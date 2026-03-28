import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { Accelerometer } from 'expo-sensors';
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import {
  cargarPerfil, cargarHistorial, guardarHistorial,
  Perfil, TelegramContacto, guardarEntradaAnimo, agregarRecuerdo,
  guardarRecordatorio, bienvenidaYaDada, marcarBienvenidaDada,
  registrarMusicaHoy, guardarUltimaRadio, cargarUltimaRadio,
  borrarRecordatorio,
  Lista, cargarListas, guardarLista, agregarItemLista, borrarLista,
} from '../lib/memoria';
import { Expresion, ModoNoche } from '../components/RosaOjos';
import { buscarRadio, getFallbackUrl, getFallbackAlt } from '../lib/musica';
import { obtenerClima, climaATexto } from '../lib/clima';
import { getFeriadosCercanos } from '../lib/feriados';
import { enviarAlertaTelegram, enviarFotoTelegram } from '../lib/telegram';
import {
  hashTexto, respuestaOffline,
  construirSystemPromptEstable, construirContextoDinamico, parsearRespuesta, velocidadSegunEdad,
} from '../lib/claudeParser';
import { llamarClaude, llamarClaudeConStreaming, transcribirAudio, sintetizarVoz, urlCartesiaStream, buscarWeb, buscarLugares, leerImagen, sincronizarAnimo, VOICE_ID_FEMENINA, VOICE_ID_MASCULINA } from '../lib/ai';
import * as Location from 'expo-location';
import * as Brightness from 'expo-brightness';
import { obtenerEstadoSmartThings, controlarDispositivo, controlarTodos, obtenerEstadoDispositivo, Dispositivo } from '../lib/smartthings';

// ── Flag de testing: true = usa TTS nativo del sistema en lugar de ElevenLabs ──
const USAR_TTS_NATIVO = false;

// ── Silbidos locales (assets pre-generados) ───────────────────────────────────
const SILBIDOS_ASSETS = [
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../assets/audio/a_gentle_cheerful_wh_#1-1774615322853.mp3'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../assets/audio/a_gentle_cheerful_wh_#1-1774615343390.mp3'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../assets/audio/a_gentle_cheerful_wh_#1-1774615356858.mp3'),
];

const MINUTOS_SIN_CHARLA = 120;
const HORA_DESPERTAR     = 7;
const HORA_CHARLA_INICIO = 9;
const HORA_FIN           = 21;

type Mensaje = { role: 'user' | 'assistant'; content: string };

// ── Muletillas por categoría y género ────────────────────────────────────────

type CategoriaMuletilla = 'empatico' | 'busqueda' | 'nostalgia' | 'comando' | 'default';

// {n} se reemplaza con el nombre de la usuaria al pre-cachear y reproducir.
// Añade ~0.5-1s sin perder contexto — "Mmm, Negrita..." funciona en cualquier situación.
const MULETILLAS: Record<CategoriaMuletilla, { femenina: string[]; masculina: string[] }> = {
  empatico: {
    femenina:  ['Ay, {n}... estoy acá, contame.', 'Uy, {n}... te escucho, decime.', 'Ay, tranquila {n}... acá estoy.'],
    masculina: ['Ay, {n}... estoy acá, contame.', 'Uy, {n}... te escucho, decime.', 'Tranquilo {n}... acá estoy.'],
  },
  busqueda: {
    femenina:  ['A ver, {n}, dame un segundito que me fijo...', 'Aguantame un cachito, {n}, que ya te lo busco...', 'Esperame un ratito, {n}, que reviso...'],
    masculina: ['A ver, {n}, dame un segundito que me fijo...', 'Aguantame un cachito, {n}, que ya te lo busco...', 'Esperame un ratito, {n}, que reviso...'],
  },
  nostalgia: {
    femenina:  ['Mirá vos, {n}... contame.', 'Ay, qué lindo, {n}... decime.', 'Qué bárbaro, {n}, te escucho.'],
    masculina: ['Mirá vos, {n}... contame.', 'Qué interesante, {n}... decime.', 'Qué bárbaro, {n}, te escucho.'],
  },
  comando: {
    femenina:  ['¡Dale, {n}!', '¡Ahora mismo!', '¡Claro, {n}!'],
    masculina: ['¡Dale, {n}!', '¡Ahora mismo!', '¡Claro, {n}!'],
  },
  default: {
    femenina:  ['Mmm, {n}...', 'Mmm... a ver...', 'A ver, {n}...'],
    masculina: ['Mmm, {n}...', 'Mmm... a ver...', 'A ver, {n}...'],
  },
};

type CategoriaRapida = 'saludo' | 'gracias' | 'de_nada' | 'despedida' | 'afirmacion';

const RESPUESTAS_RAPIDAS: Record<CategoriaRapida, { femenina: string[]; masculina: string[]; emotion: string }> = {
  saludo: {
    femenina:  ['¡Hola, {n}! ¿Cómo andás hoy?', '¡{n}! Qué bueno que me hablás. ¿Cómo estás?', '¡Acá estoy, {n}! ¿Cómo te va?'],
    masculina: ['¡Hola, {n}! ¿Cómo andás hoy?', '¡{n}! Qué bueno que me hablás. ¿Cómo estás?', '¡Acá estoy, {n}! ¿Cómo te va?'],
    emotion:   'feliz',
  },
  gracias: {
    femenina:  ['¡De nada {n}!', '¡Para eso estoy, {n}!', '¡De nada, {n}! Cualquier cosa me decís.'],
    masculina: ['¡De nada {n}!', '¡Para eso estoy, {n}!', '¡De nada, {n}! Cualquier cosa me decís.'],
    emotion:   'feliz',
  },
  de_nada: {
    femenina:  ['¡Gracias a vos, {n}!', '¡Ay, qué bueno tenerte acá, {n}!', '¡Gracias, {n}! Me alegra estar acá con vos.'],
    masculina: ['¡Gracias a vos, {n}!', '¡Qué bueno tenerte acá, {n}!', '¡Gracias, {n}! Me alegra estar acá con vos.'],
    emotion:   'feliz',
  },
  despedida: {
    femenina:  ['¡Chau, {n}! Cuidate mucho.', '¡Hasta luego, {n}! Acá voy a estar cuando me necesitás.', '¡Nos vemos, {n}! Un beso grande.'],
    masculina: ['¡Chau, {n}! Cuidate mucho.', '¡Hasta luego, {n}! Acá voy a estar cuando me necesitás.', '¡Nos vemos, {n}! Un beso grande.'],
    emotion:   'neutral',
  },
  afirmacion: {
    femenina:  ['¡Perfecto, {n}! ¿Algo más en lo que te pueda ayudar?', '¡Qué bueno, {n}! Acá estoy si necesitás algo.', '¡Genial, {n}!'],
    masculina: ['¡Perfecto, {n}! ¿Algo más en lo que te pueda ayudar?', '¡Qué bueno, {n}! Acá estoy si necesitás algo.', '¡Genial, {n}!'],
    emotion:   'feliz',
  },
};

function slugNombre(nombre: string): string {
  return nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
}

// Sin muletilla: saludos, gracias, despedidas, afirmaciones — Claude responde < 2s
// "cómo va/viene/estás/andás" solo como saludo — no cuando va seguido de pregunta real ("cómo va a estar el clima")
const PATRON_SKIP = /\b(buen[ao]s?\s*(d[ií]as?|tardes?|noches?)|hola\b|qu[eé] tal|c[oó]mo (est[aá]s|and[aá]s)\b|c[oó]mo (va|viene)\s*[,?]?\s*$|gracias|much[aí]simas?\s+gracias|te agradezco|de nada|chau|hasta\s*(luego|pronto|ma[ñn]ana)|nos vemos|por supuesto|perfecto|entendido|re bien|todo bien)\b/i;
const PATRON_EMPATICO  = /triste|me duele|dolor|me caí|caída|me siento mal|estoy mal|sola?\b|angustia|llor|médico|ambulancia|hospital|me asusta|tengo miedo/i;
const PATRON_BUSQUEDA  = /clima|llover|llueve|temperatura|noticias?|partido|fútbol|quiniela|qué hora|intendente|municipalidad|pronóstico|qué pasó|qué dice|calor|frío|farmacia|hospital|heladeria|restaurant|hotel|banco|supermercado|pami|correo|estacion|nafta|donde queda|donde hay|cerca|polici[aá]|comisari[aá]/i;

// Mapeo de texto del usuario → tipo OSM (para Overpass API)
const LUGAR_TIPOS: Array<{ patron: RegExp; tipo: string }> = [
  { patron: /farmacia/,                                              tipo: 'farmacia' },
  { patron: /hospital|guardia/,                                     tipo: 'hospital' },
  { patron: /cl[ií]nica/,                                           tipo: 'clinica' },
  { patron: /m[eé]dic[ao]|odontologo|dentista|consultorio/,         tipo: 'medico' },
  { patron: /banco/,                                                tipo: 'banco' },
  { patron: /correo|correoargentino/,                               tipo: 'correo' },
  { patron: /supermercado/,                                         tipo: 'supermercado' },
  { patron: /nafta|combustible|ypf|shell|axion|surtidor|estaci[oó]n.{0,5}servicio/, tipo: 'nafta' },
  { patron: /heladeria|helado/,                                     tipo: 'heladeria' },
  { patron: /panaderia/,                                            tipo: 'panaderia' },
  { patron: /veterinaria/,                                          tipo: 'veterinaria' },
  { patron: /restaurant|restaurante|pizzeria/,                      tipo: 'restaurant' },
  { patron: /polici[aá]|comisari[aá]/,                              tipo: 'policia' },
  { patron: /municipalidad|municipio|intendencia/,                   tipo: 'municipalidad' },
  { patron: /hotel|hostal|hospedaje/,                               tipo: 'hotel' },
];
const PATRON_NOSTALGIA = /\bantes\b|en mi época|de joven|de chic[ao]|mi abuelo|mi abuela|mi madre|mi padre|en la escuela|cuando trabajaba|me recuerdo|me acuerdo|en mis tiempos|cuando era/i;
const PATRON_COMANDO   = /pon[eé]|apag[aá]|sub[ií]|baj[aá]|prend[eé]|par[aá]\b|música|la radio|una canción|las luces?|la luz|una alarma|un recordatorio|un timer|despertame/i;

function categorizarMuletilla(texto: string): CategoriaMuletilla | null {
  if (texto.length < 10) return null;
  if (PATRON_SKIP.test(texto))      return null;
  if (PATRON_EMPATICO.test(texto))  return 'empatico';
  if (PATRON_BUSQUEDA.test(texto))  return 'busqueda';
  if (PATRON_NOSTALGIA.test(texto)) return 'nostalgia';
  if (PATRON_COMANDO.test(texto))   return 'comando';
  return 'default';
}

function categorizarRapida(texto: string): CategoriaRapida | null {
  if (texto.length > 50) return null;
  if (PATRON_EMPATICO.test(texto))  return null;
  if (PATRON_BUSQUEDA.test(texto))  return null;
  if (PATRON_COMANDO.test(texto))   return null;
  if (/\b(hola\b|qu[eé] tal|c[oó]mo (est[aá]s|and[aá]s)\b|c[oó]mo (va|viene)\s*[,?]?\s*$|buen[ao]s?\s*(d[ií]as?|tardes?|noches?))/i.test(texto)) return 'saludo';
  if (/\b(gracias|much[aí]simas?\s+gracias|te agradezco)\b/i.test(texto)) return 'gracias';
  if (/\bde nada\b/i.test(texto)) return 'de_nada';
  if (/\b(chau|hasta\s*(luego|pronto|ma[ñn]ana)|nos vemos)\b/i.test(texto)) return 'despedida';
  if (/\b(perfecto|entendido|re bien|todo bien|genial|b[aá]rbaro|de acuerdo)\b/i.test(texto)) return 'afirmacion';
  return null;
}

export function useRosita() {
  useEffect(() => {
    activateKeepAwakeAsync();
    return () => { deactivateKeepAwake(); };
  }, []);

  // ── Estado visible ──────────────────────────────────────────────────────────
  const [estado,            setEstado]            = useState<'esperando' | 'escuchando' | 'pensando' | 'hablando'>('esperando');
  const [expresion,         setExpresion]         = useState<Expresion>('neutral');
  const [cargando,          setCargando]          = useState(true);
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false);
  const [musicaActiva,      setMusicaActiva]      = useState(false);
  const [silbando,          setSilbando]          = useState(false);
  const [linternaActiva,    setLinternaActiva]    = useState(false);
  const [mostrarCamara,     setMostrarCamara]     = useState(false);
  const [camaraFacing,      setCamaraFacing]      = useState<'front' | 'back'>('front');
  const [camaraSilenciosa,  setCamaraSilenciosa]  = useState(false);
  const [detectandoSonido,  setDetectandoSonido]  = useState(false);
  const detectandoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noMolestar,        setNoMolestar]        = useState(false);
  const [modoNoche,         setModoNoche]         = useState<ModoNoche>('despierta');
  const [horaActual,        setHoraActual]        = useState(new Date().getHours());
  const [climaObj,          setClimaObj]          = useState<{ temperatura: number; descripcion: string } | null>(null);
  const [ciudadDetectada,   setCiudadDetectada]   = useState('');
  const [debugGPS,          setDebugGPS]          = useState('');
  const [listas,            setListas]            = useState<Lista[]>([]);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const estadoRef           = useRef(estado);
  const musicaActivaRef     = useRef(musicaActiva);
  const noMolestarRef       = useRef(false);
  const modoNocheRef        = useRef<ModoNoche>('despierta');
  const ultimaCharlaRef     = useRef<number>(Date.now());
  const ultimaActividadRef  = useRef<number>(Date.now());
  const alertaInactividadRef= useRef<number>(0);
  const yaDetuvRef          = useRef(false);
  const perfilRef           = useRef<Perfil | null>(null);
  const historialRef        = useRef<Mensaje[]>([]);
  const procesandoRef       = useRef(false);
  const srActivoRef         = useRef(false);
  const procesandoDesdeRef  = useRef<number>(0);
  const charlaProactivaRef  = useRef(false);
  const proximaAlarmaRef    = useRef<number>(0); // epoch ms de la próxima alarma activa (0 = ninguna)
  const ultimaAlertaRef     = useRef<number>(0);
  const nombreAsistenteRef  = useRef<string>('rosita');
  const expresionTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ojoPicadoTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silbidoTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silbidoActivoRef    = useRef(false);
  const silbidoIndexRef     = useRef(0);
  const musicaNocheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaActivacionSrRef = useRef<number>(0);
  const climaRef            = useRef<string>('');
  const ciudadRef           = useRef<string>('');
  const coordRef            = useRef<{ lat: number; lon: number } | null>(null);
  const climaTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feriadosRef         = useRef<string>('');
  const duckTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerVozRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const telegramOffsetRef   = useRef<number>(0);
  const flashAnim           = useRef(new Animated.Value(0)).current;
  const fotoResolverRef     = useRef<((base64: string | null) => void) | null>(null);
  const ultimoAudioUriRef   = useRef<string | null>(null);
  const ultimoTextoHabladoRef = useRef<string | null>(null);

  // ── Flag para bloquear SR durante flujo de mensajes de voz ──────────────────
  const enFlujoVozRef    = useRef(false);

  // ── Dispositivos Tuya/Smartlife ───────────────────────────────────────────────
  const dispositivosTuyaRef = useRef<Dispositivo[]>([]);

  // ── Última radio reproducida ──────────────────────────────────────────────────
  const ultimaRadioRef = useRef<string | null>(null);

  // ── System prompt en dos bloques: estable (cacheable) + dinámico ─────────────
  const systemEstableRef = useRef<{ key: string; text: string } | null>(null);
  function getSystemBlocks(p: Perfil, climaTexto: string, incluirJuego: boolean, extra = '', incluirChiste = false) {
    const perfKey = `${p.nombreAbuela}|${p.nombreAsistente}|${p.edad}|${p.vozGenero}`;
    if (!systemEstableRef.current || systemEstableRef.current.key !== perfKey) {
      systemEstableRef.current = { key: perfKey, text: construirSystemPromptEstable(p) };
    }
    return [
      { type: 'text' as const, text: systemEstableRef.current.text, cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: construirContextoDinamico(p, climaTexto, incluirJuego, extra, incluirChiste, dispositivosTuyaRef.current) + (ciudadRef.current ? `\nUbicación actual: ${ciudadRef.current}, Argentina.` : '') + (coordRef.current ? `\nCoordenadas GPS exactas: ${coordRef.current.lat.toFixed(4)}, ${coordRef.current.lon.toFixed(4)} — usá estas coordenadas para calcular distancias precisas.` : '') + (feriadosRef.current ? `\n${feriadosRef.current}` : '') },
    ];
  }
  const sinConexionRef   = useRef(false);
  const ultimoSosRef     = useRef<number>(0);

  // ── Audio ───────────────────────────────────────────────────────────────────
  const recorderConv = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player       = useAudioPlayer(null);
  const playerMusica = useAudioPlayer(null);

  // ── Sincronizar refs con estado ─────────────────────────────────────────────
  useEffect(() => { estadoRef.current      = estado;      }, [estado]);
  useEffect(() => {
    musicaActivaRef.current = musicaActiva;
    if (musicaActiva) {
      ExpoSpeechRecognitionModule.stop();
      // Programar verificación nocturna: la música no debería quedar prendida de noche
      if (musicaNocheTimerRef.current) clearTimeout(musicaNocheTimerRef.current);
      musicaNocheTimerRef.current = setTimeout(async () => {
        if (!musicaActivaRef.current) return;
        const hAhora = new Date().getHours();
        // Solo actuar si es horario nocturno
        const _inicio = perfilRef.current?.horaInicioNoche ?? 23;
        const _fin    = perfilRef.current?.horaFinNoche    ?? 9;
        if (hAhora >= _fin && hAhora < _inicio) return;
        const nombre = perfilRef.current?.nombreAbuela ?? '';
        const tsAntes = ultimaCharlaRef.current;
        try {
          await hablar(`¿Seguís ahí, ${nombre}? Son las ${hAhora} y tenés la música puesta.`);
        } catch {}
        // Esperar 2 minutos para ver si responde
        musicaNocheTimerRef.current = setTimeout(() => {
          if (!musicaActivaRef.current) return;
          if (ultimaCharlaRef.current > tsAntes + 5000) return; // respondió
          pararMusica();
        }, 2 * 60 * 1000);
      }, 30 * 60 * 1000);
    } else {
      setSilbando(false);
      if (musicaNocheTimerRef.current) {
        clearTimeout(musicaNocheTimerRef.current);
        musicaNocheTimerRef.current = null;
      }
      if (!enFlujoVozRef.current) iniciarSpeechRecognition();
    }
    return () => {
      if (musicaNocheTimerRef.current) clearTimeout(musicaNocheTimerRef.current);
    };
  }, [musicaActiva]);
  useEffect(() => { noMolestarRef.current  = noMolestar;  }, [noMolestar]);

  // ── Hora actual (para fondo) ────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setHoraActual(new Date().getHours()), 60000);
    return () => clearInterval(id);
  }, []);

  // ── OTA update ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (__DEV__) return;
    const id = setTimeout(async () => {
      try {
        if (__DEV__) console.log('[OTA] chequeando update...');
        const check = await Updates.checkForUpdateAsync();
        if (__DEV__) console.log('[OTA] isAvailable:', check.isAvailable);
        if (!check.isAvailable) return;
        if (__DEV__) console.log('[OTA] descargando...');
        await Updates.fetchUpdateAsync();
        if (__DEV__) console.log('[OTA] descargado, recargando...');
        await Updates.reloadAsync();
      } catch (e: any) {
        if (__DEV__) console.log('[OTA] error:', e?.message ?? e);
      }
    }, 5000);
    return () => clearTimeout(id);
  }, []);

  // ── Monitor de conectividad (cada 60s) ─────────────────────────────────────
  useEffect(() => {
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!BACKEND_URL) return;

    async function chequearConexion() {
      try {
        const ctrl = new AbortController();
        const ctrlId = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`${BACKEND_URL}/health`, { signal: ctrl.signal }).finally(() => clearTimeout(ctrlId));
        const habia = sinConexionRef.current;
        sinConexionRef.current = !res.ok;
        if (habia && res.ok && !noMolestarRef.current) {
          await hablar(`¡Listo, ya tengo señal de nuevo!`);
        }
      } catch {
        const habia = sinConexionRef.current;
        sinConexionRef.current = true;
        if (!habia && !noMolestarRef.current) {
          const p = perfilRef.current;
          await hablar(`${p?.nombreAbuela ? p.nombreAbuela + ', ' : ''}por ahora no tengo señal. Seguí hablándome y te respondo con lo que pueda.`);
        }
      }
    }

    // Chequear al arrancar (con pequeño delay para no solaparse con el saludo)
    const initId = setTimeout(chequearConexion, 5000);
    const id = setInterval(chequearConexion, 60 * 1000);
    return () => { clearTimeout(initId); clearInterval(id); };
  }, []);

  // ── Back handler de Android ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        '¿Salir de la app?',
        '¿Estás seguro que querés cerrar la aplicación?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Salir', style: 'destructive', onPress: () => BackHandler.exitApp() },
        ],
        { cancelable: true }
      );
      return true;
    });
    return () => handler.remove();
  }, []);

  // ── Modo noche ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function calcularModo() {
      const h = new Date().getHours();
      const inicioNoche = perfilRef.current?.horaInicioNoche ?? 23;
      const finNoche    = perfilRef.current?.horaFinNoche    ?? HORA_DESPERTAR;
      const esDormir = h >= inicioNoche || h < finNoche;
      if (!esDormir) { setModoNoche('despierta'); modoNocheRef.current = 'despierta'; return; }
      const minutos = (Date.now() - ultimaCharlaRef.current) / 60000;
      const nuevoModo: ModoNoche = minutos >= 1 ? 'durmiendo' : 'soñolienta';
      setModoNoche(nuevoModo);
      modoNocheRef.current = nuevoModo;
    }
    calcularModo();
    const id = setInterval(calcularModo, 10000);
    return () => clearInterval(id);
  }, []);

  // ── Brillo modo noche ───────────────────────────────────────────────────────
  useEffect(() => {
    if (linternaActiva) return; // la linterna maneja su propio brillo
    if (modoNoche !== 'despierta') {
      Brightness.setBrightnessAsync(0).catch(() => {});
    } else {
      Brightness.useSystemBrightnessAsync().catch(() => {});
    }
  }, [modoNoche, linternaActiva]);

  // ── Speech recognition ──────────────────────────────────────────────────────
  useSpeechRecognitionEvent('result', async (event) => {
    const texto = event.results?.[0]?.transcript?.trim();
    if (__DEV__) console.log('[SR] result:', texto, '| proc:', procesandoRef.current, '| flujo:', enFlujoVozRef.current, '| estado:', estadoRef.current, '| asistente:', nombreAsistenteRef.current);
    if (procesandoRef.current) return;
    if (enFlujoVozRef.current) return;

    // Comando de reactivación: funciona incluso con no molestar activo
    if (noMolestarRef.current) {
      const nombreNormNM  = nombreAsistenteRef.current.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const textoNormNM   = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const mencionaNombreNM = new RegExp('(^|\\s)' + nombreNormNM.slice(0, 5), 'i').test(textoNormNM);
      if (mencionaNombreNM && /\b(podes hablar|podes volver|volvé|vuelve|ya podes|despierta|activa(te)?|estoy aca|hola)\b/.test(textoNormNM)) {
        setNoMolestar(false);
      }
      return;
    }
    if (estadoRef.current === 'pensando' || estadoRef.current === 'hablando') return;
    if (!texto || texto.length < 2) return;

    if (musicaActivaRef.current) duckMusica();

    const nombreNorm  = nombreAsistenteRef.current.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const textoNorm   = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nombreRegex = new RegExp('(^|\\s)' + nombreNorm.slice(0, 5), 'i');
    const mencionaNombre = nombreRegex.test(textoNorm);
    const esNoche = modoNocheRef.current !== 'despierta';
    const tiempoDesdeUltimaCharla = Date.now() - ultimaCharlaRef.current;
    const enConversacion = musicaActivaRef.current
      ? false
      : esNoche
        ? tiempoDesdeUltimaCharla < 30 * 1000
        : tiempoDesdeUltimaCharla < 30 * 1000;

    // esPreguntaDirecta: activa Rosita sin necesidad de nombrarla.
    // No usa la primera palabra sola (demasiado genérico cuando hay visitas),
    // sino tres bloques con patrones que casi exclusivamente van dirigidos a un asistente.
    // textoNorm ya está en minúsculas y sin tildes (ej: "poné" → "pone", "avisá" → "avisa").
    const _imp    = /^(pone|pon|avisa(me)?|recorda(me)?|acordate|apaga|prende|encende|enciende|llama|manda|busca)\b/.test(textoNorm);
    const _info   = /(que hora|que dia|que fecha|que tiempo (hace|va|esta)|va a llover|que temperatura|cuanto (es|son|vale|valen))/.test(textoNorm);
    const _entret = /^(contame (un|una)|cantame|jugamos)\b/.test(textoNorm) || /\b(un chiste|una adivinanza)\b/.test(textoNorm);
    const esPreguntaDirecta = (musicaActivaRef.current || esNoche) ? false : (_imp || _info || _entret);
    if (__DEV__) console.log('[SR] check → menciona:', mencionaNombre, '| enConv:', enConversacion, '| pregunta:', esPreguntaDirecta);

    if (!mencionaNombre && !enConversacion && !esPreguntaDirecta) { unduckMusica(); return; }

    // Comando de silencio: "[nombre] hacé silencio" → activa modo no molestar
    if (mencionaNombre && /\b(silencio|callate|calla(te)?|no molestes|no hables|modo silencio|no molestar)\b/.test(textoNorm)) {
      unduckMusica();
      setNoMolestar(true);
      return;
    }

    try {
      procesandoRef.current = true;
      procesandoDesdeRef.current = Date.now();
      ExpoSpeechRecognitionModule.stop();
      const esRepeticion = enConversacion
        && /repet[ií]|no te escuch[eé]|no entend[ií]|m[aá]s (alto|fuerte)|no te o[ií]|no te oi/.test(textoNorm)
        && ultimoAudioUriRef.current !== null;

      if (esRepeticion) {
        await hablar(ultimoTextoHabladoRef.current!);
      } else if (/\bfoto\b/i.test(textoNorm)) {
        await flujoFoto();
      } else if (/\b(que (dice|pone|ves|hay)|leeme|lee (esto|eso|ahi|aca)|describime|describi (esto|eso))\b/.test(textoNorm)) {
        await flujoLeerImagen();
      } else {
        await responderConClaude(texto);
      }
    } finally {
      unduckMusica();
      procesandoRef.current = false;
      procesandoDesdeRef.current = 0;
      iniciarSpeechRecognition();
    }
  });

  useSpeechRecognitionEvent('end', () => {
    srActivoRef.current = false;
    if (enFlujoVozRef.current) return;
    if (!perfilRef.current?.nombreAbuela) return;
    if (estadoRef.current === 'esperando' && !procesandoRef.current) {
      setTimeout(() => {
        if (estadoRef.current === 'esperando' && !procesandoRef.current && !enFlujoVozRef.current) {
          if (!verificarCharlaProactiva()) iniciarSpeechRecognition();
        }
      }, 1500);
    }
  });

  // Feedback visual cuando el SR detecta sonido — soundstart + speechstart como respaldo
  // En algunos Android speechstart es más confiable que soundstart
  function activarFeedbackSonido() {
    ultimaActivacionSrRef.current = Date.now();
    if (estadoRef.current === 'esperando') {
      setDetectandoSonido(true);
      // Safety timeout: si soundend/speechend nunca llegan (quirk Android), apagar a los 4s
      if (detectandoTimerRef.current) clearTimeout(detectandoTimerRef.current);
      detectandoTimerRef.current = setTimeout(() => setDetectandoSonido(false), 4000);
    }
  }
  function desactivarFeedbackSonido() {
    if (detectandoTimerRef.current) clearTimeout(detectandoTimerRef.current);
    setDetectandoSonido(false);
  }
  useSpeechRecognitionEvent('soundstart',  activarFeedbackSonido);
  useSpeechRecognitionEvent('speechstart', activarFeedbackSonido);
  useSpeechRecognitionEvent('soundend',    desactivarFeedbackSonido);
  useSpeechRecognitionEvent('speechend',   desactivarFeedbackSonido);

  useSpeechRecognitionEvent('error', (event) => {
    if (__DEV__) console.log('[SR] error:', event.error);
    srActivoRef.current = false;
    if (enFlujoVozRef.current) return;
    if (!perfilRef.current?.nombreAbuela) return;
    if (estadoRef.current === 'esperando' && !procesandoRef.current) {
      const delay = event.error === 'network' ? 3000 : 1000;
      setTimeout(() => {
        if (!procesandoRef.current && !enFlujoVozRef.current && !verificarCharlaProactiva()) {
          iniciarSpeechRecognition();
        }
      }, delay);
    }
  });

  // ── Inicialización y watchdog ───────────────────────────────────────────────
  useEffect(() => {
    inicializar().catch(() => { setCargando(false); iniciarSpeechRecognition(); });
    const watchdog = setInterval(() => {
      if (enFlujoVozRef.current) return;
      if (!perfilRef.current?.nombreAbuela) return;

      // Recuperar procesandoRef colgado (safetyTimeout de hablar es 45s, damos 60s)
      if (procesandoRef.current && Date.now() - procesandoDesdeRef.current > 60000) {
        if (__DEV__) console.log('[Watchdog] procesandoRef colgado — forzando reset');
        procesandoRef.current = false;
        procesandoDesdeRef.current = 0;
      }

      if (estadoRef.current !== 'esperando' || procesandoRef.current) return;

      const ahora = Date.now();
      const tiempoDesdeInicio = ahora - ultimaActivacionSrRef.current;
      // Zombie: activo según ref pero sin resultado en 25s (margen para pausas naturales del usuario)
      const srZombie = srActivoRef.current && tiempoDesdeInicio > 25000;
      // Reinicio proactivo: Android continuous puede silenciarse sin disparar 'end'
      const srVencido = srActivoRef.current && tiempoDesdeInicio > 45000;

      if (!srActivoRef.current || srZombie || srVencido) {
        if (srZombie || srVencido) {
          if (__DEV__) console.log('[Watchdog] SR', srVencido ? 'vencido (45s)' : 'zombie — reiniciando');
          srActivoRef.current = false;
        }
        iniciarSpeechRecognition();
      }
    }, 5000);
    return () => { ExpoSpeechRecognitionModule.stop(); clearInterval(watchdog); if (climaTimerRef.current) clearTimeout(climaTimerRef.current); };
  }, []);

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

  // ── Muletillas ──────────────────────────────────────────────────────────────

  async function precachearMuletillas(voiceId?: string, nombre?: string) {
    if (USAR_TTS_NATIVO) return;
    const vozGenero = perfilRef.current?.vozGenero ?? 'femenina';
    const genero = vozGenero === 'masculina' ? 'masculina' : 'femenina';
    const effectiveVoiceId = voiceId ?? (vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
    const slug = slugNombre(nombre ?? perfilRef.current?.nombreAbuela ?? '');
    for (const [cat, variantes] of Object.entries(MULETILLAS) as [CategoriaMuletilla, typeof MULETILLAS[CategoriaMuletilla]][]) {
      const lista = variantes[genero];
      for (let i = 0; i < lista.length; i++) {
        const uri = FileSystem.cacheDirectory + `muletilla_v10_${cat}_${i}_${slug}.mp3`;
        const info = await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }));
        if (info.exists) continue;
        const textoFinal = lista[i].replace(/\{n\}/g, nombre ?? perfilRef.current?.nombreAbuela ?? '');
        const base64 = await sintetizarVoz(textoFinal, effectiveVoiceId, velocidadSegunEdad(perfilRef.current?.edad)).catch(() => null);
        if (base64) await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' }).catch(() => {});
      }
    }
  }

  async function precachearRespuestasRapidas(nombre?: string) {
    if (USAR_TTS_NATIVO) return;
    const vozGenero = perfilRef.current?.vozGenero ?? 'femenina';
    const genero = vozGenero === 'masculina' ? 'masculina' : 'femenina';
    const n = nombre ?? perfilRef.current?.nombreAbuela ?? '';
    for (const cat of Object.keys(RESPUESTAS_RAPIDAS) as CategoriaRapida[]) {
      const { [genero]: lista, emotion } = RESPUESTAS_RAPIDAS[cat];
      for (const textoRaw of lista) {
        const texto = textoRaw.replace(/\{n\}/g, n).trim();
        if (texto) await precachearTexto(texto, emotion).catch(() => {});
      }
    }
  }

  const ultimaMuletillaRef = useRef<Partial<Record<CategoriaMuletilla, number>>>({});
  const ultimaRapidaRef    = useRef<Partial<Record<CategoriaRapida, number>>>({});
  const debugTimingsRef    = useRef<{ t0: number; t1: number; t2: number; tPrimeraDetectada: number; tWinner: number; winnerKind: string } | null>(null);

  function extraerPrimeraFrase(texto: string): { primera: string; resto: string } {
    const match = texto.match(/^.{20,}?[.!?](?:\s+|$)/);
    if (!match) return { primera: texto, resto: '' };
    const primera = match[0].trimEnd();
    const resto   = texto.slice(match[0].length).trim();
    if (resto.length < 10) return { primera: texto, resto: '' };
    return { primera, resto };
  }

  /** Divide un texto en oraciones individuales para pipeline de TTS.
   *  Fragmentos < 12 chars se fusionan con el siguiente para evitar llamadas triviales. */
  function splitEnOraciones(texto: string): string[] {
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
    if (cola.length > 0) oraciones.push(cola);
    return oraciones.filter(s => s.length > 0);
  }

  /** Reproduce un array de oraciones en pipeline: pre-cachea la N+1 mientras suena la N.
   *  Garantiza cero gap entre oraciones para respuestas largas (cuentos, juegos). */
  async function hablarConCola(oraciones: string[], emotion?: string) {
    if (oraciones.length === 0) return;
    if (oraciones.length === 1) { await hablar(oraciones[0], emotion); return; }
    for (let i = 0; i < oraciones.length; i++) {
      const nextPrecache = i + 1 < oraciones.length
        ? precachearTexto(oraciones[i + 1], emotion)
        : Promise.resolve();
      await hablar(oraciones[i], emotion);
      await nextPrecache;
    }
  }

  /** Limpia texto para TTS: recorta, elimina markup, expande unidades. Pura y determinista. */
  function limpiarTextoParaTTS(texto: string): string {
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
      });
  }

  /** Pre-cachea TTS en disco (POST /ai/tts → Cartesia bytes → base64 → archivo).
   *  Usa el mismo cache key que hablar() para garantizar cache hit. */
  async function precachearTexto(texto: string, emotion?: string) {
    try {
      const limpio = limpiarTextoParaTTS(texto);
      if (!limpio) return;
      const cacheUri = FileSystem.cacheDirectory + 'tts_v4_' + hashTexto(limpio + '|' + (emotion ?? '')) + '.mp3';
      const info = await FileSystem.getInfoAsync(cacheUri);
      if (info.exists) return;
      const voiceId = perfilRef.current?.vozId ?? (perfilRef.current?.vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
      const base64 = await sintetizarVoz(limpio, voiceId, velocidadSegunEdad(perfilRef.current?.edad), emotion);
      if (base64) await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: 'base64' });
    } catch {}
  }



  async function reproducirMuletilla(categoria: CategoriaMuletilla, abort?: { current: boolean }, onPlay?: () => void): Promise<string> {
    try {
      const vozGenero = perfilRef.current?.vozGenero ?? 'femenina';
      const genero = vozGenero === 'masculina' ? 'masculina' : 'femenina';
      const lista = MULETILLAS[categoria][genero];
      const ultimo = ultimaMuletillaRef.current[categoria] ?? -1;
      let idx: number;
      do { idx = Math.floor(Math.random() * lista.length); } while (idx === ultimo && lista.length > 1);
      ultimaMuletillaRef.current[categoria] = idx;
      const textoRaw  = lista[idx];
      const nombre    = perfilRef.current?.nombreAbuela ?? '';
      const slug      = slugNombre(nombre);
      const texto     = textoRaw.replace(/\{n\}/g, nombre);
      const uri = FileSystem.cacheDirectory + `muletilla_v10_${categoria}_${idx}_${slug}.mp3`;
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return texto;
      if (abort?.current) return texto; // race ya resolvió, no reproducir
      player.replace({ uri });
      player.play();
      onPlay?.();
      // Esperar que el audio termine — o que el race aborte para ceder el player a hablar()
      await new Promise<void>(resolve => {
        const safety = setTimeout(() => resolve(), 3000);
        const poll = setInterval(() => {
          if (abort?.current) {
            clearTimeout(safety);
            clearInterval(poll);
            resolve(); // sin pause — hablar() toma el player directamente
            return;
          }
          const dur = (player as any).duration as number;
          const pos = (player as any).currentTime as number;
          if (dur > 0 && pos >= dur - 0.15) {
            clearTimeout(safety);
            clearInterval(poll);
            player.pause(); // limpiar estado antes de ceder el player a hablar()
            resolve();
          }
        }, 80);
      });
      return texto;
    } catch {}
    return '';
  }

  // ── Activar post-onboarding ─────────────────────────────────────────────────
  async function reactivar() {
    const perfil = await cargarPerfil();
    if (!perfil.nombreAbuela) return;
    perfilRef.current = perfil;
    nombreAsistenteRef.current = (perfil.nombreAsistente ?? 'Rosita').toLowerCase();
    precachearMuletillas(perfil.vozId, perfil.nombreAbuela).catch(() => {});
    precachearRespuestasRapidas(perfil.nombreAbuela).catch(() => {});
    setCargando(false);
    const yaDada = await bienvenidaYaDada();
    if (!yaDada) {
      const asistente = perfil.nombreAsistente ?? 'Rosita';
      const rol = perfil.vozGenero === 'masculina' ? 'tu nuevo compañero' : 'tu nueva compañera';
      await marcarBienvenidaDada();
      await hablar(`¡Hola ${perfil.nombreAbuela}! Soy ${asistente}, ${rol}. Podés hablarme cuando quieras, acá estoy.`);
    }
  }

  async function recargarPerfil() {
    const perfil = await cargarPerfil();
    if (!perfil.nombreAbuela) return;
    perfilRef.current = perfil;
    nombreAsistenteRef.current = (perfil.nombreAsistente ?? 'Rosita').toLowerCase();
  }

  // ── Inicializar ─────────────────────────────────────────────────────────────
  async function inicializar() {
    if (new Date().getFullYear() < 2024) {
      setTimeout(inicializar, 10000);
      return;
    }

    try { await AudioModule.requestRecordingPermissionsAsync(); } catch {}
    try { await ExpoSpeechRecognitionModule.requestPermissionsAsync(); } catch {}
    limpiarCacheViejo().catch(() => {});

    const [perfilGuardado, historialGuardado, listasGuardadas, ultimaRadio] = await Promise.all([
      cargarPerfil(), cargarHistorial(), cargarListas(), cargarUltimaRadio(),
    ]);
    ultimaRadioRef.current = ultimaRadio;
    perfilRef.current    = perfilGuardado;
    historialRef.current = historialGuardado as Mensaje[];
    setListas(listasGuardadas);
    nombreAsistenteRef.current = (perfilGuardado.nombreAsistente ?? 'Rosita').toLowerCase();

    if (!perfilGuardado.nombreAbuela) {
      setMostrarOnboarding(true);
    } else {
      precachearMuletillas(perfilGuardado.vozId, perfilGuardado.nombreAbuela).catch(() => {});
      precachearRespuestasRapidas(perfilGuardado.nombreAbuela).catch(() => {});
      setCargando(false);
      iniciarSpeechRecognition();
    }

    // Retry loop: intenta obtener clima/ubicación hasta lograrlo.
    // Si falla, reintenta cada 30s. Una vez obtenido, refresca cada 60 min.
    async function intentarClima() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { climaTimerRef.current = setTimeout(intentarClima, 30000); return; }
        const serviciosOn = await Location.hasServicesEnabledAsync().catch(() => false);
        if (!serviciosOn) { climaTimerRef.current = setTimeout(intentarClima, 30000); return; }
        // 1) Posición en caché (instantáneo)
        let loc = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000, requiredAccuracy: 5000 }).catch(() => null);
        // 2) Balanced: red + GPS (~1-3s en interiores)
        if (!loc) {
          loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>(r => setTimeout(() => r(null), 15000)),
          ]);
        }
        // 3) Low: solo red celular (muy rápido pero menos preciso)
        if (!loc) {
          loc = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
            new Promise<null>(r => setTimeout(() => r(null), 10000)),
          ]);
        }
        if (!loc) { climaTimerRef.current = setTimeout(intentarClima, 30000); return; }
        const clima = await obtenerClima(loc.coords.latitude, loc.coords.longitude).catch(() => null);
        if (clima) {
          climaRef.current  = climaATexto(clima);
          ciudadRef.current = clima.ciudad ?? '';
          setCiudadDetectada(clima.ciudad ?? '');
          if (clima.latitud && clima.longitud) coordRef.current = { lat: clima.latitud, lon: clima.longitud };
          setClimaObj({ temperatura: clima.temperatura, descripcion: clima.descripcion });
          climaTimerRef.current = setTimeout(intentarClima, 60 * 60 * 1000); // refrescar en 1h
        } else {
          climaTimerRef.current = setTimeout(intentarClima, 30 * 1000);
        }
      } catch (e: any) {
        climaTimerRef.current = setTimeout(intentarClima, 30 * 1000);
      }
    }
    intentarClima();

    obtenerEstadoSmartThings().then(async ({ vinculado, dispositivos }) => {
      if (!vinculado) return;
      // Consultar estado real (encendido/apagado) de cada dispositivo online
      const conEstado = await Promise.all(
        dispositivos.map(async d => {
          if (!d.online) return d;
          try {
            const est = await obtenerEstadoDispositivo(d.id);
            const encendido = est?.['switch'];
            return { ...d, estado: typeof encendido === 'boolean' ? encendido : undefined };
          } catch { return d; }
        })
      );
      dispositivosTuyaRef.current = conEstado;
    }).catch(() => {});

    getFeriadosCercanos().then(texto => {
      feriadosRef.current = texto;
    }).catch(() => {});
  }

  // ── SR helpers ──────────────────────────────────────────────────────────────

  function iniciarSpeechRecognition() {
    if (enFlujoVozRef.current) return;
    const ahora = Date.now();
    if (ahora - ultimaActivacionSrRef.current < 1500) return;
    try {
      try { ExpoSpeechRecognitionModule.stop(); } catch {} // limpiar instancia previa si existía
      ExpoSpeechRecognitionModule.start({
        lang: 'es-AR',
        continuous: true,
        interimResults: false,
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 700,
        },
      });
      srActivoRef.current = true;
    } catch {
      srActivoRef.current = false;
    } finally {
      ultimaActivacionSrRef.current = ahora;
    }
  }

  function verificarCharlaProactiva(): boolean {
    if (noMolestarRef.current) return false;
    const hora = new Date().getHours();
    const dentroDeHorario = hora >= (perfilRef.current?.horaFinNoche ?? HORA_CHARLA_INICIO) && hora < (perfilRef.current?.horaInicioNoche ?? HORA_FIN);
    const minutosSinCharla = (Date.now() - ultimaCharlaRef.current) / 1000 / 60;
    // No arrancar charla proactiva si hay una alarma en las próximas 2 horas
    const alarmaProxima = proximaAlarmaRef.current;
    if (alarmaProxima && alarmaProxima - Date.now() < 2 * 60 * 60 * 1000) return false;
    if (dentroDeHorario && minutosSinCharla >= MINUTOS_SIN_CHARLA) { arrancarCharlaProactiva(); return true; }
    return false;
  }

  async function arrancarCharlaProactiva() {
    if (charlaProactivaRef.current) { iniciarSpeechRecognition(); return; }
    if (estadoRef.current !== 'esperando') { iniciarSpeechRecognition(); return; }
    const p = perfilRef.current;
    if (!p) return;
    charlaProactivaRef.current = true;
    const hora = new Date().getHours();
    const momento = hora < 12 ? 'la mañana' : hora < 14 ? 'la hora del almuerzo' : hora < 18 ? 'la tarde' : 'la noche';

    const temasPorMomento: Record<string, string[]> = {
      'la mañana': [
        'cómo amaneció, si durmió bien o cómo se siente',
        'qué tiene pensado hacer hoy o si tiene algún plan',
        'algo relacionado con el clima de hoy y cómo afecta el día',
        'una comida o desayuno, si ya tomó algo rico',
        'un recuerdo o anécdota relacionada con las mañanas',
        'si soñó algo anoche — preguntalo con curiosidad y calidez, como quien comparte un momento íntimo de la mañana',
        'contale un sueño inventado y gracioso o tierno que "tuviste" anoche (inventalo vos, sé creativa), y después preguntale si ella también suele soñar o si recuerda los sueños',
      ],
      'la hora del almuerzo': [
        'qué va a comer o ya comió, o sugerirle algo rico y saludable',
        'cómo va el día hasta ahora',
        'si descansó un rato o tiene planes para la tarde',
        'algo liviano sobre algún gustos o actividad que le gusta',
      ],
      'la tarde': [
        'cómo está pasando la tarde, si descansó o hizo algo',
        'algún tema de conversación basado en sus gustos o intereses',
        'si se movió un poco hoy o si le apetece hacer algún ejercicio liviano',
        'algo relacionado con algún familiar mencionado en su perfil',
        'una curiosidad, dato interesante o pregunta lúdica para pasar el rato',
        'un recuerdo o anécdota personal que surge naturalmente',
      ],
      'la noche': [
        'cómo le fue en el día, qué fue lo mejor',
        'si cenó algo rico o qué tiene ganas de cenar',
        'si está cansada o cómo se siente físicamente',
        'un tema tranquilo y cálido para cerrar el día con buena energía',
        'si tiene ganas de escuchar música o que le cuenten algo',
      ],
    };

    const temas = temasPorMomento[momento];
    const esFeriadoHoy = feriadosRef.current?.startsWith('Hoy es feriado') ?? false;
    const tema = esFeriadoHoy
      ? `el feriado nacional de hoy (${feriadosRef.current}) — mencionalo con entusiasmo y calidez`
      : temas[Math.floor(Math.random() * temas.length)];

    try {
      const frase = await llamarClaude({
        maxTokens: 120,
        system: getSystemBlocks(p, climaRef.current, false, `\n\nEs ${momento}. Iniciá UNA sola frase corta y cálida sobre este tema: ${tema}. Usá el contexto del perfil si es relevante. Respondé SOLO con la frase, sin etiquetas.`),
        messages: [{ role: 'user', content: 'iniciá una charla' }],
      });
      if (frase) { await hablar(frase); ultimaCharlaRef.current = Date.now(); }
    } catch {
      ultimaCharlaRef.current = Date.now();
    } finally {
      charlaProactivaRef.current = false;
    }
  }

  // ── Silbido ─────────────────────────────────────────────────────────────────
  async function reproducirSilbido() {
    if (!silbidoActivoRef.current) return;
    if (estadoRef.current !== 'esperando') return;
    if (musicaActivaRef.current) return;
    try {
      const asset = SILBIDOS_ASSETS[silbidoIndexRef.current];
      silbidoIndexRef.current = (silbidoIndexRef.current + 1) % SILBIDOS_ASSETS.length;
      player.replace(asset);
      player.play();
      // Poll en lugar de sleep fijo: abortar si música empieza o silbido se detiene
      for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (!silbidoActivoRef.current || musicaActivaRef.current) {
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

  // ── Música ──────────────────────────────────────────────────────────────────
  function duckMusica() { /* volumen fijo — duck desactivado */ }
  function unduckMusica() { /* volumen fijo — duck desactivado */ }

  function pararMusica() { playerMusica.pause(); setMusicaActiva(false); }

  // ── Expresiones de ojos ─────────────────────────────────────────────────────
  function onOjoPicado() {
    if (ojoPicadoTimer.current) clearTimeout(ojoPicadoTimer.current);
    setExpresion('enojada');
    ojoPicadoTimer.current = setTimeout(() => setExpresion('neutral'), 3000);
  }

  function onCaricia() {
    if (ojoPicadoTimer.current) clearTimeout(ojoPicadoTimer.current);
    setExpresion('mimada');
    ojoPicadoTimer.current = setTimeout(() => setExpresion('neutral'), 3500);
  }

  function onRelampago() {
    flashAnim.stopAnimation();
    flashAnim.setValue(0);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 0.85, duration: 60,  useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0,    duration: 120, useNativeDriver: true }),
      Animated.delay(80),
      Animated.timing(flashAnim, { toValue: 0.5,  duration: 50,  useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0,    duration: 250, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      if (expresionTimerRef.current) clearTimeout(expresionTimerRef.current);
      setExpresion('sorprendida');
      expresionTimerRef.current = setTimeout(() => setExpresion('neutral'), 2500);
    }, 400);
  }

  // ── TTS ─────────────────────────────────────────────────────────────────────
  async function hablar(texto: string, emotion?: string) {
    ultimoTextoHabladoRef.current = texto;
    if (__DEV__) console.log('[TTS] hablar() llamado, chars:', texto.length, '| texto:', texto.slice(0, 40));
    ExpoSpeechRecognitionModule.stop();
    detenerSilbido();
    estadoRef.current = 'hablando';

    texto = limpiarTextoParaTTS(texto);

    // ── TTS nativo (testing) ──────────────────────────────────────────────────
    if (USAR_TTS_NATIVO) {
      setEstado('hablando');
      estadoRef.current = 'hablando';
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
        // Safety: palabras × ~400ms + 3s margen, máximo 20s
        const estimado = Math.min(texto.split(' ').length * 400 + 3000, 20000);
        const safety = setTimeout(done, estimado);
        Speech.speak(texto, {
          language: 'es-AR',
          rate: velocidadSegunEdad(perfilRef.current?.edad),
          onDone:    () => done(),
          onError:   () => done(),
          onStopped: () => done(),
        });
        // Poll isSpeakingAsync: detecta inicio y fin aunque los callbacks fallen
        pollInterval = setInterval(async () => {
          try {
            const speaking = await Speech.isSpeakingAsync();
            if (!started && speaking) { started = true; }
            else if (started && !speaking) { done(); }
            else if (!started && !speaking) {
              // Nunca arrancó — si pasaron 3s sin empezar, asumir fallo silencioso
            }
          } catch { done(); }
        }, 300);
        // Si nunca arrancó en 3s, resolver
        setTimeout(() => { if (!started) done(); }, 3000);
      });
      unduckMusica();
      setEstado('esperando');
      estadoRef.current = 'esperando';
      if (!enFlujoVozRef.current) iniciarSpeechRecognition();
      return;
    }

    try {
      // ── TTS — cache disco o streaming Cartesia ────────────────────────────────
      const cacheUri = FileSystem.cacheDirectory + 'tts_v4_' + hashTexto(texto + '|' + (emotion ?? '')) + '.mp3';
      const info = await FileSystem.getInfoAsync(cacheUri);
      const voiceId = perfilRef.current?.vozId ?? (perfilRef.current?.vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
      const isStream = !info.exists;
      const uri: string = info.exists
        ? cacheUri
        : urlCartesiaStream(texto, voiceId, velocidadSegunEdad(perfilRef.current?.edad), emotion);

      if (uri) {
        ultimoAudioUriRef.current = uri;
        player.replace({ uri });
        // estadoRef en 'hablando' ya — suprime el watchdog de SR.
        // setEstado visual se hace en el poll cuando playing=true (audio realmente arrancó),
        // para no animar la boca durante el buffering de Cartesia streaming.
        estadoRef.current = 'hablando';
        // ── Guardar timing TTS para el log consolidado de responderConClaude ──
        if (debugTimingsRef.current) {
          (debugTimingsRef.current as any).tPlay    = Date.now();
          (debugTimingsRef.current as any).cacheHit = isStream ? 'stream' : true;
        }
        player.play();
        if (__DEV__) console.log('[TTS] play() llamado');
        await new Promise<void>(resolve => {
          let resolved = false;
          const done = (motivo: string) => {
            if (resolved) return;
            resolved = true;
            clearInterval(pollInterval);
            if (durationTimer !== undefined) clearTimeout(durationTimer);
            if (posStableTimer !== undefined) clearTimeout(posStableTimer);
            if (estimatedPlaybackTimer !== undefined) clearTimeout(estimatedPlaybackTimer);
            clearTimeout(safetyTimeout);
            clearTimeout(noStartTimer);
            if (__DEV__) console.log('[TTS] fin de reproducción, motivo:', motivo);
            resolve();
          };

          const safetyTimeout = setTimeout(() => done('safety-timeout'), 45000);
          let started = false;
          let silenceCount = 0;
          let durationTimer: ReturnType<typeof setTimeout> | undefined;
          let posStableTimer: ReturnType<typeof setTimeout> | undefined;
          let estimatedPlaybackTimer: ReturnType<typeof setTimeout> | undefined;
          let lastPos = -1;

          // Streaming: Cartesia puede tardar más en bufferear el primer chunk
          const noStartTimer = setTimeout(() => { if (!started) done('no-start'); }, isStream ? 10000 : 4000);

          const pollInterval = setInterval(() => {
            const playing = player.playing;
            const dur = (player as any).duration as number;
            const pos = (player as any).currentTime as number;
            const durKnown = !isNaN(dur) && dur > 0 && isFinite(dur) && dur < 7200;

            // Lazy: setear duration timer si no se pudo al arrancar (streaming sin Content-Length)
            if (started && durationTimer === undefined && durKnown) {
              durationTimer = setTimeout(() => done('duration-timer'), (dur + 0.8) * 1000);
            }

            if (!started) {
              if (playing) {
                started = true;
                lastPos = pos;
                clearTimeout(noStartTimer);
                if (debugTimingsRef.current) (debugTimingsRef.current as any).tAudioStart = Date.now();
                // Animación de boca sincronizada con el audio real (no con play())
                setEstado('hablando');
                if (__DEV__) console.log('[TTS] audio arrancó, dur:', dur?.toFixed(2), 's');
                if (durKnown) {
                  durationTimer = setTimeout(() => done('duration-timer'), (dur + 0.8) * 1000);
                } else if (isStream) {
                  // Fallback para streaming WAV: ExoPlayer puede quedarse en playing=true
                  // avanzando pos hacia el silencio indefinidamente. Estimamos la duración
                  // basándonos en la longitud del texto (~80ms/char) + 2s de margen.
                  // ~70ms/char basado en velocidad de la voz + 500ms de margen
                  const estimatedMs = Math.max(2000, texto.length * 70);
                  if (__DEV__) console.log('[TTS] estimatedPlaybackTimer:', estimatedMs, 'ms (', texto.length, 'chars)');
                  estimatedPlaybackTimer = setTimeout(() => done('estimated-playback'), estimatedMs);
                }
              }
            } else {
              if (!playing) {
                const nearEnd = durKnown && pos >= dur - 0.3;
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
                  // Streaming (durKnown=false): timer independiente de playing (oscila en Android)
                  if (!durKnown && pos > 0.1 && posStableTimer === undefined) {
                    posStableTimer = setTimeout(() => done('pos-stable'), 600);
                  }
                  silenceCount++;
                  const thresh = durKnown ? 15 : (pos > 0.3 ? 5 : 15);
                  if (__DEV__) console.log('[TTS] poll silencio', silenceCount, '| pos:', pos?.toFixed(2), '| dur:', dur?.toFixed(2));
                  if (silenceCount >= thresh) done('silence-polls');
                }
              } else {
                // playing=true: ExoPlayer puede quedarse esperando más datos del WAV streaming
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
        if (__DEV__) console.log('[TTS] fallback a Speech.speak (ElevenLabs falló)');
        setEstado('hablando');
        estadoRef.current = 'hablando';
        await new Promise<void>((resolve) => {
          Speech.speak(texto, { language: 'es-AR', rate: 0.9, onDone: resolve, onError: () => resolve(), onStopped: () => resolve() });
        });
      }
    } catch (e: any) {
      if (__DEV__) console.log('[TTS] CATCH en hablar:', e?.message ?? e);
      try {
        if (__DEV__) console.log('[TTS] fallback a Speech.speak (catch)');
        setEstado('hablando');
        estadoRef.current = 'hablando';
        await new Promise<void>((resolve) => {
          Speech.speak(texto, { language: 'es-AR', rate: 0.9, onDone: resolve, onError: () => resolve(), onStopped: () => resolve() });
        });
      } catch {}
    }

    unduckMusica();
    setEstado('esperando');
    estadoRef.current = 'esperando';

    if (!enFlujoVozRef.current) {
      iniciarSpeechRecognition();
    }
  }

  // ── Escucha manual (botón) ──────────────────────────────────────────────────
  async function iniciarEscucha() {
    if (estadoRef.current !== 'esperando') return;
    detenerSilbido();
    enFlujoVozRef.current = true;
    try {
      if (musicaActivaRef.current) { playerMusica.pause(); setMusicaActiva(false); }
      ExpoSpeechRecognitionModule.stop();
      await new Promise(r => setTimeout(r, 400));
      setEstado('escuchando');
      estadoRef.current = 'escuchando';
      await recorderConv.prepareToRecordAsync();
      recorderConv.record();
      yaDetuvRef.current = false;
      setTimeout(() => { if (!yaDetuvRef.current) detenerEscucha(); }, 8000);
    } catch {
      enFlujoVozRef.current = false;
      setEstado('esperando');
      estadoRef.current = 'esperando';
    }
  }

  async function detenerEscucha() {
    if (yaDetuvRef.current) return;
    yaDetuvRef.current = true;
    try {
      await recorderConv.stop();
      const uri = recorderConv.uri;
      if (uri) { await enviarAudio(uri); }
      else { enFlujoVozRef.current = false; setEstado('esperando'); estadoRef.current = 'esperando'; iniciarSpeechRecognition(); }
    } catch {
      enFlujoVozRef.current = false; setEstado('esperando'); estadoRef.current = 'esperando'; iniciarSpeechRecognition();
    }
  }

  async function enviarAudio(uri: string) {
    setEstado('pensando');
    estadoRef.current = 'pensando';
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (__DEV__) console.log('[AUDIO] uri:', uri, '| existe:', info.exists, '| size:', (info as any).size ?? '?');
      // Muletilla default en paralelo con Whisper — cubre la latencia de red + STT
      const muletillaPromise = reproducirMuletilla('default');
      const texto = await transcribirAudio(uri);
      await muletillaPromise; // esperar que termine antes de ceder el player
      if (__DEV__) console.log('[AUDIO] transcripcion:', JSON.stringify(texto));
      if (!texto.trim()) { await hablar('No te escuché bien, ¿podés repetir?'); return; }
      await responderConClaude(texto);
    } catch (e: any) {
      if (__DEV__) console.log('[AUDIO] CATCH:', e?.message ?? e);
      setEstado('esperando');
      estadoRef.current = 'esperando';
    } finally {
      enFlujoVozRef.current = false;
      if (estadoRef.current === 'esperando') iniciarSpeechRecognition();
    }
  }

  // ── Noticias en tiempo real ─────────────────────────────────────────────────
  async function buscarNoticias(query: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
      const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' after:' + hace5dias)}&hl=es-419&gl=AR&ceid=AR:es-419`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) return null;
      const xml = await res.text();
      const cdataMatches = [...xml.matchAll(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/gi)];
      const plainMatches = cdataMatches.length ? [] : [...xml.matchAll(/<title>([^<]+)<\/title>/gi)];
      const allMatches = cdataMatches.length ? cdataMatches : plainMatches;
      const titulos = allMatches.slice(1, 6).map(m => m[1].trim()).filter(Boolean);
      if (!titulos.length) return null;
      return titulos.join('\n');
    } catch {
      return null;
    }
  }

  // ── Foto para la familia ─────────────────────────────────────────────────────
  async function flujoFoto(silencioso = false, destChatId?: string) {
    const p = perfilRef.current;
    const chatIds = destChatId ? [destChatId] : (p?.telegramContactos ?? []).map(c => c.id);
    if (!chatIds.length) {
      if (!silencioso) await hablar('No tenés familiares configurados para mandar la foto.');
      return;
    }
    if (!silencioso) await hablar('Dale, mirá la pantalla, te saco una foto en tres segundos.');
    setCamaraSilenciosa(silencioso);
    const base64 = await new Promise<string | null>(resolve => {
      fotoResolverRef.current = resolve;
      setMostrarCamara(true);
    });
    setMostrarCamara(false);
    setCamaraSilenciosa(false);
    if (!base64) {
      if (!silencioso) await hablar('Bueno, cuando quieras sacamos la foto.');
      else await enviarAlertaTelegram(chatIds, `📸 No pude sacar la foto. Verificá que la app tenga permisos de cámara.`, p?.nombreAsistente);
      return;
    }
    if (!silencioso) await hablar('Mandando la foto a tu familia, un momento.');
    try {
      const ahora = new Date();
      const hora = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const caption = `📸 Foto de ${p?.nombreAbuela ?? 'tu familiar'} — ${hora}`;
      await enviarFotoTelegram(chatIds, base64, caption);
      if (!silencioso) await hablar('Listo, la foto ya está con tu familia.');
    } catch {
      if (!silencioso) await hablar('No pude mandar la foto, perdoname.');
    }
  }

  // ── Helper de género del usuario ─────────────────────────────────────────────
  function g(femenino: string, masculino: string): string {
    return perfilRef.current?.generoUsuario === 'masculino' ? masculino : femenino;
  }

  // ── Leer imagen con Claude Vision ───────────────────────────────────────────
  async function flujoLeerImagen() {
    const p = perfilRef.current;
    const nombre = p?.nombreAbuela ?? '';
    await hablar(
      `Bueno${nombre ? ` ${nombre}` : ''}, apuntá la cámara a lo que querés que vea. ` +
      `Cuando estés ${g('lista', 'listo')}, quedate ${g('quieta', 'quieto')} y esperá hasta que cuente tres. ` +
      `Yo te digo todo lo que vea.`
    );
    setCamaraFacing('back');
    const base64 = await new Promise<string | null>(resolve => {
      fotoResolverRef.current = resolve;
      setMostrarCamara(true);
    });
    setMostrarCamara(false);
    setCamaraFacing('front');
    if (!base64) {
      await hablar('No pude sacar la foto. ¿Querés intentarlo de nuevo?');
      return;
    }
    await hablar('A ver, déjame mirar...');
    const resultado = await leerImagen(base64);
    if (!resultado) {
      await hablar('No pude ver bien la imagen. ¿Podés acercar un poco más la cámara y volvemos a intentar?');
      return;
    }
    const DIGITOS_ES: Record<string, string> = {
      '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro',
      '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve',
    };
    const textoFormateado = resultado.replace(/\d{2,}/g, m =>
      m.split('').map(d => DIGITOS_ES[d] ?? d).join(', ')
    );
    await hablar(textoFormateado);
  }

  function onFotoCapturada(base64: string) {
    fotoResolverRef.current?.(base64);
    fotoResolverRef.current = null;
  }

  function onFotoCancelada() {
    fotoResolverRef.current?.(null);
    fotoResolverRef.current = null;
  }

  // ── Responder con Claude ────────────────────────────────────────────────────
  async function responderConClaude(textoUsuario: string) {
    if (__DEV__) console.log('[RC] responderConClaude llamado, texto:', textoUsuario.slice(0, 40));
    const p = perfilRef.current;
    if (!p) { console.log('[RC] sin perfil, saliendo'); return; }

    // Gate offline: evita esperar el timeout de red si ya sabemos que no hay conexión
    if (sinConexionRef.current) {
      const chatIds = (p.telegramContactos ?? []).map(c => c.id);
      const respLocal = respuestaOffline(textoUsuario, p.nombreAbuela, p.nombreAsistente ?? 'Rosita', climaRef.current, p.vozGenero ?? 'femenina');
      setEstado('esperando');
      estadoRef.current = 'esperando';
      await hablar(respLocal ?? 'No tengo conexión ahora. Cuando vuelva la señal seguimos.');
      return;
    }

    detenerSilbido();
    setEstado('pensando');
    estadoRef.current = 'pensando';

    // ── Computar flags antes de iniciar muletilla/streaming ──────────────────
    const nuevoHistorial: Mensaje[] = [...historialRef.current, { role: 'user', content: textoUsuario }];
    const textoNorm = textoUsuario.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // ── Respuestas rápidas: saltear Claude para mensajes cortos y predecibles ──
    const catRapida = categorizarRapida(textoNorm);
    if (catRapida) {
      // Afirmaciones solo si Rosita no hizo una pregunta pendiente (podría ser respuesta a ella)
      const hayPreguntaPendiente = catRapida === 'afirmacion' && (() => {
        const last = historialRef.current.filter(m => m.role === 'assistant').pop()?.content ?? '';
        return /\?/.test(last.replace(/\[[^\]]+\]/g, '').slice(-100));
      })();
      if (!hayPreguntaPendiente) {
        const { femenina, masculina, emotion } = RESPUESTAS_RAPIDAS[catRapida];
        const genero = (p.vozGenero ?? 'femenina') === 'masculina' ? 'masculina' : 'femenina';
        const lista  = genero === 'masculina' ? masculina : femenina;
        const ultimo = ultimaRapidaRef.current[catRapida] ?? -1;
        let idx: number;
        do { idx = Math.floor(Math.random() * lista.length); } while (idx === ultimo && lista.length > 1);
        ultimaRapidaRef.current[catRapida] = idx;
        const texto = lista[idx].replace(/\{n\}/g, p.nombreAbuela ?? '').trim();
        setExpresion('feliz');
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: texto }].slice(-30);
        historialRef.current = nuevoHist;
        await guardarHistorial(nuevoHist);
        ultimaCharlaRef.current    = Date.now();
        ultimaActividadRef.current = Date.now();
        await hablar(texto, emotion);
        return;
      }
    }

    const pideJuego   = /\b(juego|jugar|adivinan|trivia|preguntas?|quiz|memori|refranes?|adivina|calculo|calcul|trabale|cuenta|cuantos|cuanto es|matematica)\b/.test(textoNorm);
    const pideChiste  = /\b(chiste|chistoso|gracioso|algo gracioso|me hace rei|haceme rei|contame algo diverti|divertido|me rei)\b/.test(textoNorm)
      || (/\b(otro|uno mas|dale|seguí|segui|mas|contame otro|otro mas)\b/.test(textoNorm)
          && nuevoHistorial.slice(-4).some(m => m.role === 'assistant' && /\[CHISTE\]/i.test(m.content)));
    const pideCuento  = /\b(cuento|historia|relato|narrac|contame (algo|lo que|una)|habla(me)? de (algo|lo que)|que sabes de|libre|lo que quieras|lo que se te ocurra|sorprendeme)\b/.test(textoNorm);
    const esConsultaHorario = /\b(cuando juega|cuand[oa] juega|proximo partido|a que hora juega|a que hora es|proxima carrera|proximo gran premio|f1 horario|calendario deportivo|fixture|cuando es el partido|juega el|juega boca|juega river|juega racing|juega independiente|juega san lorenzo|juega belgrano|juega huracan|juega la seleccion|juega argentina)\b/.test(textoNorm);
    const pideNoticias = !esConsultaHorario && /\b(como salio|salio|resultado|gano|perdio|partido|noticias|novedades|que paso|que hay|que se sabe|que esta pasando|actualidad|hoy en|contame algo|algo nuevo|enterame|boca|river|racing|independiente|san lorenzo|huracan|belgrano|seleccion|mundial|copa|liga|torneo|politica|gobierno|presidente|congreso|senado|diputados|elecciones|ministerio|economia|dolar|inflacion|pobreza|desempleo|formula|formulauno|f1|gran premio|carrera|verstappen|hamilton|leclerc|norris|moto ?gp|tenis|roland garros|wimbledon|us open|nba|nfl|olimpiadas?|clima de manana|pronostico)\b/.test(textoNorm);
    const pideBusqueda = esConsultaHorario || /\b(numero|telefono|direccion|donde queda|donde hay|comedor|municipalidad|municipio|farmacia|hospital|guardia|medico|odontologo|dentista|supermercado|colectivo|omnibus|horario|esta abierto|cerca de|cerca mia|cerca mio|cercano|cercana|mas cerca|banco|correo|correoargentino|renaper|anses|pami|cuando juega|proximo partido|a que hora juega|a que hora es|proxima carrera|proximo gran premio|f1 horario|calendario deportivo|heladeria|heladerias|restaurant|restaurante|pizzeria|panaderia|carniceria|verduleria|ferreteria|peluqueria|gimnasio|kiosco|confiteria|cafe|bar|veterinaria|optica|zapateria|ropa|tienda|negocio|local|comercio|donde puedo|donde compro|donde venden|estacion.{0,5}servicio|nafta|combustible|surtidor|ypf|shell|axion|hay .{3,30} en|intendente|municipio)\b/.test(textoNorm);

    let queryBusqueda = textoUsuario;
    let tipoLugar: string | null = null;
    if (pideBusqueda) {
      const esTelefono = /telefono|numero de|numero tel/.test(textoNorm);
      const esCerca    = /cerca|cercano|cercana|mas cerca|donde hay|en mi ciudad|en la ciudad/.test(textoNorm);
      const esHorario  = esConsultaHorario || /cuando juega|a que hora|proxim|horario de|calendario/.test(textoNorm);
      const ciudad     = ciudadRef.current;
      if (esTelefono && ciudad)   queryBusqueda = `${textoUsuario} número de teléfono ${ciudad} Argentina`;
      else if (esCerca && ciudad) queryBusqueda = `${textoUsuario} más cercano a ${ciudad} Argentina`;
      else if (esHorario)         queryBusqueda = `${textoUsuario} fecha y hora confirmada`;
      else if (ciudad)            queryBusqueda = `${textoUsuario} ${ciudad} Argentina`;

      // Detectar tipo de lugar físico para usar Overpass en vez de Serper
      for (const { patron, tipo } of LUGAR_TIPOS) {
        if (patron.test(textoNorm)) { tipoLugar = tipo; break; }
      }
    }
    // Si hay tipo de lugar pero no tenemos coords todavía, intentar con el caché del OS (instantáneo)
    if (tipoLugar && !coordRef.current) {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getLastKnownPositionAsync();
          if (pos) coordRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        }
      } catch {}
    }
    const esLugarLocal = !!tipoLugar && !!coordRef.current;

    const catMuletilla = categorizarMuletilla(textoUsuario);
    const t0 = Date.now();

    // ── Estado de streaming ───────────────────────────────────────────────────
    let primeraFraseReproducida = false;
    let tagDetectadoStreaming = 'neutral';
    let tPrimeraDetectada = 0;
    let primeraFraseResolver: ((txt: string) => void) | null = null;
    const primeraFraseDisparada = new Promise<string>(resolve => { primeraFraseResolver = resolve; });
    const onPrimeraFrase = (primera: string, tag: string) => {
      tPrimeraDetectada = Date.now();
      tagDetectadoStreaming = tag.toLowerCase();
      // Arrancar el fetch de Cartesia inmediatamente — overlap con muletilla y race.
      // Si hay muletilla de 2s, cuando hablar() llame estará cacheado → cero gap.
      precachearTexto(primera, tag.toLowerCase()).catch(() => {});
      primeraFraseResolver?.(primera);
    };
    const extraBase  = ultimaRadioRef.current ? `\nÚltima radio reproducida: "${ultimaRadioRef.current}" — cuando el usuario pida "la radio" o "la música" sin especificar, usá esa clave.` : '';
    const pideAccion = /\b(recordatorio|recordame|recorda(me)?|alarma|avisa(me)?|timer|temporizador|anota|guarda|manda(le)?|envia(le)?|llama(le)?|emergencia)\b/.test(textoNorm);
    const maxTokBase = (pideCuento || pideJuego || pideChiste) ? 700 : pideAccion ? 300 : undefined;

    try {
      let resultadosBusqueda: string | null = null;
      let claudePromise: Promise<string>;

      // Muletilla arranca de inmediato — los callbacks XHR del streaming
      // se disparan entre los ticks del setInterval interno de hablar().
      let tMuletillaPlay = 0;
      const muletillaAbort = { current: false };
      const muletillaPromise = catMuletilla
        ? reproducirMuletilla(catMuletilla, muletillaAbort, () => { tMuletillaPlay = Date.now(); })
        : Promise.resolve(null);

      if (!pideNoticias && !pideBusqueda) {
        // ── Fast path: streaming inicia en paralelo con la muletilla ──────────
        claudePromise = llamarClaudeConStreaming({
          system:     getSystemBlocks(p, climaRef.current, pideJuego, extraBase, pideChiste),
          messages:   nuevoHistorial.slice(-8),
          maxTokens:  maxTokBase,
          onPrimeraFrase,
        }).catch(async () => {
          if (__DEV__) console.log('[RC] streaming falló, fallback a llamarClaude');
          return await llamarClaude({
            system:    getSystemBlocks(p, climaRef.current, pideJuego, extraBase, pideChiste),
            messages:  nuevoHistorial.slice(-8),
            maxTokens: maxTokBase,
          }) || '';
        });
      } else {
        // ── Slow path: esperar resultados (muletilla corre durante la búsqueda) ─
        const [titulosNoticias, busquedaResult] = await Promise.all([
          pideNoticias ? buscarNoticias(textoUsuario).then(r => r ?? buscarWeb(textoUsuario)) : Promise.resolve(null),
          pideBusqueda
            ? (esLugarLocal
                // Overpass: datos reales de OSM por GPS. Si falla (null), cae a Serper.
                ? buscarLugares(coordRef.current!.lat, coordRef.current!.lon, tipoLugar!)
                    .then(r => r !== null ? r : buscarWeb(queryBusqueda))
                : buscarWeb(queryBusqueda))
            : Promise.resolve(null),
        ]);
        resultadosBusqueda = busquedaResult;
        const noticiasFinales = resultadosBusqueda ? null : titulosNoticias;
        let contextoNoticias = '';
        if (noticiasFinales) {
          contextoNoticias = `\n\n🚨 EXCEPCIÓN DE LONGITUD: Para esta respuesta podés usar hasta 60 palabras para resumir los titulares con claridad.\nNoticias recientes relacionadas con la consulta (fuente: Google News, ${new Date().toLocaleDateString('es-AR')}):\n${noticiasFinales}\nResumí los titulares más relevantes en lenguaje simple y cálido.`;
        }
        let contextoBusqueda = '';
        if (resultadosBusqueda) {
          contextoBusqueda = `\n\n🚨 EXCEPCIÓN DE LONGITUD: Podés usar hasta 80 palabras.
Resultados de búsqueda web (Google, ${new Date().toLocaleDateString('es-AR')}):
${resultadosBusqueda}

REGLAS CRÍTICAS PARA RESPONDER:
1. Usá SOLO los datos que aparecen en los resultados. NUNCA inventes nombres de lugares, direcciones, teléfonos ni personas. Si el dato no está en los resultados, decí claramente "No tengo ese dato ahora mismo" o "No lo encontré".
2. PRONUNCIACIÓN OBLIGATORIA: Cualquier número que sea altura de dirección o teléfono, escribilo separando CADA dígito con coma y espacio. Ejemplos: "Yrigoyen 7, 6, 2" — "Colón 1, 2, 5, 0" — "3, 4, 0, 8, 6, 7, 7". Sin excepción. No hagas esto con años (1990, 2024).
3. CERO PREGUNTAS: NUNCA hagas preguntas de seguimiento al final de tu respuesta. Entregá la información y terminá en punto final.`;
        }
        const systemFull = getSystemBlocks(p, climaRef.current, pideJuego, extraBase + contextoNoticias + contextoBusqueda, pideChiste);
        const msgSlice   = nuevoHistorial.slice(-8);
        claudePromise = llamarClaudeConStreaming({
          system: systemFull, messages: msgSlice, maxTokens: maxTokBase, onPrimeraFrase,
        }).catch(async () => {
          return await llamarClaude({ system: systemFull, messages: msgSlice, maxTokens: maxTokBase }) || '';
        });
      }

      // Race arranca de inmediato — sin esperar que la muletilla termine
      const t1 = Date.now();

      // Inicializar debug ref antes del race para que primera-case también lo vea
      if (p.debugChatId) {
        debugTimingsRef.current = { t0, t1, t2: 0, tPrimeraDetectada: 0, tWinner: 0, winnerKind: '' };
      }

      const winner = await Promise.race([
        primeraFraseDisparada.then(t => ({ kind: 'primera' as const, t })),
        claudePromise.then(t => ({ kind: 'claude' as const, t })),
      ]);
      const tWinner = Date.now();
      if (debugTimingsRef.current) {
        debugTimingsRef.current.tWinner = tWinner;
        debugTimingsRef.current.tPrimeraDetectada = tPrimeraDetectada;
        debugTimingsRef.current.winnerKind = winner.kind;
      }

      // Señalar abort y esperar que la muletilla ceda el player (poll cada 80ms → max 80ms de espera)
      muletillaAbort.current = true;
      const textoMuletilla = await muletillaPromise;

      if (winner.kind === 'primera') {
        // Primera frase lista — reproducirla mientras Claude termina de streamear
        primeraFraseReproducida = true;
        const hablarPrimeraPromise = hablar(winner.t, tagDetectadoStreaming);

        // Esperar Claude en paralelo con la reproducción de primera
        const rawParaPrecache = await claudePromise;

        // Pre-cachear la primera oración del resto mientras primera todavía puede estar sonando
        let precachePromise: Promise<void> | undefined;
        if (rawParaPrecache) {
          const p2 = parsearRespuesta(rawParaPrecache, p.telegramContactos ?? [], p.familiares ?? []);
          const { resto } = extraerPrimeraFrase(p2.respuesta);
          if (resto) {
            const restOraciones = splitEnOraciones(resto);
            if (restOraciones.length > 0) precachePromise = precachearTexto(restOraciones[0], p2.expresion);
          }
        }

        // Esperar que primera termine Y que el pre-cache escriba el archivo
        await hablarPrimeraPromise;
        if (precachePromise) await precachePromise;
      }

      // Obtener respuesta completa de Claude (ya resuelta si primera ganó el race)
      if (__DEV__) console.log('[RC] esperando respuesta completa de Claude...');
      const respuestaRaw = (await claudePromise) || '[NEUTRAL] No entendí bien, ¿podés repetir?';
      const t2 = Date.now();
      // Actualizar t2 en el ref si no fue consumido aún (caso claude ganó el race)
      if (debugTimingsRef.current) debugTimingsRef.current.t2 = t2;

      // ── Log de debug (solo si debugChatId configurado) ──
      const debugChatId = p.debugChatId;
      if (debugChatId) {
        const dt = debugTimingsRef.current as any;
        const ms = (n: number) => n ? `${n - t0}ms` : '–';

        // Muletilla
        const muletillaLinea = textoMuletilla
          ? `🎭 (${catMuletilla}) "${textoMuletilla}" | play: ${tMuletillaPlay ? `${tMuletillaPlay - t0}ms` : '–'}`
          : `🎭 sin muletilla`;

        // Streaming / Claude
        const streamingLinea = winner.kind === 'primera'
          ? `🎙 Streaming: primera=${ms(tPrimeraDetectada)} | completo=${ms(t2)}`
          : `🎙 Sin streaming (claude ganó): completo=${ms(t2)}`;

        // Cartesia
        const modo = dt?.cacheHit === true ? 'cache' : 'stream';
        const cartesiaLinea = dt?.tPlay
          ? `🔊 Cartesia (${modo}): play()=${ms(dt.tPlay)} | audio_real=${dt.tAudioStart ? ms(dt.tAudioStart) : '–'}`
          : `🔊 Cartesia: sin datos`;

        // Análisis de lag percibido
        const primerSonido = tMuletillaPlay || (tPrimeraDetectada && dt?.tPlay) || dt?.tPlay || 0;
        const audioReal    = dt?.tAudioStart || 0;
        const silencioMs   = primerSonido ? primerSonido - t0 : null;
        const gapMs        = (tMuletillaPlay && audioReal) ? audioReal - tMuletillaPlay : null;
        const lagLinea     = [
          silencioMs !== null ? `silencio inicial: ${silencioMs}ms` : null,
          gapMs      !== null ? `gap muletilla→audio: ${gapMs}ms`   : null,
        ].filter(Boolean).join(' | ');

        const lineas = [
          `👤 <b>${textoUsuario}</b>`,
          muletillaLinea,
          streamingLinea,
          cartesiaLinea,
          lagLinea ? `📊 ${lagLinea}` : null,
          `🤖 ${respuestaRaw.slice(0, 400)}`,
        ].filter(Boolean);
        enviarAlertaTelegram([debugChatId], lineas.join('\n'), p.nombreAsistente).catch(() => {});
        debugTimingsRef.current = null;
      }

      const parsed = parsearRespuesta(
        respuestaRaw,
        p.telegramContactos ?? [],
        p.familiares ?? [],
      );

      if (resultadosBusqueda) {
        const sinPregunta = parsed.respuesta.replace(/¿[^?]+?\?\s*$/, '').trim();
        if (sinPregunta.length > 15) {
          parsed.respuesta = sinPregunta;
        }
      }

      // ── PARAR_MUSICA ──
      if (parsed.tagPrincipal === 'PARAR_MUSICA') {
        playerMusica.pause();
        setMusicaActiva(false);
        setExpresion('neutral');
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsed.respuesta }].slice(-30);
        historialRef.current = nuevoHist;
        await guardarHistorial(nuevoHist);
        ultimaCharlaRef.current   = Date.now();
        ultimaActividadRef.current = Date.now();
        await hablar(parsed.respuesta);
        if (expresionTimerRef.current) clearTimeout(expresionTimerRef.current);
        expresionTimerRef.current = setTimeout(() => setExpresion('neutral'), 20000);
        return;
      }

      // ── LINTERNA ──
      if (parsed.tagPrincipal === 'LINTERNA') {
        setLinternaActiva(true);
        Animated.timing(flashAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        try {
          await Brightness.setBrightnessAsync(1);
        } catch {}
        await hablar(parsed.respuesta);
        return;
      }

      // ── MUSICA ──
      if (parsed.tagPrincipal === 'MUSICA' && parsed.generoMusica) {
        setExpresion('neutral');
        // Iniciar la búsqueda/probe del stream en paralelo con el TTS para no agregar latencia
        const streamPromise = buscarRadio(parsed.generoMusica);
        await hablar(parsed.respuesta + ` Para pararla, tocá la pantalla.`);
        setEstado('pensando');
        estadoRef.current = 'pensando';
        ExpoSpeechRecognitionModule.stop();
        const urlStream = await streamPromise; // probablemente ya resuelto mientras hablaba
        if (urlStream) {
          try {
            playerMusica.replace({ uri: urlStream });
            playerMusica.volume = 0.70;
            playerMusica.play();
            musicaActivaRef.current = true; // actualización inmediata: evita race condition con silbido
            detenerSilbido();               // detener silbido inmediatamente si está en curso
            setMusicaActiva(true);
            registrarMusicaHoy().catch(() => {});
            ultimaRadioRef.current = parsed.generoMusica!;
            guardarUltimaRadio(parsed.generoMusica!).catch(() => {});
            setEstado('esperando');
            estadoRef.current = 'esperando';
            iniciarSpeechRecognition();
            if (expresionTimerRef.current) clearTimeout(expresionTimerRef.current);
            expresionTimerRef.current = setTimeout(() => setExpresion('neutral'), 5000);
            // Health check: si a los 10s el stream no arrancó, intenta URL alternativa.
            // currentTime >= 0.5 es señal confiable de que el audio está reproduciéndose.
            setTimeout(async () => {
              if (!musicaActivaRef.current) return;
              if (playerMusica.currentTime >= 0.5) return;
              // Intentar URL alternativa del mismo género
              const altUrl = getFallbackAlt(parsed.generoMusica!, urlStream);
              if (altUrl) {
                try {
                  playerMusica.replace({ uri: altUrl });
                  playerMusica.play();
                  // Segundo check a los 8s
                  setTimeout(async () => {
                    if (!musicaActivaRef.current) return;
                    if (playerMusica.currentTime < 0.5) {
                      pararMusica();
                      await hablar('No pude conectar con esa radio ahora. ¿Querés que intente con otra?');
                    }
                  }, 8000);
                } catch {
                  pararMusica();
                  await hablar('No pude conectar con esa radio ahora. ¿Querés que intente con otra?');
                }
              } else {
                pararMusica();
                await hablar('La radio no está respondiendo. ¿Querés que intente con otra?');
              }
            }, 10000);
          } catch {
            setMusicaActiva(false);
            await hablar('No pude conectar con la radio, perdoname.');
          }
        } else {
          await hablar('No pude conectar con esa radio ahora, perdoname. Podés intentar con otra o pedirme un género musical.');
        }
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsed.respuesta }].slice(-30);
        historialRef.current = nuevoHist;
        await guardarHistorial(nuevoHist);
        ultimaCharlaRef.current = Date.now();
        return;
      }

      // ── TIMER ──
      if (parsed.timerSegundos) {
        const segundos = parsed.timerSegundos;
        const nombre = perfilRef.current?.nombreAbuela ?? '';
        const formatearTiempo = (s: number) => {
          if (s < 60) return `${s} segundo${s !== 1 ? 's' : ''}`;
          const m = Math.round(s / 60);
          if (m < 60) return `${m} minuto${m !== 1 ? 's' : ''}`;
          const h = Math.floor(m / 60); const mm = m % 60;
          const hStr = `${h} hora${h !== 1 ? 's' : ''}`;
          return mm === 0 ? hStr : `${hStr} y ${mm} minuto${mm !== 1 ? 's' : ''}`;
        };
        const mensaje = `${nombre}, ya pasaron los ${formatearTiempo(segundos)}.`.trimStart();

        // Siempre persistir como alarma para sobrevivir al background (iOS suspende JS)
        const timerId = `timer_${Date.now()}`;
        const targetMs = Date.now() + segundos * 1000;
        const targetDate = new Date(targetMs).toISOString().slice(0, 10);
        guardarRecordatorio({
          id: timerId,
          texto: mensaje,
          fechaISO: targetDate,
          timestampEpoch: targetMs,
          esTimer: true,
          esAlarma: true, // chequearAlarmas lo dispara sin restricción de horario
          creadoEn: Date.now(),
        }).catch(() => {});

        if (segundos <= 3600) {
          // Fast-path: setTimeout cuando la app está en primer plano
          if (timerVozRef.current) clearTimeout(timerVozRef.current);
          timerVozRef.current = setTimeout(async () => {
            // Borrar la alarma persistida para evitar doble disparo
            borrarRecordatorio(timerId).catch(() => {});
            if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') {
              await new Promise<void>(resolve => {
                const check = setInterval(() => { if (estadoRef.current === 'esperando') { clearInterval(check); resolve(); } }, 500);
              });
            }
            await hablar(mensaje);
          }, segundos * 1000);
        }
      }

      // ── RECORDATORIO ──
      // Si hay alarma, no guardar recordatorio por el mismo pedido (evita duplicados)
      if (parsed.recordatorio && !parsed.alarma) {
        await guardarRecordatorio(parsed.recordatorio);
      }

      // ── ALARMA ──
      if (parsed.alarma) {
        const fechaISO = new Date(parsed.alarma.timestampEpoch).toISOString().slice(0, 10);
        await guardarRecordatorio({
          id: `alarma_${parsed.alarma.timestampEpoch}`,
          texto: parsed.alarma.texto,
          fechaISO,
          timestampEpoch: parsed.alarma.timestampEpoch,
          esTimer: true,
          esAlarma: true,
          creadoEn: Date.now(),
        }).catch(() => {});
        proximaAlarmaRef.current = parsed.alarma.timestampEpoch;
      }

      // ── RECUERDOS ──
      if (parsed.recuerdos.length > 0) {
        await Promise.all(parsed.recuerdos.map((r: string) => agregarRecuerdo(r)));
        perfilRef.current = await cargarPerfil();
      }

      // ── DOMÓTICA ──
      if (parsed.domotica) {
        const { tipo, dispositivoNombre, valor } = parsed.domotica;
        const dispositivos = dispositivosTuyaRef.current;
        if (!dispositivos.length) {
          // Sin dispositivos vinculados — Rosita ya habrá dicho algo amable
        } else if (tipo === 'todo') {
          // Apagar todos los dispositivos online
          await controlarTodos(dispositivos, false).catch(() => {});
          // Actualizar estado local
          dispositivosTuyaRef.current = dispositivos.map(d =>
            d.online ? { ...d, estado: false } : d
          );
        } else if (tipo === 'control') {
          const dispositivo = dispositivos.find(d =>
            d.nombre.toLowerCase().includes(dispositivoNombre.toLowerCase()) ||
            dispositivoNombre.toLowerCase().includes(d.nombre.toLowerCase())
          );
          if (dispositivo) {
            controlarDispositivo(dispositivo.id, Boolean(valor)).catch(() => {});
            // Actualizar estado local
            dispositivosTuyaRef.current = dispositivos.map(d =>
              d.id === dispositivo.id ? { ...d, estado: Boolean(valor) } : d
            );
          }
        } else if (tipo === 'estado') {
          // Consultar estado real y decírselo a la persona
          const dispositivo = dispositivos.find(d =>
            d.nombre.toLowerCase().includes(dispositivoNombre.toLowerCase()) ||
            dispositivoNombre.toLowerCase().includes(d.nombre.toLowerCase())
          );
          if (dispositivo) {
            const est = await obtenerEstadoDispositivo(dispositivo.id).catch(() => null);
            if (est) {
              const encendida = est['switch'];
              const descripcion = encendida === true
                ? `La ${dispositivo.nombre} está encendida.`
                : encendida === false
                  ? `La ${dispositivo.nombre} está apagada.`
                  : `No pude determinar el estado de ${dispositivo.nombre}.`;
              dispositivosTuyaRef.current = dispositivos.map(d =>
                d.id === dispositivo.id ? { ...d, estado: typeof encendida === 'boolean' ? encendida : d.estado } : d
              );
              await hablar(descripcion);
            }
          }
        }
      }

      // ── LISTAS ──
      if (parsed.listaNueva) {
        const nueva: Lista = { id: Date.now().toString(), nombre: parsed.listaNueva.nombre, items: parsed.listaNueva.items, creadaEn: Date.now() };
        guardarLista(nueva).then(() => cargarListas().then(setListas)).catch(() => {});
      } else if (parsed.listaAgregar) {
        agregarItemLista(parsed.listaAgregar.nombre, parsed.listaAgregar.item).then(() => cargarListas().then(setListas)).catch(() => {});
      } else if (parsed.listaBorrar) {
        borrarLista(parsed.listaBorrar).then(() => cargarListas().then(setListas)).catch(() => {});
      }

      // ── Alertas Telegram: EMERGENCIA > LLAMAR_FAMILIA > MENSAJE_FAMILIAR ──
      if (parsed.emergencia) {
        const chatIds     = (p.telegramContactos ?? []).map(c => c.id);
        const nombreAsist = p.nombreAsistente ?? 'Rosita';
        ultimaAlertaRef.current = Date.now();
        sincronizarAnimo('emergencia', Date.now());
        enviarAlertaTelegram(chatIds, `⚠️ *URGENTE* — ${p.nombreAbuela}\n\n${parsed.emergencia}\n\nAbrí ${nombreAsist} o llamala de inmediato.`, nombreAsist);
      } else if (parsed.llamarFamilia) {
        const chatIds = (p.telegramContactos ?? []).map(c => c.id);
        const ahora   = Date.now();
        if (ahora - ultimaAlertaRef.current > 30 * 60 * 1000) {
          ultimaAlertaRef.current = ahora;
          enviarAlertaTelegram(chatIds, `${p.nombreAbuela} necesita hablar con vos.\n\n_${parsed.llamarFamilia}_`, p.nombreAsistente);
        }
      } else if (parsed.mensajeFamiliar) {
        const { nombreDestino, texto: textoMensaje } = parsed.mensajeFamiliar;
        const contactos: TelegramContacto[] = p.telegramContactos ?? [];
        const contacto = contactos.find(c => c.nombre === nombreDestino)
          ?? contactos.find(c => c.nombre.toLowerCase().includes(nombreDestino.toLowerCase()));
        if (contacto) {
          try {
            await enviarAlertaTelegram([contacto.id], textoMensaje, p.nombreAsistente);
            await hablar(`Listo, le mandé el mensaje a ${contacto.nombre}.`);
          } catch {
            await hablar(`Ay, no pude mandarle el mensaje a ${contacto.nombre}. Intentá de nuevo en un ratito.`);
          }
        } else {
          await hablar(`No encontré a ${nombreDestino} en los contactos. ¿Está configurado en la app?`);
        }
        ultimaCharlaRef.current    = Date.now();
        ultimaActividadRef.current = Date.now();
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsed.respuesta }].slice(-30);
        historialRef.current = nuevoHist;
        await guardarHistorial(nuevoHist);
        return;
      }

      // ── Respuesta normal ──
      setExpresion(parsed.expresion);
      guardarEntradaAnimo(parsed.animoUsuario);
      sincronizarAnimo(parsed.animoUsuario, Date.now());
      const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsed.respuesta }].slice(-30);
      historialRef.current = nuevoHist;
      await guardarHistorial(nuevoHist);
      ultimaCharlaRef.current    = Date.now();
      ultimaActividadRef.current = Date.now();
      if (primeraFraseReproducida) {
        // Primera ya reproducida — reproducir el resto en pipeline (pre-cache por oración)
        const { resto } = extraerPrimeraFrase(parsed.respuesta);
        if (resto) await hablarConCola(splitEnOraciones(resto), parsed.expresion);
      } else {
        await hablarConCola(splitEnOraciones(parsed.respuesta), parsed.expresion);
      }

      // ── Recordatorio de medicamento pendiente ──
      try {
        const medRaw = await AsyncStorage.getItem('medPendiente');
        if (medRaw) {
          const { texto, ts } = JSON.parse(medRaw);
          await AsyncStorage.removeItem('medPendiente');
          const cuatroHoras = 4 * 60 * 60 * 1000;
          if (Date.now() - ts < cuatroHoras) {
            await hablar(`Por cierto, ${texto}`);
          }
        }
      } catch {}

      if (expresionTimerRef.current) clearTimeout(expresionTimerRef.current);
      expresionTimerRef.current = setTimeout(() => {
        if (estadoRef.current === 'esperando') setExpresion('neutral');
      }, 8000);

    } catch (e: any) {
      if (__DEV__) console.log('[RC] CATCH error:', e?.message ?? e);
      const chatIds  = (perfilRef.current?.telegramContactos ?? []).map(c => c.id);
      const respLocal = respuestaOffline(
        textoUsuario,
        p.nombreAbuela,
        p.nombreAsistente ?? 'Rosita',
        climaRef.current,
        p.vozGenero ?? 'femenina',
      );
      await hablar(respLocal ?? 'No pude conectarme ahora. ¿Podés intentar de nuevo en un momento?');
    }
  }

  // ── SOS ─────────────────────────────────────────────────────────────────────
  async function dispararSOS() {
    const ahora = Date.now();
    if (ahora - ultimoSosRef.current < 60000) return;
    ultimoSosRef.current = ahora;

    const p = perfilRef.current;
    const chatIds = (p?.telegramContactos ?? []).map(c => c.id);
    const nombre  = p?.nombreAbuela ?? '';
    const asistente = p?.nombreAsistente ?? 'Rosita';

    if (chatIds.length) {
      enviarAlertaTelegram(
        chatIds,
        `🆘 *ALERTA SOS* — ${nombre} necesita ayuda urgente.\n\nAbrí la app o llamala de inmediato.`,
        asistente,
      );
    }
    guardarEntradaAnimo('triste');
    sincronizarAnimo('sos', Date.now());
    await hablar(`${nombre}, ya avisé a tu familia. Alguien va a comunicarse con vos pronto.`);
  }

  async function dispararSOSCaida() {
    const ahora = Date.now();
    if (ahora - ultimoSosRef.current < 60000) return;
    ultimoSosRef.current = ahora;

    const p = perfilRef.current;
    if (!p?.nombreAbuela) return;
    const chatIds   = (p.telegramContactos ?? []).map(c => c.id);
    const nombre    = p.nombreAbuela;
    const asistente = p.nombreAsistente ?? 'Rosita';

    if (chatIds.length) {
      enviarAlertaTelegram(
        chatIds,
        `⚠️ *POSIBLE CAÍDA* — ${nombre}\n\nEl sensor del teléfono detectó un posible golpe o caída. Verificá que esté bien.`,
        asistente,
      );
    }
    guardarEntradaAnimo('triste');
    sincronizarAnimo('caida', Date.now());
    await hablar(`${nombre}, detecté un posible golpe. ¿Estás bien? Ya avisé a tu familia.`);
  }

  // ── Bostezo por inactividad ──────────────────────────────────────────────────
  const ultimoBostezRef = useRef<number>(0);
  const CINCO_MIN       = 5 * 60 * 1000;

  function bostezar() {
    if (estadoRef.current !== 'esperando') return;
    setExpresion('bostezando');
    setTimeout(() => { if (estadoRef.current === 'esperando') setExpresion('neutral'); }, 2800);
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (estadoRef.current !== 'esperando') return;
      if (modoNocheRef.current !== 'despierta') return;
      if (noMolestarRef.current) return;
      if (musicaActivaRef.current) return;
      if ((Date.now() - ultimaActividadRef.current) < CINCO_MIN) return;
      if ((Date.now() - ultimoBostezRef.current) < 10 * 60 * 1000) return;
      ultimoBostezRef.current = Date.now();
      bostezar();
      setTimeout(bostezar, 5000);
      setTimeout(bostezar, 10000);
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Detección de sacudida y caída ────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const UMBRAL_SACUDIDA  = 2.5;
    const SACUDIDAS        = 3;
    const VENTANA_SACUDIDA = 1500;
    const UMBRAL_CAIDA_LIBRE = 0.5;
    const UMBRAL_IMPACTO     = 3.0;
    const VENTANA_IMPACTO    = 500;

    let enCaidaLibre       = false;
    let timerImpacto: ReturnType<typeof setTimeout> | null = null;
    let ultimaCaida        = 0;
    const COOLDOWN_CAIDA   = 60000;

    let conteo = 0;
    let timerReset: ReturnType<typeof setTimeout> | null = null;

    // 300ms: 3× menos CPU que 100ms, sigue siendo suficiente para caídas y sacudidas
    // En modo durmiendo baja a 1000ms para ahorrar más batería
    const intervalo = modoNocheRef.current === 'durmiendo' ? 1000 : 300;
    Accelerometer.setUpdateInterval(intervalo);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      // Actualizar intervalo dinámicamente si cambió el modo noche
      const nuevoIntervalo = modoNocheRef.current === 'durmiendo' ? 1000 : 300;
      if (nuevoIntervalo !== intervalo) Accelerometer.setUpdateInterval(nuevoIntervalo);
      const magnitud = Math.sqrt(x * x + y * y + z * z);

      if (magnitud < UMBRAL_CAIDA_LIBRE && !enCaidaLibre) {
        enCaidaLibre = true;
        if (timerImpacto) clearTimeout(timerImpacto);
        timerImpacto = setTimeout(() => { enCaidaLibre = false; }, VENTANA_IMPACTO);
      }

      if (enCaidaLibre && magnitud > UMBRAL_IMPACTO) {
        enCaidaLibre = false;
        if (timerImpacto) { clearTimeout(timerImpacto); timerImpacto = null; }
        const ahora = Date.now();
        if (ahora - ultimaCaida > COOLDOWN_CAIDA) {
          ultimaCaida = ahora;
          if (__DEV__) console.log('[CAIDA] caída detectada, magnitud impacto:', magnitud.toFixed(2));
          dispararSOSCaida();
        }
        return;
      }

      if (magnitud > UMBRAL_SACUDIDA) {
        conteo++;
        if (timerReset) clearTimeout(timerReset);
        timerReset = setTimeout(() => { conteo = 0; }, VENTANA_SACUDIDA);
        if (conteo >= SACUDIDAS) {
          conteo = 0;
          if (timerReset) clearTimeout(timerReset);
          dispararSOS();
        }
      }
    });

    return () => {
      sub.remove();
      if (timerReset) clearTimeout(timerReset);
      if (timerImpacto) clearTimeout(timerImpacto);
    };
  }, []);

  // ── Interfaz pública del hook ───────────────────────────────────────────────
  return {
    estado, expresion, cargando, mostrarOnboarding, setMostrarOnboarding, detectandoSonido,
    musicaActiva, silbando, noMolestar, setNoMolestar,
    listas,
    borrarListaVoz: (nombre: string) => borrarLista(nombre).then(() => cargarListas().then(setListas)).catch(() => {}),
    linternaActiva, apagarLinterna: () => {
      setLinternaActiva(false);
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      Brightness.useSystemBrightnessAsync().catch(() => {});
    },
    modoNoche, horaActual, climaObj, ciudadDetectada, flashAnim,
    iniciarEscucha, detenerEscucha, pararMusica, dispararSOS, forzarBostezo: () => {
      ultimoBostezRef.current = Date.now();
      setExpresion('bostezando');
      setTimeout(() => { if (estadoRef.current === 'esperando') setExpresion('neutral'); }, 2800);
    },
    onOjoPicado, onCaricia, onRelampago, iniciarSilbido, detenerSilbido, reactivar, recargarPerfil,
    mostrarCamara, camaraFacing, camaraSilenciosa, onFotoCapturada, onFotoCancelada, flujoFoto,
    refs: {
      perfilRef, estadoRef, noMolestarRef, modoNocheRef,
      ultimaActividadRef, ultimaCharlaRef, alertaInactividadRef,
      telegramOffsetRef, climaRef, ciudadRef, coordRef, setClimaObj,
      musicaActivaRef, enFlujoVozRef, proximaAlarmaRef,
      setEstado, hablar, iniciarSpeechRecognition,
      modoNoche, iniciarSilbido, detenerSilbido, flujoFoto,
    },
    player,
  };
}