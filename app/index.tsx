import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRootNavigationState } from 'expo-router';
import { Animated, Easing, Modal, PanResponder, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

// Escala fuentes respetando la accesibilidad del sistema (hasta 1.3x)
function fs(size: number) { return size * Math.min(PixelRatio.getFontScale(), 1.3); }
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// ExpoSpeechRecognitionModule eliminado — el SR se gestiona en useAudioPipeline
// a través de pararSRIntencional. No hay llamadas directas al módulo acquí.
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRosita } from '../hooks/useRosita';
import { useNotificaciones } from '../hooks/useNotificaciones';
import { useAccionesRosita } from '../hooks/useAccionesRosita';
import { useBLEBeacon } from '../hooks/useBLEBeacon';
import { useClickSound } from '../hooks/useClickSound';
import RositaHorizontalLayout from '../components/RositaHorizontalLayout';
import RosaOjos, { BG } from '../components/RosaOjos';
import MenuFlotante from '../components/MenuFlotante';
import ExpresionOverlay from '../components/ExpresionOverlay';
import { AnimacionMusica, ZZZ, CieloNoche } from '../components/FondoAnimado';
import { Globos } from '../components/EfectosExpresion';
import CameraAutoCaptura from '../components/CameraAutoCaptura';
import CamaraPresenciaVisionOverlay from '../components/CamaraPresenciaVisionOverlay';

import PostItViewer, { POSTIT_COLORES } from '../components/PostItViewer';
import { OvaloRosita } from '../components/FaceGlow';
import { CODIGOS_ADVERSOS } from '../lib/clima';
import { nombreRadioOGenero } from '../lib/musica';
import { cargarRecordatorios } from '../lib/memoria';


function RelojNoche({ fontSize }: { fontSize: number }) {
  const [tiempo, setTiempo] = React.useState(() => {
    const now = new Date();
    return {
      hh: String(now.getHours()).padStart(2, '0'),
      mm: String(now.getMinutes()).padStart(2, '0'),
    };
  });
  const latido = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setTiempo({
        hh: String(now.getHours()).padStart(2, '0'),
        mm: String(now.getMinutes()).padStart(2, '0'),
      });
    }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 0.15, duration: 500, useNativeDriver: true }),
        Animated.timing(latido, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[styles.relojNoche, { fontSize }]}>{tiempo.hh}</Text>
      <Animated.Text style={[styles.relojNoche, { fontSize, opacity: latido, marginHorizontal: 2 }]}>:</Animated.Text>
      <Text style={[styles.relojNoche, { fontSize }]}>{tiempo.mm}</Text>
    </View>
  );
}

function MarqueeText({ text, style }: { text: string; style?: object }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [containerW, setContainerW] = React.useState(0);

  useEffect(() => {
    if (!containerW) return;
    // El texto entra desde la derecha y sale por la izquierda.
    // Usamos una distancia fija generosa (containerW + 600) sin necesidad de medir el texto.
    const totalDistance = containerW + 600;
    translateX.setValue(containerW);
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -600,
        duration: totalDistance * 18,  // ~18ms/px ≈ velocidad cómoda de lectura
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [containerW]);

  return (
    <View
      style={{ flex: 1, overflow: 'hidden' }}
      onLayout={e => setContainerW(e.nativeEvent.layout.width)}
    >
      <Animated.Text style={[style, { transform: [{ translateX }] }]} numberOfLines={1}>
        {text}
      </Animated.Text>
    </View>
  );
}

// Bisel cromado retro — alto contraste, diagonal para simular curvatura del metal
const CHROME_BEZEL = ['#e8e8e8', '#ffffff', '#cccccc', '#707070', '#b4b4b4', '#383838'] as const;


export default function Index() {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const {
    estado, expresion, cargando, mostrarOnboarding, setMostrarOnboarding,
    musicaActiva, silbando, noMolestar, setNoMolestar,
    linternaActiva, apagarLinterna,
    modoNoche, horaActual, climaObj, ciudadDetectada, flashAnim,
    pararMusica, reanudarMusica, dispararSOS,
    resetExpresion,
    onOjoPicado, onCaricia, onRelampago, iniciarSilbido, detenerSilbido, reactivar, recargarPerfil,
    mostrarCamara, camaraFacing, camaraSilenciosa, onFotoCapturada, onFotoCancelada, iniciarFlujoFoto, modoVision, capturaVisionFnRef,
    modoWatchingPresencia, onPresenciaDetectada,
    bleConectadoRef,
    refs, player,
    listas, borrarListaVoz,
    detectandoSonido,
    monitoreoActivo,
    ultimaRadioRef,
  } = useRosita();

  const menuTriggerRef = useRef<(() => void) | null>(null);

  const panCaricia = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dy) < 40,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 40) onCaricia(); },
  })).current;

  // Al volver del onboarding con perfil ya guardado, arrancar normalmente.
  // Al salir (onboarding, configuración, etc.) detener SR para que no escuche
  // en segundo plano mientras el tab sigue montado.
  useFocusEffect(useCallback(() => {
    // Si está mostrando onboarding, no hacer nada (evitar interferir con la navegación)
    if (mostrarOnboarding) return;

    refs.reanudarSR?.();
    resetExpresion();
    if (cargando) reactivar();
    else recargarPerfil();
    cargarRecordatorios().then(r => setHayRecordatorios(r.length > 0)).catch(() => { });
    return () => { refs.suspenderSR?.(); };
  }, [cargando, mostrarOnboarding]));

  // ── Foto recibida por Telegram ───────────────────────────────────────────────
  const [fotoTelegram, setFotoTelegram] = React.useState<{ url: string; descripcion: string } | null>(null);
  const [modoRelojHorizontal, setModoRelojHorizontal] = useState(false);
  const [bleConectado, setBleConectado] = useState(false);
  const [hayRecordatorios, setHayRecordatorios] = useState(false);
  const fotoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup de ambos timers al desmontar
  useEffect(() => () => {
    if (fotoTimerRef.current) clearTimeout(fotoTimerRef.current);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
  }, []);

  function mostrarFoto(urlFoto: string, descripcion: string) {
    if (fotoTimerRef.current) clearTimeout(fotoTimerRef.current);
    setFotoTelegram({ url: urlFoto, descripcion });
    // Fallback: cierra sola a los 60s si por algún motivo cerrarFoto no se llama
    fotoTimerRef.current = setTimeout(() => setFotoTelegram(null), 60000);
  }

  function cerrarFoto() {
    if (fotoTimerRef.current) { clearTimeout(fotoTimerRef.current); fotoTimerRef.current = null; }
    setFotoTelegram(null);
  }

  // Conectar hook de notificaciones pasándole todos los refs del hook principal
  const { chequearPendientesAlActivar, esCumpleaños, triggerCumpleaños, ultimaNotaId, clearUltimaNotaId } = useNotificaciones({ ...refs, pararMusica, reanudarMusica, iniciarSilbido, detenerSilbido, pararSRIntencional: refs.pararSRIntencional, mostrarFoto, cerrarFoto, monitoreoActivo }, player);

  // Auto-abrir la nota cuando esté lista
  useEffect(() => {
    if (!ultimaNotaId) return;
    clearUltimaNotaId();
    router.push(`/nota/${ultimaNotaId}` as Parameters<typeof router.push>[0]);
  }, [ultimaNotaId]);


  // ── Cálculo del fondo y Degradados ──────────────────────────────────────────
  const hora = horaActual;
  const esAtardecerBg = hora >= 17 && hora < 20;
  const esAmanecer    = hora >= 5 && hora < 8;
  const esFondoNoche  = hora >= 20 || hora < 5;
  const esBotonesNoche = esFondoNoche;
  const esClimaOscuro = !!climaObj?.descripcion?.toLowerCase().match(/lluvia|lloviendo|llovizna|tormenta|granizo|chaparrón|nevada/);

  // Tu color base original
  const bgActual = esFondoNoche ? BG : esClimaOscuro ? '#64748B' : esAmanecer ? '#FED7AA' : esAtardecerBg ? '#FDBA74' : '#A5F3FC';
  // Párpados de piel normal si el cielo ya aclaró pero Rosita aún duerme (ej: 5-9h)
  const amaneciendo = !esFondoNoche && modoNoche === 'durmiendo';

  // Degradados para el cielo
  const degradadoCielo: readonly [string, string, string] | readonly [string, string, string, string] = esFondoNoche
    ? ['#0F172A', '#1E1B4B', bgActual]
    : esClimaOscuro
      ? ['#94A3B8', '#64748B', bgActual]
      : esAmanecer
        ? ['#818CF8', '#D8B4FE', bgActual]
        : esAtardecerBg
          ? ['#1E3A5F', '#7C3AED', '#FB923C', bgActual]
          : ['#38BDF8', '#93C5FD', bgActual];

  const desc = climaObj?.descripcion?.toLowerCase() ?? '';
  const cieloTapado = /\bnublado\b/.test(desc) && !/parcial|algunas nubes/.test(desc)
    || /nuboso|cubierto|lluvia|lloviendo|llovizna|tormenta|nevada|nieve|granizo|niebla|chaparrón/.test(desc);

  // ── Hora + Temperatura alternando en modo espera ─────────────────────────────
  const fmtHoraMinuto = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const [horaMinuto, setHoraMinuto] = useState(fmtHoraMinuto);
  const [infoIdx, setInfoIdx] = useState(0); // 0 = hora, 1 = radio, 2 = temperatura, 3 = alerta clima
  const [faceBottom, setFaceBottom] = useState(0); // Y bottom del ojoContenedor → posición del panel cuero
  const climaObjRef = useRef(climaObj);
  useEffect(() => { climaObjRef.current = climaObj; }, [climaObj]);

  useEffect(() => {
    const id = setInterval(() => setHoraMinuto(fmtHoraMinuto()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const hasAlert = !!(climaObj?.codigoActual && CODIGOS_ADVERSOS.has(climaObj.codigoActual)) || (climaObj?.temperatura !== undefined && (climaObj.temperatura >= 35 || climaObj.temperatura <= 3));
    const screens = 1 + (musicaActiva ? 1 : 0) + (climaObj?.temperatura != null ? 1 : 0) + (hasAlert ? 1 : 0);
    setInfoIdx(prev => Math.min(prev, Math.max(0, screens - 1)));
  }, [climaObj, musicaActiva]);

  const fechaDisplay = useMemo(() => {
    const d = new Date();
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`;
  }, [horaMinuto]);

  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintTranslate = useRef(new Animated.Value(20)).current;
  const hintScale = useRef(new Animated.Value(0.95)).current;
  const hintActiveRef = useRef(false);
  const hintAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const hintAnimSeqRef = useRef(0);

  useEffect(() => {
    hintAnimSeqRef.current += 1;
    hintAnimRef.current?.stop();
    hintActiveRef.current = true;
    hintTranslate.setValue(20);
    hintScale.setValue(0.95);
    const seq = hintAnimSeqRef.current;
    hintAnimRef.current = Animated.parallel([
      Animated.timing(hintOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(hintTranslate, { toValue: 0, duration: 700, useNativeDriver: true }),
      Animated.timing(hintScale, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]);
    hintAnimRef.current.start();
    const id = setInterval(() => {
      if (!hintActiveRef.current || hintAnimSeqRef.current !== seq) return;
      hintAnimRef.current?.stop();
      hintAnimRef.current = Animated.parallel([
        Animated.timing(hintOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(hintTranslate, { toValue: -20, duration: 400, useNativeDriver: true }),
        Animated.timing(hintScale, { toValue: 0.95, duration: 400, useNativeDriver: true }),
      ]);
      hintAnimRef.current.start(({ finished }) => {
        if (!finished || !hintActiveRef.current || hintAnimSeqRef.current !== seq) return;
        setInfoIdx(prev => {
          const co = climaObjRef.current;
          const hasAlert = !!(co?.codigoActual && CODIGOS_ADVERSOS.has(co.codigoActual)) || (co?.temperatura !== undefined && (co.temperatura >= 35 || co.temperatura <= 3));
          const screens = 1 + (musicaActiva ? 1 : 0) + (co?.temperatura != null ? 1 : 0) + (hasAlert ? 1 : 0);
          const max = Math.max(0, screens - 1);
          const next = prev >= max ? 0 : prev + 1;
          hintTranslate.setValue(20);
          hintScale.setValue(0.95);
          return next;
        });
        hintAnimRef.current?.stop();
        hintAnimRef.current = Animated.parallel([
          Animated.timing(hintOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(hintTranslate, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(hintScale, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]);
        hintAnimRef.current.start();
      });
    }, 4500);
    return () => {
      hintActiveRef.current = false;
      clearInterval(id);
      hintAnimRef.current?.stop();
    };
  }, [musicaActiva]);

  // ── Modal hint SOS ──────────────────────────────────────────────────────────
  const [hintSOS, setHintSOS] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mostrarHintSOS() {
    setHintSOS(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHintSOS(false), 3500);
  }

  // ── Pulso ámbar del badge "esperando" ───────────────────────────────────────
  const badgePulso = useRef(new Animated.Value(0)).current;
  const badgePulsoRef = useRef<Animated.CompositeAnimation | null>(null);
  const isEsperando = !noMolestar && !musicaActiva && !esBotonesNoche && estado === 'esperando';

  useEffect(() => {
    if (isEsperando) {
      badgePulsoRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(badgePulso, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(badgePulso, { toValue: 0, duration: 900, useNativeDriver: true }),
        ])
      );
      badgePulsoRef.current.start();
    } else {
      badgePulsoRef.current?.stop();
      badgePulso.setValue(0);
    }
    return () => { badgePulsoRef.current?.stop(); };
  }, [isEsperando]);

  // ── Animación del botón SOS ─────────────────────────────────────────────────
  const [sosPresionando, setSosPresionando] = useState(false);
  const [mostrarListas, setMostrarListas] = useState(false);
  const sosBrillo = useRef(new Animated.Value(0)).current;

  // ── LED de presencia (ojo en LCD) ───────────────────────────────────────────
  const deteccionPresenciaActiva = refs.perfilRef.current?.deteccionPresenciaActiva ?? false;
  const [presenciaVista, setPresenciaVista] = useState(false);
  const presenciaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ojoPulso = useRef(new Animated.Value(1)).current;
  const ojoPulsoRef = useRef<Animated.CompositeAnimation | null>(null);
  // Pulsa solo cuando la cámara está activamente escaneando (watching)
  const ojoDebePulsar = modoWatchingPresencia && !presenciaVista;

  function onPresenciaDetectadaConLed() {
    setPresenciaVista(true);
    if (presenciaTimerRef.current) clearTimeout(presenciaTimerRef.current);
    presenciaTimerRef.current = setTimeout(() => setPresenciaVista(false), 3000);
    onPresenciaDetectada();
  }

  useEffect(() => {
    if (ojoDebePulsar) {
      ojoPulsoRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(ojoPulso, { toValue: 0.2, duration: 700, useNativeDriver: true }),
          Animated.timing(ojoPulso, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      ojoPulsoRef.current.start();
    } else {
      ojoPulsoRef.current?.stop();
      ojoPulso.setValue(1);
    }
    return () => { ojoPulsoRef.current?.stop(); };
  }, [ojoDebePulsar]);

  function sosPresionado() {
    setSosPresionando(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Animated.timing(sosBrillo, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }

  function sosSoltado() {
    setSosPresionando(false);
    Animated.timing(sosBrillo, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }


  // ── Nombre del asistente para el onboarding ─────────────────────────────────
  const nombreAsistente = refs.perfilRef.current?.nombreAsistente ?? 'Rosita';
  const vozGenero = refs.perfilRef.current?.vozGenero ?? 'femenina';

  // ── Auto-navegar al onboarding en primer uso ─────────────────────────────────
  // Espera a que navigationState.key esté definido (router listo) antes de navegar.
  // Sin esta guarda, router.replace falla silenciosamente en el primer arranque post-install.
  useEffect(() => {
    if (!navigationState?.key) return; // router todavía no está listo
    if (mostrarOnboarding) {
      // Usar setTimeout para asegurar que la navegación ocurra después del render
      setTimeout(() => {
        router.replace('/onboarding' as any);
        setMostrarOnboarding(false);
      }, 0);
    }
  }, [navigationState?.key, mostrarOnboarding]);

  const { width: screenW, height: screenH } = useWindowDimensions();
  const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();
  const layoutMode = screenW > screenH ? 'horizontal' : 'vertical';
  const { playClick } = useClickSound();
  const isTablet = screenW >= 600;
  const faceScale = isTablet ? Math.min(screenW / 390, 1.62) : layoutMode === 'vertical' ? 1.15 : 1;
  const textScale = faceScale;
  // Row = sideBtn + gap + mainBtn + gap + sideBtn, donde mainBtn ≈ 3.125 * sideBtn (ratio original 200/64)
  // Disponible = screenW - 52px marco cuero - 32px gaps - 16px padding lateral
  const btnH = isTablet ? Math.round(64 * textScale) : Math.min(64, Math.floor((screenW - 100) / 5.125));
  const btnW = isTablet ? Math.round(Math.min(200 * faceScale, 380)) : Math.round(btnH * 3.125);
  // Display: escala proporcional a btnH; fonts derivados del alto del contenedor
  const displayH = isTablet ? Math.round(120 * textScale) : Math.min(140, Math.round(btnH * 2.2));
  const displayFontInfo = Math.round(displayH * 0.34);   // hora / temperatura
  const displayFontReloj = Math.round(displayH * 0.62);   // reloj noche (pantalla completa)
  const icoBtn = Math.round(btnH * 0.46);
  const icoSOS = Math.round(btnH * 0.50);
  const btnFont = isTablet ? fs(26) : fs(18);
  const sosFontTablet = fs(43);
  const tabletPadV = isTablet ? Math.round(screenH * 0.08) : 0;

  // ── Badge de estado ──────────────────────────────────────────────────────────
  const badgeBg = noMolestar ? '#ffffff'
    : musicaActiva ? '#f97316'
      : estado === 'pensando' ? '#3b82f6'
        : estado === 'hablando' ? '#22c55e'
          : estado === 'escuchando' ? '#ef4444'
            : esBotonesNoche ? '#1a1f2e'
              : '#ffffff';
  const badgeColor = noMolestar ? '#ffffff'
    : musicaActiva ? '#ffffff'
      : estado === 'pensando' ? '#ffffff'
        : estado === 'hablando' ? '#ffffff'
          : estado === 'escuchando' ? '#ffffff'
            : esBotonesNoche ? '#e2e8f0'
              : '#fff8e7';
  const badgeLabel = noMolestar ? 'Silencio'
    : musicaActiva ? 'Parar'
      : estado === 'pensando' ? 'Pensando'
        : estado === 'hablando' ? 'Hablando'
          : estado === 'escuchando' ? 'Escuchando'
            : 'Esperando';

  const badgeGradient: [string, string] = noMolestar ? ['#4b5563', '#1f2937']
    : musicaActiva ? ['#fdba74', '#ea580c']
      : estado === 'pensando' ? ['#93c5fd', '#1d4ed8']
        : estado === 'hablando' ? ['#86efac', '#15803d']
          : estado === 'escuchando' ? ['#fca5a5', '#dc2626']
            : esBotonesNoche ? ['#2d3748', '#0f1117']
              : ['#92400e', '#451a03'];

  const glowColor = noMolestar ? '#374151'
    : musicaActiva ? '#f97316'
      : estado === 'pensando' ? '#3b82f6'
        : estado === 'hablando' ? '#22c55e'
          : estado === 'escuchando' ? '#ef4444'
            : esBotonesNoche ? '#6366f1'
              : '#f59e0b';

  // Rojo oscuro = luz apagada (base siempre visible)
  const sosGradientOff: [string, string] = esBotonesNoche ? ['#7f1d1d', '#450a0a'] : ['#b91c1c', '#7f1d1d'];
  // Rojo brillante = luz encendida (se mezcla encima con opacity animada)
  const sosGradientOn: [string, string] = ['#fca5a5', '#ef4444'];
  const sosShadowColor = sosPresionando ? '#ff2222' : esBotonesNoche ? '#6B1111' : '#CC2222';
  const sosShadowOpacity = sosPresionando ? 0.85 : esBotonesNoche ? 0.20 : 0.55;
  const sosInnerBorder = sosPresionando ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.32)';


  // ── Acciones canónicas (touch vertical y BLE horizontal llaman a lo mismo) ───
  const acciones = useAccionesRosita({
    estado, musicaActiva, musicaActivaRef: refs.musicaActivaRef,
    bloquearReanudarMusicaRef: refs.bloquearReanudarMusicaRef, noMolestar,
    pararMusica, dispararSOS,
    iniciarFlujoFoto,
    setNoMolestar,
    iniciarSpeechRecognition: refs.iniciarSpeechRecognition,
    pararSRIntencional: refs.pararSRIntencional,
    detenerSilbido,
    chequearPendientesAlActivar,
  });

  // ── BLE Beacon ────────────────────────────────────────────────────────────────
  useBLEBeacon({ acciones, conectadoRef: bleConectadoRef, onConexionChange: setBleConectado });


  if (cargando && Platform.OS !== 'web') return <View style={{ flex: 1, backgroundColor: '#fff' }} />;

  // Si debe mostrar onboarding, no renderizar la pantalla principal
  // (evita que se vea la cara de gato antes de navegar)
  if (mostrarOnboarding) {
    return <View style={{ flex: 1, backgroundColor: '#fff' }} />;
  }

  // Si no hay perfil cargado aún, esperar (evita renderizar sin datos)
  if (!refs.perfilRef.current?.nombreAbuela) {
    return <View style={{ flex: 1, backgroundColor: '#fff' }} />;
  }

  // ── Modo horizontal: layout dedicado sin botones visibles ────────────────────
  if (layoutMode === 'horizontal') {
    return (
      <>
        <RositaHorizontalLayout
          modoReloj={modoRelojHorizontal}
          onToggleModoReloj={() => setModoRelojHorizontal(prev => !prev)}
          hasListas={listas.length > 0}
          listasCount={listas.length}
          onOpenListas={() => setMostrarListas(true)}
          estado={estado}
          expresion={expresion}
          modoNoche={modoNoche}
          musicaActiva={musicaActiva}
          silbando={silbando}
          noMolestar={noMolestar}
          linternaActiva={linternaActiva}
          detectandoSonido={detectandoSonido}
          bgActual={bgActual}
          degradadoCielo={degradadoCielo}
          esFondoNoche={esFondoNoche}
          cieloTapado={cieloTapado}
          amaneciendo={amaneciendo}
          climaObj={climaObj}
          ultimaRadio={ultimaRadioRef.current}
          mostrarCamara={mostrarCamara}
          camaraFacing={camaraFacing}
          camaraSilenciosa={camaraSilenciosa}
          onFotoCapturada={onFotoCapturada}
          onFotoCancelada={onFotoCancelada}
          fotoTelegram={fotoTelegram}
          onClearFotoTelegram={() => setFotoTelegram(null)}
          flashAnim={flashAnim}
          esCumpleaños={esCumpleaños}
          onTriggerCumpleaños={triggerCumpleaños}
          acciones={acciones}
          onOjoPicado={onOjoPicado}
          onCaricia={onCaricia}
          onRelampago={onRelampago}
          apagarLinterna={apagarLinterna}
          deteccionPresenciaActiva={deteccionPresenciaActiva}
          modoWatchingPresencia={modoWatchingPresencia}
          presenciaVista={presenciaVista}
          bleConectado={bleConectado}
        />
        <PostItViewer
          visible={mostrarListas}
          listas={listas}
          onBorrar={(nombre) => { borrarListaVoz(nombre); }}
          onClose={() => setMostrarListas(false)}
        />
        <CamaraPresenciaVisionOverlay activo={modoWatchingPresencia} onPresenciaDetectada={onPresenciaDetectadaConLed} />
      </>
    );
  }

  return (
    <>
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          if (linternaActiva) { apagarLinterna(); return; }
          if (musicaActiva) pararMusica();
        }}
      >
        <LinearGradient
          colors={degradadoCielo}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          locations={degradadoCielo.length === 4 ? [0, 0.25, 0.55, 1] : [0, 0.4, 1]}
          style={[styles.contenedor, isTablet && { justifyContent: 'space-evenly', paddingVertical: tabletPadV }]}
        >
          <MenuFlotante oscuro hideBtn triggerRef={menuTriggerRef} />

          {/* Botón No Molestar — arriba izquierda */}
          <TouchableOpacity
            style={{
              position: 'absolute', top: safeTop + 12, left: 16,
              width: btnH, height: btnH, borderRadius: btnH / 2, zIndex: 20,
              backgroundColor: noMolestar ? 'rgba(239,68,68,0.40)' : 'rgba(0,0,0,0.10)',
              borderWidth: 1, borderColor: noMolestar ? 'rgba(239,68,68,0.70)' : 'rgba(255,255,255,0.30)',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.30, shadowRadius: 8,
            }}
            onPress={() => { playClick(); acciones.toggleDoNotDisturb(); }}
            activeOpacity={0.7}
          >
            <Ionicons name={noMolestar ? 'mic-off' : 'mic-outline'} size={Math.round(btnH * 0.42)} color="rgba(255,255,255,0.92)" />
          </TouchableOpacity>

          {/* Botón Menú — arriba derecha */}
          <TouchableOpacity
            style={{
              position: 'absolute', top: safeTop + 12, right: 16,
              width: btnH, height: btnH, borderRadius: btnH / 2, zIndex: 20,
              backgroundColor: 'rgba(0,0,0,0.10)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.30, shadowRadius: 8,
            }}
            onPress={() => { menuTriggerRef.current?.(); }}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={Math.round(btnH * 0.42)} color="rgba(255,255,255,0.92)" />
          </TouchableOpacity>

          {esFondoNoche && !cieloTapado && <CieloNoche bgColor={bgActual} />}
          {esCumpleaños && <Globos />}

          <CameraAutoCaptura visible={mostrarCamara || modoVision} facing={camaraFacing} silencioso={camaraSilenciosa} modoVision={modoVision} capturaVisionRef={capturaVisionFnRef} onCaptura={onFotoCapturada} onCancelar={onFotoCancelada} />
          <CamaraPresenciaVisionOverlay activo={modoWatchingPresencia} onPresenciaDetectada={onPresenciaDetectadaConLed} />

          {fotoTelegram && (
            <Modal transparent animationType="fade" statusBarTranslucent>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setFotoTelegram(null)}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{
                  transform: [{ rotate: '-3deg' }],
                  backgroundColor: '#fff',
                  padding: 12,
                  paddingBottom: 48,
                  borderRadius: 4,
                  shadowColor: '#000',
                  shadowOpacity: 0.5,
                  shadowRadius: 20,
                  elevation: 20,
                  width: '88%',
                }}>
                  <Animated.Image
                    source={{ uri: fotoTelegram.url }}
                    style={{ width: '100%', aspectRatio: 1, resizeMode: 'cover', borderRadius: 2 }}
                  />
                  {!!fotoTelegram.descripcion && (
                    <Text style={{ marginTop: 10, fontSize: fs(13), color: '#555', textAlign: 'center', fontWeight: '500' }}>
                      {fotoTelegram.descripcion}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </Modal>
          )}

          <OvaloRosita
            faceScale={!isTablet && layoutMode === 'vertical' ? faceScale * 0.85 : faceScale}
            screenW={screenW}
            faceBottom={faceBottom}
            esNoche={esFondoNoche}
          />
          <View
            style={[
              styles.ojoContenedor,
              {
                marginTop: (() => {
                  const shiftUp = isTablet ? Math.round(screenH * 0.04) : Math.round(screenH * 0.10);
                  return isTablet
                    ? Math.max(0, Math.round(screenH * 0.06) - shiftUp + 120)
                    : Math.max(0, 180 - shiftUp);
                })()
              },
            ]}
            {...panCaricia.panHandlers}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              setFaceBottom(y + height);
            }}
          >
            <ExpresionOverlay
              capa="fondo"
              expresion={expresion}
              musicaActiva={musicaActiva}
              temperatura={climaObj?.temperatura}
              condicion={climaObj?.descripcion}
              modoNoche={modoNoche}
              esFondoNoche={esFondoNoche}
              faceScale={faceScale}
            />
            <RosaOjos
              estado={estado}
              expresion={expresion}
              modoNoche={modoNoche}
              bgColor={bgActual}
              silbando={silbando}
              noMolestar={noMolestar}
              onOjoPicado={onOjoPicado}
              scale={!isTablet && layoutMode === 'vertical' ? faceScale * 0.85 : faceScale}
              amaneciendo={amaneciendo}
              mouthOffsetY={layoutMode === 'vertical' ? 5 : 0}
              zipperOffsetY={layoutMode === 'vertical' ? -40 : 0}
            />
            <ExpresionOverlay
              capa="frente"
              expresion={expresion}
              musicaActiva={musicaActiva}
              temperatura={climaObj?.temperatura}
              condicion={climaObj?.descripcion}
              modoNoche={modoNoche}
              silbando={silbando}
              onRelampago={onRelampago}
              esCumpleaños={esCumpleaños}
              browOffsetY={isTablet && layoutMode === 'vertical' ? -30 : modoNoche === 'durmiendo' ? 40 : 45}
              browOffsetX={0}
              browScale={isTablet && layoutMode === 'vertical' ? 1.0 : 0.85}
              browGap={isTablet && layoutMode === 'vertical' ? 0 : -12}
              faceScale={faceScale}
              noMolestar={noMolestar}
            />
          </View>
          {modoNoche === 'durmiendo' && <ZZZ />}


          <View style={[
            styles.ecualizadorWrap,
            { height: displayH, marginTop: Math.round(screenH * 0.05) - (isTablet && layoutMode === 'vertical' ? 120 : 0) },
          ]}>
            {listas.length > 0
              ? (() => {
                const PEEK   = 10;
                const nExtra = Math.min(listas.length - 1, 2);
                // Las cartas de atrás asoman por ARRIBA: están en top=0
                // La carta frontal empieza nExtra*PEEK px más abajo y llega hasta el fondo.
                // Así overflow:hidden del contenedor no corta nada.
                return (
                  <TouchableOpacity onPress={() => setMostrarListas(true)} activeOpacity={0.85} style={styles.displayInlineWrap}>
                    <View style={styles.previewDisplayFrame}>
                      {listas.slice(0, 3).map((lista, i) => {
                        const c = POSTIT_COLORES[i % POSTIT_COLORES.length];
                        // i=0: carta frontal → top = nExtra*PEEK, bottom = 0, zIndex más alto
                        // i=1: carta trasera → top = (nExtra-1)*PEEK, bottom = 0, zIndex menor
                        // i=2: carta más atrás → top = 0, bottom = 0, zIndex el más bajo
                        const topOffset = (nExtra - i) * PEEK;
                        return (
                          <View
                            key={lista.id}
                            style={[styles.postItPreviewCard, {
                              position: 'absolute',
                              top:    topOffset,
                              left:   i === 0 ? 0 : (i === 1 ? 2 : 4),
                              right:  i === 0 ? 0 : (i === 1 ? 2 : 4),
                              bottom: 0,
                              zIndex: listas.length - i,
                              backgroundColor: c.bg,
                              transform: i === 0 ? [] : [
                                { rotate: i % 2 === 0 ? '-2.5deg' : '2.5deg' },
                              ],
                            }]}
                          >
                            <View style={[styles.postItLinea, { backgroundColor: c.tape }]} />
                            {i === 0 && (
                              <View style={styles.postItPreviewBody}>
                                <Text style={[styles.postItTituloPreview, { color: c.text }]} numberOfLines={2}>
                                  {lista.nombre}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </TouchableOpacity>
                );
              })()

              : (
                /* ── Display glass ── */
                (() => {
                  const climaEfectivo = climaObj ?? undefined;
                  const musicaEfectiva = musicaActiva;
                  const codigoActual   = climaEfectivo?.codigoActual ?? 0;
                  const tempEfectiva   = climaEfectivo?.temperatura;
                  const tieneCodAlerta = codigoActual > 0 && CODIGOS_ADVERSOS.has(codigoActual);
                  const tieneCalor     = (tempEfectiva ?? -1) >= 35;
                  const tieneFrio      = (tempEfectiva ?? 999) <= 3;
                  const dotHasAlert    = tieneCodAlerta || tieneCalor || tieneFrio;
                  const dotCount =
                    1 +
                    (musicaEfectiva ? 1 : 0) +
                    (tempEfectiva != null ? 1 : 0) +
                    (dotHasAlert ? 1 : 0);
                  const alertaTexto = tieneCalor
                    ? 'Calor extremo'
                    : tieneFrio
                      ? 'Frío extremo'
                      : (climaEfectivo?.descripcion || 'Alerta meteorológica');
                  const subFont = Math.max(12, Math.round(displayFontInfo * 0.38));
                  const radioScreenIdx = musicaEfectiva ? 1 : -1;
                  const tempScreenIdx = 1 + (musicaEfectiva ? 1 : 0);
                  const alertScreenIdx = tempScreenIdx + (climaEfectivo?.temperatura != null ? 1 : 0);
                  return (
                    <View style={{
                      width: '61%', height: '100%', borderRadius: 18, overflow: 'hidden',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
                      backgroundColor: 'rgba(0,0,0,0.10)',
                    }}>
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}>
                        {modoNoche !== 'despierta'
                          ? <RelojNoche fontSize={displayFontReloj} />
                          : <Animated.View style={{ opacity: hintOpacity, transform: [{ translateY: hintTranslate }, { scale: hintScale }], width: '100%', alignItems: 'center' }}>
                            {/* Pantalla 0: Hora */}
                            {infoIdx === 0 && (
                              <View style={{ alignItems: 'center' }}>
                                <Text style={[styles.infoText, { fontSize: displayFontInfo }]}>{horaMinuto}</Text>
                                <Text style={{ fontSize: subFont, color: '#ffffff', marginTop: 3, textTransform: 'capitalize', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }} numberOfLines={1}>
                                  {fechaDisplay}
                                </Text>
                              </View>
                            )}
                            {/* Pantalla 1: Radio */}
                            {musicaEfectiva && infoIdx === radioScreenIdx && (
                              <View style={{ alignItems: 'center', width: '100%' }}>
                                <AnimacionMusica />
                                <Text style={{ fontSize: subFont, color: '#ffffff', fontWeight: 'bold', marginTop: 6, textAlign: 'center', paddingHorizontal: 8 }} numberOfLines={1}>
                                  {nombreRadioOGenero(ultimaRadioRef.current ?? 'FM Cristal 98.9')}
                                </Text>
                              </View>
                            )}
                            {/* Pantalla 1: Temperatura */}
                            {infoIdx === tempScreenIdx && climaEfectivo?.temperatura != null && (
                              <View style={{ alignItems: 'center' }}>
                                <Text style={[styles.infoText, { fontSize: displayFontInfo }]}>{`${Math.round(climaEfectivo?.temperatura ?? 0)}°`}</Text>
                                <Text style={{ fontSize: subFont, color: '#ffffff', marginTop: 3, textTransform: 'capitalize', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }} numberOfLines={1}>
                                  {climaEfectivo?.descripcion}
                                </Text>
                              </View>
                            )}
                            {/* Pantalla 2: Alerta */}
                            {dotHasAlert && infoIdx === alertScreenIdx && (
                              <View style={{ alignItems: 'center', paddingHorizontal: 10 }}>
                                <Text style={{ fontSize: Math.round(displayFontInfo * 0.32), fontWeight: '700', color: '#fbbf24', marginBottom: 3, letterSpacing: 0.5 }}>
                                  ALERTA
                                </Text>
                                <Text style={{ fontSize: subFont, color: '#ffffff', textAlign: 'center' }} numberOfLines={2}>
                                  {alertaTexto}
                                </Text>
                              </View>
                            )}
                          </Animated.View>
                        }
                        {/* Indicador de presencia — esquina superior derecha del display */}
                        {deteccionPresenciaActiva && (
                          <View style={{
                            position: 'absolute', top: 7, right: 8,
                            width: 20, height: 20, borderRadius: 10,
                            backgroundColor: 'rgba(0,0,0,0.22)',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Ionicons
                              name={presenciaVista ? 'person' : modoWatchingPresencia ? 'eye' : 'eye-outline'}
                              size={11}
                              color={presenciaVista ? '#22c55e' : modoWatchingPresencia ? '#ef4444' : 'rgba(255,255,255,0.65)'}
                            />
                          </View>
                        )}

                        {/* Indicador recordatorios — amarillo cuando hay timers/recordatorios */}
                        {hayRecordatorios && (
                          <View style={{
                            position: 'absolute', top: 7, right: 60,
                            width: 20, height: 20, borderRadius: 10,
                            backgroundColor: 'rgba(0,0,0,0.22)',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Ionicons name="alarm" size={11} color="#facc15" />
                          </View>
                        )}

                        {/* Indicador BLE — a la izquierda del indicador de presencia */}
                        <View style={{
                          position: 'absolute', top: 7, right: 34,
                          width: 20, height: 20, borderRadius: 10,
                          backgroundColor: 'rgba(0,0,0,0.22)',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ionicons
                            name={bleConectado ? 'bluetooth' : 'bluetooth-outline'}
                            size={11}
                            color={bleConectado ? '#3b82f6' : 'rgba(255,255,255,0.35)'}
                          />
                        </View>

                        {/* Pagination dots del carrusel */}
                        {modoNoche === 'despierta' && (
                          <View style={{ flexDirection: 'row', gap: 4, position: 'absolute', bottom: 8 }}>
                            {dotCount > 1 && Array.from({ length: dotCount }).map((_, i) => (
                              <View key={i} style={{
                                height: 4,
                                width: infoIdx === i ? 14 : 4,
                                borderRadius: 2,
                                backgroundColor: infoIdx === i ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)',
                              }} />
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })()
              )
            }
          </View>

          <TouchableOpacity
            onLongPress={triggerCumpleaños}
            style={{ position: 'absolute', bottom: safeBottom + 50, right: 0, width: 70, height: 70 }}
          />

          {/* ── Zona de botones ── */}
          <View style={[styles.botonesZona, isTablet && styles.botonesZonaTablet]}>

            {/* Fila principal — Badge estado */}
            <View style={[styles.botonesFilaPrincipal, isTablet && { gap: 20 }]}>

              {/* Badge de estado */}
              <TouchableOpacity
                onPress={acciones.toggleTalkOrStopMusic}
                activeOpacity={musicaActiva ? 0.75 : 0.9}
                style={[styles.estadoBadgeWrap, {
                  width: btnW, height: btnH, borderRadius: btnH / 2,
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.38)',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.18, shadowRadius: 8, elevation: 4,
                  overflow: 'hidden',
                }]}
              >
                <LinearGradient colors={badgeGradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                  style={[StyleSheet.absoluteFill, { opacity: isEsperando ? 0.50 : 0.88 }]} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
                {isEsperando && (
                  <Animated.View style={[StyleSheet.absoluteFill, { opacity: badgePulso }]}>
                    <LinearGradient colors={['#fde68a', '#f59e0b']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                      style={StyleSheet.absoluteFill} />
                  </Animated.View>
                )}
                <View style={styles.estadoBadgeGradient}>
                  <Text style={[styles.estadoBadgeTexto, { color: badgeColor, fontSize: btnFont }]}>
                    {badgeLabel}
                  </Text>
                </View>
              </TouchableOpacity>

            </View>

            {/* Botón SOS */}
            {(() => {
              const hayFamiliaTelegram = (refs.perfilRef.current?.telegramContactos?.length ?? 0) > 0;
              return (
                <View style={{ alignItems: 'center', opacity: hayFamiliaTelegram ? 1 : 0.35 }}>
                  <TouchableOpacity
                    style={[styles.botonSOSWrap, {
                      width: btnW, height: btnH, borderRadius: btnH / 2,
                      borderWidth: 1, borderColor: sosPresionando ? 'rgba(255,100,100,0.60)' : 'rgba(255,255,255,0.38)',
                      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.18, shadowRadius: 8, elevation: 4,
                      overflow: 'hidden',
                    }]}
                    onPress={hayFamiliaTelegram ? mostrarHintSOS : undefined}
                    onPressIn={hayFamiliaTelegram ? sosPresionado : undefined}
                    onPressOut={hayFamiliaTelegram ? sosSoltado : undefined}
                    onLongPress={hayFamiliaTelegram ? async () => { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); dispararSOS(); } : undefined}
                    delayLongPress={2000}
                    activeOpacity={hayFamiliaTelegram ? 1 : 1}
                  >
                    <LinearGradient colors={sosGradientOff} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                      style={[StyleSheet.absoluteFill, { opacity: 0.88 }]} />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.10)' }]} />
                    <Animated.View style={[StyleSheet.absoluteFill, { opacity: sosBrillo }]}>
                      <LinearGradient colors={sosGradientOn} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                        style={StyleSheet.absoluteFill} />
                    </Animated.View>
                    <View style={styles.estadoBadgeGradient}>
                      <Text style={[styles.botonSOSTexto, { fontSize: isTablet ? sosFontTablet : Math.round(btnFont * 1.2), fontWeight: sosPresionando ? '400' : '700', marginBottom: sosPresionando ? 3 : 0 }]}>
                        {sosPresionando ? 'Espera...' : 'SOS'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })()}

          </View>

          {mostrarOnboarding && (
            <TouchableOpacity
              style={styles.onboardingOverlay}
              onPress={() => setMostrarOnboarding(false)}
              activeOpacity={1}
            >
              <TouchableOpacity activeOpacity={1} onPress={() => { }} style={styles.onboardingCard}>
                <View style={styles.onboardingHeader}>
                  <View style={styles.onboardingAvatarRing}>
                    <View style={styles.onboardingAvatar}>
                      <Ionicons name="heart" size={28} color="#0097b2" />
                    </View>
                  </View>
                  <View style={styles.onboardingHeaderTexts}>
                    <Text style={styles.onboardingEyebrow}>{vozGenero === 'masculina' ? 'Tu nuevo compañero' : 'Tu nueva compañera'}</Text>
                    <Text style={styles.onboardingTitulo}>{nombreAsistente}</Text>
                  </View>
                </View>

                <View style={styles.onboardingGrid}>
                  {[
                    { icono: 'musical-notes', texto: 'Música', color: '#7C5200', bg: '#FFE0A0' },
                    { icono: 'medkit', texto: 'Medicamentos', color: '#004785', bg: '#D3E4FF' },
                    { icono: 'partly-sunny', texto: 'Clima', color: '#1B5E28', bg: '#C8EFCE' },
                    { icono: 'people', texto: 'Familia', color: '#5B0073', bg: '#EDD9FF' },
                    { icono: 'timer', texto: 'Timers', color: '#7D2D00', bg: '#FFDCC8' },
                    { icono: 'chatbubble', texto: 'Charlar', color: '#004785', bg: '#cef5ff' },
                  ].map(({ icono, texto, color, bg }) => (
                    <View key={texto} style={[styles.onboardingChip, { backgroundColor: bg }]}>
                      <Ionicons name={icono as any} size={18} color={color} />
                      <Text style={[styles.onboardingChipText, { color }]}>{texto}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.onboardingCTA}>
                  <TouchableOpacity
                    style={styles.onboardingCTABtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      setMostrarOnboarding(false);
                      if (!refs.perfilRef.current?.nombreAbuela) {
                        router.push('/onboarding' as any);
                      }
                    }}
                  >
                    <Text style={styles.onboardingCTAText}>
                      {refs.perfilRef.current?.nombreAbuela ? 'Empezar' : 'Configurar'}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onLongPress={() => silbando ? detenerSilbido() : iniciarSilbido()}
            style={{ position: 'absolute', bottom: safeBottom + 50, left: 0, width: 70, height: 70 }}
          />


          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: flashAnim }]}
          />

          <Modal visible={hintSOS} transparent animationType="fade" onRequestClose={() => setHintSOS(false)}>
            <TouchableOpacity style={styles.sosModalOverlay} activeOpacity={1} onPress={() => setHintSOS(false)}>
              <View style={[styles.sosModalCard, isTablet && { paddingVertical: 52, paddingHorizontal: 57, borderRadius: 36, gap: 21 }]}>
                <Ionicons name="alert-circle" size={isTablet ? 110 : 88} color="#fff" />
                <Text style={[styles.sosModalTitulo, isTablet && { fontSize: fs(32) * 1.3 }]}>Botón SOS</Text>
                <Text style={[styles.sosModalTexto, isTablet && { fontSize: fs(22) * 1.3, lineHeight: fs(32) * 1.3 }]}>
                  Mantené presionado{'\n'}2 segundos para avisar{'\n'}a tu familia
                </Text>
              </View>
            </TouchableOpacity>
          </Modal>

        </LinearGradient>
      </Pressable>

      <PostItViewer
        visible={mostrarListas}
        listas={listas}
        onBorrar={(nombre) => { borrarListaVoz(nombre); }}
        onClose={() => setMostrarListas(false)}
        cardStyle={layoutMode === 'vertical' ? styles.postItCardExpanded : undefined}
        expandedWidth={layoutMode === 'vertical' ? screenW * 0.9 : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly' },
  updateId: { position: 'absolute', bottom: 6, right: 10, fontSize: 10, color: '#ffffffcc' },
  ojoContenedor: { flexDirection: 'row', alignItems: 'flex-end', overflow: 'visible', marginTop: 120 },
  ecualizadorWrap: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  displayInlineWrap: {
    width: '61%',
    height: '100%',
    borderRadius: 18,
    overflow: 'visible',
  },
  previewDisplayFrame: {
    flex: 1,
  },
  infoText: {
    fontSize: fs(26),
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  relojNoche: {
    fontSize: fs(51),
    color: '#ffffff',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  botonesZona: { alignItems: 'center', gap: 12 },
  botonesZonaTablet: { alignItems: 'center', gap: 16 },
  botonesFilaPrincipal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  botonesWrap: { alignItems: 'center', justifyContent: 'center', height: 90 },
  botonContenedor: { alignItems: 'center', justifyContent: 'center' },
  postIt: { borderRadius: 6, width: 280, height: 80, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 2, height: 4 }, shadowOpacity: 0.22, shadowRadius: 6, elevation: 5 },
  postItPreviewCard: {
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
  },
  postItLinea: { height: 5, width: '100%' },
  postItTitulo: { fontSize: fs(28), fontWeight: '800', textTransform: 'capitalize' },
  postItPreviewBody: { flex: 1, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  postItTituloPreview: { fontSize: fs(21), fontWeight: '800', textTransform: 'capitalize', lineHeight: fs(24), textAlign: 'center' },
  postItCardExpanded: {
    aspectRatio: 0.72,
    height: undefined,
    maxHeight: '82%',
  },
  btnGlow: { position: 'absolute' },
  btnShadow: { shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 18, elevation: 10 },
  boton: { backgroundColor: '#FAFAFA', alignItems: 'center', justifyContent: 'center' },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, overflow: 'hidden' },
  statusDot: { width: 13, height: 13, borderRadius: 7 },
  botonTexto: { fontSize: fs(18), fontWeight: '600', color: '#374151' },
  botonDeshabilitado: { opacity: 0.55 },
  estadoBadgeWrap: {},
  estadoBadgeGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  estadoBadgeShine: { position: 'absolute', top: 4, left: '12%', width: '76%', height: '42%', borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.28)' },
  estadoBadgeTexto: { fontWeight: '600' },
  botonSOSWrap: {},
  botonSOSTexto: { fontSize: fs(18), fontWeight: '700', color: '#fff' },
  botonSOSHint: { fontSize: fs(11), color: '#ffffff99' },
  sosModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  sosModalCard: { backgroundColor: '#CC2222', borderRadius: 36, paddingVertical: 56, paddingHorizontal: 60, alignItems: 'center', gap: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 20, width: '85%' },
  sosModalTitulo: { fontSize: fs(42), fontWeight: '800', color: '#fff' },
  sosModalTexto: { fontSize: fs(30), fontWeight: '500', color: '#ffffffdd', textAlign: 'center', lineHeight: fs(42) },

  musicaOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent', zIndex: 50 },
  onboardingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 28 },
  onboardingCard: { backgroundColor: '#f9fafb', borderRadius: 28, width: '100%', maxWidth: 340, overflow: 'hidden', elevation: 6, shadowColor: '#0097b2', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 20 },
  onboardingHeader: { backgroundColor: '#0097b2', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 28, flexDirection: 'row', alignItems: 'center', gap: 16 },
  onboardingAvatarRing: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' },
  onboardingAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  onboardingHeaderTexts: { flex: 1 },
  onboardingEyebrow: { fontSize: 11, fontWeight: '500', color: '#ffffffaa', textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 2 },
  onboardingTitulo: { fontSize: 34, fontWeight: '300', color: '#ffffff', letterSpacing: -0.5, lineHeight: 38 },
  onboardingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 20 },
  onboardingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100, minWidth: '44%', flex: 1 },
  onboardingChipText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  onboardingCTA: { paddingHorizontal: 20, paddingBottom: 24 },
  onboardingCTABtn: { backgroundColor: '#0097b2', borderRadius: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  onboardingCTAText: { fontSize: 15, fontWeight: '600', color: '#ffffff', letterSpacing: 0.1 },
});
