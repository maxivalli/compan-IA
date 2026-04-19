/**
 * useAudioPipeline — motor de audio de Rosita.
 *
 * Responsabilidades:
 *   - Speech Recognition continuo vía Deepgram Nova-3 (useDeepgramSR)
 *   - TTS con cache disco + streaming HTTP (expo-audio)
 *   - Cola de oraciones (hablarConCola) con pre-cache solapado
 *   - Respuestas rápidas: pre-cache de audios sin Claude
 *   - Silbido de inactividad (assets locales)
 *   - Watchdog de SR (zombie / vencido / procesandoRef colgado)
 *
 * NO gestiona: lógica de Claude, historial, prompts, domótica, Telegram,
 *              estado visual de ojos, modo noche, sensores, OTA.
 * Recibe callbacks para todo eso a través de AudioPipelineDeps.
 */

import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { useAudioPlayer, AudioPlayer } from 'expo-audio';

// expo-audio no expone duration, currentTime ni loop en sus tipos TypeScript,
// pero sí existen en el objeto subyacente de Android/iOS.
type AudioPlayerExt = AudioPlayer & { duration?: number; currentTime?: number; loop?: boolean };
import { useDeepgramSR } from './useDeepgramSR';
import { Perfil } from '../lib/memoria';
import { ModoNoche } from '../components/RosaOjos';
import { hashTexto, velocidadSegunEdad } from '../lib/claudeParser';
import {
  beginTurnTelemetry,
  getCurrentTurnMetrics,
  markTurnFirstAudio,
  sintetizarVoz,
  urlFishRealtimeStream,
  logCliente,
  VOICE_ID_FEMENINA,
  VOICE_ID_MASCULINA,
  urlFrasePrecacheada,
} from '../lib/ai';
import { RESPUESTAS_RAPIDAS, FRASES_SISTEMA, CategoriaRapida, EstadoRosita } from './useBrain';

const TTS_CACHE_VERSION = 'v6';


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

// ── Muletillas (frases puente mientras Claude genera) ─────────────────────────
export type TipoMuletilla = 'mm' | 'ver' | 'aver' | 'bueno' | 'espera';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MULETILLA_ASSETS: Record<TipoMuletilla, ReturnType<typeof require>> = {
  mm:     require('../assets/audio/[voz mujer argentina]Mmm........ause].mp3'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ver:    require('../assets/audio/[voz mujer argentina]Dejám......er....mp3'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  aver:   require('../assets/audio/[voz mujer argentina][long......er....mp3'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  bueno:  require('../assets/audio/[voz mujer argentina]Bueno......orta].mp3'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  espera: require('../assets/audio/[voz mujer argentina]Esper......to....mp3'),
};

// ── Funciones puras de texto ──────────────────────────────────────────────────

export function slugNombre(nombre: string): string {
  return nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
}

// Convierte enteros 0–999.999.999 a español rioplatense.
// ElevenLabs Flash lee "40" como "cuatro coma cero"; pasar "cuarenta" lo resuelve.
function numToSpanish(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999) return String(n);
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
  if (n < 1000) { const h = Math.floor(n / 100), rest = n % 100; return rest ? `${hunds[h]} ${numToSpanish(rest)}` : hunds[h]; }
  if (n < 1_000_000) {
    const miles = Math.floor(n / 1000), resto = n % 1000;
    const milesStr = miles === 1 ? 'mil' : `${numToSpanish(miles)} mil`;
    return resto ? `${milesStr} ${numToSpanish(resto)}` : milesStr;
  }
  const millones = Math.floor(n / 1_000_000), resto = n % 1_000_000;
  const millonesStr = millones === 1 ? 'un millón' : `${numToSpanish(millones)} millones`;
  return resto ? `${millonesStr} ${numToSpanish(resto)}` : millonesStr;
}

// Extrae el entero de un string numérico con separadores de miles (. o ,) y posibles centavos.
// "70,000" → 70000 | "70.000" → 70000 | "1.500.000,50" → 1500000 | "70.5" → 70
function parseMilesInt(s: string): number {
  const sinCentavos = s.replace(/[.,]\d{1,2}$/, '');
  return parseInt(sinCentavos.replace(/[.,]/g, ''), 10) || 0;
}

/** Limpia texto para TTS: recorta, elimina markup, expande unidades. Pura y determinista. */
export function limpiarTextoParaTTS(texto: string): string {
  const MAX_CHARS = 700; // subido de 450: evita truncar respuestas largas de Claude en hablarConCola
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
    // Monedas: USD/u$s/US$ → dólares | $ solo → pesos | € → euros | £ → libras
    .replace(/\b(?:USD|US\$|u\$s)\s*([\d.,]+)/gi, (_, s) => `${numToSpanish(parseMilesInt(s))} dólares`)
    .replace(/\$\s*([\d.,]+)/g,  (_, s) => `${numToSpanish(parseMilesInt(s))} pesos`)
    .replace(/€\s*([\d.,]+)/g,   (_, s) => `${numToSpanish(parseMilesInt(s))} euros`)
    .replace(/£\s*([\d.,]+)/g,   (_, s) => `${numToSpanish(parseMilesInt(s))} libras`)
    // Números con separadores de miles: 70.000 / 70,000 / 1.500.000
    .replace(/\b(\d{1,3}(?:[.,]\d{3})+)\b/g, (_, s) => numToSpanish(parseMilesInt(s)))
    // Números grandes sin separadores (4+ dígitos): 70000, 1500000
    .replace(/\b(\d{4,9})\b/g, (m) => numToSpanish(parseInt(m, 10)))
    // Números pequeños (1–3 dígitos)
    .replace(/\b(\d{1,3})\b/g, (m) => numToSpanish(parseInt(m, 10)));
}

/** Extrae la primera frase y el resto de un texto. */
export function extraerPrimeraFrase(texto: string): { primera: string; resto: string } {
  // Mínimo 8 chars (igual que el umbral del streaming SSE) para no perder
  // oraciones cortas como "Bien, acá estoy." (16 chars) cuando la respuesta
  // tiene más de una oración.
  const match = texto.match(/^.{8,}?[.!?](?:\s+|$)/);
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
  // Solo agregar la cola si no hay oraciones completas todavía (toda la respuesta es la cola,
  // p.ej. "Bien, acá estoy") o si es muy corta (<= 30 chars).
  // Si ya hay oraciones y la cola es larga, es un fragmento sin terminar del LLM → descartar
  // para evitar que Rosita hable una frase a medias al final de respuestas largas.
  const colaSustancial = cola.length > 30;
  if (cola.length >= 4 && /\w/.test(cola) && (!colaSustancial || oraciones.length === 0)) {
    oraciones.push(cola);
  }
  return oraciones.filter(s => s.length > 0);
}





// ── Tipos públicos ───────────────────────────────────────────────────────────


// ── Interfaz de dependencias ──────────────────────────────────────────────────

export interface AudioPipelineDeps {
  // Refs compartidos con brain / useRosita
  perfilRef:                React.MutableRefObject<Perfil | null>;
  estadoRef:                React.MutableRefObject<EstadoRosita>;
  musicaActivaRef:          React.MutableRefObject<boolean>;
  ultimaCharlaRef:          React.MutableRefObject<number>;
  ultimaActividadRef:       React.MutableRefObject<number>;
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
  onPartialReconocido?:     (texto: string) => void;        // opcional — para ejecución especulativa
  onTextoReconocido:        (texto: string, turnId: string) => Promise<void>;
  onFlujoFoto:              () => Promise<void>;
  onFlujoLeerImagen:        () => Promise<void>;
  onFlujoModoVision:        () => Promise<void>;
  onNuevaCapturaVision:     () => Promise<void>;
  onCerrarModoVision:       () => void;
  modoVisionRef:            React.RefObject<boolean>;
  verificarCharlaProactiva: () => boolean;
}

// ── useAudioPipeline ──────────────────────────────────────────────────────────

export function useAudioPipeline(deps: AudioPipelineDeps) {
  // Actualizar sincrónicamente en cada render para evitar stale closures en async
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // ── Reproductores ─────────────────────────────────────────────────────────
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
  const hablarCancelledRef = useRef(false); // true solo cuando cancelarHablaRef cancela efectivamente (barge-in real)

  // ── Refs de SR ────────────────────────────────────────────────────────────
  const srActivoRef            = useRef(false);
  const ultimaActivacionSrRef  = useRef<number>(0);
  // Suspendido por blur (ej: usuario navegó a un juego) — el watchdog no reinicia SR.
  const srSuspendidoRef        = useRef(false);

  // ── Refs de TTS ──────────────────────────────────────────────────────────
  const ultimoAudioUriRef     = useRef<string | null>(null);
  // Timestamp del último fin de TTS — usado para protección de eco post-TTS en el SR.
  const ultimoFinTTSRef       = useRef<number>(0);
  const ultimoTextoHabladoRef = useRef<string | null>(null);
  const cancelarHablaRef      = useRef<(() => void) | null>(null);
  const bargeInTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hablandoDesdeRef      = useRef<number>(0);

  const precacheInFlightRef        = useRef<Map<string, Promise<void>>>(new Map());
  const precacheRapidasRunningRef    = useRef(false);
  const precacheSistemaRunningRef    = useRef(false);
  const ultimaRapidaRef            = useRef<Partial<Record<CategoriaRapida, number>>>({});

  // Muletilla activa — hablar() la awaita antes de iniciar TTS para que no se solapen.
  const muletillaPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const precacheQueueRef           = useRef<Promise<void>>(Promise.resolve());

  // ── Refs de silbido ──────────────────────────────────────────────────────
  const silbidoActivoRef  = useRef(false);
  const silbidoIndexRef   = useRef(0);
  const silbidoTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Idle DG ───────────────────────────────────────────────────────────────
  // Cierra el WebSocket de Deepgram tras 60s sin actividad post-TTS.
  const dgIdleRef      = useRef(false);
  const dgIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Deepgram SR hook ─────────────────────────────────────────────────────
  const { detenerDG, pausarCapturaDG, reanudarCapturaDG } = useDeepgramSR({
    onReady: () => {
      srActivoRef.current = true;
      ultimaActivacionSrRef.current = Date.now(); // reset zombie timer tras reconexión
      logCliente('dg_sr_ready', { estado: depsRef.current.estadoRef.current });
      // Si DG reconectó mientras el SR está suspendido (juego activo, Rosita hablando,
      // o flujo de voz en curso), pausar AudioCapture inmediatamente para evitar eco.
      if (
        srSuspendidoRef.current
        || depsRef.current.estadoRef.current === 'hablando'
        || enFlujoVozRef.current
        || enColaHablaRef.current
      ) {
        pausarCapturaDG();
      }
    },
    onPartial: (texto) => {
      // Partials de Deepgram = hay voz activa → mostrar waveform
      activarFeedbackSonido();
      depsRef.current.onPartialReconocido?.(texto);
    },
    onFinal: (texto) => {
      // El usuario habló — cancelar idle timer si está corriendo.
      if (dgIdleTimerRef.current) { clearTimeout(dgIdleTimerRef.current); dgIdleTimerRef.current = null; }
      dgIdleRef.current = false;
      const d = depsRef.current;
      // speech_final de Deepgram es el proxy más cercano a "el usuario dejó de hablar".
      // Registrar acá para poder medir lag_speech_end_ms correctamente.
      d.speechEndTsRef.current = Date.now();
      if (procesandoRef.current || enFlujoVozRef.current) return;
      if (d.noMolestarRef.current) return;
      if (d.estadoRef.current === 'pensando') return;
      // Bloquear transcripciones mientras Rosita habla (eco de TTS) o SR suspendido (juego activo)
      if (d.estadoRef.current === 'hablando') return;
      if (srSuspendidoRef.current) return;
      if (d.musicaActivaRef.current) duckMusica();
      procesarTextoReconocido(texto).catch(() => {});
    },
    onError: (reason) => {
      srActivoRef.current = false;
      logCliente('dg_sr_error', { reason });
    },
  });

  // Pausa AudioCapture para evitar eco (Rosita escuchándose a sí misma).
  // El WS queda abierto — se reanuda cuando termine de hablar.
  function safeStopSpeechRecognition() {
    srActivoRef.current = false;
    pausarCapturaDG();
  }

  // ── Limpiar cache viejo (TTS files > 7 días) ─────────────────────────────
  async function limpiarCacheViejo() {
    try {
      const dir = FileSystem.cacheDirectory!;
      const archivos = await FileSystem.readDirectoryAsync(dir);
      const hace7dias = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const candidatos = archivos.filter(a => a.startsWith('tts_') && a.endsWith('.mp3'));
      const infos = await Promise.all(candidatos.map(a => FileSystem.getInfoAsync(dir + a)));
      const aEliminar = candidatos.filter((_, i) => {
        const info = infos[i];
        return info.exists && info.modificationTime && info.modificationTime * 1000 < hace7dias;
      });
      await Promise.all(aEliminar.map(a => FileSystem.deleteAsync(dir + a, { idempotent: true })));
    } catch {}
  }

  // ── SR: iniciar ──────────────────────────────────────────────────────────
  function iniciarSpeechRecognition(fromBargeIn = false) {
    const ahora = Date.now();
    if (ahora - ultimaActivacionSrRef.current < 1500) return;
    // Actualizar antes de cualquier check para que llamadas concurrentes vean el lock
    ultimaActivacionSrRef.current = ahora;
    if (enFlujoVozRef.current) return;
    
    // Si no es barge-in, solo puede arrancar si está 'esperando'. 
    // Si es barge-in, debe estar 'hablando'.
    const d = depsRef.current;
    if (fromBargeIn) {
      if (d.estadoRef.current !== 'hablando') return;
    } else {
      if (srSuspendidoRef.current) return; // juego u otra pantalla tomó el mic
      if (d.estadoRef.current !== 'esperando') return;
      if (enColaHablaRef.current) return;
    }
    
    if (d.noMolestarRef.current) return;

    if (d.estadoRef.current === 'esperando') {
      d.speechEndTsRef.current = 0;
      d.srResultTsRef.current = 0;
    }

    // Marcar activo inmediatamente para que el watchdog no vuelva a llamar antes del onReady.
    srActivoRef.current = true;
    // reanudarCapturaDG: reactiva AudioCapture si el WS sigue abierto,
    // o reconecta si el WS cayó mientras Rosita hablaba.
    reanudarCapturaDG();
    logCliente('sr_start', { estado: depsRef.current.estadoRef.current });
  }

  // ── procesarTextoReconocido ───────────────────────────────────────────────
  async function procesarTextoReconocido(texto: string) {
    const d = depsRef.current;
    const textoNorm = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tiempoDesdeUltimaCharla = Date.now() - d.ultimaCharlaRef.current;
    const enConversacion = d.musicaActivaRef.current ? false : tiempoDesdeUltimaCharla < 60 * 1000;
    try {
      procesandoRef.current = true;
      procesandoDesdeRef.current = Date.now();
      safeStopSpeechRecognition();
      const esRepeticion = enConversacion
        && /repet[ií]|no te escuch[eé]|no entend[ií]|m[aá]s (alto|fuerte)|no te o[ií]|no te oi/.test(textoNorm)
        && ultimoAudioUriRef.current !== null;
      d.srResultTsRef.current = Date.now();
      const lagSpeechEndMs = d.speechEndTsRef.current ? d.srResultTsRef.current - d.speechEndTsRef.current : -1;
      const newTurnId = beginTurnTelemetry();
      logCliente('sr_final_received', { chars: texto.length, lag_speech_end_ms: lagSpeechEndMs });
      if (esRepeticion) {
        await hablar(ultimoTextoHabladoRef.current!);
      } else if (/\b(sac[aá](me)?\s+una?\s+foto|man[dá]|mand[aá](me|les?)?\s+una?\s+foto|hacé?\s+una?\s+foto|tir[aá]\s+una?\s+foto|foto\s+para\s+(la\s+)?famil|foto\s+a\s+(la\s+)?famil)\b/i.test(textoNorm)) {
        await d.onFlujoFoto();
      } else if (d.modoVisionRef.current) {
        if (/\b(listo|cerra|cerr[aá]|gracias|ya est[aá]|no m[aá]s|sal[ií])\b/.test(textoNorm)) {
          d.onCerrarModoVision();
        } else {
          await d.onNuevaCapturaVision();
        }
      } else if (/\b(que (dice|pone|ves|hay)|leeme|lee (esto|eso|ahi|aca)|describime|describi (esto|eso)|mir[aá]\s+(esto|eso|ac[aá]|ah[ií])|que\s+ves\s+ac[aá]|qu[eé]\s+hay\s+ac[aá]|ayud[aá](me)?\s+(a\s+)?ver|no\s+(veo|puedo\s+ver)|us[aá]\s+la\s+c[aá]mara|abr[ií]\s+la\s+c[aá]mara|qu[eé]\s+es\s+(esto|eso)|qu[eé]\s+dice\s+(ac[aá]|ah[ií]|esto|eso))\b/.test(textoNorm)) {
        await d.onFlujoModoVision();
      } else {
        await d.onTextoReconocido(texto, newTurnId);
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
        && !srSuspendidoRef.current
        && !d.musicaActivaRef.current // no arrancar SR mientras suena música
      ) {
        iniciarSpeechRecognition();
      }
    }
  }


  function activarFeedbackSonido() {
    // Side-effect intencional: actualizar ultimaActivacionSrRef evita que el watchdog
    // reinicie el SR justo mientras el usuario está hablando (los 1500ms de lock).
    ultimaActivacionSrRef.current = Date.now();
    if (depsRef.current.estadoRef.current === 'esperando') {
      setDetectandoSonido(true);
      if (detectandoTimerRef.current) clearTimeout(detectandoTimerRef.current);
      detectandoTimerRef.current = setTimeout(() => setDetectandoSonido(false), 4000);
    }
  }
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
      if (d.musicaActivaRef.current) return; // SR intencionalmente parado mientras suena música

      const ahora = Date.now();
      const tiempoDesdeInicio = ahora - ultimaActivacionSrRef.current;
      const srZombie  = srActivoRef.current && tiempoDesdeInicio > 8000;
      const srVencido = srActivoRef.current && tiempoDesdeInicio > 15000;

      if (srSuspendidoRef.current) return;
      // DG en idle: solo verificar proactiva (ella llama despertarDG() antes de hablar).
      if (dgIdleRef.current) {
        d.verificarCharlaProactiva();
        return;
      }
      if (!srActivoRef.current || srZombie || srVencido) {
        if (srZombie || srVencido) {
          if (__DEV__) console.log('[Watchdog] SR', srVencido ? 'vencido (15s)' : 'zombie — reiniciando');
          srActivoRef.current = false;
        }
        iniciarSpeechRecognition();
      } else {
        // SR sano — verificar si corresponde arrancar charla proactiva
        d.verificarCharlaProactiva();
      }
    }, 3000);
    return () => {
      clearInterval(watchdog);
      if (dgIdleTimerRef.current) clearTimeout(dgIdleTimerRef.current);
      detenerDG();
    };
  }, []);

  // ── Duck / unduck música ──────────────────────────────────────────────────
  const MUSICA_VOL_NORMAL = 0.45;
  const MUSICA_VOL_DUCK   = 0.15;
  function duckMusica()   { try { playerMusica.volume = MUSICA_VOL_DUCK;   } catch {} }
  function unduckMusica() { try { playerMusica.volume = MUSICA_VOL_NORMAL; } catch {} }

  // ── Música ────────────────────────────────────────────────────────────────
  function pararMusica() {
    playerMusica.pause();
    depsRef.current.musicaActivaRef.current = false;
    depsRef.current.setMusicaActiva(false);
    // Resetear solo el cooldown de inactividad (ultimaActividadRef) para que
    // el tiempo de música no cuente como "2 horas sin actividad" y no dispare
    // una charla proactiva inmediata. NO se resetea ultimaCharlaRef: el usuario
    // debe nombrar a Rosita para que la escuche después de parar la música.
    depsRef.current.ultimaActividadRef.current = Date.now();
    // Rearrancar SR después de parar la música — la música lo había detenido
    // intencionalmente y nadie más lo reactiva al parar manualmente.
    setTimeout(() => iniciarSpeechRecognition(), 300);
  }
  function despertarDG() {
    if (dgIdleTimerRef.current) { clearTimeout(dgIdleTimerRef.current); dgIdleTimerRef.current = null; }
    dgIdleRef.current = false;
    reanudarCapturaDG(); // reconecta WS si está cerrado
  }

  /** Cierra completamente el WebSocket de Deepgram. Usar cuando la pausa va a ser
   *  larga (modo música) para que Deepgram no siga recibiendo audio del altavoz. */
  function cerrarDGParaMusica() {
    srActivoRef.current = false;
    detenerDG();
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
      // Polling basado en duración real del audio (en lugar de un loop fijo de 4.5s)
      await new Promise<void>(resolve => {
        const safety = setTimeout(() => resolve(), 6000);
        const poll = setInterval(() => {
          if (!silbidoActivoRef.current || depsRef.current.musicaActivaRef.current) {
            clearTimeout(safety); clearInterval(poll);
            try { player.pause(); } catch {}
            resolve(); return;
          }
          const dur = (player as AudioPlayerExt).duration ?? NaN;
          const pos = (player as AudioPlayerExt).currentTime ?? NaN;
          if (!isNaN(dur) && dur > 0 && isFinite(dur) && pos >= dur - 0.15) {
            clearTimeout(safety); clearInterval(poll); resolve();
          }
        }, 100);
      });
    } catch {}
    // Loop: programar el siguiente silbido con pausa entre ellos
    if (silbidoActivoRef.current) {
      silbidoTimerRef.current = setTimeout(() => reproducirSilbido(), 1500);
    }
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
  // Usa playerMusica (canal separado) para no interrumpir player. No toca nada si hay música activa.
  // Loop manual: no depende del flag .loop nativo (poco confiable en expo-audio).
  // Safety timeout de 30s para garantizar que nunca quede corriendo indefinidamente.
  async function reproducirTecleo(abort: { current: boolean }): Promise<void> {
    if (abort.current) return;
    if (depsRef.current.musicaActivaRef.current) return;
    const SAFETY_MS = 30_000;
    const startedAt = Date.now();
    try {
      // Loop manual: cada vez que el audio termina, lo arrancamos de nuevo
      // mientras no se haya pedido abort ni haya música activa.
      while (!abort.current && !depsRef.current.musicaActivaRef.current) {
        if (Date.now() - startedAt > SAFETY_MS) break; // safety timeout
        playerMusica.replace(TECLEO_ASSET);
        playerMusica.play();
        // Esperar fin del clip o abort — poll cada 80ms
        await new Promise<void>(resolve => {
          const safety = setTimeout(() => resolve(), 6000); // máx 6s por clip
          const poll = setInterval(() => {
            if (abort.current || depsRef.current.musicaActivaRef.current) {
              clearTimeout(safety); clearInterval(poll); resolve(); return;
            }
            const dur = (playerMusica as AudioPlayerExt).duration ?? NaN;
            const pos = (playerMusica as AudioPlayerExt).currentTime ?? NaN;
            if (!isNaN(dur) && dur > 0 && isFinite(dur) && pos >= dur - 0.1) {
              clearTimeout(safety); clearInterval(poll); resolve();
            }
          }, 80);
        });
      }
    } catch {}
    finally {
      // No pausar si la música ya tomó el playerMusica.
      try {
        if (!depsRef.current.musicaActivaRef.current) playerMusica.pause();
      } catch {}
    }
  }

  // ── Muletillas (frases puente mientras Claude genera) ─────────────────────
  // Usa playerMusica igual que el tecleo. Pausa Deepgram para evitar eco.
  // Retorna una Promise que resuelve al terminar el clip — hablar() la awaita.
  function reproducirMuletilla(tipo: TipoMuletilla): Promise<void> {
    safeStopSpeechRecognition();
    const promise = (async () => {
      if (depsRef.current.musicaActivaRef.current) return;
      try {
        playerMusica.replace(MULETILLA_ASSETS[tipo]);
        playerMusica.play();
        await new Promise<void>(resolve => {
          const safety = setTimeout(() => resolve(), 4000);
          const poll = setInterval(() => {
            const dur = (playerMusica as AudioPlayerExt).duration ?? NaN;
            const pos = (playerMusica as AudioPlayerExt).currentTime ?? NaN;
            if (!isNaN(dur) && dur > 0 && isFinite(dur) && pos >= dur - 0.1) {
              clearTimeout(safety); clearInterval(poll); resolve();
            }
          }, 80);
        });
      } catch {}
      finally {
        try {
          if (!depsRef.current.musicaActivaRef.current) playerMusica.pause();
        } catch {}
      }
    })();
    muletillaPromiseRef.current = promise;
    return promise;
  }

  // ── Pre-cache TTS ─────────────────────────────────────────────────────────
  async function precachearTexto(texto: string, emotion?: string): Promise<void> {
    const limpio = limpiarTextoParaTTS(texto);
    if (!limpio) return;
    const key = hashTexto(limpio + '|' + (emotion ?? ''));
    const existing = precacheInFlightRef.current.get(key);
    if (existing !== undefined) return existing;
    const cacheUri = FileSystem.cacheDirectory + `tts_${TTS_CACHE_VERSION}_` + key + '.mp3';
    let resolveInFlight!: () => void;
    const inFlightPromise = new Promise<void>(res => { resolveInFlight = res; });
    precacheInFlightRef.current.set(key, inFlightPromise);
    const run = async () => {
      try {
        const info = await FileSystem.getInfoAsync(cacheUri);
        if (info.exists) return;
        const p = depsRef.current.perfilRef.current;
        const voiceId = p?.vozId ?? (p?.vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
        const base64 = await sintetizarVoz(limpio, voiceId, velocidadSegunEdad(p?.edad), emotion);
        if (base64) await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: 'base64' });
      } catch {} finally {
        precacheInFlightRef.current.delete(key);
        resolveInFlight();
      }
    };
    precacheQueueRef.current = precacheQueueRef.current.catch(() => {}).then(run);
    // La cola garantiza que solo corre un request Fish Audio a la vez.
    // inFlightPromise permite que hablar() espere el resultado en vez de lanzar un segundo request.
  }

  async function precachearRespuestasRapidas(nombre?: string) {
    if (precacheRapidasRunningRef.current) return;
    precacheRapidasRunningRef.current = true;
    const p = depsRef.current.perfilRef.current;
    const vozGenero = p?.vozGenero ?? 'femenina';
    const genero: 'femenina' | 'masculina' = vozGenero === 'masculina' ? 'masculina' : 'femenina';
    const effectiveVoiceId = p?.vozId ?? (vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
    const n = nombre ?? p?.nombreAbuela ?? '';
    for (const cat of Object.keys(RESPUESTAS_RAPIDAS) as CategoriaRapida[]) {
      const { [genero]: lista, emotion } = RESPUESTAS_RAPIDAS[cat];
      for (let i = 0; i < lista.length; i++) {
        const textoRaw = lista[i];
        const texto = textoRaw.replace(/\{n\}/g, n).trim();
        if (!texto) continue;
        // Para frases sin {n} intentar descarga desde backend
        if (!textoRaw.includes('{n}')) {
          const limpio = limpiarTextoParaTTS(texto);
          const key = hashTexto(limpio + '|' + emotion);
          const cacheUri = FileSystem.cacheDirectory + `tts_${TTS_CACHE_VERSION}_${key}.mp3`;
          const info = await FileSystem.getInfoAsync(cacheUri).catch(() => ({ exists: false }));
          if (!info.exists) {
            const remoteUrl = urlFrasePrecacheada(effectiveVoiceId, 'rapida', cat, i, genero);
            const downloaded = await FileSystem.downloadAsync(remoteUrl, cacheUri).catch(() => null);
            if (downloaded?.status === 200) continue;
            // downloadAsync escribe el body del 404 en disco — borrarlo antes de sintetizar
            await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
          } else {
            continue;
          }
        }
        // Fallback: síntesis local (también cubre frases con {n})
        await precachearTexto(texto, emotion).catch(() => {});
      }
    }
    precacheRapidasRunningRef.current = false;
  }

  async function precachearSistema() {
    if (precacheSistemaRunningRef.current) return;
    precacheSistemaRunningRef.current = true;
    const p = depsRef.current.perfilRef.current;
    const vozGenero = p?.vozGenero ?? 'femenina';
    const effectiveVoiceId = p?.vozId ?? (vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
    for (const [cat, { frases, emotion }] of Object.entries(FRASES_SISTEMA) as [string, { frases: string[]; emotion: string }][]) {
      for (let i = 0; i < frases.length; i++) {
        const limpio = limpiarTextoParaTTS(frases[i]);
        const key = hashTexto(limpio + '|' + emotion);
        const cacheUri = FileSystem.cacheDirectory + `tts_${TTS_CACHE_VERSION}_${key}.mp3`;
        const info = await FileSystem.getInfoAsync(cacheUri).catch(() => ({ exists: false }));
        if (info.exists) continue;
        const remoteUrl = urlFrasePrecacheada(effectiveVoiceId, 'sistema', cat, i);
        const downloaded = await FileSystem.downloadAsync(remoteUrl, cacheUri).catch(() => null);
        if (downloaded?.status === 200) continue;
        // downloadAsync escribe el body del 404 en disco — borrarlo antes de sintetizar
        await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
        await precachearTexto(frases[i], emotion).catch(() => {});
      }
    }
    precacheSistemaRunningRef.current = false;
  }

  // ── TTS principal ─────────────────────────────────────────────────────────
  async function hablar(texto: string, emotion?: string) {
    // Esperar a que la muletilla del turno termine antes de reproducir TTS.
    // Si no hay muletilla activa, muletillaPromiseRef ya está resuelta — sin costo.
    await muletillaPromiseRef.current.catch(() => {});

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
    // Barge-in desactivado temporalmente — causa eco del TTS en el SR
    if (bargeInTimerRef.current) clearTimeout(bargeInTimerRef.current);

    texto = limpiarTextoParaTTS(texto);

    try {
      // ── TTS — cache disco o REST Fish Audio ──────────────────────────────
      const cacheKey = hashTexto(texto + '|' + (emotion ?? ''));
      const cacheUri = FileSystem.cacheDirectory + `tts_${TTS_CACHE_VERSION}_` + cacheKey + '.mp3';
      const info = await FileSystem.getInfoAsync(cacheUri);
      const p = d.perfilRef.current;
      const voiceId = p?.vozId ?? (p?.vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
      if (__DEV__) console.log(`[TTS-CACHE] ${info.exists ? 'HIT' : 'MISS'} | chars:${texto.length}`);

      let playUri: string | null = info.exists ? cacheUri : null;

      if (!playUri) {
        // Stream directo: ExoPlayer empieza a reproducir cuando llegan los primeros chunks
        // (~300-400ms) en vez de esperar la descarga completa (~850-1000ms).
        // En paralelo, descargamos y cacheamos con sintetizarVoz para el próximo turn.
        try {
          const streamUrl = await urlFishRealtimeStream(texto, voiceId, velocidadSegunEdad(p?.edad), emotion);
          logCliente('tts_path', { chars: texto.length, emotion: emotion ?? 'none', provider: 'fish_stream' });
          // Cache en background via precachearTexto (usa el in-flight map, evita double call)
          precachearTexto(texto, emotion).catch(() => {});
          playUri = streamUrl;
        } catch {
          // Fallback a REST si no se puede construir la URL de stream
          logCliente('tts_path', { chars: texto.length, emotion: emotion ?? 'none', provider: 'fish_rest_fallback' });
          try {
            const base64 = await sintetizarVoz(texto, voiceId, velocidadSegunEdad(p?.edad), emotion);
            if (base64) {
              await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: 'base64' });
              playUri = cacheUri;
            }
          } catch {}
        }
      }

      if (playUri) {
        ultimoAudioUriRef.current = playUri;
        try { player.pause(); } catch {}
        player.replace({ uri: playUri });
        d.estadoRef.current = 'hablando';
        player.play();
        if (__DEV__) console.log('[TTS] play() llamado');
        await new Promise<void>(resolve => {
          let resolved = false;
          const done = (motivo: string) => {
            if (resolved) return;
            resolved = true;
            cancelarHablaRef.current = null;
            clearInterval(pollInterval);
            if (durationTimer !== undefined) clearTimeout(durationTimer);
            if (posStableTimer !== undefined) clearTimeout(posStableTimer);
            clearTimeout(safetyTimeout);
            clearTimeout(noStartTimer);
            if (bargeInTimerRef.current) { clearTimeout(bargeInTimerRef.current); bargeInTimerRef.current = null; }
            if (__DEV__) console.log('[TTS] fin de reproducción, motivo:', motivo);
            const turnMetrics = getCurrentTurnMetrics();
            logCliente('hablar_end', {
              motivo,
              pos: Math.round(((player as AudioPlayerExt).currentTime ?? 0) * 1000),
              dur: Math.round(((player as AudioPlayerExt).duration ?? 0) * 1000),
              e2e_now_ms: turnMetrics.e2eNowMs ?? -1,
            });
            resolve();
          };

          const safetyTimeout = setTimeout(() => done('safety-timeout'), 45000);
          let started = false;
          let silenceCount = 0;
          let durationTimer: ReturnType<typeof setTimeout> | undefined;
          let posStableTimer: ReturnType<typeof setTimeout> | undefined;
          let lastPos = -1;
          cancelarHablaRef.current = () => {
            try { player.pause(); } catch {}
            hablarCancelledRef.current = true;
            done('barge-in');
          };

          // Stream HTTP → 6s (buffering); archivo local → 4s (debería arrancar casi de inmediato).
          // Se basa en playUri (ya resuelto) y NO en info.exists para evitar el bug donde el
          // fallback REST escribe cacheUri pero info.exists sigue siendo false → 10s de silencio.
          // HTTP: 9s para cubrir el peor caso (Fish RT slot ocupado 3s + REST fallback ~1.5s + buffering ExoPlayer).
          // Local: 4s sigue siendo suficiente para archivos cacheados.
          const noStartTimer = setTimeout(() => { if (!started) done('no-start'); }, typeof playUri === 'string' && playUri.startsWith('http') ? 9000 : 4000);

          let playRetries = 0;
          const pollInterval = setInterval(() => {
            const playing = player.playing;
            const dur = (player as any).duration as number;
            const pos = (player as any).currentTime as number;
            const durKnown = !isNaN(dur) && dur > 0 && isFinite(dur) && dur < 7200;

            if (started && durationTimer === undefined && durKnown) {
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
                }
              } else {
                playRetries++;
                // Si ExoPlayer ignora el play() síncrono inicial (frecuente al cambiar rápido de URIs)
                // forzamos el play de nuevo cada ~600ms
                if (playRetries % 4 === 0) {
                  if (__DEV__) console.log('[TTS] forzando play() en ExoPlayer...');
                  try { player.play(); } catch {}
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
      } else {
        if (__DEV__) console.log('[TTS] sintetizarVoz falló, sin audio');
      }
    } catch (e: any) {
      if (__DEV__) console.log('[TTS] CATCH en hablar:', e?.message ?? e);
    }

    hablandoDesdeRef.current = 0;
    cancelarHablaRef.current = null;
    ultimoFinTTSRef.current = Date.now(); // marcar fin de TTS para protección de eco
    if (bargeInTimerRef.current) { clearTimeout(bargeInTimerRef.current); bargeInTimerRef.current = null; }
    // Iniciar (o reiniciar) el timer de idle: si pasan 60s sin actividad, cierra DG.
    if (dgIdleTimerRef.current) clearTimeout(dgIdleTimerRef.current);
    dgIdleTimerRef.current = setTimeout(() => {
      logCliente('dg_idle_close', {});
      detenerDG();
      dgIdleRef.current = true;
      dgIdleTimerRef.current = null;
    }, 60_000);
    unduckMusica();
    d.setEstado('esperando');
    d.estadoRef.current = 'esperando';
    // Delay de 400 ms: le da tiempo al Android AudioSession de liberar el
    // hardware del altavoz y devolver el foco de audio al micrófono antes de
    // arrancar el SR. Sin esto, el SR puede terminar inmediatamente sin result.
    if (!enFlujoVozRef.current && !enColaHablaRef.current) {
      setTimeout(() => {
        if (
          depsRef.current.estadoRef.current === 'esperando'
          && !enFlujoVozRef.current
          && !enColaHablaRef.current
          && !depsRef.current.musicaActivaRef.current // no arrancar SR si música ya está activa
        ) iniciarSpeechRecognition();
      }, 400);
    } else if (enColaHablaRef.current) {
      // Si estamos en un loop (hablarConCola), agregar una pequeña pausa síncrona
      // para forzar al event loop a ceder el control y permitir que ExoPlayer
      // resetee su pipeline de audio. Sin esto, un play() inmediato en la
      // siguiente iteración puede ser ignorado silenciosamente causando 'no-start'.
      // Detener SR durante la pausa para evitar falsos positivos de barge-in.
      if (srActivoRef.current) safeStopSpeechRecognition();
      await new Promise(r => setTimeout(r, 250));
    }
  }

  // ── Cola de oraciones TTS ─────────────────────────────────────────────────
  async function hablarConCola(oraciones: string[], emotion?: string) {
    if (oraciones.length === 0) return;
    enColaHablaRef.current = true;
    hablarCancelledRef.current = false; // reset: solo cortamos si un barge-in real cancela esta cola
    try {
      for (const oracion of oraciones) {
        if (!oracion.trim()) continue;
        await hablar(oracion, emotion);
        // Cortar solo si cancelarHablaRef fue invocado (barge-in real del usuario),
        // no por el simple hecho de que procesandoRef sea true durante el turn.
        if (hablarCancelledRef.current) break;
      }
    } finally {
      enColaHablaRef.current = false;
    }
  }

  // ── Interfaz pública ──────────────────────────────────────────────────────
  return {
    // Reproductores (brain y useRosita los necesitan)
    player,
    playerMusica,

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
    ultimaRapidaRef,

    // Funciones de audio (usadas por brain y useRosita)
    hablar,
    hablarConCola,
    splitEnOraciones,
    extraerPrimeraFrase,
    precachearTexto,
    reproducirTecleo,
    reproducirMuletilla,

    // Funciones de gestión (usadas por useRosita en inicializar/reactivar)
    precachearRespuestasRapidas,
    precachearSistema,
    limpiarCacheViejo,

    // Silbido y música
    iniciarSilbido,
    detenerSilbido,
    pararMusica,
    cerrarDGParaMusica,
    reanudarMusica,
    despertarDG,

    // SR y escucha manual
    iniciarSpeechRecognition,
    /** Detiene el SR marcando el stop como intencional para que el handler 'end' no
     *  dispare un restart espurio. Delegado a safeStopSpeechRecognition() que ya
     *  centraliza la lógica de flag + srActivoRef. */
    pararSpeechRecognitionIntencional(): void { safeStopSpeechRecognition(); },
    suspenderSR(): void {
      srSuspendidoRef.current = true;
      safeStopSpeechRecognition();
    },
    reanudarSR(): void {
      srSuspendidoRef.current = false;
      const d = depsRef.current;
      if (
        d.estadoRef.current === 'esperando'
        && !procesandoRef.current
        && !enFlujoVozRef.current
        && !enColaHablaRef.current
        && !d.noMolestarRef.current
        && d.perfilRef.current?.nombreAbuela
      ) {
        setTimeout(() => {
          if (srSuspendidoRef.current) return;
          if (d.estadoRef.current !== 'esperando' || procesandoRef.current) return;
          iniciarSpeechRecognition();
        }, 200);
      }
    },
  };
}
