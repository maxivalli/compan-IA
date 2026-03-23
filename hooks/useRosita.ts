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
  registrarMusicaHoy,
} from '../lib/memoria';
import { Expresion, ModoNoche } from '../components/RosaOjos';
import { buscarRadio } from '../lib/musica';
import { obtenerClima, climaATexto } from '../lib/clima';
import { getFeriadosCercanos } from '../lib/feriados';
import { enviarAlertaTelegram, enviarFotoTelegram } from '../lib/telegram';
import {
  hashTexto, respuestaOffline,
  construirSystemPromptEstable, construirContextoDinamico, parsearRespuesta, velocidadSegunEdad,
} from '../lib/claudeParser';
import { llamarClaude, transcribirAudio, sintetizarVoz, generarSonido, buscarWeb, leerImagen, sincronizarAnimo, VOICE_ID_FEMENINA, VOICE_ID_MASCULINA } from '../lib/ai';
import * as Brightness from 'expo-brightness';
import { obtenerEstadoTuya, controlarDispositivo, controlarTodosLosTipos, obtenerEstadoDispositivo, Dispositivo } from '../lib/tuya';

const MINUTOS_SIN_CHARLA = 120;
const HORA_DESPERTAR     = 7;
const HORA_CHARLA_INICIO = 9;
const HORA_FIN           = 21;

type Mensaje = { role: 'user' | 'assistant'; content: string };

// ── Muletillas por género ─────────────────────────────────────────────────────

const MULETILLAS_FEMENINA = [
  'A ver...',
  'Mmm...',
  'Dejame pensar...',
  '¿Sabés qué?...',
  'Uy, buena pregunta...',
];

const MULETILLAS_MASCULINO = [
  'A ver...',
  'Mmm...',
  'Déjame pensar...',
  '¿Sabés qué?...',
  'Uy, buena pregunta...',
];

// Solo se usa muletilla cuando la pregunta genuinamente requiere reflexión
const REQUIERE_MULETILLA = /\b(por qu[eé]|c[oó]mo|cu[aá]ndo|d[oó]nde|qui[eé]n|qu[eé] es|cont[aá]me|explic[aá]me|qu[eé] pens[aá]s|qu[eé] opin[aá]s|me recomend[aá]s|qu[eé] hago|ayud[aá]me|qu[eé] ten[ií]a|cu[aá]l|cu[aá]nto|qu[eé] pas[oó])\b/i;

function debeUsarMuletilla(texto: string): boolean {
  return REQUIERE_MULETILLA.test(texto) && texto.length > 20;
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
  const brilloOriginalRef = useRef<number | null>(null);
  const [mostrarCamara,     setMostrarCamara]     = useState(false);
  const [camaraFacing,      setCamaraFacing]      = useState<'front' | 'back'>('front');
  const [camaraSilenciosa,  setCamaraSilenciosa]  = useState(false);
  const [noMolestar,        setNoMolestar]        = useState(false);
  const [modoNoche,         setModoNoche]         = useState<ModoNoche>('despierta');
  const [horaActual,        setHoraActual]        = useState(new Date().getHours());
  const [climaObj,          setClimaObj]          = useState<{ temperatura: number; descripcion: string } | null>(null);

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
  const charlaProactivaRef  = useRef(false);
  const ultimaAlertaRef     = useRef<number>(0);
  const nombreAsistenteRef  = useRef<string>('rosita');
  const expresionTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const miedoTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ojoPicadoTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silbidoTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silbidoActivoRef    = useRef(false);
  const musicaNocheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const climaRef            = useRef<string>('');
  const ciudadRef           = useRef<string>('');
  const coordRef            = useRef<{ lat: number; lon: number } | null>(null);
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
      setSilbando(true);
      ExpoSpeechRecognitionModule.stop();
      // Si son las 23 o más, programar verificación tras 30 minutos
      const h = new Date().getHours();
      if (h >= 23) {
        if (musicaNocheTimerRef.current) clearTimeout(musicaNocheTimerRef.current);
        musicaNocheTimerRef.current = setTimeout(async () => {
          if (!musicaActivaRef.current) return;
          const nombre = perfilRef.current?.nombreAbuela ?? '';
          const tsAntes = ultimaCharlaRef.current;
          await hablar(`¿Seguís ahí, ${nombre}? Son las ${new Date().getHours()} y tenés la música puesta.`);
          // Esperar 2 minutos para ver si responde
          musicaNocheTimerRef.current = setTimeout(() => {
            if (!musicaActivaRef.current) return;
            if (ultimaCharlaRef.current > tsAntes + 5000) return; // respondió
            pararMusica();
          }, 2 * 60 * 1000);
        }, 30 * 60 * 1000);
      }
    } else {
      setSilbando(false);
      if (musicaNocheTimerRef.current) {
        clearTimeout(musicaNocheTimerRef.current);
        musicaNocheTimerRef.current = null;
      }
      if (!enFlujoVozRef.current) iniciarSpeechRecognition();
    }
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
        console.log('[OTA] chequeando update...');
        const check = await Updates.checkForUpdateAsync();
        console.log('[OTA] isAvailable:', check.isAvailable);
        if (!check.isAvailable) return;
        console.log('[OTA] descargando...');
        await Updates.fetchUpdateAsync();
        console.log('[OTA] descargado, recargando...');
        await Updates.reloadAsync();
      } catch (e: any) {
        console.log('[OTA] error:', e?.message ?? e);
      }
    }, 5000);
    return () => clearTimeout(id);
  }, []);

  // ── Monitor de conectividad (cada 3 min) ────────────────────────────────────
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
        if (habia && res.ok && estadoRef.current === 'esperando' && !noMolestarRef.current) {
          await hablar(`${perfilRef.current?.nombreAbuela ?? ''}, ya volví a estar ${perfilRef.current?.vozGenero === 'masculina' ? 'conectado' : 'conectada'}.`);
        }
      } catch {
        const habia = sinConexionRef.current;
        sinConexionRef.current = true;
        if (!habia && estadoRef.current === 'esperando' && !noMolestarRef.current) {
          const p = perfilRef.current;
          if (p?.nombreAbuela) {
            await hablar(`${p.nombreAbuela}, por ahora no tengo señal. Seguí hablándome y te respondo con lo que pueda.`);
          }
        }
      }
    }

    const id = setInterval(chequearConexion, 3 * 60 * 1000);
    return () => clearInterval(id);
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
      const esDormir = h >= 23 || h < HORA_DESPERTAR;
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

  // ── Speech recognition ──────────────────────────────────────────────────────
  useSpeechRecognitionEvent('result', async (event) => {
    const texto = event.results?.[0]?.transcript?.trim();
    console.log('[SR] result:', texto, '| proc:', procesandoRef.current, '| flujo:', enFlujoVozRef.current, '| estado:', estadoRef.current, '| asistente:', nombreAsistenteRef.current);
    if (procesandoRef.current) return;
    if (noMolestarRef.current) return;
    if (enFlujoVozRef.current) return;
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
        : tiempoDesdeUltimaCharla < 60 * 1000;

    const esPreguntaDirecta = (musicaActivaRef.current || esNoche) ? false : /^(que|qué|como|cómo|cuando|cuándo|donde|dónde|quien|quién|cuanto|cuánto|cual|cuál|por que|por qué|pone|pon|conta|cuenta|deci|decí|avisá|avisa|recorda|acordate|para|podes|podés)\b/.test(textoNorm);
    console.log('[SR] check → menciona:', mencionaNombre, '| enConv:', enConversacion, '| pregunta:', esPreguntaDirecta);

    if (!mencionaNombre && !enConversacion && !esPreguntaDirecta) { unduckMusica(); return; }

    procesandoRef.current = true;
    ExpoSpeechRecognitionModule.stop();

    try {
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

  useSpeechRecognitionEvent('error', (event) => {
    console.log('[SR] error:', event.error);
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
      if (estadoRef.current !== 'esperando' || procesandoRef.current) return;
      const srZombie = srActivoRef.current && (Date.now() - ultimaActivacionSrRef.current) > 20000;
      if (!srActivoRef.current || srZombie) {
        if (srZombie) srActivoRef.current = false;
        iniciarSpeechRecognition();
      }
    }, 5000);
    return () => { ExpoSpeechRecognitionModule.stop(); clearInterval(watchdog); };
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

  async function precachearMuletillas(voiceId?: string) {
    const vozGenero = perfilRef.current?.vozGenero ?? 'femenina';
    const lista = vozGenero === 'masculina' ? MULETILLAS_MASCULINO : MULETILLAS_FEMENINA;
    for (let i = 0; i < lista.length; i++) {
      const uri = FileSystem.cacheDirectory + `muletilla_${i}.mp3`;
      const info = await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }));
      if (info.exists) continue;
      const base64 = await sintetizarVoz(lista[i], voiceId).catch(() => null);
      if (base64) await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' }).catch(() => {});
    }
  }

  const ultimaMuletillaRef = useRef(0);

  async function reproducirMuletilla() {
    try {
      const vozGenero = perfilRef.current?.vozGenero ?? 'femenina';
      const lista = vozGenero === 'masculina' ? MULETILLAS_MASCULINO : MULETILLAS_FEMENINA;
      // Índice aleatorio, evitando repetir la última
      let idx: number;
      do { idx = Math.floor(Math.random() * lista.length); } while (idx === ultimaMuletillaRef.current && lista.length > 1);
      ultimaMuletillaRef.current = idx;
      const uri = FileSystem.cacheDirectory + `muletilla_${idx}.mp3`;
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return;
      player.replace({ uri });
      player.play();
    } catch {}
  }

  // ── Activar post-onboarding ─────────────────────────────────────────────────
  async function reactivar() {
    const perfil = await cargarPerfil();
    if (!perfil.nombreAbuela) return;
    perfilRef.current = perfil;
    nombreAsistenteRef.current = (perfil.nombreAsistente ?? 'Rosita').toLowerCase();
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

    const [perfilGuardado, historialGuardado] = await Promise.all([
      cargarPerfil(), cargarHistorial(),
    ]);
    perfilRef.current    = perfilGuardado;
    historialRef.current = historialGuardado as Mensaje[];
    nombreAsistenteRef.current = (perfilGuardado.nombreAsistente ?? 'Rosita').toLowerCase();

    precachearMuletillas(perfilGuardado.vozId).catch(() => {});

    if (!perfilGuardado.nombreAbuela) {
      setMostrarOnboarding(true);
    } else {
      setCargando(false);
      iniciarSpeechRecognition();
    }

    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      const pingCtrl = new AbortController();
      setTimeout(() => pingCtrl.abort(), 30000);
      fetch(`${backendUrl}/health`, { signal: pingCtrl.signal }).catch(() => {});
    }

    obtenerClima().then(clima => {
      if (clima) {
        climaRef.current  = climaATexto(clima);
        ciudadRef.current = clima.ciudad ?? '';
        if (clima.latitud && clima.longitud) coordRef.current = { lat: clima.latitud, lon: clima.longitud };
        setClimaObj({ temperatura: clima.temperatura, descripcion: clima.descripcion });
      }
    }).catch(() => {});

    obtenerEstadoTuya().then(async ({ vinculado, dispositivos }) => {
      if (!vinculado) return;
      // Consultar estado real (encendido/apagado) de cada dispositivo online
      const TIPOS_LUZ     = ['dj', 'dd', 'xdd'];
      const TIPOS_ENCHUFE = ['cz', 'pc'];
      const conEstado = await Promise.all(
        dispositivos.map(async d => {
          if (!d.online || !([...TIPOS_LUZ, ...TIPOS_ENCHUFE].includes(d.tipo))) return d;
          try {
            const est = await obtenerEstadoDispositivo(d.id);
            const encendido = est?.['switch_led'] ?? est?.['switch_1'];
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
  const ultimaActivacionSrRef = useRef<number>(0);

  function iniciarSpeechRecognition() {
    if (enFlujoVozRef.current) return;
    const ahora = Date.now();
    if (ahora - ultimaActivacionSrRef.current < 1500) return;
    try {
      ExpoSpeechRecognitionModule.start({ lang: 'es-AR', continuous: true, interimResults: false });
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
    const dentroDeHorario = hora >= HORA_CHARLA_INICIO && hora < HORA_FIN;
    const minutosSinCharla = (Date.now() - ultimaCharlaRef.current) / 1000 / 60;
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
    try {
      const frase = await llamarClaude({
        maxTokens: 120,
        system: getSystemBlocks(p, climaRef.current, false, `\n\nEs ${momento}. Iniciá UNA sola frase corta y cálida para charlar. Respondé SOLO con la frase, sin etiquetas.`),
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
    try {
      const cacheUri = FileSystem.cacheDirectory + 'silbido.mp3';
      const cached = await FileSystem.getInfoAsync(cacheUri);
      if (!cached.exists) {
        const base64 = await generarSonido('a gentle cheerful whistle melody, friendly and warm', 4, 0.3);
        if (!base64) return;
        await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: 'base64' });
      }
      player.replace({ uri: cacheUri });
      player.play();
      await new Promise<void>(resolve => setTimeout(resolve, 4500));
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
    flashAnim.setValue(0);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 0.85, duration: 60,  useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0,    duration: 120, useNativeDriver: true }),
      Animated.delay(80),
      Animated.timing(flashAnim, { toValue: 0.5,  duration: 50,  useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0,    duration: 250, useNativeDriver: true }),
    ]).start();
    if (miedoTimerRef.current) clearTimeout(miedoTimerRef.current);
    setExpresion('sorprendida');
    miedoTimerRef.current = setTimeout(() => setExpresion('neutral'), 2500);
  }

  // ── TTS ─────────────────────────────────────────────────────────────────────
  async function hablar(texto: string) {
    ultimoTextoHabladoRef.current = texto;
    console.log('[TTS] hablar() llamado, chars:', texto.length, '| texto:', texto.slice(0, 40));
    ExpoSpeechRecognitionModule.stop();
    detenerSilbido();
    estadoRef.current = 'hablando';

    const MAX_CHARS = 450;
    if (texto.length > MAX_CHARS) {
      const corte = texto.lastIndexOf('.', MAX_CHARS);
      texto = corte > 40 ? texto.slice(0, corte + 1) : texto.slice(0, MAX_CHARS).trimEnd();
    }

    texto = texto
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
      .replace(/(?:\+?\d[- ]?){6,}\d/g, m => m.replace(/[^0-9]/g, '').split('').join(', '));

    try {
      const cacheUri = FileSystem.cacheDirectory + 'tts_v2_' + hashTexto(texto) + '.mp3';
      const info = await FileSystem.getInfoAsync(cacheUri);
      let uri: string | null = info.exists ? cacheUri : null;
      console.log('[TTS] cache:', info.exists ? 'HIT' : 'MISS');

      if (!uri) {
        const voiceId = perfilRef.current?.vozId ?? (perfilRef.current?.vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
        const base64 = await sintetizarVoz(texto, voiceId, velocidadSegunEdad(perfilRef.current?.edad));
        console.log('[TTS] ElevenLabs response:', base64 ? `base64 len=${base64.length}` : 'NULL');
        if (base64) {
          await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: 'base64' });
          uri = cacheUri;
        }
      }

      if (uri) {
        ultimoAudioUriRef.current = uri;
        player.replace({ uri });
        setEstado('hablando');
        estadoRef.current = 'hablando';
        player.play();
        console.log('[TTS] play() llamado');
        await new Promise<void>(resolve => {
          let resolved = false;
          const done = (motivo: string) => {
            if (resolved) return;
            resolved = true;
            clearInterval(pollInterval);
            if (durationTimer !== undefined) clearTimeout(durationTimer);
            clearTimeout(safetyTimeout);
            clearTimeout(noStartTimer);
            console.log('[TTS] fin de reproducción, motivo:', motivo);
            resolve();
          };

          const safetyTimeout = setTimeout(() => done('safety-timeout'), 45000);
          let started = false;
          let silenceCount = 0;
          let durationTimer: ReturnType<typeof setTimeout> | undefined;
          let lastPos = -1;

          const noStartTimer = setTimeout(() => { if (!started) done('no-start-4s'); }, 4000);

          const pollInterval = setInterval(() => {
            const playing = player.playing;
            const dur = (player as any).duration as number;
            const pos = (player as any).currentTime as number;
            if (!started) {
              if (playing) {
                started = true;
                lastPos = pos;
                clearTimeout(noStartTimer);
                console.log('[TTS] audio arrancó, dur:', dur?.toFixed(2), 's');
                if (!isNaN(dur) && dur > 0) {
                  durationTimer = setTimeout(() => done('duration-timer'), (dur + 0.8) * 1000);
                }
              }
            } else {
              if (!playing) {
                const nearEnd = !isNaN(dur) && dur > 0 && pos >= dur - 0.3;
                if (nearEnd) {
                  done('near-end');
                } else if (pos === lastPos && !isNaN(dur) && dur > 0 && pos < dur - 0.3) {
                  console.log('[TTS] audio stalled en pos:', pos?.toFixed(2), '/ dur:', dur?.toFixed(2), '— resumiendo');
                  player.play();
                  silenceCount = 0;
                } else if (pos !== lastPos) {
                  silenceCount = 0;
                } else {
                  silenceCount++;
                  console.log('[TTS] poll silencio', silenceCount, '| pos:', pos?.toFixed(2), '| dur:', dur?.toFixed(2));
                  if (silenceCount >= 15) done('silence-15-polls');
                }
              } else {
                silenceCount = 0;
              }
              lastPos = pos;
            }
          }, 150);
        });
      } else {
        console.log('[TTS] fallback a Speech.speak (ElevenLabs falló)');
        setEstado('hablando');
        estadoRef.current = 'hablando';
        await new Promise<void>((resolve) => {
          Speech.speak(texto, { language: 'es-AR', rate: 0.9, onDone: resolve, onError: () => resolve(), onStopped: () => resolve() });
        });
      }
    } catch (e: any) {
      console.log('[TTS] CATCH en hablar:', e?.message ?? e);
      try {
        console.log('[TTS] fallback a Speech.speak (catch)');
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
      console.log('[AUDIO] uri:', uri, '| existe:', info.exists, '| size:', (info as any).size ?? '?');
      const texto = await transcribirAudio(uri);
      console.log('[AUDIO] transcripcion:', JSON.stringify(texto));
      if (!texto.trim()) { await hablar('No te escuché bien, ¿podés repetir?'); return; }
      await responderConClaude(texto);
    } catch (e: any) {
      console.log('[AUDIO] CATCH:', e?.message ?? e);
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
    console.log('[RC] responderConClaude llamado, texto:', textoUsuario.slice(0, 40));
    const p = perfilRef.current;
    if (!p) { console.log('[RC] sin perfil, saliendo'); return; }
    detenerSilbido();
    setEstado('pensando');
    estadoRef.current = 'pensando';

    // Muletilla solo cuando la pregunta genuinamente lo requiere
    if (debeUsarMuletilla(textoUsuario)) {
      reproducirMuletilla();
    }

    const nuevoHistorial: Mensaje[] = [...historialRef.current, { role: 'user', content: textoUsuario }];

    try {
      const textoNorm = textoUsuario.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const pideJuego   = /\b(juego|jugar|adivinan|trivia|preguntas?|quiz|memori|refranes?|adivina|calculo|calcul|trabale|cuenta|cuantos|cuanto es|matematica)\b/.test(textoNorm);
      const pideChiste  = /\b(chiste|chistoso|gracioso|algo gracioso|me hace rei|haceme rei|contame algo diverti|divertido|me rei)\b/.test(textoNorm)
        || (/\b(otro|uno mas|dale|seguí|segui|mas|contame otro|otro mas)\b/.test(textoNorm)
            && nuevoHistorial.slice(-4).some(m => m.role === 'assistant' && /\[CHISTE\]/i.test(m.content)));

      const esConsultaHorario = /\b(cuando juega|cuand[oa] juega|proximo partido|a que hora juega|a que hora es|proxima carrera|proximo gran premio|f1 horario|calendario deportivo|fixture|cuando es el partido|juega el|juega boca|juega river|juega racing|juega independiente|juega san lorenzo|juega belgrano|juega huracan|juega la seleccion|juega argentina)\b/.test(textoNorm);
      const pideNoticias = !esConsultaHorario && /\b(como salio|salio|resultado|gano|perdio|partido|noticias|novedades|que paso|que hay|que se sabe|que esta pasando|actualidad|hoy en|contame algo|algo nuevo|enterame|boca|river|racing|independiente|san lorenzo|huracan|belgrano|seleccion|mundial|copa|liga|torneo|politica|gobierno|presidente|congreso|senado|diputados|elecciones|ministerio|economia|dolar|inflacion|pobreza|desempleo|formula|formulauno|f1|gran premio|carrera|verstappen|hamilton|leclerc|norris|moto ?gp|tenis|roland garros|wimbledon|us open|nba|nfl|olimpiadas?|clima de manana|pronostico)\b/.test(textoNorm);
      const pideBusqueda = esConsultaHorario || /\b(numero|telefono|direccion|donde queda|donde hay|comedor|municipalidad|municipio|farmacia|hospital|guardia|medico|odontologo|dentista|supermercado|colectivo|omnibus|horario|esta abierto|cerca de|cerca mia|cerca mio|cercano|cercana|mas cerca|banco|correo|correoargentino|renaper|anses|pami|cuando juega|proximo partido|a que hora juega|a que hora es|proxima carrera|proximo gran premio|f1 horario|calendario deportivo)\b/.test(textoNorm);

      let queryBusqueda = textoUsuario;
      if (pideBusqueda) {
        const esTelefono = /telefono|numero de|numero tel/.test(textoNorm);
        const esCerca    = /cerca|cercano|cercana|mas cerca|donde hay/.test(textoNorm);
        const esHorario  = esConsultaHorario || /cuando juega|a que hora|proxim|horario de|calendario/.test(textoNorm);
        const ciudad     = ciudadRef.current;
        if (esTelefono && ciudad)   queryBusqueda = `${textoUsuario} número de teléfono ${ciudad} Argentina`;
        else if (esCerca && ciudad) queryBusqueda = `${textoUsuario} más cercano a ${ciudad} Argentina`;
        else if (esHorario)         queryBusqueda = `${textoUsuario} fecha y hora confirmada`;
        else if (ciudad)            queryBusqueda = `${textoUsuario} ${ciudad} Argentina`;
      }

      const [titulosNoticias, resultadosBusqueda] = await Promise.all([
        pideNoticias ? buscarNoticias(textoUsuario) : Promise.resolve(null),
        pideBusqueda ? buscarWeb(queryBusqueda)     : Promise.resolve(null),
      ]);

      const noticiasFinales = resultadosBusqueda ? null : titulosNoticias;

      let contextoNoticias = '';
      if (noticiasFinales) {
        contextoNoticias = `\n\n🚨 EXCEPCIÓN DE LONGITUD: Para esta respuesta podés usar hasta 60 palabras para resumir los titulares con claridad.\nNoticias recientes relacionadas con la consulta (fuente: Google News, ${new Date().toLocaleDateString('es-AR')}):\n${noticiasFinales}\nResumí los titulares más relevantes en lenguaje simple y cálido.`;
      }

      let contextoBusqueda = '';
      if (resultadosBusqueda) {
        contextoBusqueda = `\n\n🚨 EXCEPCIÓN DE LONGITUD: Podés usar hasta 80 palabras.
Resultados de búsqueda web (Tavily, ${new Date().toLocaleDateString('es-AR')}):
${resultadosBusqueda}

REGLAS CRÍTICAS PARA RESPONDER:
1. Respondé con datos concretos. Si no encontrás el dato, decilo amablemente.
2. PRONUNCIACIÓN: Si das un número de teléfono o la altura de una dirección, separá TODOS sus números con comas (ejemplo: 3, 4, 0, 8, 6, 7... o San Martín 1, 2, 5, 0) para que el sistema de voz los dicte muy pausado, uno por uno. ¡No hagas esto con los años!
3. CERO PREGUNTAS: NUNCA hagas preguntas de seguimiento al final de tu respuesta (prohibido decir "¿Te ayudo con otra cosa?", "¿Para qué precisás ir?", "¿Lo pudiste anotar?", etc.). Entregá la información y terminá tu frase en punto final para que la persona tenga paz y tiempo de asimilar el dato.`;
      }

      console.log('[RC] llamando a Claude...');
      const respuestaRaw = await llamarClaude({
        system: getSystemBlocks(p, climaRef.current, pideJuego, contextoNoticias + contextoBusqueda, pideChiste),
        messages: nuevoHistorial.slice(-8),
      }) || '[NEUTRAL] No entendí bien, ¿podés repetir?';

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
          const { status } = await Brightness.requestPermissionsAsync();
          if (status === 'granted') {
            brilloOriginalRef.current = await Brightness.getBrightnessAsync();
            await Brightness.setBrightnessAsync(1);
          }
        } catch {}
        await hablar(parsed.respuesta);
        return;
      }

      // ── MUSICA ──
      if (parsed.tagPrincipal === 'MUSICA' && parsed.generoMusica) {
        setExpresion('neutral');
        await hablar(parsed.respuesta + ` Para pararla, tocá la pantalla.`);
        setEstado('pensando');
        estadoRef.current = 'pensando';
        ExpoSpeechRecognitionModule.stop();
        const urlStream = await buscarRadio(parsed.generoMusica);
        if (urlStream) {
          try {
            playerMusica.replace({ uri: urlStream });
            playerMusica.volume = 0.50;
            playerMusica.play();
            setMusicaActiva(true);
            registrarMusicaHoy().catch(() => {});
            setEstado('esperando');
            estadoRef.current = 'esperando';
            iniciarSpeechRecognition();
            if (expresionTimerRef.current) clearTimeout(expresionTimerRef.current);
            expresionTimerRef.current = setTimeout(() => setExpresion('neutral'), 5000);
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

        if (segundos > 3600) {
          const targetMs = Date.now() + segundos * 1000;
          const targetDate = new Date(targetMs).toISOString().slice(0, 10);
          guardarRecordatorio({
            id: `timer_${Date.now()}`,
            texto: mensaje,
            fechaISO: targetDate,
            timestampEpoch: targetMs,
            esTimer: true,
            creadoEn: Date.now(),
          }).catch(() => {});
        } else {
          if (timerVozRef.current) clearTimeout(timerVozRef.current);
          timerVozRef.current = setTimeout(async () => {
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
      if (parsed.recordatorio) {
        await guardarRecordatorio(parsed.recordatorio);
      }

      // ── RECUERDOS ──
      if (parsed.recuerdos.length > 0) {
        await Promise.all(parsed.recuerdos.map((r: string) => agregarRecuerdo(r)));
        perfilRef.current = await cargarPerfil();
      }

      // ── DOMÓTICA ──
      if (parsed.domotica) {
        const { tipo, dispositivoNombre, codigo, valor } = parsed.domotica;
        const dispositivos = dispositivosTuyaRef.current;
        const TIPOS_LUZ     = ['dj', 'dd', 'xdd'];
        const TIPOS_ENCHUFE = ['cz', 'pc'];
        if (!dispositivos.length) {
          // Sin dispositivos vinculados — Rosita ya habrá dicho algo amable
        } else if (tipo === 'todo') {
          // Apagar todas las luces y enchufes online
          await controlarTodosLosTipos(dispositivos, TIPOS_LUZ,     'switch_led', false).catch(() => {});
          await controlarTodosLosTipos(dispositivos, TIPOS_ENCHUFE, 'switch_1',   false).catch(() => {});
          // Actualizar estado local
          dispositivosTuyaRef.current = dispositivos.map(d =>
            [...TIPOS_LUZ, ...TIPOS_ENCHUFE].includes(d.tipo) ? { ...d, estado: false } : d
          );
        } else if (tipo === 'control') {
          const dispositivo = dispositivos.find(d =>
            d.nombre.toLowerCase().includes(dispositivoNombre.toLowerCase()) ||
            dispositivoNombre.toLowerCase().includes(d.nombre.toLowerCase())
          );
          if (dispositivo) {
            controlarDispositivo(dispositivo.id, codigo, valor!).catch(() => {});
            // Actualizar estado local si es un switch
            if (codigo === 'switch_led' || codigo === 'switch_1') {
              dispositivosTuyaRef.current = dispositivos.map(d =>
                d.id === dispositivo.id ? { ...d, estado: Boolean(valor) } : d
              );
            }
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
              const encendida = est['switch_led'] ?? est['switch_1'];
              const brillo    = est['bright_value'];
              let descripcion = encendida === true
                ? `La ${dispositivo.nombre} está encendida`
                : encendida === false
                  ? `La ${dispositivo.nombre} está apagada`
                  : `No pude determinar el estado de ${dispositivo.nombre}`;
              if (encendida && brillo !== undefined) {
                descripcion += ` al ${Math.round((brillo / 1000) * 100)}% de brillo`;
              }
              descripcion += '.';
              dispositivosTuyaRef.current = dispositivos.map(d =>
                d.id === dispositivo.id ? { ...d, estado: typeof encendida === 'boolean' ? encendida : d.estado } : d
              );
              await hablar(descripcion);
            }
          }
        }
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
      await hablar(parsed.respuesta);

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
      console.log('[RC] CATCH error:', e?.message ?? e);
      const chatIds  = (perfilRef.current?.telegramContactos ?? []).map(c => c.id);
      const respLocal = respuestaOffline(
        textoUsuario,
        p.nombreAbuela,
        p.nombreAsistente ?? 'Rosita',
        climaRef.current,
        pararMusica,
        chatIds,
        enviarAlertaTelegram,
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

    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
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
          console.log('[CAIDA] caída detectada, magnitud impacto:', magnitud.toFixed(2));
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
    estado, expresion, cargando, mostrarOnboarding, setMostrarOnboarding,
    musicaActiva, silbando, noMolestar, setNoMolestar,
    linternaActiva, apagarLinterna: () => {
      setLinternaActiva(false);
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      if (brilloOriginalRef.current !== null) {
        Brightness.setBrightnessAsync(brilloOriginalRef.current).catch(() => {});
        brilloOriginalRef.current = null;
      }
    },
    modoNoche, horaActual, climaObj, flashAnim,
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
      musicaActivaRef, enFlujoVozRef,
      setEstado, hablar, iniciarSpeechRecognition,
      modoNoche, iniciarSilbido, detenerSilbido, flujoFoto,
    },
    player,
  };
}