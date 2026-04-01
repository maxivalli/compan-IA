/**
 * useAudioPipeline — motor de audio de Rosita.
 *
 * Responsabilidades:
 *   - Speech Recognition continuo (expo-speech-recognition)
 *   - TTS con cache disco + streaming HTTP (expo-audio)
 *   - Cola de oraciones (hablarConCola) con pre-cache solapado
 *   - Muletillas: pre-cache al inicio y reproducción en race con Claude
 *   - Respuestas rápidas: pre-cache de audios sin Claude
 *   - Silbido de inactividad (assets locales)
 *   - Grabación manual (expo-audio recorder) + transcripción Whisper
 *   - Watchdog de SR (zombie / vencido / procesandoRef colgado)
 *
 * NO gestiona: lógica de Claude, historial, prompts, domótica, Telegram,
 *              estado visual de ojos, modo noche, sensores, OTA.
 * Recibe callbacks para todo eso a través de AudioPipelineDeps.
 */

import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer } from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { Perfil } from '../lib/memoria';
import { ModoNoche } from '../components/RosaOjos';
import { hashTexto, velocidadSegunEdad } from '../lib/claudeParser';
import {
  getCurrentTurnMetrics,
  markTurnFirstAudio,
  transcribirAudio,
  sintetizarVoz,
  urlFishRealtimeStream,
  logCliente,
  VOICE_ID_FEMENINA,
  VOICE_ID_MASCULINA,
} from '../lib/ai';
import { MULETILLAS, RESPUESTAS_RAPIDAS, CategoriaMuletilla, CategoriaRapida, EstadoRosita } from './useBrain';

// ── Flag de testing ─────────────────────────────────────────────────────────
const USAR_TTS_NATIVO = false;
const TTS_SEGMENT_PADDING_MS = 80;
const TTS_CACHE_VERSION = 'v5';
const MULETILLA_CACHE_VERSION = 'v13';
const USE_FISH_REALTIME_STREAM_EXPERIMENT = true;
const BARGE_IN_ARM_DELAY_MS = 2600;
const BARGE_IN_MIN_SPEECH_MS = 1400;
const BARGE_IN_MIN_CHARS = 110;
const FISH_REALTIME_COOLDOWN_MS = 2 * 60 * 1000;
const FRASES_BUFFER_429 = [
  'Un momentito...',
  'Ya te sigo...',
  'Dame un segundo...',
  'Esperate un cachito...',
  'Ahi voy...',
  'Ya te respondo...',
  'Un momento...',
  'Enseguida...',
] as const;

// ── Silbidos locales (assets pre-generados) ──────────────────────────────────
const SILBIDOS_ASSETS = [
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../assets/audio/a_gentle_cheerful_wh_#1-1774615322853.mp3'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../assets/audio/a_gentle_cheerful_wh_#1-1774615343390.mp3'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../assets/audio/a_gentle_cheerful_wh_#1-1774615356858.mp3'),
];

// ── Tecleo (audio de espera durante búsquedas) ────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TECLEO_ASSET = require('../assets/audio/tecleo.mp3');

// ── Funciones puras de texto ──────────────────────────────────────────────────

export function slugNombre(nombre: string): string {
  return nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
}

// Convierte enteros 0–999 a español rioplatense.
// ElevenLabs Flash lee "40" como "cuatro coma cero"; pasar "cuarenta" lo resuelve.
function numToSpanish(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  const ones  = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
                  'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
  const veint = ['veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco',
                  'veintiséis','veintisiete','veintiocho','veintinueve'];
  const tens  = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const hunds = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos',
                  'seiscientos','setecientos','ochocientos','novecientos'];
  if (n < 20)  return ones[n];
  if (n < 30)  return veint[n - 20];
  if (n === 100) return 'cien';
  if (n < 100) { const t = Math.floor(n / 10), o = n % 10; return o ? `${tens[t]} y ${ones[o]}` : tens[t]; }
  const h = Math.floor(n / 100), rest = n % 100;
  return rest ? `${hunds[h]} ${numToSpanish(rest)}` : hunds[h];
}

/** Limpia texto para TTS: recorta, elimina markup, expande unidades. Pura y determinista. */
export function limpiarTextoParaTTS(texto: string): string {
  const MAX_CHARS = 450;
  if (texto.length > MAX_CHARS) {
    const corte = texto.lastIndexOf('.', MAX_CHARS);
    texto = corte > 40 ? texto.slice(0, corte + 1) : texto.slice(0, MAX_CHARS).trimEnd();
  }
  return texto
    .replace(/\(\s*(pausa|risas?|risa|suspiro|silencio|aplauso)\s*\)/gi, '')
    .replace(/^\s*[—–-]?\s*pausa\s*[—–-]?\s*$/gim, '')
    .replace(/(\d+)\s*°\s*[Cc]/g,  '$1 grados')
    .replace(/(\d+)\s*°\s*[Ff]/g,  '$1 grados Fahrenheit')
    .replace(/°/g,                  ' grados')
    .replace(/(\d+)\s*%/g,          '$1 por ciento')
    .replace(/(\d+)\s*km\/h/gi,     '$1 kilómetros por hora')
    .replace(/(\d+)\s*m\/s/gi,      '$1 metros por segundo')
    .replace(/\bkm\b/gi,            'kilómetros')
    .replace(/\*\*(.+?)\*\*/g,      '$1')
    .replace(/\*(.+?)\*/g,          '$1')
    .replace(/#+\s/g,               '')
    .replace(/[_~`]/g,              '')
    .replace(/(?:\+?\d[- ]?){6,}\d/g, m => m.replace(/[^0-9]/g, '').split('').join(', '))
    .replace(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\.?)\s+(\d{2,4})\b/g, (m, word, num) => {
      const n = parseInt(num);
      if (n >= 1800 && n <= 2099) return m;
      return `${word} ${num.split('').join(', ')}`;
    })
    .replace(/\b(\d{1,2})\s*hs\b/gi, '$1 horas')
    .replace(/\b(\d{1,3})\b/g, (m) => {
      const n = parseInt(m);
      if (n >= 100 && n <= 999) return numToSpanish(n);
      if (n < 100) return numToSpanish(n);
      return m;
    });
}

/** Extrae la primera frase y el resto de un texto. */
export function extraerPrimeraFrase(texto: string): { primera: string; resto: string } {
  const match = texto.match(/^.{20,}?[.!?](?:\s+|$)/);
  if (!match) return { primera: texto, resto: '' };
  const primera = match[0].trimEnd();
  const resto   = texto.slice(match[0].length).trim();
  if (resto.length < 10) return { primera: texto, resto: '' };
  return { primera, resto };
}

/** Divide texto en oraciones para el pipeline TTS. Fragmentos < 12 chars se fusionan. */
export function splitEnOraciones(texto: string): string[] {
  const oraciones: string[] = [];
  const re = /[^.!?]*[.!?]+/g;
  let match: RegExpExecArray | null;
  let lastIdx = 0;
  while ((match = re.exec(texto)) !== null) {
    const parte = match[0].trim();
    if (parte.length >= 12) {
      oraciones.push(parte);
      lastIdx = match.index + match[0].length;
    }
  }
  const cola = texto.slice(lastIdx).trim();
  if (cola.length >= 4 && /\w/.test(cola)) oraciones.push(cola);
  return oraciones.filter(s => s.length > 0);
}

function normalizarTextoPlano(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function esEcoDelTTS(reconocido: string, hablado: string | null): boolean {
  if (!hablado) return false;
  const r = normalizarTextoPlano(reconocido);
  const h = normalizarTextoPlano(hablado);
  if (!r || !h) return false;
  if (r.length < 6) return false;
  if (h.includes(r) || r.includes(h.slice(0, Math.min(h.length, 24)))) return true;
  const tokensR = new Set(r.split(' ').filter(p => p.length >= 3));
  const tokensH = new Set(h.split(' ').filter(p => p.length >= 3));
  if (!tokensR.size || !tokensH.size) return false;
  let overlap = 0;
  tokensR.forEach(token => { if (tokensH.has(token)) overlap++; });
  return overlap >= Math.min(3, tokensR.size);
}

function coincideConColaDelTTS(reconocido: string, hablado: string | null): boolean {
  if (!hablado) return false;
  const r = normalizarTextoPlano(reconocido);
  const h = normalizarTextoPlano(hablado);
  if (!r || !h) return false;

  const colaChars = h.slice(-Math.min(h.length, 48));
  if (colaChars.includes(r)) return true;

  const tokensH = h.split(' ').filter(Boolean);
  const tokensR = r.split(' ').filter(Boolean);
  if (!tokensH.length || !tokensR.length) return false;

  const cola3 = tokensH.slice(-3).join(' ');
  const cola4 = tokensH.slice(-4).join(' ');
  const cola5 = tokensH.slice(-5).join(' ');
  if (cola3.includes(r) || cola4.includes(r) || cola5.includes(r)) return true;

  // Si lo reconocido es muy corto y comparte casi toda la cola, preferimos
  // ignorarlo para evitar que Rosita se auto-interrumpa con su propio cierre.
  if (r.length <= 16 && tokensR.length <= 3) {
    const overlap = tokensR.filter(token => token.length >= 3 && (cola4.includes(token) || cola5.includes(token))).length;
    if (overlap >= Math.max(1, tokensR.length)) return true;
  }

  return false;
}

function deberiaUsarFishRealtimeStream(texto: string, _emotion?: string): boolean {
  if (!USE_FISH_REALTIME_STREAM_EXPERIMENT) return false;
  if (texto.trim().length < 8) return false;
  return true;
}

// ── Interfaz de dependencias ──────────────────────────────────────────────────

export interface AudioPipelineDeps {
  // Refs compartidos con brain / useRosita
  perfilRef:                React.MutableRefObject<Perfil | null>;
  estadoRef:                React.MutableRefObject<EstadoRosita>;
  musicaActivaRef:          React.MutableRefObject<boolean>;
  ultimaCharlaRef:          React.MutableRefObject<number>;
  modoNocheRef:             React.MutableRefObject<ModoNoche>;
  noMolestarRef:            React.MutableRefObject<boolean>;
  nombreAsistenteRef:       React.MutableRefObject<string>;
  proximaAlarmaRef:         React.MutableRefObject<number>;
  rcStartTsRef:             React.MutableRefObject<number>;
  speechEndTsRef:           React.MutableRefObject<number>;
  srResultTsRef:            React.MutableRefObject<number>;

  // Setters de estado visual
  setEstado:                (s: EstadoRosita) => void;
  setMusicaActiva:          (v: boolean) => void;
  setNoMolestar:            (v: boolean) => void;

  // Callbacks de useRosita / brain (funciones que quedan fuera del pipeline)
  onTextoReconocido:        (texto: string) => Promise<void>;
  onFlujoFoto:              () => Promise<void>;
  onFlujoLeerImagen:        () => Promise<void>;
  verificarCharlaProactiva: () => boolean;
}

// ── useAudioPipeline ──────────────────────────────────────────────────────────

export function useAudioPipeline(deps: AudioPipelineDeps) {
  // Actualizar sincrónicamente en cada render para evitar stale closures en async
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // ── Reproductores y grabador ──────────────────────────────────────────────
  const recorderConv = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player       = useAudioPlayer(null);
  const playerMusica = useAudioPlayer(null);

  // ── Estado propio del pipeline ────────────────────────────────────────────
  const [silbando,         setSilbando]         = useState(false);
  const [detectandoSonido, setDetectandoSonido] = useState(false);
  const detectandoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Refs de control de flujo ─────────────────────────────────────────────
  // Compartidos con brain via depsRef y con useRosita (se devuelven en el return)
  const enFlujoVozRef      = useRef(false);
  const enColaHablaRef     = useRef(false);
  const procesandoRef      = useRef(false);
  const procesandoDesdeRef = useRef<number>(0);
  const yaDetuvRef         = useRef(false);
  const fishRealtimeCooldownUntilRef = useRef(0);

  // ── Refs de SR ────────────────────────────────────────────────────────────
  const srActivoRef           = useRef(false);
  const ultimaActivacionSrRef = useRef<number>(0);

  // ── Refs de TTS ──────────────────────────────────────────────────────────
  const ultimoAudioUriRef     = useRef<string | null>(null);
  const ultimoTextoHabladoRef = useRef<string | null>(null);
  const cancelarHablaRef      = useRef<(() => void) | null>(null);
  const bargeInTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hablandoDesdeRef      = useRef<number>(0);

  // ── Refs de muletillas y cache ────────────────────────────────────────────
  const ultimaMuletillaRef         = useRef<Partial<Record<CategoriaMuletilla, number>>>({});
  const precacheInFlightRef        = useRef<Set<string>>(new Set());
  const precacheMuletillasRunningRef = useRef(false);
  const ultimaRapidaRef            = useRef<Partial<Record<CategoriaRapida, number>>>({});
  const precacheQueueRef           = useRef<Promise<void>>(Promise.resolve());
  const fishRealtimeInFlightRef    = useRef(0);
  const fraseBufferIdxRef          = useRef(0);

  // ── Refs de silbido ──────────────────────────────────────────────────────
  const silbidoActivoRef  = useRef(false);
  const silbidoIndexRef   = useRef(0);
  const silbidoTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  function safeStopSpeechRecognition() {
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
  }

  // ── Limpiar cache viejo (TTS files > 7 días) ─────────────────────────────
  async function limpiarCacheViejo() {
    try {
      const dir = FileSystem.cacheDirectory!;
      const archivos = await FileSystem.readDirectoryAsync(dir);
      const hace7dias = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const archivo of archivos) {
        if (!archivo.startsWith('tts_') || !archivo.endsWith('.mp3')) continue;
        const info = await FileSystem.getInfoAsync(dir + archivo);
        if (info.exists && info.modificationTime && info.modificationTime * 1000 < hace7dias) {
          await FileSystem.deleteAsync(dir + archivo, { idempotent: true });
        }
      }
    } catch {}
  }

  // ── SR: iniciar ──────────────────────────────────────────────────────────
  function iniciarSpeechRecognition() {
    if (enFlujoVozRef.current) return;
    if (depsRef.current.estadoRef.current !== 'esperando') return;
    if (depsRef.current.noMolestarRef.current) return;
    if (enColaHablaRef.current) return;
    const ahora = Date.now();
    if (ahora - ultimaActivacionSrRef.current < 1500) return;
    try {
      safeStopSpeechRecognition();
      ExpoSpeechRecognitionModule.start({
        lang: 'es-AR',
        continuous: true,
        interimResults: false,
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 700,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 350,
        },
      });
      srActivoRef.current = true;
      logCliente('sr_start', { estado: depsRef.current.estadoRef.current });
    } catch {
      srActivoRef.current = false;
      logCliente('sr_start_error', { estado: depsRef.current.estadoRef.current });
    } finally {
      ultimaActivacionSrRef.current = ahora;
    }
  }

  // ── SR: event handlers ────────────────────────────────────────────────────

  useSpeechRecognitionEvent('result', async (event) => {
    const d = depsRef.current;
    const texto = event.results?.[0]?.transcript?.trim();
    if (__DEV__) console.log('[SR] result:', texto, '| proc:', procesandoRef.current, '| flujo:', enFlujoVozRef.current, '| estado:', d.estadoRef.current, '| asistente:', d.nombreAsistenteRef.current);
    if (procesandoRef.current) return;
    if (enFlujoVozRef.current) return;
    if (!texto || texto.length < 2) return;

    // Reactivación en modo no molestar
    if (d.noMolestarRef.current) {
      const nombreNormNM  = d.nombreAsistenteRef.current.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const textoNormNM   = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const mencionaNombreNM = new RegExp('(^|\\s)' + nombreNormNM.slice(0, 5), 'i').test(textoNormNM);
      if (mencionaNombreNM && /\b(podes hablar|podes volver|volvé|vuelve|ya podes|despierta|activa(te)?|estoy aca|hola)\b/.test(textoNormNM)) {
        d.setNoMolestar(false);
      }
      return;
    }

    if (d.musicaActivaRef.current) duckMusica();

    const nombreNorm  = d.nombreAsistenteRef.current.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const textoNorm   = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nombreRegex = new RegExp('(^|\\s)' + nombreNorm.slice(0, 5), 'i');
    const mencionaNombre = nombreRegex.test(textoNorm);
    const esNoche = d.modoNocheRef.current !== 'despierta';
    const tiempoDesdeUltimaCharla = Date.now() - d.ultimaCharlaRef.current;
    const enConversacion = d.musicaActivaRef.current ? false : tiempoDesdeUltimaCharla < 30 * 1000;

    const _imp    = /^(pone|pon|avisa(me)?|recorda(me)?|acordate|apaga|prende|encende|enciende|llama|manda|busca)\b/.test(textoNorm);
    const _info   = /(que hora|que dia|que fecha|que tiempo (hace|va|esta)|va a llover|que temperatura|cuanto (es|son|vale|valen))/.test(textoNorm);
    const _entret = /^(contame (un|una)|cantame|jugamos)\b/.test(textoNorm) || /\b(un chiste|una adivinanza)\b/.test(textoNorm);
    const esPreguntaDirecta = (d.musicaActivaRef.current || esNoche) ? false : (_imp || _info || _entret);
    if (__DEV__) console.log('[SR] check → menciona:', mencionaNombre, '| enConv:', enConversacion, '| pregunta:', esPreguntaDirecta);

    if (d.estadoRef.current === 'hablando') {
      const msHablando = hablandoDesdeRef.current ? Date.now() - hablandoDesdeRef.current : 0;
      const esRelevante = mencionaNombre || esPreguntaDirecta || (enConversacion && textoNorm.length >= 10);
      if (msHablando < BARGE_IN_MIN_SPEECH_MS) {
        logCliente('barge_in_ignored', { motivo: 'grace', chars: texto.length, ms_hablando: msHablando });
        unduckMusica();
        return;
      }
      if (esEcoDelTTS(texto, ultimoTextoHabladoRef.current)) {
        logCliente('barge_in_ignored', { motivo: 'echo', chars: texto.length });
        unduckMusica();
        return;
      }
      if (coincideConColaDelTTS(texto, ultimoTextoHabladoRef.current)) {
        logCliente('barge_in_ignored', { motivo: 'echo_tail', chars: texto.length });
        unduckMusica();
        return;
      }
      if (!esRelevante) {
        logCliente('barge_in_ignored', { motivo: 'irrelevante', chars: texto.length });
        unduckMusica();
        return;
      }
      logCliente('barge_in_committed', { chars: texto.length, ms_hablando: msHablando });
      try { cancelarHablaRef.current?.(); } catch {}
    } else if (d.estadoRef.current === 'pensando') {
      return;
    }

    if (!mencionaNombre && !enConversacion && !esPreguntaDirecta) { unduckMusica(); return; }

    // Comando de silencio: "[nombre] hacé silencio" → activa modo no molestar
    if (mencionaNombre && /\b(silencio|callate|calla(te)?|no molestes|no hables|modo silencio|no molestar)\b/.test(textoNorm)) {
      unduckMusica();
      d.setNoMolestar(true);
      return;
    }

    try {
      procesandoRef.current = true;
      procesandoDesdeRef.current = Date.now();
      safeStopSpeechRecognition();
      const esRepeticion = enConversacion
        && /repet[ií]|no te escuch[eé]|no entend[ií]|m[aá]s (alto|fuerte)|no te o[ií]|no te oi/.test(textoNorm)
        && ultimoAudioUriRef.current !== null;

      d.srResultTsRef.current = Date.now();
      const lagSpeechEndMs = d.speechEndTsRef.current ? d.srResultTsRef.current - d.speechEndTsRef.current : -1;
      logCliente('sr_final_received', { chars: texto.length, lag_speech_end_ms: lagSpeechEndMs });
      if (esRepeticion) {
        await hablar(ultimoTextoHabladoRef.current!);
      } else if (/\b(sac[aá](me)?\s+una?\s+foto|man[dá]|mand[aá](me|les?)?\s+una?\s+foto|hacé?\s+una?\s+foto|tir[aá]\s+una?\s+foto|foto\s+para\s+(la\s+)?famil|foto\s+a\s+(la\s+)?famil)\b/i.test(textoNorm)) {
        await d.onFlujoFoto();
      } else if (/\b(que (dice|pone|ves|hay)|leeme|lee (esto|eso|ahi|aca)|describime|describi (esto|eso))\b/.test(textoNorm)) {
        await d.onFlujoLeerImagen();
      } else {
        await d.onTextoReconocido(texto);
      }
    } finally {
      unduckMusica();
      procesandoRef.current = false;
      procesandoDesdeRef.current = 0;
      if (
        d.estadoRef.current === 'esperando'
        && !enFlujoVozRef.current
        && !enColaHablaRef.current
        && !d.noMolestarRef.current
      ) {
        iniciarSpeechRecognition();
      }
    }
  });

  useSpeechRecognitionEvent('end', () => {
    const d = depsRef.current;
    srActivoRef.current = false;
    if (enFlujoVozRef.current) return;
    if (!d.perfilRef.current?.nombreAbuela) return;
    if (d.estadoRef.current === 'esperando' && !procesandoRef.current) {
      setTimeout(() => {
        if (d.estadoRef.current === 'esperando' && !procesandoRef.current && !enFlujoVozRef.current) {
          if (!d.verificarCharlaProactiva()) iniciarSpeechRecognition();
        }
      }, 1500);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    const d = depsRef.current;
    if (__DEV__) console.log('[SR] error:', event.error);
    srActivoRef.current = false;
    if (enFlujoVozRef.current) return;
    if (!d.perfilRef.current?.nombreAbuela) return;
    if (d.estadoRef.current === 'esperando' && !procesandoRef.current) {
      const delay = event.error === 'network' ? 3000 : 1000;
      setTimeout(() => {
        if (!procesandoRef.current && !enFlujoVozRef.current && !d.verificarCharlaProactiva()) {
          iniciarSpeechRecognition();
        }
      }, delay);
    }
  });

  function activarFeedbackSonido() {
    ultimaActivacionSrRef.current = Date.now();
    if (depsRef.current.estadoRef.current === 'esperando') {
      setDetectandoSonido(true);
      if (detectandoTimerRef.current) clearTimeout(detectandoTimerRef.current);
      detectandoTimerRef.current = setTimeout(() => setDetectandoSonido(false), 4000);
    }
  }
  function desactivarFeedbackSonido() {
    if (detectandoTimerRef.current) clearTimeout(detectandoTimerRef.current);
    setDetectandoSonido(false);
  }
  function registrarFinDeVozUsuario() {
    const d = depsRef.current;
    desactivarFeedbackSonido();
    if (enFlujoVozRef.current || enColaHablaRef.current) return;
    if (d.estadoRef.current === 'hablando') return;
    d.speechEndTsRef.current = Date.now();
    logCliente('end_of_user_speech', { estado: d.estadoRef.current });
  }
  useSpeechRecognitionEvent('soundstart',  activarFeedbackSonido);
  useSpeechRecognitionEvent('speechstart', activarFeedbackSonido);
  useSpeechRecognitionEvent('soundend',    desactivarFeedbackSonido);
  useSpeechRecognitionEvent('speechend',   registrarFinDeVozUsuario);

  // ── Watchdog de SR ────────────────────────────────────────────────────────
  useEffect(() => {
    const watchdog = setInterval(() => {
      const d = depsRef.current;
      if (enFlujoVozRef.current) return;
      if (!d.perfilRef.current?.nombreAbuela) return;

      // Recuperar procesandoRef colgado (> 20s sin hablar)
      if (procesandoRef.current && d.estadoRef.current !== 'hablando' && !enColaHablaRef.current && Date.now() - procesandoDesdeRef.current > 20000) {
        if (__DEV__) console.log('[Watchdog] procesandoRef colgado — forzando reset');
        logCliente('watchdog_reset', { estado: d.estadoRef.current, colgadoMs: Date.now() - procesandoDesdeRef.current });
        procesandoRef.current = false;
        procesandoDesdeRef.current = 0;
      }

      if (d.estadoRef.current !== 'esperando' || procesandoRef.current) return;

      const ahora = Date.now();
      const tiempoDesdeInicio = ahora - ultimaActivacionSrRef.current;
      const srZombie  = srActivoRef.current && tiempoDesdeInicio > 25000;
      const srVencido = srActivoRef.current && tiempoDesdeInicio > 45000;

      if (!srActivoRef.current || srZombie || srVencido) {
        if (srZombie || srVencido) {
          if (__DEV__) console.log('[Watchdog] SR', srVencido ? 'vencido (45s)' : 'zombie — reiniciando');
          srActivoRef.current = false;
        }
        iniciarSpeechRecognition();
      }
    }, 5000);
    return () => clearInterval(watchdog);
  }, []);

  // ── Duck / unduck música ──────────────────────────────────────────────────
  const MUSICA_VOL_NORMAL = 0.45;
  const MUSICA_VOL_DUCK   = 0.15;
  function duckMusica()   { try { playerMusica.volume = MUSICA_VOL_DUCK;   } catch {} }
  function unduckMusica() { try { playerMusica.volume = MUSICA_VOL_NORMAL; } catch {} }

  // ── Música ────────────────────────────────────────────────────────────────
  function pararMusica() {
    playerMusica.pause();
    depsRef.current.setMusicaActiva(false);
  }
  function reanudarMusica() {
    playerMusica.play();
    depsRef.current.setMusicaActiva(true);
  }

  // ── Silbido ───────────────────────────────────────────────────────────────
  async function reproducirSilbido() {
    if (!silbidoActivoRef.current) return;
    if (depsRef.current.estadoRef.current !== 'esperando') return;
    if (depsRef.current.musicaActivaRef.current) return;
    try {
      const asset = SILBIDOS_ASSETS[silbidoIndexRef.current];
      silbidoIndexRef.current = (silbidoIndexRef.current + 1) % SILBIDOS_ASSETS.length;
      player.replace(asset);
      player.play();
      for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (!silbidoActivoRef.current || depsRef.current.musicaActivaRef.current) {
          try { player.pause(); } catch {}
          return;
        }
      }
    } catch {}
  }

  function iniciarSilbido() {
    if (silbidoActivoRef.current) return;
    silbidoActivoRef.current = true;
    setSilbando(true);
    reproducirSilbido();
  }

  function detenerSilbido() {
    silbidoActivoRef.current = false;
    setSilbando(false);
    if (silbidoTimerRef.current) clearTimeout(silbidoTimerRef.current);
    try { if (player.playing) player.pause(); } catch {}
  }

  // ── Tecleo de espera durante búsquedas ────────────────────────────────────
  // Usa playerMusica (canal separado) para sonar en PARALELO con la muletilla
  // verbal que corre en player. No toca nada si hay música activa.
  async function reproducirTecleo(abort: { current: boolean }): Promise<void> {
    if (abort.current) return;
    if (depsRef.current.musicaActivaRef.current) return;
    try {
      playerMusica.replace(TECLEO_ASSET);
      (playerMusica as any).loop = true;
      playerMusica.play();
      await new Promise<void>(resolve => {
        const poll = setInterval(() => {
          if (abort.current) {
            clearInterval(poll);
            resolve();
          }
        }, 80);
      });
    } catch {}
    try {
      (playerMusica as any).loop = false;
      playerMusica.pause();
    } catch {}
  }

  function cacheUriBuffer429(texto: string) {
    const key = hashTexto(`buffer429|${texto}`);
    return FileSystem.cacheDirectory + `tts_${TTS_CACHE_VERSION}_buffer429_` + key + '.mp3';
  }

  async function precachearFrasesBuffer429() {
    const p = depsRef.current.perfilRef.current;
    const voiceId = p?.vozId ?? (p?.vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
    for (const frase of FRASES_BUFFER_429) {
      try {
        const uri = cacheUriBuffer429(frase);
        const info = await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }));
        if ((info as any).exists) continue;
        const base64 = await sintetizarVoz(frase, voiceId, velocidadSegunEdad(p?.edad), 'neutral').catch(() => null);
        if (base64) await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' }).catch(() => {});
      } catch {}
    }
  }

  async function reproducirFallbackFishCacheado(): Promise<boolean> {
    for (let intentos = 0; intentos < FRASES_BUFFER_429.length; intentos++) {
      const idx = fraseBufferIdxRef.current % FRASES_BUFFER_429.length;
      fraseBufferIdxRef.current += 1;
      const frase = FRASES_BUFFER_429[idx];
      const uri = cacheUriBuffer429(frase);
      const info = await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }));
      if (!(info as any).exists) continue;
      try {
        player.replace({ uri });
        player.play();
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 2500);
          const poll = setInterval(() => {
            const dur = (player as any).duration as number;
            const pos = (player as any).currentTime as number;
            if (dur > 0 && pos >= dur - 0.15) {
              clearTimeout(timeout);
              clearInterval(poll);
              try { player.pause(); } catch {}
              resolve();
            }
          }, 80);
        });
        return true;
      } catch {}
    }
    return false;
  }

  async function fallbackVozUltimoRecurso(texto: string) {
    const d = depsRef.current;
    d.setEstado('hablando');
    d.estadoRef.current = 'hablando';
    const pudoCache = await reproducirFallbackFishCacheado().catch(() => false);
    if (pudoCache) return;
    await new Promise<void>((resolve) => {
      Speech.speak(texto, { language: 'es-AR', rate: 0.9, onDone: resolve, onError: () => resolve(), onStopped: () => resolve() });
    });
  }

  // ── Pre-cache TTS ─────────────────────────────────────────────────────────
  async function precachearTexto(texto: string, emotion?: string) {
    const limpio = limpiarTextoParaTTS(texto);
    if (!limpio) return;
    const key = hashTexto(limpio + '|' + (emotion ?? ''));
    if (precacheInFlightRef.current.has(key)) return;
    precacheInFlightRef.current.add(key);
    const run = async () => {
      try {
        if (fishRealtimeInFlightRef.current > 0) return;
        if (
          USE_FISH_REALTIME_STREAM_EXPERIMENT
          && Date.now() >= fishRealtimeCooldownUntilRef.current
          && deberiaUsarFishRealtimeStream(limpio, emotion)
        ) {
          return;
        }
        const cacheUri = FileSystem.cacheDirectory + `tts_${TTS_CACHE_VERSION}_` + key + '.mp3';
        const info = await FileSystem.getInfoAsync(cacheUri);
        if (info.exists) return;
        const p = depsRef.current.perfilRef.current;
        const voiceId = p?.vozId ?? (p?.vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
        const base64 = await sintetizarVoz(limpio, voiceId, velocidadSegunEdad(p?.edad), emotion);
        if (base64) await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: 'base64' });
      } catch {} finally {
        precacheInFlightRef.current.delete(key);
      }
    };
    precacheQueueRef.current = precacheQueueRef.current.catch(() => {}).then(run);
    await precacheQueueRef.current;
  }

  async function precachearMuletillas(voiceId?: string, nombre?: string) {
    if (USAR_TTS_NATIVO) return;
    if (precacheMuletillasRunningRef.current) return;
    precacheMuletillasRunningRef.current = true;
    const p = depsRef.current.perfilRef.current;
    const vozGenero = p?.vozGenero ?? 'femenina';
    const genero = vozGenero === 'masculina' ? 'masculina' : 'femenina';
    const effectiveVoiceId = voiceId ?? (vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
    const slug = slugNombre(nombre ?? p?.nombreAbuela ?? '');
    for (const [cat, variantes] of Object.entries(MULETILLAS) as [CategoriaMuletilla, typeof MULETILLAS[CategoriaMuletilla]][]) {
      const lista = variantes[genero];
      for (let i = 0; i < lista.length; i++) {
        const uri = FileSystem.cacheDirectory + `muletilla_${MULETILLA_CACHE_VERSION}_${cat}_${i}_${slug}.mp3`;
        const info = await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }));
        if (info.exists) continue;
        const textoFinal = lista[i].replace(/\{n\}/g, nombre ?? p?.nombreAbuela ?? '');
        const muletillaEmotion: Record<CategoriaMuletilla, string> = {
          empatico: 'triste', busqueda: 'neutral', nostalgia: 'triste', comando: 'feliz', default: 'neutral',
        };
        const base64 = await sintetizarVoz(textoFinal, effectiveVoiceId, velocidadSegunEdad(p?.edad), muletillaEmotion[cat]).catch(() => null);
        if (base64) await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' }).catch(() => {});
      }
    }
    await precachearFrasesBuffer429().catch(() => {});
    precacheMuletillasRunningRef.current = false;
  }

  async function precachearRespuestasRapidas(nombre?: string) {
    if (USAR_TTS_NATIVO) return;
    const p = depsRef.current.perfilRef.current;
    const vozGenero = p?.vozGenero ?? 'femenina';
    const genero = vozGenero === 'masculina' ? 'masculina' : 'femenina';
    const n = nombre ?? p?.nombreAbuela ?? '';
    for (const cat of Object.keys(RESPUESTAS_RAPIDAS) as CategoriaRapida[]) {
      const { [genero]: lista, emotion } = RESPUESTAS_RAPIDAS[cat];
      for (const textoRaw of lista) {
        const texto = textoRaw.replace(/\{n\}/g, n).trim();
        if (texto) await precachearTexto(texto, emotion).catch(() => {});
      }
    }
  }

  // ── Reproducir muletilla ─────────────────────────────────────────────────
  async function reproducirMuletilla(categoria: CategoriaMuletilla, abort?: { current: boolean }, onPlay?: () => void): Promise<string> {
    try {
      const p = depsRef.current.perfilRef.current;
      const vozGenero = p?.vozGenero ?? 'femenina';
      const genero = vozGenero === 'masculina' ? 'masculina' : 'femenina';
      const lista = MULETILLAS[categoria][genero];
      const ultimo = ultimaMuletillaRef.current[categoria] ?? -1;
      let idx: number;
      do { idx = Math.floor(Math.random() * lista.length); } while (idx === ultimo && lista.length > 1);
      ultimaMuletillaRef.current[categoria] = idx;
      const textoRaw  = lista[idx];
      const nombre    = p?.nombreAbuela ?? '';
      const slug      = slugNombre(nombre);
      const texto     = textoRaw.replace(/\{n\}/g, nombre);
      const uri = FileSystem.cacheDirectory + `muletilla_${MULETILLA_CACHE_VERSION}_${categoria}_${idx}_${slug}.mp3`;
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) { logCliente('muletilla_miss', { categoria, idx }); return texto; }
      if (abort?.current) { logCliente('muletilla_abort', { categoria }); return texto; }
      logCliente('muletilla_play', { categoria, idx, texto: texto.slice(0, 20) });
      player.replace({ uri });
      player.play();
      onPlay?.();
      await new Promise<void>(resolve => {
        const safety = setTimeout(() => resolve(), 3000);
        const poll = setInterval(() => {
          if (abort?.current) {
            clearTimeout(safety);
            clearInterval(poll);
            resolve();
            return;
          }
          const dur = (player as any).duration as number;
          const pos = (player as any).currentTime as number;
          if (dur > 0 && pos >= dur - 0.15) {
            clearTimeout(safety);
            clearInterval(poll);
            player.pause();
            resolve();
          }
        }, 80);
      });
      return texto;
    } catch {}
    return '';
  }

  // ── TTS principal ─────────────────────────────────────────────────────────
  async function hablar(texto: string, emotion?: string) {
    const d = depsRef.current;
    ultimoTextoHabladoRef.current = texto;
    if (__DEV__) console.log('[TTS] hablar() llamado, chars:', texto.length, '| texto:', texto.slice(0, 40));
    const lagRcMs = d.rcStartTsRef.current ? Date.now() - d.rcStartTsRef.current : -1;
    const turnAudio = markTurnFirstAudio();
    if (turnAudio.firstForTurn) {
      logCliente('first_audio', {
        chars: texto.length,
        emotion: emotion ?? 'none',
        lag_rc_ms: lagRcMs,
        e2e_first_audio_ms: turnAudio.e2eFirstAudioMs ?? -1,
      });
    }
    logCliente('hablar_start', {
      chars: texto.length,
      emotion: emotion ?? 'none',
      lag_rc_ms: lagRcMs,
      e2e_first_audio_ms: turnAudio.e2eFirstAudioMs ?? -1,
      first_audio_turn: turnAudio.firstForTurn ? 'si' : 'no',
    });
    safeStopSpeechRecognition();
    detenerSilbido();
    d.estadoRef.current = 'hablando';
    hablandoDesdeRef.current = Date.now();
    const shouldArmBargeIn = turnAudio.firstForTurn && texto.length >= BARGE_IN_MIN_CHARS;
    if (bargeInTimerRef.current) clearTimeout(bargeInTimerRef.current);
    if (shouldArmBargeIn) {
      bargeInTimerRef.current = setTimeout(() => {
        if (depsRef.current.estadoRef.current === 'hablando' && !depsRef.current.noMolestarRef.current) {
          iniciarSpeechRecognition();
          logCliente('barge_in_listening', { chars: texto.length });
        }
      }, BARGE_IN_ARM_DELAY_MS);
    }

    texto = limpiarTextoParaTTS(texto);

    // ── TTS nativo (testing) ─────────────────────────────────────────────
    if (USAR_TTS_NATIVO) {
      d.setEstado('hablando');
      d.estadoRef.current = 'hablando';
      await new Promise<void>(resolve => {
        let resolved = false;
        let started = false;
        let pollInterval: ReturnType<typeof setInterval>;
        const done = () => {
          if (resolved) return;
          resolved = true;
          clearInterval(pollInterval);
          clearTimeout(safety);
          resolve();
        };
        const estimado = Math.min(texto.split(' ').length * 400 + 3000, 20000);
        const safety = setTimeout(done, estimado);
        Speech.speak(texto, {
          language: 'es-AR',
          rate: velocidadSegunEdad(d.perfilRef.current?.edad),
          onDone:    () => done(),
          onError:   () => done(),
          onStopped: () => done(),
        });
        pollInterval = setInterval(async () => {
          try {
            const speaking = await Speech.isSpeakingAsync();
            if (!started && speaking) { started = true; }
            else if (started && !speaking) { done(); }
          } catch { done(); }
        }, 300);
        setTimeout(() => { if (!started) done(); }, 3000);
      });
      unduckMusica();
      d.setEstado('esperando');
      d.estadoRef.current = 'esperando';
      if (!enFlujoVozRef.current && !enColaHablaRef.current) iniciarSpeechRecognition();
      return;
    }

    let isStream = false;
    let usaFishRealtime = false;
    try {
      // ── TTS — cache disco o streaming Fish realtime ──────────────────────
      const cacheUri = FileSystem.cacheDirectory + `tts_${TTS_CACHE_VERSION}_` + hashTexto(texto + '|' + (emotion ?? '')) + '.mp3';
      const info = await FileSystem.getInfoAsync(cacheUri);
      const p = d.perfilRef.current;
      const voiceId = p?.vozId ?? (p?.vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
      isStream = !info.exists;
      const fishRealtimeDisponible = Date.now() >= fishRealtimeCooldownUntilRef.current;
      usaFishRealtime = isStream && fishRealtimeDisponible && deberiaUsarFishRealtimeStream(texto, emotion);
      if (__DEV__) console.log(`[TTS-CACHE] ${isStream ? 'MISS' : 'HIT'} | chars:${texto.length}`);
      if (isStream) {
        logCliente('tts_path', {
          chars: texto.length,
          emotion: emotion ?? 'none',
          provider: usaFishRealtime ? 'fish_realtime' : 'legacy_stream',
        });
      }
      const uri: string = info.exists
        ? cacheUri
        : usaFishRealtime
          ? urlFishRealtimeStream(texto, voiceId, velocidadSegunEdad(p?.edad), emotion, { latency: 'balanced', chunkLength: 140 })
          : '';

      if (uri) {
        if (usaFishRealtime) fishRealtimeInFlightRef.current += 1;
        ultimoAudioUriRef.current = uri;
        try { player.pause(); } catch {}
        player.replace({ uri });
        d.estadoRef.current = 'hablando';
        player.play();
        if (__DEV__) console.log('[TTS] play() llamado');
        let finishReason: string | null = null;
        await new Promise<void>(resolve => {
          let resolved = false;
          const done = (motivo: string) => {
            if (resolved) return;
            resolved = true;
            finishReason = motivo;
            cancelarHablaRef.current = null;
            clearInterval(pollInterval);
            if (durationTimer !== undefined) clearTimeout(durationTimer);
            if (posStableTimer !== undefined) clearTimeout(posStableTimer);
            if (estimatedPlaybackTimer !== undefined) clearTimeout(estimatedPlaybackTimer);
            clearTimeout(safetyTimeout);
            clearTimeout(noStartTimer);
            if (bargeInTimerRef.current) { clearTimeout(bargeInTimerRef.current); bargeInTimerRef.current = null; }
            if (__DEV__) console.log('[TTS] fin de reproducción, motivo:', motivo);
            const turnMetrics = getCurrentTurnMetrics();
            logCliente('hablar_end', {
              motivo,
              pos: Math.round(((player as any).currentTime ?? 0) * 1000),
              dur: Math.round(((player as any).duration ?? 0) * 1000),
              e2e_now_ms: turnMetrics.e2eNowMs ?? -1,
            });
            resolve();
          };

          const safetyTimeout = setTimeout(() => done('safety-timeout'), 45000);
          let started = false;
          let silenceCount = 0;
          let durationTimer: ReturnType<typeof setTimeout> | undefined;
          let posStableTimer: ReturnType<typeof setTimeout> | undefined;
          let estimatedPlaybackTimer: ReturnType<typeof setTimeout> | undefined;
          let lastPos = -1;
          cancelarHablaRef.current = () => {
            try { player.pause(); } catch {}
            done('barge-in');
          };

          const noStartTimer = setTimeout(() => { if (!started) done('no-start'); }, isStream ? (usaFishRealtime ? 3000 : 10000) : 4000);

          const pollInterval = setInterval(() => {
            const playing = player.playing;
            const dur = (player as any).duration as number;
            const pos = (player as any).currentTime as number;
            const durKnown = !isNaN(dur) && dur > 0 && isFinite(dur) && dur < 7200;

            if (started && durationTimer === undefined && durKnown) {
              if (estimatedPlaybackTimer !== undefined) { clearTimeout(estimatedPlaybackTimer); estimatedPlaybackTimer = undefined; }
              durationTimer = setTimeout(() => done('duration-timer'), (dur + 0.8) * 1000);
            }

            if (!started) {
              if (playing) {
                started = true;
                lastPos = pos;
                clearTimeout(noStartTimer);
                d.setEstado('hablando');
                if (__DEV__) console.log('[TTS] audio arrancó, dur:', dur?.toFixed(2), 's');
                if (durKnown) {
                  durationTimer = setTimeout(() => done('duration-timer'), (dur + 0.8) * 1000);
                } else if (isStream) {
                  const estimatedMs = Math.max(2000, texto.length * 90);
                  if (__DEV__) console.log('[TTS] estimatedPlaybackTimer:', estimatedMs, 'ms (', texto.length, 'chars)');
                  estimatedPlaybackTimer = setTimeout(() => done('estimated-playback'), estimatedMs);
                }
              }
            } else {
              if (!playing) {
                const nearEndThresh = durKnown && dur < 1.5 ? 0.05 : 0.15;
                const nearEnd = durKnown && pos >= dur - nearEndThresh;
                if (nearEnd) {
                  done('near-end');
                } else if (pos === lastPos && durKnown && pos < dur - 0.3) {
                  if (__DEV__) console.log('[TTS] audio stalled en pos:', pos?.toFixed(2), '/ dur:', dur?.toFixed(2), '— resumiendo');
                  player.play();
                  silenceCount = 0;
                } else if (pos !== lastPos) {
                  silenceCount = 0;
                  if (posStableTimer !== undefined) { clearTimeout(posStableTimer); posStableTimer = undefined; }
                } else {
                  if (!durKnown && pos > 0.1 && posStableTimer === undefined) {
                    posStableTimer = setTimeout(() => done('pos-stable'), 600);
                  }
                  silenceCount++;
                  const thresh = durKnown ? 15 : (pos > 0.3 ? 5 : 15);
                  if (__DEV__) console.log('[TTS] poll silencio', silenceCount, '| pos:', pos?.toFixed(2), '| dur:', dur?.toFixed(2));
                  if (silenceCount >= thresh) done('silence-polls');
                }
              } else {
                if (pos !== lastPos) {
                  silenceCount = 0;
                  if (posStableTimer !== undefined) { clearTimeout(posStableTimer); posStableTimer = undefined; }
                } else if (!durKnown && pos > 0.1 && posStableTimer === undefined) {
                  posStableTimer = setTimeout(() => done('pos-stable'), 600);
                }
              }
              lastPos = pos;
            }
          }, 150);
        });
        if (isStream && finishReason === 'no-start') {
          if (usaFishRealtime) {
            fishRealtimeCooldownUntilRef.current = Date.now() + FISH_REALTIME_COOLDOWN_MS;
            logCliente('tts_rt_cooldown', { ms: FISH_REALTIME_COOLDOWN_MS, motivo: 'no-start' });
          }
          if (__DEV__) console.log('[TTS] no-start en stream, fallback a frase cacheada/native');
          await fallbackVozUltimoRecurso(texto);
        }
      } else {
        if (__DEV__) console.log('[TTS] fallback a frase cacheada/native (sin URI de stream)');
        await fallbackVozUltimoRecurso(texto);
      }
    } catch (e: any) {
      if (__DEV__) console.log('[TTS] CATCH en hablar:', e?.message ?? e);
      try {
        await fallbackVozUltimoRecurso(texto);
      } catch {}
    } finally {
      if (isStream && usaFishRealtime) {
        fishRealtimeInFlightRef.current = Math.max(0, fishRealtimeInFlightRef.current - 1);
      }
    }

    hablandoDesdeRef.current = 0;
    cancelarHablaRef.current = null;
    if (bargeInTimerRef.current) { clearTimeout(bargeInTimerRef.current); bargeInTimerRef.current = null; }
    unduckMusica();
    d.setEstado('esperando');
    d.estadoRef.current = 'esperando';
    if (!enFlujoVozRef.current && !enColaHablaRef.current) iniciarSpeechRecognition();
  }

  // ── Cola de oraciones TTS ─────────────────────────────────────────────────
  async function hablarConCola(oraciones: string[], emotion?: string) {
    if (oraciones.length === 0) return;
    enColaHablaRef.current = true;
    try {
      if (oraciones.length === 1) {
        await hablar(oraciones[0], emotion);
      } else {
        for (let i = 0; i < oraciones.length; i++) {
          const nextPrecache = i + 1 < oraciones.length
            ? precachearTexto(oraciones[i + 1], emotion)
            : Promise.resolve();
          await hablar(oraciones[i], emotion);
          if (i + 1 < oraciones.length) {
            await new Promise(r => setTimeout(r, TTS_SEGMENT_PADDING_MS));
          }
          depsRef.current.rcStartTsRef.current = Date.now();
          await nextPrecache;
        }
      }
    } finally {
      enColaHablaRef.current = false;
    }
  }

  // ── Escucha manual (botón) ────────────────────────────────────────────────
  async function iniciarEscucha() {
    const d = depsRef.current;
    if (d.estadoRef.current !== 'esperando') return;
    detenerSilbido();
    enFlujoVozRef.current = true;
    try {
      if (d.musicaActivaRef.current) { playerMusica.pause(); d.setMusicaActiva(false); }
      safeStopSpeechRecognition();
      await new Promise(r => setTimeout(r, 400));
      d.setEstado('escuchando');
      d.estadoRef.current = 'escuchando';
      await recorderConv.prepareToRecordAsync();
      recorderConv.record();
      yaDetuvRef.current = false;
      setTimeout(() => { if (!yaDetuvRef.current) detenerEscucha(); }, 8000);
    } catch {
      enFlujoVozRef.current = false;
      d.setEstado('esperando');
      d.estadoRef.current = 'esperando';
    }
  }

  async function detenerEscucha() {
    const d = depsRef.current;
    if (yaDetuvRef.current) return;
    yaDetuvRef.current = true;
    try {
      await recorderConv.stop();
      const uri = recorderConv.uri;
      if (uri) { await enviarAudio(uri); }
      else { enFlujoVozRef.current = false; d.setEstado('esperando'); d.estadoRef.current = 'esperando'; iniciarSpeechRecognition(); }
    } catch {
      enFlujoVozRef.current = false; d.setEstado('esperando'); d.estadoRef.current = 'esperando'; iniciarSpeechRecognition();
    }
  }

  async function enviarAudio(uri: string) {
    const d = depsRef.current;
    d.setEstado('pensando');
    d.estadoRef.current = 'pensando';
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (__DEV__) console.log('[AUDIO] uri:', uri, '| existe:', info.exists, '| size:', (info as any).size ?? '?');
      const muletillaPromise = reproducirMuletilla('busqueda');
      const texto = await transcribirAudio(uri);
      await muletillaPromise;
      if (__DEV__) console.log('[AUDIO] transcripcion:', JSON.stringify(texto));
      if (!texto.trim()) { await hablar('No te escuché bien, ¿podés repetir?'); return; }
      await d.onTextoReconocido(texto);
    } catch (e: any) {
      if (__DEV__) console.log('[AUDIO] CATCH:', e?.message ?? e);
      d.setEstado('esperando');
      d.estadoRef.current = 'esperando';
    } finally {
      enFlujoVozRef.current = false;
      if (d.estadoRef.current === 'esperando') iniciarSpeechRecognition();
    }
  }

  // ── Interfaz pública ──────────────────────────────────────────────────────
  return {
    // Reproductores (brain y useRosita los necesitan)
    player,
    playerMusica,
    recorderConv,

    // Estado
    silbando,
    detectandoSonido,

    // Refs de control de flujo (compartidos con brain y useRosita)
    enFlujoVozRef,
    enColaHablaRef,
    procesandoRef,
    procesandoDesdeRef,
    srActivoRef,
    ultimaActivacionSrRef,
    ultimaMuletillaRef,
    ultimaRapidaRef,

    // Funciones de audio (usadas por brain y useRosita)
    hablar,
    hablarConCola,
    splitEnOraciones,
    extraerPrimeraFrase,
    precachearTexto,
    reproducirMuletilla,
    reproducirTecleo,

    // Funciones de gestión (usadas por useRosita en inicializar/reactivar)
    precachearMuletillas,
    precachearRespuestasRapidas,
    limpiarCacheViejo,

    // Silbido y música
    iniciarSilbido,
    detenerSilbido,
    pararMusica,
    reanudarMusica,

    // SR y escucha manual
    iniciarSpeechRecognition,
    iniciarEscucha,
    detenerEscucha,
  };
}
