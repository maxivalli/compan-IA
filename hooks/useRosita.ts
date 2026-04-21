import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, DeviceEventEmitter, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { Accelerometer } from 'expo-sensors';
import { AudioModule } from 'expo-audio';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {
  cargarPerfil, cargarHistorialConLimpieza,
  Perfil, TelegramContacto, guardarEntradaAnimo,
  bienvenidaYaDada, marcarBienvenidaDada,
  cargarUltimaRadio,
  Lista, cargarListas, borrarLista,
} from '../lib/memoria';
import { Expresion, ModoNoche } from '../components/RosaOjos';
import { obtenerClima, climaATexto } from '../lib/clima';

import { enviarAlertaTelegram, enviarFotoTelegram } from '../lib/telegram';
import { leerImagen, verVision, sincronizarAnimo, obtenerTokenDispositivo, logCliente, calentarCacheClaudeEnBackground } from '../lib/ai';
import { initChatWs } from '../lib/chatWs';
import { buildRositaSystemPayload } from '../lib/systemPayload';
import * as Location from 'expo-location';
import * as Brightness from 'expo-brightness';
import { useSmartThings } from './useSmartThings';
import {
  useBrain, BrainDeps,
  RESPUESTAS_RAPIDAS,
  CategoriaRapida, Mensaje, EstadoRosita,
} from './useBrain';
import {
  useAudioPipeline, AudioPipelineDeps,
  slugNombre, limpiarTextoParaTTS, extraerPrimeraFrase, splitEnOraciones,
} from './useAudioPipeline';
import { useCamaraPresencia } from './useCamaraPresencia';
import { registerRositaSpeechForGames, unregisterRositaSpeechForGames } from '../lib/rositaSpeechForGames';
import { PERFIL_LOCAL_GUARDADO } from '../lib/perfilSync';

const MINUTOS_SIN_CHARLA = 120;
const HORA_DESPERTAR     = 7;
const HORA_CHARLA_INICIO = 9;
const HORA_FIN           = 23;


export function useRosita() {
  const router = useRouter();

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
  const [linternaActiva,    setLinternaActiva]    = useState(false);
  const [mostrarCamara,     setMostrarCamara]     = useState(false);
  const [camaraFacing,      setCamaraFacing]      = useState<'front' | 'back'>('front');
  const [camaraSilenciosa,  setCamaraSilenciosa]  = useState(false);
  const [modoVision,        setModoVision]        = useState(false);
  const [noMolestar,        setNoMolestarState]   = useState(false);
  const [modoNoche,         setModoNoche]         = useState<ModoNoche>('despierta');
  const [horaActual,        setHoraActual]        = useState(new Date().getHours());
  const [climaObj,          setClimaObj]          = useState<{ temperatura: number; descripcion: string; codigoActual: number } | null>(null);
  const [ciudadDetectada,   setCiudadDetectada]   = useState('');
  const [debugGPS,          setDebugGPS]          = useState('');
  const [listas,            setListas]            = useState<Lista[]>([]);
  const [monitoreoActivo,   setMonitoreoActivo]   = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const estadoRef           = useRef(estado);
  const musicaActivaRef     = useRef(musicaActiva);
  const noMolestarRef       = useRef(false);
  const modoNocheRef        = useRef<ModoNoche>('despierta');
  const ultimaCharlaRef     = useRef<number>(Date.now() - 61_000);
  const ultimaActividadRef  = useRef<number>(Date.now());
  const perfilRef           = useRef<Perfil | null>(null);
  // procesandoRef, srActivoRef, procesandoDesdeRef → pipeline.*
  const proximaAlarmaRef    = useRef<number>(0); // epoch ms de la próxima alarma activa (0 = ninguna)
  const ultimaAlertaRef     = useRef<number>(0);
  const nombreAsistenteRef  = useRef<string>('rosita');
  const expresionTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ojoPicadoTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const musicaNocheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const musicaNocheFollowupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const climaRef            = useRef<string>('');
  const ciudadRef           = useRef<string>('');
  const coordRef            = useRef<{ lat: number; lon: number } | null>(null);
  const climaTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  const duckTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerVozRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const telegramOffsetRef   = useRef<number>(0);
  const flashAnim           = useRef(new Animated.Value(0)).current;
  const fotoResolverRef        = useRef<((base64: string | null) => void) | null>(null);
  const capturaVisionFnRef     = useRef<(() => Promise<void>) | null>(null);
  const visionResolverRef      = useRef<((base64: string | null) => void) | null>(null);
  const modoVisionRef          = useRef(false);

  // ── Timestamps para medir lag percibido ──────────────────────────────────────
  const speechEndTsRef   = useRef(0);  // cuando el ASR detecta fin de voz del usuario
  const srResultTsRef    = useRef(0);  // cuando SR devuelve resultado
  const rcStartTsRef     = useRef(0);  // cuando empieza responderConClaude
  // enFlujoVozRef, enColaHablaRef → pipeline.*
  // mensajesSesionRef → brain.*

  // dispositivosTuyaRef → smartthings.dispositivosTuyaRef

  // ── Última radio reproducida ──────────────────────────────────────────────────
  const ultimaRadioRef = useRef<string | null>(null);

  /** Ref mutable que indica si el beacon BLE está conectado. Se actualiza desde index.tsx. */
  const bleConectadoRef = useRef(false);

  const silbidoHabilitadoRef = useRef(true);

  const sinConexionRef           = useRef(false);
  const ultimoSosRef             = useRef<number>(0);
  const alertaInactividadRef     = useRef<number>(0);
  // Intervalo actual del acelerómetro — ref mutable para actualizarlo dentro del listener
  // sin recrear el efecto. Sin esto, la const `intervalo` nunca cambiaba (siempre 300ms).
  const acelerometroIntervaloRef = useRef<number>(300);

  // ── Ref para brain (rompe dependencia circular con pipeline) ──────────────────
  // El pipeline necesita brain.responderConClaude pero brain se instancia después.
  // brainRef se actualiza en cada render y el pipeline lo lee sólo en callbacks async.
  const brainRef = useRef<ReturnType<typeof useBrain> | null>(null);

  // SR se gestiona a través de pipeline.pararSpeechRecognitionIntencional() (pausa AudioCapture vía Deepgram).

  function setNoMolestar(v: boolean) {
    noMolestarRef.current = v;
    setNoMolestarState(v);
    // Al desactivar No Molestar, resetear ultimaCharlaRef para que calcularModo
    // vea actividad reciente y ponga 'soñolienta' en lugar de saltar a 'durmiendo'.
    if (!v) ultimaCharlaRef.current = Date.now();
  }

  function clearMusicaNocheTimers() {
    if (musicaNocheTimerRef.current) {
      clearTimeout(musicaNocheTimerRef.current);
      musicaNocheTimerRef.current = null;
    }
    if (musicaNocheFollowupTimerRef.current) {
      clearTimeout(musicaNocheFollowupTimerRef.current);
      musicaNocheFollowupTimerRef.current = null;
    }
  }

  // ── Pipeline de audio (SR, TTS, silbido, grabación manual) ───────────────────
  // flujoFoto y flujoLeerImagen son declaraciones de función (hoistadas) — definidas más abajo.
  // verificarCharlaProactiva también es hoistada.
  const pipeline = useAudioPipeline({
    perfilRef,
    estadoRef,
    musicaActivaRef,
    ultimaCharlaRef,
    ultimaActividadRef,
    modoNocheRef,
    noMolestarRef,
    nombreAsistenteRef,
    proximaAlarmaRef,
    rcStartTsRef,
    speechEndTsRef,
    srResultTsRef,
    setEstado,
    setMusicaActiva,
    setNoMolestar,
    onPartialReconocido: (texto) => brainRef.current?.onPartialReconocido(texto),
    onTextoReconocido: (texto, turnId) => brainRef.current?.responderConClaude(texto, turnId) ?? Promise.resolve(),
    onFlujoFoto:              flujoFoto,
    onFlujoLeerImagen:        flujoLeerImagen,
    onFlujoModoVision:        flujoModoVision,
    onNuevaCapturaVision:     nuevaCapturaVision,
    onCerrarModoVision:       cerrarModoVision,
    modoVisionRef,
    verificarCharlaProactiva,
  });

  const pipelineForGamesRef = useRef(pipeline);
  pipelineForGamesRef.current = pipeline;
  useEffect(() => {
    registerRositaSpeechForGames(
      () => pipelineForGamesRef.current.suspenderSR(),
      () => pipelineForGamesRef.current.reanudarSR(),
    );
    return () => unregisterRositaSpeechForGames();
  }, []);

  // ── SmartThings (domótica) ────────────────────────────────────────────────────
  const smartthings = useSmartThings({ hablar: pipeline.hablar });

  // ── Brain (Claude + historial + prompts + acciones) ──────────────────────────
  // Las funciones de pipeline y smartthings ya están disponibles porque se instanciaron antes.
  // depsRef en brain se actualiza en cada render.
  const brain = useBrain({
    setEstado,
    setExpresion,
    setMusicaActiva,
    setLinternaActiva,
    setListas,
    estadoRef,
    sinConexionRef,
    musicaActivaRef,
    ultimaCharlaRef,
    ultimaActividadRef,
    proximaAlarmaRef,
    ultimaAlertaRef,
    timerVozRef,
    expresionTimerRef,
    climaRef,
    ciudadRef,
    coordRef,
  // feriadosRef eliminado — el backend calcula los feriados de forma autónoma
    perfilRef,
    ultimaRadioRef,
    dispositivosTuyaRef:      smartthings.dispositivosTuyaRef,
    speechEndTsRef,
    srResultTsRef,
    rcStartTsRef,
    flashAnim,
    hablar:                   pipeline.hablar,
    hablarConCola:            pipeline.hablarConCola,
    splitEnOraciones:         pipeline.splitEnOraciones,
    extraerPrimeraFrase:      pipeline.extraerPrimeraFrase,
    precachearTexto:          pipeline.precachearTexto,
    reproducirTecleo:         pipeline.reproducirTecleo,
    reproducirMuletilla:      pipeline.reproducirMuletilla,
    detenerSilbido:           pipeline.detenerSilbido,
    silbidoHabilitadoRef,
    arranqueFrioRef:          pipeline.arranqueFrioRef,
    pararMusica:              pipeline.pararMusica,
    cerrarDGParaMusica:       pipeline.cerrarDGParaMusica,
    playerMusica:             pipeline.playerMusica,
    iniciarSpeechRecognition: pipeline.iniciarSpeechRecognition,
    pararSRIntencional:       pipeline.pararSpeechRecognitionIntencional,
    setNoMolestar,
    suspenderSR:              pipeline.suspenderSR,
    reanudarSR:               pipeline.reanudarSR,
    isBleConectado: () => bleConectadoRef.current,
    ejecutarAccionDomotica:   smartthings.ejecutarAccion,
    lanzarJuego: (tipo) => {
      const rutaJuego = { tateti: '/tateti', ahorcado: '/ahorcado', memoria: '/memoria' } as const;
      router.push(rutaJuego[tipo] as Parameters<typeof router.push>[0]);
    },
  });

  // Actualizar brainRef en cada render — permite que el pipeline llame brain.responderConClaude
  brainRef.current = brain;

  // ── Detección de presencia por cámara frontal ─────────────────────────────────
  const hablarPresenciaRef = useRef<((texto: string) => Promise<void>) | null>(null);
  useEffect(() => { hablarPresenciaRef.current = pipeline.hablar; });

  const camaraPresencia = useCamaraPresencia({
    ultimaActividadRef,
    estadoRef,
    hablarRef: hablarPresenciaRef,
    perfilRef,
    noMolestarRef,
    musicaActivaRef,
  });

  // ── Sincronizar refs con estado ─────────────────────────────────────────────
  useEffect(() => { estadoRef.current      = estado;      }, [estado]);
  useEffect(() => {
    musicaActivaRef.current = musicaActiva;
    if (musicaActiva) {
      // Stop intencional: usar pipeline para que el handler 'end' no dispare un restart espurio
      pipeline.pararSpeechRecognitionIntencional();
      // Programar verificación nocturna: la música no debería quedar prendida de noche
      clearMusicaNocheTimers();
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
          await pipeline.hablar(`¿Seguís ahí, ${nombre}? Son las ${hAhora} y tenés la música puesta.`);
        } catch {}
        // Esperar 2 minutos para ver si responde
        musicaNocheFollowupTimerRef.current = setTimeout(() => {
          if (!musicaActivaRef.current) return;
          if (ultimaCharlaRef.current > tsAntes + 5000) return; // respondió
          pipeline.pararMusica();
        }, 2 * 60 * 1000);
      }, 30 * 60 * 1000);
    } else {
      pipeline.detenerSilbido();
      clearMusicaNocheTimers();
      if (!pipeline.enFlujoVozRef.current) {
        // Delay de 400ms: misma razón que en hablar() — AudioSession de Android necesita
        // tiempo para liberar el foco del altavoz y devolver el mic al SR.
        setTimeout(() => {
          if (!pipeline.enFlujoVozRef.current && !musicaActivaRef.current) {
            pipeline.iniciarSpeechRecognition();
          }
        }, 400);
      }
    }
    return () => {
      clearMusicaNocheTimers();
    };
  }, [musicaActiva]);
  useEffect(() => { noMolestarRef.current = noMolestar; }, [noMolestar]);

  // ── Hora actual (para fondo) ────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setHoraActual(new Date().getHours()), 60000);
    return () => clearInterval(id);
  }, []);

  // ── OTA update ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (__DEV__) return;
    let idleIntervalId: ReturnType<typeof setInterval> | null = null;
    const id = setTimeout(async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        // Esperar a que la app esté idle antes de recargar para no cortar conversaciones.
        // Máximo 2 minutos: después recarga igual para no bloquear el update indefinidamente.
        const TIMEOUT_MAX = 2 * 60 * 1000;
        const inicio = Date.now();
        await new Promise<void>(resolve => {
          idleIntervalId = setInterval(() => {
            const idle = estadoRef.current === 'esperando'
              && (Date.now() - ultimaCharlaRef.current) > 10000;
            if (idle || Date.now() - inicio > TIMEOUT_MAX) {
              clearInterval(idleIntervalId!);
              idleIntervalId = null;
              resolve();
            }
          }, 1000);
        });
        await Updates.reloadAsync();
      } catch (e: any) {
        if (__DEV__) console.log('[OTA] error:', e?.message ?? e);
      }
    }, 5000);
    return () => {
      clearTimeout(id);
      if (idleIntervalId !== null) {
        clearInterval(idleIntervalId);
        idleIntervalId = null;
      }
    };
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
          await pipeline.hablar(`¡Listo, ya tengo señal de nuevo!`);
        }
      } catch {
        const habia = sinConexionRef.current;
        sinConexionRef.current = true;
        if (!habia && !noMolestarRef.current) {
          const p = perfilRef.current;
          await pipeline.hablar(`${p?.nombreAbuela ? p.nombreAbuela + ', ' : ''}por ahora no tengo señal. Seguí hablándome y te respondo con lo que pueda.`);
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

  // ── Resumen de sesión al entrar en modo durmiendo ───────────────────────────
  useEffect(() => {
    if (modoNoche !== 'durmiendo') return;
    brain.generarResumenSesion().catch(() => {});
  }, [modoNoche]);

  // ── Brillo (fuente única de verdad) ─────────────────────────────────────────
  // Evita comportamientos erráticos por llamadas cruzadas a setBrightness/restore
  // (p. ej. apagar linterna en modo noche, o cambios frecuentes de modo).
  const brilloUltimoRef = useRef<null | { tipo: 'restore' | 'value'; value?: number }>(null);
  const brilloAplicandoRef = useRef(false);
  async function aplicarBrilloDeseado(desired: { tipo: 'restore' } | { tipo: 'value'; value: number }) {
    const prev = brilloUltimoRef.current;
    if (prev?.tipo === desired.tipo && (desired.tipo === 'restore' || prev.value === desired.value)) return;
    if (brilloAplicandoRef.current) return;
    brilloAplicandoRef.current = true;
    try {
      if (desired.tipo === 'restore') await Brightness.restoreSystemBrightnessAsync();
      else await Brightness.setBrightnessAsync(desired.value);
      brilloUltimoRef.current = desired;
    } catch {
      // si falla (permisos/OS), no spamear ni bloquear
    } finally {
      brilloAplicandoRef.current = false;
    }
  }

  // ── Brillo modo noche ───────────────────────────────────────────────────────
  useEffect(() => {
    // Prioridad: linterna > modo noche > sistema
    if (linternaActiva) {
      void aplicarBrilloDeseado({ tipo: 'value', value: 1 });
      return;
    }
    if (modoNoche !== 'despierta') {
      // Brillo mínimo 0.03: suficiente para ver el reloj nocturno sin molestar.
      void aplicarBrilloDeseado({ tipo: 'value', value: 0.03 });
      return;
    }
    void aplicarBrilloDeseado({ tipo: 'restore' });
  }, [modoNoche, linternaActiva]);

  // Al desmontar, restaurar brillo del sistema (evita quedar “oscuro” si se sale).
  useEffect(() => {
    return () => { Brightness.restoreSystemBrightnessAsync().catch(() => {}); };
  }, []);

  // ── Inicialización ─────────────────────────────────────────────────────────
  // El watchdog de SR ahora vive en useAudioPipeline (pipeline.watchdog)
  useEffect(() => {
    inicializar().catch(async () => {
      // Si la inicialización falla (p.ej. módulo nativo no listo en cold start),
      // verificar igual si necesita onboarding antes de mostrar la pantalla principal.
      try {
        const perfil = await cargarPerfil();
        if (!perfil.nombreAbuela) { setCargando(false); setMostrarOnboarding(true); return; }
      } catch {}
      setCargando(false);
      pipeline.iniciarSpeechRecognition();
    });
    return () => {
      // Stop intencional en cleanup de inicialización
      pipeline.pararSpeechRecognitionIntencional();
      if (climaTimerRef.current) clearTimeout(climaTimerRef.current);
    };
  }, []);

  // ── Activar post-onboarding ─────────────────────────────────────────────────
  async function reactivar() {
    const perfil = await cargarPerfil();
    if (!perfil.nombreAbuela) return;
    perfilRef.current = perfil;
    setMonitoreoActivo(perfil.monitoreoActivo ?? false);
    nombreAsistenteRef.current = (perfil.nombreAsistente ?? 'Rosita').toLowerCase();
    pipeline.precachearRespuestasRapidas(perfil.nombreAbuela).catch(() => {});
    pipeline.precachearSistema().catch(() => {});
    setCargando(false);
    const yaDada = await bienvenidaYaDada();
    if (!yaDada) {
      const asistente = perfil.nombreAsistente ?? 'Rosita';
      const rol = perfil.vozGenero === 'masculina' ? 'tu nuevo compañero' : 'tu nueva compañera';
      await marcarBienvenidaDada();
      await pipeline.hablar(`¡Hola ${perfil.nombreAbuela}! Soy ${asistente}, ${rol}. Podés hablarme cuando quieras, acá estoy.`);
    }
  }

  const recargarPerfilRef = useRef<() => Promise<void>>(async () => {});
  async function recargarPerfil() {
    const perfil = await cargarPerfil();
    if (!perfil.nombreAbuela) return;
    perfilRef.current = perfil;
    setMonitoreoActivo(perfil.monitoreoActivo ?? false);
    nombreAsistenteRef.current = (perfil.nombreAsistente ?? 'Rosita').toLowerCase();
  }
  recargarPerfilRef.current = recargarPerfil;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PERFIL_LOCAL_GUARDADO, () => {
      void recargarPerfilRef.current();
    });
    return () => sub.remove();
  }, []);

  // ── Inicializar ─────────────────────────────────────────────────────────────
  async function inicializar() {
    if (new Date().getFullYear() < 2024) {
      setTimeout(inicializar, 10000);
      return;
    }

    try { await AudioModule.requestRecordingPermissionsAsync(); } catch {}
    try { await ExpoSpeechRecognitionModule.requestPermissionsAsync(); } catch {}
    obtenerTokenDispositivo().catch(() => {}); // warmea _cachedToken para urlCartesiaStream
    initChatWs({ getToken: obtenerTokenDispositivo, log: logCliente });
    pipeline.limpiarCacheViejo().catch(() => {});

    const [perfilGuardado, historialGuardado, listasGuardadas, ultimaRadio] = await Promise.all([
      cargarPerfil(), cargarHistorialConLimpieza(), cargarListas(), cargarUltimaRadio(),
    ]);
    ultimaRadioRef.current = ultimaRadio;
    perfilRef.current    = perfilGuardado;
    setMonitoreoActivo(perfilGuardado.monitoreoActivo ?? false);
    brain.historialRef.current = historialGuardado as Mensaje[];
    setListas(listasGuardadas);
    nombreAsistenteRef.current = (perfilGuardado.nombreAsistente ?? 'Rosita').toLowerCase();

    if (!perfilGuardado.nombreAbuela) {
      setCargando(false);
      setMostrarOnboarding(true);
    } else {
      pipeline.precachearRespuestasRapidas(perfilGuardado.nombreAbuela).catch(() => {});
      pipeline.precachearSistema().catch(() => {});
      setCargando(false);
      pipeline.iniciarSpeechRecognition();
      // Warmup: escribe el cache de Claude para que el primer turno real sea rápido
      const warmupPayload = buildRositaSystemPayload({ perfil: perfilGuardado, climaTexto: '' });
      calentarCacheClaudeEnBackground(warmupPayload);
    }

    // Retry loop: intenta obtener clima/ubicación hasta lograrlo.
    // Si falla, reintenta cada 30s. Una vez obtenido, refresca cada 60 min.
    async function intentarClima() {
      try {
        const timeoutAt = Date.now() + 12000;
        const conTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
          return await Promise.race([
            promise,
            new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
          ]);
        };
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { climaTimerRef.current = setTimeout(intentarClima, 30000); return; }
        const serviciosOn = await Location.hasServicesEnabledAsync().catch(() => false);
        if (!serviciosOn) { climaTimerRef.current = setTimeout(intentarClima, 30000); return; }
        // 1) Posición en caché (instantáneo)
        let loc = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000, requiredAccuracy: 5000 }).catch(() => null);
        // 2) Balanced: red + GPS (~1-3s en interiores)
        if (!loc && Date.now() < timeoutAt) {
          const restante = Math.max(1500, timeoutAt - Date.now());
          loc = await conTimeout(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            Math.min(8000, restante),
          );
        }
        // 3) Low: solo red celular (muy rápido pero menos preciso)
        if (!loc && Date.now() < timeoutAt) {
          const restante = Math.max(1000, timeoutAt - Date.now());
          loc = await conTimeout(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
            Math.min(4000, restante),
          );
        }
        if (!loc) { climaTimerRef.current = setTimeout(intentarClima, 30000); return; }
        const clima = await obtenerClima(loc.coords.latitude, loc.coords.longitude).catch(() => null);
        if (clima) {
          climaRef.current  = climaATexto(clima);
          ciudadRef.current = clima.ciudad ?? '';
          setCiudadDetectada(clima.ciudad ?? '');
          if (clima.latitud && clima.longitud) coordRef.current = { lat: clima.latitud, lon: clima.longitud };
          setClimaObj({ temperatura: clima.temperatura, descripcion: clima.descripcion, codigoActual: clima.codigoActual });
          climaTimerRef.current = setTimeout(intentarClima, 60 * 60 * 1000); // refrescar en 1h
          // Re-warm: el warmup inicial no tenía ciudad/coords/dispositivos → cache miss.
          // Esperamos 3s para que SmartThings también termine de cargar sus dispositivos.
          setTimeout(() => {
            if (!perfilRef.current?.nombreAbuela) return;
            calentarCacheClaudeEnBackground(buildRositaSystemPayload({
              perfil: perfilRef.current,
              dispositivos: smartthings.dispositivosTuyaRef.current,
              climaTexto: climaRef.current,
              ciudad: ciudadRef.current,
              coords: coordRef.current,
            }));
          }, 3000);
        } else {
          climaTimerRef.current = setTimeout(intentarClima, 30 * 1000);
        }
      } catch (e: any) {
        climaTimerRef.current = setTimeout(intentarClima, 30 * 1000);
      }
    }
    intentarClima();

    smartthings.inicializar();



    brain.cargarNoticiasDiarias().catch(() => {});
  }

  function verificarCharlaProactiva(): boolean {
    if (noMolestarRef.current) return false;
    const hora = new Date().getHours();
    const dentroDeHorario = hora >= (perfilRef.current?.horaFinNoche ?? HORA_CHARLA_INICIO) && hora < (perfilRef.current?.horaInicioNoche ?? HORA_FIN);
    const minutosSinCharla = (Date.now() - ultimaCharlaRef.current) / 1000 / 60;
    // No arrancar charla proactiva si hay una alarma en las próximas 2 horas
    const alarmaProxima = proximaAlarmaRef.current;
    if (alarmaProxima && alarmaProxima - Date.now() < 2 * 60 * 60 * 1000) return false;
    if (dentroDeHorario && minutosSinCharla >= MINUTOS_SIN_CHARLA) {
      ultimaCharlaRef.current = Date.now();
      pipeline.despertarDG(); // reconecta WS si cerró por idle
      brain.arrancarCharlaProactiva();
      return true;
    }
    return false;
  }

  // arrancarCharlaProactiva → delegado a brain.arrancarCharlaProactiva()

  // ── Duck / unduck música ──────────────────────────────────────────────────────
  function duckMusica() { /* volumen fijo — duck desactivado */ }
  function unduckMusica() { /* volumen fijo — duck desactivado */ }

  // ── Expresiones de ojos ─────────────────────────────────────────────────────
  function onOjoPicado() {
    if (ojoPicadoTimer.current) clearTimeout(ojoPicadoTimer.current);
    setExpresion('enojada');
    ojoPicadoTimer.current = setTimeout(() => setExpresion('neutral'), 3000);
    // Solo hablar si está en reposo: si Rosita está respondiendo, pisar el audio
    // a mitad de oración (hablar() pausa el player) sería confuso.
    if (estadoRef.current === 'esperando') pipeline.hablar('¡Ey, eso duele!');
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

  function pedirCapturaFoto(acciones?: { beforeOpen?: () => void; afterClose?: () => void }) {
    // Cancelar captura anterior FUERA de la Promise para que el resolver previo
    // reciba null inmediatamente y no quede colgado si dos flujos se solapan.
    if (fotoResolverRef.current) {
      fotoResolverRef.current(null);
      fotoResolverRef.current = null;
    }
    return new Promise<string | null>(resolve => {
      acciones?.beforeOpen?.();
      fotoResolverRef.current = (base64: string | null) => {
        fotoResolverRef.current = null;
        acciones?.afterClose?.();
        resolve(base64);
      };
      setMostrarCamara(true);
    });
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
      if (!silencioso) await pipeline.hablar('No tenés familiares configurados para mandar la foto.');
      return;
    }
    if (!silencioso) await pipeline.hablar('Dale, mirá la pantalla, te saco una foto en tres segundos.');
    const base64 = await pedirCapturaFoto({
      beforeOpen: () => setCamaraSilenciosa(silencioso),
      afterClose: () => {
        setMostrarCamara(false);
        setCamaraSilenciosa(false);
      },
    });
    setMostrarCamara(false);
    setCamaraSilenciosa(false);
    if (!base64) {
      if (!silencioso) await pipeline.hablar('Bueno, cuando quieras sacamos la foto.');
      else await enviarAlertaTelegram(chatIds, `📸 No pude sacar la foto. Verificá que la app tenga permisos de cámara.`, p?.nombreAsistente);
      return;
    }
    if (!silencioso) await pipeline.hablar('Mandando la foto a tu familia, un momento.');
    try {
      const ahora = new Date();
      const hora = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const caption = `📸 Foto de ${p?.nombreAbuela ?? 'tu familiar'} — ${hora}`;
      await enviarFotoTelegram(chatIds, base64, caption);
      if (!silencioso) await pipeline.hablar('Listo, la foto ya está con tu familia.');
    } catch {
      if (!silencioso) await pipeline.hablar('No pude mandar la foto, perdoname.');
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
    await pipeline.hablar(
      `Bueno${nombre ? ` ${nombre}` : ''}, apuntá la cámara a lo que querés que vea. ` +
      `Cuando estés ${g('lista', 'listo')}, quedate ${g('quieta', 'quieto')} y esperá hasta que cuente tres. ` +
      `Yo te digo todo lo que vea.`
    );
    const base64 = await pedirCapturaFoto({
      beforeOpen: () => setCamaraFacing('back'),
      afterClose: () => {
        setMostrarCamara(false);
        setCamaraFacing('front');
      },
    });
    setMostrarCamara(false);
    setCamaraFacing('front');
    if (!base64) {
      await pipeline.hablar('No pude sacar la foto. ¿Querés intentarlo de nuevo?');
      return;
    }
    await pipeline.hablar('A ver, déjame mirar...');
    const resultado = await leerImagen(base64);
    if (!resultado) {
      await pipeline.hablar('No pude ver bien la imagen. ¿Podés acercar un poco más la cámara y volvemos a intentar?');
      return;
    }
    const DIGITOS_ES: Record<string, string> = {
      '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro',
      '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve',
    };
    const textoFormateado = resultado.replace(/\d{2,}/g, m =>
      m.split('').map(d => DIGITOS_ES[d] ?? d).join(', ')
    );
    await pipeline.hablar(textoFormateado);
  }

  // ── Modo visión (cámara live con Gemini) ────────────────────────────────────

  const DIGITOS_ES_VISION: Record<string, string> = {
    '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro',
    '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve',
  };

  function formatearTextoVision(texto: string): string {
    return texto.replace(/\d{2,}/g, m =>
      m.split('').map(d => DIGITOS_ES_VISION[d] ?? d).join(', ')
    );
  }

  function pedirFrameVision(): Promise<string | null> {
    return new Promise(resolve => {
      visionResolverRef.current = resolve;
      capturaVisionFnRef.current?.();
    });
  }

  async function capturarYDescribir() {
    const base64 = await pedirFrameVision();
    if (!base64) {
      await pipeline.hablar('No pude sacar la foto. ¿Lo intentamos de nuevo?');
      return;
    }
    const [resultado] = await Promise.all([
      verVision(base64),
      pipeline.hablar('Esperáte, que estoy mirando...'),
    ]);
    if (!resultado) {
      await pipeline.hablar('Uy, no me llegó bien la imagen. ¿Probamos de nuevo?');
      return;
    }
    await pipeline.hablar(formatearTextoVision(resultado));
  }

  async function flujoModoVision() {
    const p = perfilRef.current;
    const nombre = p?.nombreAbuela ?? '';
    await pipeline.hablar(
      `Bueno${nombre ? ` ${nombre}` : ''}, apuntame la cámara a lo que querés que vea.`
    );
    // Siempre cámara trasera para ver el entorno (no selfie)
    setCamaraFacing('back');
    modoVisionRef.current = true;
    setModoVision(true);
    // Esperar a que la cámara esté lista (onCameraReady setea el ref)
    let intentos = 0;
    while (!capturaVisionFnRef.current && intentos < 20) {
      await new Promise(r => setTimeout(r, 100));
      intentos++;
    }
    // Pausa extra para que el usuario pueda apuntar la cámara
    await new Promise(r => setTimeout(r, 2000));
    await capturarYDescribir();
  }

  async function nuevaCapturaVision() {
    if (!modoVisionRef.current) return;
    await capturarYDescribir();
  }

  function cerrarModoVision() {
    visionResolverRef.current?.(null);
    visionResolverRef.current = null;
    capturaVisionFnRef.current = null;
    modoVisionRef.current = false;
    setModoVision(false);
    setCamaraFacing('front');
  }

  function onFotoCapturada(base64: string) {
    if (modoVisionRef.current) {
      visionResolverRef.current?.(base64);
      visionResolverRef.current = null;
    } else {
      fotoResolverRef.current?.(base64);
      fotoResolverRef.current = null;
    }
  }

  function onFotoCancelada() {
    if (modoVisionRef.current) {
      cerrarModoVision();
    } else {
      fotoResolverRef.current?.(null);
      fotoResolverRef.current = null;
    }
  }

  // responderConClaude → delegado a brain.responderConClaude() vía pipeline.onTextoReconocido

  // ── SOS ─────────────────────────────────────────────────────────────────────
  async function dispararAlertaFamilia(opciones: {
    syncTag: 'sos' | 'caida';
    telegramMensaje: string;
    vozConFamilia: string;
    vozSinFamilia: string;
  }) {
    const ahora = Date.now();
    if (ahora - ultimoSosRef.current < 60000) return;
    ultimoSosRef.current = ahora;

    const p = perfilRef.current;
    if (!p?.nombreAbuela) return;
    const chatIds = (p?.telegramContactos ?? []).map(c => c.id);
    const asistente = p.nombreAsistente ?? 'Rosita';

    if (musicaActivaRef.current) pipeline.pararMusica();
    // Detener SR explícitamente: el effect [musicaActiva] reinicia el SR con 400ms de delay,
    // que podría capturar el audio del TTS del SOS como input del usuario.
    pipeline.pararSpeechRecognitionIntencional();

    // SOS/caída no se registra como "triste" en el ánimo — tiene su propio contador
    // en el informe diario (alertasHoy). El ánimo "triste" queda reservado para cuando
    // el usuario menciona cosas que se categorizan emocionalmente como tristeza.
    sincronizarAnimo(opciones.syncTag, Date.now());

    if (chatIds.length) {
      enviarAlertaTelegram(
        chatIds,
        opciones.telegramMensaje,
        asistente,
      );
      await pipeline.hablar(opciones.vozConFamilia);
    } else {
      await pipeline.hablar(opciones.vozSinFamilia);
    }
  }

  async function dispararSOS() {
    const p = perfilRef.current;
    if (!p?.nombreAbuela) return;
    await dispararAlertaFamilia({
      syncTag: 'sos',
      telegramMensaje: `🆘 *ALERTA SOS* — ${p.nombreAbuela} necesita ayuda urgente.\n\nLlamala de inmediato o andá a su casa.`,
      vozConFamilia: `${p.nombreAbuela}, ya avisé a tu familia. Alguien va a comunicarse con vos pronto.`,
      vozSinFamilia: `${p.nombreAbuela}, no tenés familiares configurados en la app. No pude avisar a nadie. Pedile a alguien cercano que te ayude.`,
    });
  }

  async function dispararSOSCaida() {
    const p = perfilRef.current;
    if (!p?.nombreAbuela) return;
    await dispararAlertaFamilia({
      syncTag: 'caida',
      telegramMensaje: `⚠️ *POSIBLE CAÍDA* — ${p.nombreAbuela}\n\nEl sensor del teléfono detectó un posible golpe o caída. Verificá que esté bien.`,
      vozConFamilia: `${p.nombreAbuela}, detecté un posible golpe. ¿Estás bien? Ya avisé a tu familia.`,
      vozSinFamilia: `${p.nombreAbuela}, detecté un posible golpe. ¿Estás bien? No tenés familiares configurados, pedile a alguien cercano que te ayude.`,
    });
  }

  // ── Bostezo por inactividad ──────────────────────────────────────────────────
  const ultimoBostezRef  = useRef<number>(0);
  // Guarda los timers de los bostezos diferidos para cancelarlos en cleanup o si
  // el usuario vuelve a activarse antes de que corran.
  const bostezDelayedRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const CINCO_MIN        = 5 * 60 * 1000;

  function bostezar() {
    if (estadoRef.current !== 'esperando') return;
    if (modoNocheRef.current !== 'despierta') return;
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
      // Cancelar bostezos diferidos anteriores que aún no hayan corrido
      bostezDelayedRef.current.forEach(t => clearTimeout(t));
      ultimoBostezRef.current = Date.now();
      bostezar();
      bostezDelayedRef.current = [
        setTimeout(bostezar, 5000),
        setTimeout(bostezar, 10000),
      ];
    }, 60 * 1000);
    return () => {
      clearInterval(id);
      bostezDelayedRef.current.forEach(t => clearTimeout(t));
    };
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

    // 300ms: 3× menos CPU que 100ms, suficiente para caídas y sacudidas.
    // En modo durmiendo baja a 1000ms. Se usa acelerometroIntervaloRef (un ref mutable)
    // para que la comparación dentro del listener pueda detectar el cambio; con la
    // constante local `intervalo` la condición nunca era verdadera.
    const initIntervalo = modoNocheRef.current === 'durmiendo' ? 1000 : 300;
    acelerometroIntervaloRef.current = initIntervalo;
    Accelerometer.setUpdateInterval(initIntervalo);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const nuevoIntervalo = modoNocheRef.current === 'durmiendo' ? 1000 : 300;
      if (nuevoIntervalo !== acelerometroIntervaloRef.current) {
        acelerometroIntervaloRef.current = nuevoIntervalo;
        Accelerometer.setUpdateInterval(nuevoIntervalo);
      }
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
        // No contar sacudidas si hay música: las vibraciones del altavoz pueden
        // generar falsos positivos y disparar SOS accidentalmente.
        if (musicaActivaRef.current) return;
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
    detectandoSonido: pipeline.detectandoSonido,
    musicaActiva, silbando: pipeline.silbando, noMolestar, setNoMolestar,
    listas,
    borrarListaVoz: (nombre: string) => borrarLista(nombre).then(() => cargarListas().then(setListas)).catch(() => {}),
    linternaActiva, apagarLinterna: () => {
      setLinternaActiva(false);
      Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      // No restaurar acá: el effect de brillo decide según modoNoche.
    },
    modoNoche, horaActual, climaObj, ciudadDetectada, flashAnim,
    pararMusica:     pipeline.pararMusica,
    reanudarMusica:  pipeline.reanudarMusica,
    dispararSOS,
    forzarBostezo: () => {
      ultimoBostezRef.current = Date.now();
      setExpresion('bostezando');
      setTimeout(() => { if (estadoRef.current === 'esperando') setExpresion('neutral'); }, 2800);
    },
    resetExpresion: () => {
      if (expresionTimerRef.current) clearTimeout(expresionTimerRef.current);
      setExpresion('neutral');
    },
    onOjoPicado, onCaricia, onRelampago,
    iniciarSilbido:  pipeline.iniciarSilbido,
    detenerSilbido:  pipeline.detenerSilbido,
    reactivar, recargarPerfil,
    mostrarCamara, camaraFacing, camaraSilenciosa, onFotoCapturada, onFotoCancelada, flujoFoto,
    bleConectadoRef,
    iniciarFlujoFoto: () => {
      // Pausar SR antes de hablar para evitar que Rosita se escuche a sí misma
      // diciendo "foto" y dispare un segundo flujo que cancela el primero.
      pipeline.pararSpeechRecognitionIntencional();
      flujoFoto();
    },
    modoVision, capturaVisionFnRef,
    modoWatchingPresencia: camaraPresencia.modoWatching,
    onPresenciaDetectada: camaraPresencia.onPresenciaDetectada,
    monitoreoActivo,
    refs: {
      perfilRef, estadoRef, noMolestarRef, modoNocheRef,
      ultimaActividadRef, ultimaCharlaRef, alertaInactividadRef,
      telegramOffsetRef, climaRef, ciudadRef, coordRef, setClimaObj,
      musicaActivaRef, enFlujoVozRef: pipeline.enFlujoVozRef, proximaAlarmaRef,
      setEstado, hablar: pipeline.hablar, iniciarSpeechRecognition: pipeline.iniciarSpeechRecognition,
      pararSRIntencional: pipeline.pararSpeechRecognitionIntencional,
      suspenderSR: pipeline.suspenderSR,
      reanudarSR:  pipeline.reanudarSR,
      modoNoche, iniciarSilbido: pipeline.iniciarSilbido, detenerSilbido: pipeline.detenerSilbido, flujoFoto,
      reanudarMusica: pipeline.reanudarMusica,
      silbidoHabilitadoRef,
    },
    player: pipeline.player,
  };
}
