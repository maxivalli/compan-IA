import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { Accelerometer } from 'expo-sensors';
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import {
  cargarPerfil, cargarHistorial, guardarHistorial,
  Perfil, guardarEntradaAnimo, agregarRecuerdo,
  guardarRecordatorio, bienvenidaYaDada, marcarBienvenidaDada,
  registrarMusicaHoy,
} from '../lib/memoria';
import { Expresion, ModoNoche } from '../components/RosaOjos';
import { buscarRadio } from '../lib/musica';
import { obtenerClima, climaATexto } from '../lib/clima';
import { enviarAlertaTelegram, enviarFotoTelegram } from '../lib/telegram';
import {
  hashTexto, respuestaOffline,
  construirSystemPromptEstable, construirContextoDinamico, parsearRespuesta,
} from '../lib/claudeParser';
import { llamarClaude, transcribirAudio, sintetizarVoz, generarSonido, VOICE_ID_FEMENINA, VOICE_ID_MASCULINA } from '../lib/ai';

const MINUTOS_SIN_CHARLA = 120;
const HORA_DESPERTAR     = 7;
const HORA_CHARLA_INICIO = 9;
const HORA_FIN           = 21;

type Mensaje = { role: 'user' | 'assistant'; content: string };

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
  const [mostrarCamara,     setMostrarCamara]     = useState(false);
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
  const climaRef            = useRef<string>('');
  const duckTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerVozRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const telegramOffsetRef   = useRef<number>(0);
  const inicioSesionRef     = useRef<number>(Date.now());
  const flashAnim           = useRef(new Animated.Value(0)).current;
  const fotoResolverRef     = useRef<((base64: string | null) => void) | null>(null);
  const ultimoAudioUriRef   = useRef<string | null>(null);
  const ultimoTextoHabladoRef = useRef<string | null>(null);

  // ── Flag para bloquear SR durante flujo de mensajes de voz ──────────────────
  const enFlujoVozRef    = useRef(false);

  // ── System prompt en dos bloques: estable (cacheable) + dinámico ─────────────
  const systemEstableRef = useRef<{ key: string; text: string } | null>(null);
  function getSystemBlocks(p: Perfil, climaTexto: string, incluirJuego: boolean, extra = '', incluirChiste = false) {
    const perfKey = `${p.nombreAbuela}|${p.nombreAsistente}|${p.edad}|${p.vozGenero}`;
    if (!systemEstableRef.current || systemEstableRef.current.key !== perfKey) {
      systemEstableRef.current = { key: perfKey, text: construirSystemPromptEstable(p) };
    }
    return [
      { type: 'text' as const, text: systemEstableRef.current.text, cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: construirContextoDinamico(p, climaTexto, incluirJuego, extra, incluirChiste) },
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
    // Con música activa el SR se apaga para evitar colisiones con letras en español.
    // Se reactiva automáticamente cuando la música se detiene.
    if (musicaActiva) {
      ExpoSpeechRecognitionModule.stop();
    } else if (!enFlujoVozRef.current) {
      iniciarSpeechRecognition();
    }
  }, [musicaActiva]);
  useEffect(() => { noMolestarRef.current  = noMolestar;  }, [noMolestar]);

  // ── Hora actual (para fondo) ────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setHoraActual(new Date().getHours()), 60000);
    return () => clearInterval(id);
  }, []);

  // ── OTA update: descarga y aplica automáticamente ───────────────────────────
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

  // ── Ciclo de vida: volver del background ────────────────────────────────────
  // AppState handler deshabilitado — causa crash en Android 15 / bridgeless.
  // El watchdog (5s) ya se encarga de reiniciar SR al volver del background.

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
    const enConversacion = musicaActivaRef.current ? false : (Date.now() - ultimaCharlaRef.current) < 2 * 60 * 1000;
    const esPreguntaDirecta = /^(que|qué|como|cómo|cuando|cuándo|donde|dónde|quien|quién|cuanto|cuánto|cual|cuál|por que|por qué|pone|pon|conta|cuenta|deci|decí|avisá|avisa|recorda|acordate|para|podes|podés)\b/.test(textoNorm);
    console.log('[SR] check → menciona:', mencionaNombre, '| enConv:', enConversacion, '| pregunta:', esPreguntaDirecta);

    if (!mencionaNombre && !enConversacion && !esPreguntaDirecta) { unduckMusica(); return; }

    procesandoRef.current = true;
    ExpoSpeechRecognitionModule.stop();

    if (musicaActivaRef.current) { playerMusica.pause(); setMusicaActiva(false); }

    try {
      const esRepeticion = enConversacion
        && /repet[ií]|no te escuch[eé]|no entend[ií]|m[aá]s (alto|fuerte)|no te o[ií]|no te oi/.test(textoNorm)
        && ultimoAudioUriRef.current !== null;

      if (esRepeticion) {
        await hablar(ultimoTextoHabladoRef.current!);
      } else if (/\bfoto\b/i.test(textoNorm)) {
        await flujoFoto();
      } else {
        await responderConClaude(texto);
      }
    } finally {
      procesandoRef.current = false;
      iniciarSpeechRecognition();
    }
  });

  useSpeechRecognitionEvent('end', () => {
    srActivoRef.current = false;
    if (enFlujoVozRef.current) return; // no reactivar durante flujo de voz
    if (!perfilRef.current?.nombreAbuela) return; // sin perfil = en onboarding
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
    if (enFlujoVozRef.current) return; // no reactivar durante flujo de voz
    if (!perfilRef.current?.nombreAbuela) return; // sin perfil = en onboarding
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
      const hace7dias = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (const archivo of archivos) {
        if (!archivo.startsWith('tts_') || !archivo.endsWith('.mp3')) continue;
        const info = await FileSystem.getInfoAsync(dir + archivo);
        if (info.exists && info.modificationTime && info.modificationTime * 1000 < hace7dias) {
          await FileSystem.deleteAsync(dir + archivo, { idempotent: true });
        }
      }
    } catch {}
  }

  // ── Activar post-onboarding (cuando se vuelve de /onboarding con perfil ya guardado) ──
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

  // ── Recargar perfil al volver de configuración ──────────────────────────────
  async function recargarPerfil() {
    const perfil = await cargarPerfil();
    if (!perfil.nombreAbuela) return;
    perfilRef.current = perfil;
    nombreAsistenteRef.current = (perfil.nombreAsistente ?? 'Rosita').toLowerCase();
  }

  // ── Inicializar ─────────────────────────────────────────────────────────────
  async function inicializar() {
    try { await AudioModule.requestRecordingPermissionsAsync(); } catch {}
    try { await ExpoSpeechRecognitionModule.requestPermissionsAsync(); } catch {}
    limpiarCacheViejo().catch(() => {});

    // Cargar perfil e historial (rápido, AsyncStorage local)
    const [perfilGuardado, historialGuardado] = await Promise.all([
      cargarPerfil(), cargarHistorial(),
    ]);
    perfilRef.current    = perfilGuardado;
    historialRef.current = historialGuardado as Mensaje[];
    nombreAsistenteRef.current = (perfilGuardado.nombreAsistente ?? 'Rosita').toLowerCase();

    if (!perfilGuardado.nombreAbuela) {
      setMostrarOnboarding(true);
    } else {
      setCargando(false);
      iniciarSpeechRecognition();
    }

    // Ping al backend para despertar Railway antes de que el usuario hable
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      const pingCtrl = new AbortController();
      setTimeout(() => pingCtrl.abort(), 30000);
      fetch(`${backendUrl}/health`, { signal: pingCtrl.signal }).catch(() => {});
    }

    // Clima en background — no bloquea el arranque
    obtenerClima().then(clima => {
      if (clima) {
        climaRef.current = climaATexto(clima);
        setClimaObj({ temperatura: clima.temperatura, descripcion: clima.descripcion });
      }
    }).catch(() => {});
  }

  // ── SR helpers ──────────────────────────────────────────────────────────────
  const ultimaActivacionSrRef = useRef<number>(0);

  function iniciarSpeechRecognition() {
    if (enFlujoVozRef.current) return;
    const ahora = Date.now();
    if (ahora - ultimaActivacionSrRef.current < 1500) return; // máx 1 restart cada 1.5s
    try {
      ExpoSpeechRecognitionModule.start({ lang: 'es-AR', continuous: true, interimResults: false });
      srActivoRef.current = true;
    } catch {
      srActivoRef.current = false;
    } finally {
      ultimaActivacionSrRef.current = ahora; // throttle aplica siempre, incluso si falló
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
  // Reproduce el silbido UNA vez y espera que termine (~4s).
  // Las repeticiones las controla seriedeSilbidos() en useNotificaciones.
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
      // Timer fijo: 4s de audio + 500ms de margen.
      // No usamos player.playing porque es poco confiable en Android.
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
  function duckMusica() {
    if (!musicaActivaRef.current) return;
    playerMusica.volume = 0.15;
    if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
    duckTimerRef.current = setTimeout(() => { if (musicaActivaRef.current) playerMusica.volume = 1.0; }, 4000);
  }

  function unduckMusica() {
    if (duckTimerRef.current) clearTimeout(duckTimerRef.current);
    if (musicaActivaRef.current) playerMusica.volume = 1.0;
  }

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
    // Actualizamos el ref inmediatamente para suprimir el watchdog,
    // pero el setState visual lo hacemos justo antes de reproducir
    estadoRef.current = 'hablando';

    const MAX_CHARS = 450;
    if (texto.length > MAX_CHARS) {
      const corte = texto.lastIndexOf('.', MAX_CHARS);
      texto = corte > 40 ? texto.slice(0, corte + 1) : texto.slice(0, MAX_CHARS).trimEnd();
    }

    // Limpiar símbolos que ElevenLabs no pronuncia bien (frecuentes en respuestas de GPT)
    texto = texto
      .replace(/(\d+)\s*°\s*[Cc]/g,  '$1 grados')
      .replace(/(\d+)\s*°\s*[Ff]/g,  '$1 grados Fahrenheit')
      .replace(/°/g,                  ' grados')
      .replace(/(\d+)\s*%/g,          '$1 por ciento')
      .replace(/(\d+)\s*km\/h/gi,     '$1 kilómetros por hora')
      .replace(/(\d+)\s*m\/s/gi,      '$1 metros por segundo')
      .replace(/\bkm\b/gi,            'kilómetros')
      .replace(/\*\*(.+?)\*\*/g,      '$1')   // negrita markdown
      .replace(/\*(.+?)\*/g,          '$1')   // cursiva markdown
      .replace(/#+\s/g,               '')     // títulos markdown
      .replace(/[_~`]/g,              '');    // otros símbolos markdown

    try {
      const cacheUri = FileSystem.cacheDirectory + 'tts_v2_' + hashTexto(texto) + '.mp3';
      const info = await FileSystem.getInfoAsync(cacheUri);
      let uri: string | null = info.exists ? cacheUri : null;
      console.log('[TTS] cache:', info.exists ? 'HIT' : 'MISS');

      if (!uri) {
        const voiceId = perfilRef.current?.vozId ?? (perfilRef.current?.vozGenero === 'masculina' ? VOICE_ID_MASCULINA : VOICE_ID_FEMENINA);
        const base64 = await sintetizarVoz(texto, voiceId);
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

          // Si no arranca en 4s, asumimos fallo de carga
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
                  // Audio interrumpido por Android (audio focus) — intentar resumir
                  console.log('[TTS] audio stalled en pos:', pos?.toFixed(2), '/ dur:', dur?.toFixed(2), '— resumiendo');
                  player.play();
                  silenceCount = 0;
                } else if (pos !== lastPos) {
                  // La posición avanza → el audio sigue reproduciéndose aunque player.playing=false
                  // (oscilación de audio focus en Android). No contar como silencio.
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
        // Fallback al TTS del sistema si ElevenLabs no responde
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

    setEstado('esperando');
    estadoRef.current = 'esperando';

    // Solo reactivar SR si no estamos en flujo de voz
    if (!enFlujoVozRef.current) {
      iniciarSpeechRecognition();
    }
  }

  // ── Escucha manual (botón) ──────────────────────────────────────────────────
  async function iniciarEscucha() {
    if (estadoRef.current !== 'esperando') return;
    detenerSilbido();
    enFlujoVozRef.current = true; // bloquear SR durante todo el flujo del botón
    try {
      if (musicaActivaRef.current) { playerMusica.pause(); setMusicaActiva(false); }
      ExpoSpeechRecognitionModule.stop();
      await new Promise(r => setTimeout(r, 400)); // esperar que SR libere el micrófono
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
      // Siempre liberar el flag y reiniciar SR al terminar el flujo del botón
      enFlujoVozRef.current = false;
      if (estadoRef.current === 'esperando') iniciarSpeechRecognition();
    }
  }

  // ── Noticias en tiempo real ─────────────────────────────────────────────────
  async function buscarNoticias(query: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 6000);
      const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' after:' + hace5dias)}&hl=es-419&gl=AR&ceid=AR:es-419`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) return null;
      const xml = await res.text();
      // Extraer títulos del RSS — Google News usa CDATA, algunos feeds no
      const cdataMatches = [...xml.matchAll(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/gi)];
      const plainMatches = cdataMatches.length ? [] : [...xml.matchAll(/<title>([^<]+)<\/title>/gi)];
      const allMatches = cdataMatches.length ? cdataMatches : plainMatches;
      const titulos = allMatches.slice(1, 6).map(m => m[1].trim()).filter(Boolean); // slice(1) para saltear el título del canal
      if (!titulos.length) return null;
      return titulos.join('\n');
    } catch {
      return null;
    }
  }

  // ── Foto para la familia ─────────────────────────────────────────────────────
  async function flujoFoto() {
    const p = perfilRef.current;
    const chatIds = (p?.telegramContactos ?? []).map(c => c.id);
    if (!chatIds.length) {
      await hablar('No tenés familiares configurados para mandar la foto.');
      return;
    }
    await hablar('Dale, mirá la pantalla, te saco una foto en tres segundos.');
    // Abrir cámara y esperar que el componente capture o cancele
    const base64 = await new Promise<string | null>(resolve => {
      fotoResolverRef.current = resolve;
      setMostrarCamara(true);
    });
    setMostrarCamara(false);
    if (!base64) {
      await hablar('Bueno, cuando quieras sacamos la foto.');
      return;
    }
    await hablar('Mandando la foto a tu familia, un momento.');
    try {
      const ahora = new Date();
      const hora = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const caption = `📸 Foto de ${p?.nombreAbuela ?? 'tu familiar'} — ${hora}`;
      await enviarFotoTelegram(chatIds, base64, caption);
      await hablar('Listo, la foto ya está con tu familia.');
    } catch {
      await hablar('No pude mandar la foto, perdoname.');
    }
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
    const nuevoHistorial: Mensaje[] = [...historialRef.current, { role: 'user', content: textoUsuario }];

    try {
      const textoNorm = textoUsuario.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const pideJuego   = /\b(juego|jugar|adivinan|trivia|preguntas?|quiz|memori|refranes?|adivina|calculo|calcul|trabale|cuenta|cuantos|cuanto es|matematica)\b/.test(textoNorm);
      const pideChiste  = /\b(chiste|chistoso|gracioso|algo gracioso|me hace rei|haceme rei|contame algo diverti|divertido|me rei)\b/.test(textoNorm);

      // Buscar noticias si la pregunta es sobre eventos actuales o deportes
      let contextoNoticias = '';
      const pideNoticias = /\b(como salio|salio|resultado|gano|perdio|partido|noticias|novedades|que paso|que hay|que se sabe|que esta pasando|actualidad|hoy en|contame algo|algo nuevo|enterame|boca|river|racing|independiente|san lorenzo|huracan|belgrano|seleccion|mundial|copa|liga|torneo|politica|gobierno|presidente|congreso|senado|diputados|elecciones|ministerio|economia|dolar|inflacion|pobreza|desempleo|formula|formulauno|f1|gran premio|carrera|verstappen|hamilton|leclerc|norris|moto ?gp|tenis|roland garros|wimbledon|us open|nba|nfl|olimpiadas?|clima de manana|pronostico)\b/.test(textoNorm);
      if (pideNoticias) {
        const titulos = await buscarNoticias(textoUsuario);
        if (titulos) {
          contextoNoticias = `\n\nNoticias recientes relacionadas con la consulta (fuente: Google News, ${new Date().toLocaleDateString('es-AR')}):\n${titulos}\nUsá esta información si es relevante para responder.`;
        }
      }

      console.log('[RC] llamando a Claude...');
      const respuestaRaw = await llamarClaude({
        system: getSystemBlocks(p, climaRef.current, pideJuego, contextoNoticias, pideChiste),
        messages: nuevoHistorial.slice(-10),
      }) || '[NEUTRAL] No entendí bien, ¿podés repetir?';

      const parsed = parsearRespuesta(
        respuestaRaw,
        p.telegramContactos ?? [],
        p.familiares ?? [],
      );

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

      // ── MUSICA ──
      if (parsed.tagPrincipal === 'MUSICA' && parsed.generoMusica) {
        setExpresion('neutral');
        await hablar(parsed.respuesta);
        setEstado('pensando');
        estadoRef.current = 'pensando';
        ExpoSpeechRecognitionModule.stop();
        const urlStream = await buscarRadio(parsed.generoMusica);
        if (urlStream) {
          try {
            playerMusica.replace({ uri: urlStream });
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
        if (timerVozRef.current) clearTimeout(timerVozRef.current);
        timerVozRef.current = setTimeout(async () => {
          if (estadoRef.current === 'hablando' || estadoRef.current === 'pensando') {
            await new Promise<void>(resolve => {
              const check = setInterval(() => { if (estadoRef.current === 'esperando') { clearInterval(check); resolve(); } }, 500);
            });
          }
          await hablar(`${perfilRef.current?.nombreAbuela ?? ''}, se cumplió el tiempo.`);
        }, parsed.timerSegundos * 1000);
      }

      // ── RECORDATORIO ──
      if (parsed.recordatorio) {
        await guardarRecordatorio(parsed.recordatorio);
      }

      // ── MENSAJE_FAMILIAR ──
      if (parsed.mensajeFamiliar) {
        const { nombreDestino, texto: textoMensaje } = parsed.mensajeFamiliar;
        const contacto = (p.telegramContactos ?? []).find(c => c.nombre === nombreDestino)
          ?? (p.telegramContactos ?? []).find(c => c.nombre.toLowerCase().includes(nombreDestino.toLowerCase()));
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

      // ── RECUERDOS ──
      if (parsed.recuerdos.length > 0) {
        await Promise.all(parsed.recuerdos.map(r => agregarRecuerdo(r)));
        perfilRef.current = await cargarPerfil();
      }

      // ── LLAMAR_FAMILIA ──
      if (parsed.llamarFamilia) {
        const chatIds = (p.telegramContactos ?? []).map(c => c.id);
        const ahora   = Date.now();
        if (ahora - ultimaAlertaRef.current > 30 * 60 * 1000) {
          ultimaAlertaRef.current = ahora;
          enviarAlertaTelegram(chatIds, `${p.nombreAbuela} necesita hablar con vos.\n\n_${parsed.llamarFamilia}_`, p.nombreAsistente);
        }
      }

      // ── EMERGENCIA ──
      if (parsed.emergencia) {
        const chatIds     = (p.telegramContactos ?? []).map(c => c.id);
        const nombreAsist = p.nombreAsistente ?? 'Rosita';
        ultimaAlertaRef.current = Date.now();
        enviarAlertaTelegram(chatIds, `⚠️ *URGENTE* — ${p.nombreAbuela}\n\n${parsed.emergencia}\n\nAbrí ${nombreAsist} o llamala de inmediato.`, nombreAsist);
      }

      // ── Respuesta normal ──
      setExpresion(parsed.expresion);
      guardarEntradaAnimo(parsed.animoUsuario);
      const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsed.respuesta }].slice(-30);
      historialRef.current = nuevoHist;
      await guardarHistorial(nuevoHist);
      ultimaCharlaRef.current    = Date.now();
      ultimaActividadRef.current = Date.now();
      await hablar(parsed.respuesta);
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
    if (ahora - ultimoSosRef.current < 60000) return; // cooldown 1 minuto
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
    await hablar(`${nombre}, ya avisé a tu familia. Alguien va a comunicarse con vos pronto.`);
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
      // 3 bostezos seguidos con 5s entre cada uno
      bostezar();
      setTimeout(bostezar, 5000);
      setTimeout(bostezar, 10000);
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Detección de sacudida ────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return; // Accelerometer no disponible en web
    const UMBRAL = 2.5;      // g-force para detectar sacudida
    const SACUDIDAS = 3;     // sacudidas necesarias
    const VENTANA  = 1500;   // ms de ventana
    let conteo = 0;
    let timerReset: ReturnType<typeof setTimeout> | null = null;

    Accelerometer.setUpdateInterval(1000);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitud = Math.sqrt(x * x + y * y + z * z);
      if (magnitud > UMBRAL) {
        conteo++;
        if (timerReset) clearTimeout(timerReset);
        timerReset = setTimeout(() => { conteo = 0; }, VENTANA);
        if (conteo >= SACUDIDAS) {
          conteo = 0;
          if (timerReset) clearTimeout(timerReset);
          dispararSOS();
        }
      }
    });

    return () => { sub.remove(); if (timerReset) clearTimeout(timerReset); };
  }, []);

  // ── Interfaz pública del hook ───────────────────────────────────────────────
  return {
    // Estado UI
    estado, expresion, cargando, mostrarOnboarding, setMostrarOnboarding,
    musicaActiva, silbando, noMolestar, setNoMolestar,
    modoNoche, horaActual, climaObj, flashAnim,
    // Acciones
    iniciarEscucha, detenerEscucha, pararMusica, dispararSOS, forzarBostezo: () => {
      ultimoBostezRef.current = Date.now();
      setExpresion('bostezando');
      setTimeout(() => { if (estadoRef.current === 'esperando') setExpresion('neutral'); }, 2800);
    },
    onOjoPicado, onCaricia, onRelampago, iniciarSilbido, detenerSilbido, reactivar, recargarPerfil,
    mostrarCamara, onFotoCapturada, onFotoCancelada, flujoFoto,
    // Refs que useNotificaciones necesita
    refs: {
      perfilRef, estadoRef, noMolestarRef, modoNocheRef,
      ultimaActividadRef, ultimaCharlaRef, alertaInactividadRef,
      telegramOffsetRef, inicioSesionRef, climaRef,
      musicaActivaRef, enFlujoVozRef,
      setEstado, hablar, iniciarSpeechRecognition,
      modoNoche, iniciarSilbido, detenerSilbido,
    },
    player,
  };
}