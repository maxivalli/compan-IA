import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, BackHandler, Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import {
  cargarPerfil, cargarHistorial, guardarHistorial,
  Perfil, guardarEntradaAnimo, agregarRecuerdo,
  guardarRecordatorio,
} from '../lib/memoria';
import { Expresion, ModoNoche } from '../components/RosaOjos';
import { buscarRadio } from '../lib/musica';
import { obtenerClima, climaATexto } from '../lib/clima';
import { enviarAlertaTelegram } from '../lib/telegram';
import {
  hashTexto, respuestaOffline,
  construirSystemPrompt, parsearRespuesta,
} from '../lib/claudeParser';
import { llamarClaude, transcribirAudio, sintetizarVoz, generarSonido } from '../lib/ai';

const MINUTOS_SIN_CHARLA = 120;
const HORA_DESPERTAR     = 7;
const HORA_CHARLA_INICIO = 9;
const HORA_FIN           = 21;

type Mensaje = { role: 'user' | 'assistant'; content: string };

export function useRosita() {
  useKeepAwake();

  // ── Estado visible ──────────────────────────────────────────────────────────
  const [estado,            setEstado]            = useState<'esperando' | 'escuchando' | 'pensando' | 'hablando'>('esperando');
  const [expresion,         setExpresion]         = useState<Expresion>('neutral');
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false);
  const [musicaActiva,      setMusicaActiva]      = useState(false);
  const [silbando,          setSilbando]          = useState(false);
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

  // ── Flag para bloquear SR durante flujo de mensajes de voz ──────────────────
  const enFlujoVozRef    = useRef(false);

  // ── Memoización del system prompt (válido 1 minuto por clima/perfil) ─────────
  const systemPromptCacheRef = useRef<{ key: string; prompt: string } | null>(null);
  function getSystemPrompt(p: Perfil, climaTexto: string, incluirJuego: boolean): string {
    const ahora = new Date();
    const minKey = `${ahora.getFullYear()}-${ahora.getMonth()}-${ahora.getDate()}-${ahora.getHours()}-${ahora.getMinutes()}`;
    const perfKey = `${p.nombreAbuela}|${p.nombreAsistente}|${(p.recuerdos ?? []).length}|${(p.familiares ?? []).join(',')}`;
    const key = `${minKey}|${climaTexto}|${perfKey}|${incluirJuego}`;
    if (systemPromptCacheRef.current?.key === key) return systemPromptCacheRef.current.prompt;
    const prompt = construirSystemPrompt(p, climaTexto, incluirJuego);
    systemPromptCacheRef.current = { key, prompt };
    return prompt;
  }
  const sinConexionRef   = useRef(false);
  const ultimoSosRef     = useRef<number>(0);

  // ── Audio ───────────────────────────────────────────────────────────────────
  const recorderConv = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player       = useAudioPlayer(null);
  const playerMusica = useAudioPlayer(null);

  // ── Sincronizar refs con estado ─────────────────────────────────────────────
  useEffect(() => { estadoRef.current      = estado;      }, [estado]);
  useEffect(() => { musicaActivaRef.current = musicaActiva; }, [musicaActiva]);
  useEffect(() => { noMolestarRef.current  = noMolestar;  }, [noMolestar]);

  // ── Hora actual (para fondo) ────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setHoraActual(new Date().getHours()), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Monitor de conectividad ──────────────────────────────────────────────────
  useEffect(() => {
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!BACKEND_URL) return;

    async function chequearConexion() {
      try {
        const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(4000) });
        const habia = sinConexionRef.current;
        sinConexionRef.current = !res.ok;
        if (habia && res.ok && estadoRef.current === 'esperando' && !noMolestarRef.current) {
          await hablar(`${perfilRef.current?.nombreAbuela ?? ''}, ya volví a estar conectada.`);
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

    const id = setInterval(chequearConexion, 30000);
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
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Reiniciar SR si debería estar activo
        if (estadoRef.current === 'esperando' && !procesandoRef.current && !enFlujoVozRef.current) {
          setTimeout(() => {
            if (estadoRef.current === 'esperando' && !procesandoRef.current) {
              iniciarSpeechRecognition();
            }
          }, 800);
        }
        // Actualizar clima al volver
        obtenerClima().then(clima => {
          if (clima) {
            climaRef.current = climaATexto(clima);
            setClimaObj({ temperatura: clima.temperatura, descripcion: clima.descripcion });
          }
        }).catch(() => {});
      }
    });
    return () => sub.remove();
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
    if (procesandoRef.current) return;
    if (noMolestarRef.current) return;
    if (enFlujoVozRef.current) return; // bloqueado durante flujo de voz
    if (estadoRef.current === 'pensando' || estadoRef.current === 'hablando') return;

    const texto = event.results?.[0]?.transcript?.trim();
    if (!texto || texto.length < 2) return;

    if (musicaActivaRef.current) duckMusica();

    const nombreNorm  = nombreAsistenteRef.current.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const textoNorm   = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nombreRegex = new RegExp('(^|\\s)' + nombreNorm.slice(0, 5), 'i');
    const mencionaNombre = nombreRegex.test(textoNorm);
    const enConversacion = musicaActivaRef.current ? false : (Date.now() - ultimaCharlaRef.current) < 2 * 60 * 1000;

    if (!mencionaNombre && !enConversacion) { unduckMusica(); return; }

    procesandoRef.current = true;
    ExpoSpeechRecognitionModule.stop();

    if (musicaActivaRef.current) { playerMusica.pause(); setMusicaActiva(false); }

    try {
      await responderConClaude(texto);
    } finally {
      procesandoRef.current = false;
    }
  });

  useSpeechRecognitionEvent('end', () => {
    srActivoRef.current = false;
    if (enFlujoVozRef.current) return; // no reactivar durante flujo de voz
    if (estadoRef.current === 'esperando' && !procesandoRef.current) {
      setTimeout(() => {
        if (estadoRef.current === 'esperando' && !procesandoRef.current && !enFlujoVozRef.current) {
          if (!verificarCharlaProactiva()) iniciarSpeechRecognition();
        }
      }, 500);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    srActivoRef.current = false;
    if (enFlujoVozRef.current) return; // no reactivar durante flujo de voz
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
    inicializar();
    const watchdog = setInterval(() => {
      if (enFlujoVozRef.current) return; // no interferir durante flujo de voz
      if (estadoRef.current === 'esperando' && !srActivoRef.current && !procesandoRef.current) {
        iniciarSpeechRecognition();
      }
    }, 2000);
    return () => { ExpoSpeechRecognitionModule.stop(); clearInterval(watchdog); };
  }, []);

  // ── Cache TTS ───────────────────────────────────────────────────────────────
  async function precalentarCache(perfil: Perfil) {
    const nombre    = perfil.nombreAbuela;
    const asistente = perfil.nombreAsistente ?? 'Rosita';
    const frases = [
      'No te escuché bien, ¿podés repetir?',
      'No pude conectar con la radio, perdoname.',
      'No encontré música para poner, perdoname.',
      `Hola ${nombre}, soy ${asistente}. ¿Cómo estás hoy?`,
      // Offline
      `${nombre}, por ahora no tengo señal. Seguí hablándome y te respondo con lo que pueda.`,
      `${nombre}, ya volví a estar conectada.`,
      `Ahora mismo no tengo conexión, ${nombre}, pero acá estoy con vos. Volvé a hablarme en un ratito.`,
      `No me llega bien la señal, ${nombre}. Dame unos minutos y vuelvo a estar completa.`,
    ];
    for (const frase of frases) {
      const cacheUri = FileSystem.cacheDirectory + 'tts_v2_' + hashTexto(frase) + '.mp3';
      const info = await FileSystem.getInfoAsync(cacheUri);
      if (info.exists) continue;
      try {
        const base64 = await sintetizarVoz(frase);
        if (!base64) continue;
        await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: 'base64' });
      } catch {}
    }

    const silbidoUri  = FileSystem.cacheDirectory + 'silbido.mp3';
    const silbidoInfo = await FileSystem.getInfoAsync(silbidoUri);
    if (!silbidoInfo.exists) {
      try {
        const base64 = await generarSonido(
          'gentle cheerful whistling melody, soft and warm, like someone happily humming at home, loopable',
        );
        if (base64) await FileSystem.writeAsStringAsync(silbidoUri, base64, { encoding: 'base64' });
      } catch {}
    }
  }

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

  // ── Inicializar ─────────────────────────────────────────────────────────────
  async function inicializar() {
    await AudioModule.requestRecordingPermissionsAsync();
    await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    limpiarCacheViejo().catch(() => {});
    const [perfilGuardado, historialGuardado, clima] = await Promise.all([
      cargarPerfil(), cargarHistorial(), obtenerClima(),
    ]);
    perfilRef.current    = perfilGuardado;
    historialRef.current = historialGuardado as Mensaje[];
    if (clima) { climaRef.current = climaATexto(clima); setClimaObj({ temperatura: clima.temperatura, descripcion: clima.descripcion }); }
    nombreAsistenteRef.current = (perfilGuardado.nombreAsistente ?? 'Rosita').toLowerCase();
    precalentarCache(perfilGuardado).catch(() => {});
    const asistente = perfilGuardado.nombreAsistente ?? 'Rosita';
    if (!perfilGuardado.nombreAbuela) {
      setMostrarOnboarding(true);
      await hablar(`¡Hola! Soy ${asistente}, tu compañera virtual. Estoy acá para charlar con vos, recordarte los medicamentos, ponerte música y avisarle a tu familia si lo necesitás. Antes de empezar, pedile a un familiar que me configure con tu nombre y tus datos.`);
    } else {
      await hablar(`Hola ${perfilGuardado.nombreAbuela}, soy ${asistente}. ¿Cómo estás hoy?`);
    }
  }

  // ── SR helpers ──────────────────────────────────────────────────────────────
  function iniciarSpeechRecognition() {
    if (enFlujoVozRef.current) return; // no iniciar durante flujo de voz
    try {
      ExpoSpeechRecognitionModule.start({ lang: 'es-AR', continuous: true, interimResults: false });
      srActivoRef.current = true;
    } catch {
      srActivoRef.current = false;
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
        system: getSystemPrompt(p, climaRef.current, false) + `\n\nEs ${momento}. Iniciá UNA sola frase corta y cálida para charlar. Respondé SOLO con la frase, sin etiquetas.`,
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
  async function reproducirSilbido(repeticion = 1) {
    if (!silbidoActivoRef.current) return;
    if (estadoRef.current !== 'esperando') return;
    if (repeticion > 2) { silbidoActivoRef.current = false; setSilbando(false); ultimaCharlaRef.current = Date.now(); return; }
    try {
      const cacheUri = FileSystem.cacheDirectory + 'silbido.mp3';
      const cached = await FileSystem.getInfoAsync(cacheUri);
      if (!cached.exists) return;
      player.replace({ uri: cacheUri });
      player.play();
      await new Promise<void>(resolve => {
        setTimeout(() => {
          const interval = setInterval(() => { if (!player.playing) { clearInterval(interval); resolve(); } }, 300);
        }, 400);
      });
      if (silbidoActivoRef.current && estadoRef.current === 'esperando') {
        silbidoTimerRef.current = setTimeout(() => reproducirSilbido(repeticion + 1), 2000);
      }
    } catch {}
  }

  function iniciarSilbido() {
    if (silbidoActivoRef.current) return;
    silbidoActivoRef.current = true;
    setSilbando(true);
    reproducirSilbido(1);
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
    ExpoSpeechRecognitionModule.stop();
    detenerSilbido();
    setEstado('hablando');
    estadoRef.current = 'hablando';

    const MAX_CHARS = 200;
    if (texto.length > MAX_CHARS) {
      const corte = texto.lastIndexOf('.', MAX_CHARS);
      texto = corte > 40 ? texto.slice(0, corte + 1) : texto.slice(0, MAX_CHARS).trimEnd();
    }

    try {
      const cacheUri = FileSystem.cacheDirectory + 'tts_v2_' + hashTexto(texto) + '.mp3';
      const info = await FileSystem.getInfoAsync(cacheUri);
      let uri: string | null = info.exists ? cacheUri : null;

      if (!uri) {
        const base64 = await sintetizarVoz(texto);
        if (base64) {
          await FileSystem.writeAsStringAsync(cacheUri, base64, { encoding: 'base64' });
          uri = cacheUri;
        }
      }

      if (uri) {
        player.replace({ uri });
        player.play();
        await new Promise<void>(resolve => {
          setTimeout(() => {
            const interval = setInterval(() => {
              if (!player.playing) { clearInterval(interval); resolve(); }
            }, 300);
          }, 400);
        });
      } else {
        // Fallback al TTS del sistema si ElevenLabs no responde
        await new Promise<void>((resolve) => {
          Speech.speak(texto, { language: 'es-AR', rate: 0.9, onDone: resolve, onError: () => resolve(), onStopped: () => resolve() });
        });
      }
    } catch {
      try {
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
    try {
      if (musicaActivaRef.current) { playerMusica.pause(); setMusicaActiva(false); }
      ExpoSpeechRecognitionModule.stop();
      setEstado('escuchando');
      estadoRef.current = 'escuchando';
      await recorderConv.prepareToRecordAsync();
      recorderConv.record();
      yaDetuvRef.current = false;
      setTimeout(() => { if (!yaDetuvRef.current) detenerEscucha(); }, 12000);
    } catch {
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
      else { setEstado('esperando'); estadoRef.current = 'esperando'; iniciarSpeechRecognition(); }
    } catch {
      setEstado('esperando');
      estadoRef.current = 'esperando';
      iniciarSpeechRecognition();
    }
  }

  async function enviarAudio(uri: string) {
    setEstado('pensando');
    estadoRef.current = 'pensando';
    try {
      const texto = await transcribirAudio(uri);
      if (!texto.trim()) { await hablar('No te escuché bien, ¿podés repetir?'); return; }
      await responderConClaude(texto);
    } catch {
      setEstado('esperando');
      estadoRef.current = 'esperando';
      iniciarSpeechRecognition();
    }
  }

  // ── Responder con Claude ────────────────────────────────────────────────────
  async function responderConClaude(textoUsuario: string) {
    const p = perfilRef.current;
    if (!p) return;
    detenerSilbido();
    setEstado('pensando');
    estadoRef.current = 'pensando';
    const nuevoHistorial: Mensaje[] = [...historialRef.current, { role: 'user', content: textoUsuario }];

    try {
      const textoNorm = textoUsuario.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const pideJuego = /\b(juego|jugar|adivinan|trivia|preguntas?|quiz|memori|refranes?|adivina)\b/.test(textoNorm);

      const respuestaRaw = await llamarClaude({
        system: getSystemPrompt(p, climaRef.current, pideJuego),
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
            setEstado('esperando');
            estadoRef.current = 'esperando';
            iniciarSpeechRecognition();
            setTimeout(() => { if (!playerMusica.playing) setMusicaActiva(false); }, 5000);
            if (expresionTimerRef.current) clearTimeout(expresionTimerRef.current);
            expresionTimerRef.current = setTimeout(() => setExpresion('neutral'), 5000);
          } catch {
            setMusicaActiva(false);
            await hablar('No pude conectar con la radio, perdoname.');
          }
        } else {
          await hablar('No encontré música para poner, perdoname.');
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
        Promise.all(parsed.recuerdos.map(r => agregarRecuerdo(r))).then(() => {
          cargarPerfil().then(pf => { perfilRef.current = pf; });
        });
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

    } catch {
      const chatIds  = (perfilRef.current?.telegramContactos ?? []).map(c => c.id);
      const respLocal = respuestaOffline(
        textoUsuario,
        p.nombreAbuela,
        p.nombreAsistente ?? 'Rosita',
        climaRef.current,
        pararMusica,
        chatIds,
        enviarAlertaTelegram,
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
  useEffect(() => {
    const CINCO_MIN = 5 * 60 * 1000;
    const ENTRE_BOSTEZOS = 10 * 60 * 1000; // no bosteza de nuevo por 10 min
    const id = setInterval(() => {
      if (estadoRef.current !== 'esperando') return;
      if (modoNocheRef.current !== 'despierta') return;
      if (noMolestarRef.current) return;
      if (musicaActivaRef.current) return;
      if ((Date.now() - ultimaActividadRef.current) < CINCO_MIN) return;
      if ((Date.now() - ultimoBostezRef.current) < ENTRE_BOSTEZOS) return;

      ultimoBostezRef.current = Date.now();
      setExpresion('bostezando');
      setTimeout(() => {
        if (estadoRef.current === 'esperando') setExpresion('neutral');
      }, 2800);
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

    Accelerometer.setUpdateInterval(100);
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
    estado, expresion, mostrarOnboarding, setMostrarOnboarding,
    musicaActiva, silbando, noMolestar, setNoMolestar,
    modoNoche, horaActual, climaObj, flashAnim,
    // Acciones
    iniciarEscucha, detenerEscucha, pararMusica, dispararSOS, forzarBostezo: () => {
      ultimoBostezRef.current = Date.now();
      setExpresion('bostezando');
      setTimeout(() => { if (estadoRef.current === 'esperando') setExpresion('neutral'); }, 2800);
    },
    onOjoPicado, onRelampago, iniciarSilbido, detenerSilbido,
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