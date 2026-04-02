import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Animated, Modal, PanResponder, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useFonts, Poppins_700Bold } from '@expo-google-fonts/poppins';

// Escala fuentes respetando la accesibilidad del sistema (hasta 1.3x)
function fs(size: number) { return size * Math.min(PixelRatio.getFontScale(), 1.3); }
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRosita } from '../hooks/useRosita';
import { useNotificaciones } from '../hooks/useNotificaciones';
import { useAccionesRosita } from '../hooks/useAccionesRosita';
import { useBLEBeacon } from '../hooks/useBLEBeacon';
import RositaHorizontalLayout from '../components/RositaHorizontalLayout';
import RosaOjos, { BG } from '../components/RosaOjos';
import MenuFlotante from '../components/MenuFlotante';
import ExpresionOverlay from '../components/ExpresionOverlay';
import { AnimacionMusica, ZZZ, CieloNoche, WaveformDetectando } from '../components/FondoAnimado';
import { Globos } from '../components/EfectosExpresion';
import CameraAutoCaptura from '../components/CameraAutoCaptura';
import PostItViewer, { POSTIT_COLORES } from '../components/PostItViewer';

function RelojNoche() {
  const [fontsLoaded] = useFonts({ Poppins_700Bold });
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
    }, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 0.15, duration: 500, useNativeDriver: true }),
        Animated.timing(latido, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const fontFamily = fontsLoaded ? 'Poppins_700Bold' : undefined;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[styles.relojNoche, { fontFamily }]}>{tiempo.hh}</Text>
      <Animated.Text style={[styles.relojNoche, { fontFamily, opacity: latido, marginHorizontal: 2 }]}>:</Animated.Text>
      <Text style={[styles.relojNoche, { fontFamily }]}>{tiempo.mm}</Text>
    </View>
  );
}

export default function Index() {
  const router = useRouter();
  const {
    estado, expresion, cargando, mostrarOnboarding, setMostrarOnboarding,
    musicaActiva, silbando, noMolestar, setNoMolestar,
    linternaActiva, apagarLinterna,
    modoNoche, horaActual, climaObj, ciudadDetectada, flashAnim,
    iniciarEscucha, detenerEscucha, pararMusica, reanudarMusica, dispararSOS,
    onOjoPicado, onCaricia, onRelampago, iniciarSilbido, detenerSilbido, reactivar, recargarPerfil,
    mostrarCamara, camaraFacing, camaraSilenciosa, onFotoCapturada, onFotoCancelada,
    refs, player,
    listas, borrarListaVoz,
    detectandoSonido,
  } = useRosita();


  const panCaricia = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dy) < 40,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 40) onCaricia(); },
  })).current;

  // Al volver del onboarding con perfil ya guardado, arrancar normalmente.
  // Al salir (onboarding, configuración, etc.) detener SR para que no escuche
  // en segundo plano mientras el tab sigue montado.
  useFocusEffect(useCallback(() => {
    if (cargando) reactivar();
    else recargarPerfil();
    return () => { ExpoSpeechRecognitionModule.stop(); };
  }, [cargando]));

  // ── Foto recibida por Telegram ───────────────────────────────────────────────
  const [fotoTelegram, setFotoTelegram] = React.useState<{ url: string; descripcion: string } | null>(null);
  const [modoRelojHorizontal, setModoRelojHorizontal] = useState(false);
  const fotoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup del timer al desmontar
  useEffect(() => () => { if (fotoTimerRef.current) clearTimeout(fotoTimerRef.current); }, []);

  function mostrarFoto(urlFoto: string, descripcion: string) {
    if (fotoTimerRef.current) clearTimeout(fotoTimerRef.current);
    setFotoTelegram({ url: urlFoto, descripcion });
    fotoTimerRef.current = setTimeout(() => setFotoTelegram(null), 30000);
  }

  // Conectar hook de notificaciones pasándole todos los refs del hook principal
  const { chequearPendientesAlActivar, esCumpleaños, triggerCumpleaños } = useNotificaciones({ ...refs, pararMusica, reanudarMusica, iniciarSilbido, detenerSilbido, mostrarFoto }, player);


  // ── Cálculo del fondo y Degradados ──────────────────────────────────────────
  const hora           = horaActual;
  const esAtardecerBg  = hora >= 17 && hora < 20;
  const esAmanecer     = hora >= 5  && hora < 8;
  const esFondoNoche   = hora >= 20 || hora < 5;
  const esBotonesNoche = esFondoNoche; // sincronizado con el estado de noche del perfil
  const esClimaOscuro  = !!climaObj?.descripcion?.toLowerCase().match(/lluvia|lloviendo|llovizna|tormenta|granizo|chaparrón|nevada/);

  // Tu color base original
  const bgActual    = esFondoNoche ? BG : esClimaOscuro ? '#6B7280' : esAmanecer ? '#87CEEB' : esAtardecerBg ? '#FFBD59' : '#38B6FF';
  // Párpados de piel normal si el cielo ya aclaró pero Rosita aún duerme (ej: 5-9h)
  const amaneciendo = !esFondoNoche && modoNoche === 'durmiendo';

  // Degradados para el cielo
  const degradadoCielo: readonly [string, string, string] | readonly [string, string, string, string] = esFondoNoche
    ? ['#000000', '#050A30', bgActual] // Negro arriba -> Azul Profundo abajo -> BG
    : esClimaOscuro
    ? ['#374151', '#4B5563', bgActual]
    : esAmanecer
    ? ['#87CEEB', '#FF8C00', '#CC2200'] // celeste arriba → naranja → rojo abajo
    : esAtardecerBg
    ? ['#2B1055', '#FF416C', '#FF4B2B', bgActual] // 4 colores: Violeta -> Rosa → Naranja -> Fondo
    : ['#0052D4', '#4364F7', bgActual];

  const desc        = climaObj?.descripcion?.toLowerCase() ?? '';
  const cieloTapado = /\bnublado\b/.test(desc) && !/parcial|algunas nubes/.test(desc)
    || /nuboso|cubierto|lluvia|lloviendo|llovizna|tormenta|nevada|nieve|granizo|niebla|chaparrón/.test(desc);

  // ── Hora + Temperatura alternando en modo espera ─────────────────────────────
  const fmtHoraMinuto = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const [horaMinuto, setHoraMinuto] = useState(fmtHoraMinuto);
  const [infoIdx, setInfoIdx]       = useState(0); // 0 = hora, 1 = temperatura

  useEffect(() => {
    const id = setInterval(() => setHoraMinuto(fmtHoraMinuto()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hintOpacity    = useRef(new Animated.Value(0)).current;
  const hintTranslate  = useRef(new Animated.Value(30)).current;
  const hintActiveRef  = useRef(false);
  const hintAnimRef    = useRef<Animated.CompositeAnimation | null>(null);
  const hintAnimSeqRef = useRef(0);

  useEffect(() => {
    hintAnimSeqRef.current += 1;
    hintAnimRef.current?.stop();
    if (estado !== 'esperando' || musicaActiva) {
      hintActiveRef.current = false;
      hintAnimRef.current = Animated.timing(hintOpacity, { toValue: 0, duration: 300, useNativeDriver: true });
      hintAnimRef.current.start();
      return;
    }
    hintActiveRef.current = true;
    hintTranslate.setValue(30);
    const seq = hintAnimSeqRef.current;
    hintAnimRef.current = Animated.parallel([
      Animated.timing(hintOpacity,   { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(hintTranslate, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]);
    hintAnimRef.current.start();
    const id = setInterval(() => {
      if (!hintActiveRef.current || hintAnimSeqRef.current !== seq) return;
      hintAnimRef.current?.stop();
      hintAnimRef.current = Animated.parallel([
        Animated.timing(hintOpacity,   { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(hintTranslate, { toValue: -30, duration: 400, useNativeDriver: true }),
      ]);
      hintAnimRef.current.start(({ finished }) => {
        if (!finished || !hintActiveRef.current || hintAnimSeqRef.current !== seq) return;
        setInfoIdx(prev => (prev + 1) % 2);
        hintTranslate.setValue(30);
        hintAnimRef.current?.stop();
        hintAnimRef.current = Animated.parallel([
          Animated.timing(hintOpacity,   { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(hintTranslate, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]);
        hintAnimRef.current.start();
      });
    }, 4500);
    return () => {
      hintActiveRef.current = false;
      clearInterval(id);
      hintAnimRef.current?.stop();
    };
  }, [estado, musicaActiva]);

  // ── Modal hint SOS ──────────────────────────────────────────────────────────
  const [hintSOS, setHintSOS] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mostrarHintSOS() {
    setHintSOS(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHintSOS(false), 3500);
  }

  // ── Animación del botón SOS ─────────────────────────────────────────────────
  const [sosPresionando, setSosPresionando] = useState(false);
  const [mostrarListas,  setMostrarListas]  = useState(false);
  const sosPulso   = useRef(new Animated.Value(1)).current;   
  const sosProgreso = useRef(new Animated.Value(0)).current;  
  const sosPulsoRef    = useRef<Animated.CompositeAnimation | null>(null);
  const sosProgresoRef  = useRef<Animated.CompositeAnimation | null>(null);
  const dotPulseAnim   = useRef<Animated.CompositeAnimation | null>(null);

  function sosPresionado() {
    setSosPresionando(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    sosPulsoRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulso, { toValue: 1.22, duration: 280, useNativeDriver: true }),
        Animated.timing(sosPulso, { toValue: 1,    duration: 280, useNativeDriver: true }),
      ])
    );
    sosPulsoRef.current.start();

    sosProgresoRef.current = Animated.timing(sosProgreso, {
      toValue: 1, duration: 2000, useNativeDriver: false,
    });
    sosProgresoRef.current.start();
  }

  function sosSoltado() {
    setSosPresionando(false);
    sosPulsoRef.current?.stop();
    sosPulso.setValue(1);
    sosProgresoRef.current?.stop();
    Animated.timing(sosProgreso, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  }

  // ── Animación del botón (dot pulsante + glow respirando) ────────────────────
  const escuchando    = estado === 'escuchando';
  const botonDisabled = estado === 'pensando' || estado === 'hablando' || noMolestar;
  const pulso       = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.30)).current;
  const detectRing  = useRef(new Animated.Value(0)).current;
  const detectScale = useRef(new Animated.Value(1)).current;
  const detectScaleLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Feedback visual cuando el SR detecta sonido: ring + pulso de escala en el botón
  useEffect(() => {
    const activo = detectandoSonido && estado === 'esperando' && !noMolestar;
    Animated.timing(detectRing, {
      toValue: activo ? 1 : 0,
      duration: activo ? 80 : 500,
      useNativeDriver: true,
    }).start();
    if (activo) {
      detectScaleLoopRef.current?.stop();
      detectScaleLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(detectScale, { toValue: 1.03, duration: 200, useNativeDriver: true }),
          Animated.timing(detectScale, { toValue: 1.0,  duration: 200, useNativeDriver: true }),
        ])
      );
      detectScaleLoopRef.current.start();
    } else {
      detectScaleLoopRef.current?.stop();
      detectScale.stopAnimation();
      detectScale.setValue(1);
    }
    return () => {
      detectScaleLoopRef.current?.stop();
    };
  }, [detectandoSonido, estado, noMolestar]);

  useEffect(() => {
    dotPulseAnim.current?.stop();
    pulso.setValue(1);
    const speed = (estado === 'hablando' || estado === 'escuchando') ? 450 : 1800;
    dotPulseAnim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1.5, duration: speed, useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 1,   duration: speed, useNativeDriver: true }),
      ])
    );
    dotPulseAnim.current.start();
    return () => {
      dotPulseAnim.current?.stop();
      dotPulseAnim.current = null;
    };
  }, [estado, musicaActiva]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, { toValue: 0.55, duration: 1750, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0.20, duration: 1750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ── Nombre del asistente para el onboarding ─────────────────────────────────
  const nombreAsistente = refs.perfilRef.current?.nombreAsistente ?? 'Rosita';
  const vozGenero       = refs.perfilRef.current?.vozGenero ?? 'femenina';

  // ── Auto-navegar al onboarding en primer uso ─────────────────────────────────
  useEffect(() => {
    if (mostrarOnboarding && !refs.perfilRef.current?.nombreAbuela) {
      setMostrarOnboarding(false);
      router.replace('/onboarding' as any);
    }
  }, [mostrarOnboarding]);

  const { width: screenW, height: screenH } = useWindowDimensions();
  const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets();
  const layoutMode = screenW > screenH ? 'horizontal' : 'vertical';
  const isTablet  = screenW >= 600;
  const faceScale = isTablet ? Math.min(screenW / 390, 1.35) : 1;
  const textScale = faceScale; 
  const btnW      = isTablet ? Math.round(Math.min(200 * faceScale, 380)) : 200;
  const btnH      = isTablet ? Math.round(64 * textScale) : 64;
  const icoBtn    = Math.round(btnH * 0.46);
  const icoSOS    = Math.round(btnH * 0.50);
  const icoNM     = isTablet ? 28 : 18;
  const btnFont   = isTablet ? fs(26) : fs(18);
  const sosFontTablet = fs(43);
  const nmFont    = isTablet ? fs(24) : fs(13);
  const tabletPadV = isTablet ? Math.round(screenH * 0.08) : 0;

  // ── Color del dot / borde / glow según estado ───────────────────────────────
  const btnDotColor = musicaActiva            ? '#E8392A'
    : estado === 'escuchando' ? '#E85D24'
    : estado === 'pensando'   ? '#3b82f6'
    : estado === 'hablando'   ? '#22c55e'
    : '#ef4444';
  const btnGradient: [string, string] = musicaActiva            ? ['#fca5a5', '#E8392A']
    : estado === 'escuchando' ? ['#fdba74', '#E85D24']
    : estado === 'pensando'   ? ['#93c5fd', '#3b82f6']
    : estado === 'hablando'   ? ['#86efac', '#22c55e']
    : ['#fca5a5', '#ef4444'];
  const btnLabel = musicaActiva            ? 'Parar'
    : estado === 'escuchando' ? 'Escuchando'
    : estado === 'pensando'   ? 'Pensando...'
    : estado === 'hablando'   ? 'Hablando'
    : 'Hablar';

  // ── Acciones canónicas (touch vertical y BLE horizontal llaman a lo mismo) ───
  const acciones = useAccionesRosita({
    estado, musicaActiva, noMolestar,
    iniciarEscucha, detenerEscucha, pararMusica, dispararSOS,
    setNoMolestar,
    iniciarSpeechRecognition: refs.iniciarSpeechRecognition,
    detenerSilbido,
    chequearPendientesAlActivar,
  });

  // ── BLE Beacon — solo activo en modo horizontal ──────────────────────────────
  useBLEBeacon({
    acciones,
    modoHorizontal: layoutMode === 'horizontal',
    onCaida: () => {
      // Caída detectada: alerta inmediata por Telegram + voz
      dispararSOS();
    },
  });

  if (cargando && Platform.OS !== 'web') return <View style={{ flex: 1, backgroundColor: '#fff' }} />;

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
        />
        <PostItViewer
          visible={mostrarListas}
          listas={listas}
          onBorrar={(nombre) => { borrarListaVoz(nombre); }}
          onClose={() => setMostrarListas(false)}
        />
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
      <MenuFlotante oscuro />

      {esFondoNoche && !cieloTapado && <CieloNoche bgColor={bgActual} />}
      {esCumpleaños && <Globos />}
      <CameraAutoCaptura visible={mostrarCamara} facing={camaraFacing} silencioso={camaraSilenciosa} onCaptura={onFotoCapturada} onCancelar={onFotoCancelada} />

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
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      <View
  style={[
    styles.ojoContenedor,
    { marginTop: isTablet ? Math.round(screenH * 0.06) : 180 },
  ]}
  {...panCaricia.panHandlers}
>
        <ExpresionOverlay
          capa="fondo"
          expresion={expresion}
          musicaActiva={musicaActiva}
          temperatura={climaObj?.temperatura}
          condicion={climaObj?.descripcion}
          modoNoche={modoNoche}
        />
        <RosaOjos
          estado={estado}
          expresion={expresion}
          modoNoche={modoNoche}
          bgColor={bgActual}
          silbando={silbando}
          noMolestar={noMolestar}
          onOjoPicado={onOjoPicado}
          scale={faceScale}
          amaneciendo={amaneciendo}
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
        />
      </View>
      {modoNoche === 'durmiendo' && <ZZZ />}

      <View style={[styles.ecualizadorWrap, isTablet && { height: Math.round(90 * textScale) }, listas.length > 0 && { height: 80 + (listas.length - 1) * 20 + 10, overflow: 'visible' }]}>
        {listas.length > 0
          ? (() => {
              const PEEK = 20;
              const POST_H = 80;
              const stackH = POST_H + (listas.length - 1) * PEEK;
              return (
                <TouchableOpacity onPress={() => setMostrarListas(true)} activeOpacity={0.85}>
                  <View style={{ width: 280, height: stackH }}>
                    {[...listas].reverse().map((lista, i) => {
                      const listaIdx = listas.length - 1 - i;
                      const c = POSTIT_COLORES[listaIdx % POSTIT_COLORES.length];
                      return (
                        <View
                          key={lista.id}
                          style={[styles.postIt, {
                            position: 'absolute',
                            top: listaIdx * PEEK,
                            zIndex: i + 1,
                            backgroundColor: c.bg,
                            transform: [{ rotate: listaIdx % 2 === 0 ? '-1.5deg' : '1.2deg' }],
                          }]}
                        >
                          <View style={[styles.postItLinea, { backgroundColor: c.linea }]} />
                          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 18 }}>
                            <Text style={[styles.postItTitulo, { color: c.text }]} numberOfLines={1}>
                              {lista.nombre}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </TouchableOpacity>
              );
            })()

          : musicaActiva
          ? <AnimacionMusica />
          : modoNoche !== 'despierta'
          ? <RelojNoche />
          : <Animated.View style={{ opacity: hintOpacity, transform: [{ translateX: hintTranslate }], width: '100%', alignItems: 'center' }}>
              <Text
                style={[styles.infoText, textScale !== 1 && { fontSize: fs(52) * textScale }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >{
                infoIdx === 1 && climaObj?.temperatura != null
                  ? `${Math.round(climaObj.temperatura)}°`
                  : horaMinuto
              }</Text>
            </Animated.View>
        }
      </View>

      <TouchableOpacity
        onLongPress={triggerCumpleaños}
        style={{ position: 'absolute', bottom: safeBottom + 50, right: 0, width: 70, height: 70 }}
      />

      {/* ── Zona de botones ── */}
      <View style={[styles.botonesZona, isTablet && styles.botonesZonaTablet]}>

        {/* Fila superior: Hablar + SOS */}
        <View style={[styles.botonesFilaPrincipal, isTablet && { flexDirection: 'row', gap: 32 }]}>

          {/* Botón Hablar */}
          <View style={[styles.botonContenedor, { position: 'relative' }]}>
            {!noMolestar && (() => { const gW = btnW + 90; const gH = btnH + 70; return (
              <Animated.View style={[styles.btnGlow, { opacity: glowOpacity, top: -(gH - btnH) / 2, left: -(gW - btnW) / 2 }]}>
                <Svg width={gW} height={gH}>
                  <Defs>
                    <RadialGradient id="btnGlow" cx="50%" cy="50%" r="50%" gradientUnits="objectBoundingBox">
                      <Stop offset="0%"   stopColor={btnDotColor} stopOpacity={0.9} />
                      <Stop offset="40%"  stopColor={btnDotColor} stopOpacity={0.5} />
                      <Stop offset="100%" stopColor={btnDotColor} stopOpacity={0}   />
                    </RadialGradient>
                  </Defs>
                  <Ellipse cx={gW / 2} cy={gH / 2} rx={gW / 2} ry={gH / 2} fill="url(#btnGlow)" />
                </Svg>
              </Animated.View>
            ); })() }
            {/* Ring de detección de voz — pulsa con detectScale */}
            <Animated.View pointerEvents="none" style={{
              position: 'absolute',
              width: btnW + 16, height: btnH + 16,
              borderRadius: (btnH + 16) / 2,
              borderWidth: 2,
              borderColor: btnDotColor,
              top: -8, left: -8,
              opacity: detectRing,
              transform: [{ scale: detectScale }],
            }} />
            <Animated.View style={{ width: btnW, height: btnH, borderRadius: btnH / 2 }}>
              <TouchableOpacity
                style={{ borderRadius: btnH / 2, width: btnW, height: btnH }}
                onPress={musicaActiva ? pararMusica : escuchando ? detenerEscucha : iniciarEscucha}
                activeOpacity={0.85}
                disabled={botonDisabled && !musicaActiva}
              >
                <View style={[styles.boton, { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: btnH / 2 }, esBotonesNoche && { backgroundColor: '#1a1f2e' }, botonDisabled && !musicaActiva && styles.botonDeshabilitado]}>
                  <View style={[styles.btnInner, { width: btnW }]}>
                    {!noMolestar && (
                      <Animated.View style={[styles.statusDot, { position: 'absolute', left: Math.round(btnW * 0.08), backgroundColor: btnDotColor, transform: [{ scale: pulso }], width: Math.round(13 * (isTablet ? faceScale : 1)), height: Math.round(13 * (isTablet ? faceScale : 1)), borderRadius: Math.round(7 * (isTablet ? faceScale : 1)) }]} />
                    )}
                    {noMolestar && !musicaActiva
                      ? <Ionicons name="mic-off-outline" size={Math.round(btnFont * 1.4)} color={esBotonesNoche ? '#4b5563' : '#9ca3af'} />
                      : detectandoSonido && estado === 'esperando' && !musicaActiva
                        ? <WaveformDetectando />
                        : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.botonTexto, { fontSize: musicaActiva && !isTablet ? Math.round(btnFont * 1.2) : btnFont, fontWeight: musicaActiva && !isTablet ? '800' : '600', color: esBotonesNoche ? '#e2e8f0' : '#374151', width: Math.round(btnW * (isTablet ? 0.65 : 0.68)), textAlign: 'center' }]}>
                            {btnLabel}
                          </Text>
                    }
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Botón SOS */}
          <Animated.View style={{ transform: [{ scale: sosPulso }], alignItems: 'center' }}>
            <TouchableOpacity
              style={[styles.botonSOS, sosPresionando && styles.botonSOSActivo, { width: btnW, height: btnH, borderRadius: btnH / 2 }, esBotonesNoche && !sosPresionando && { backgroundColor: '#6B1111', shadowOpacity: 0.15 }]}
              onPress={mostrarHintSOS}
              onPressIn={sosPresionado}
              onPressOut={sosSoltado}
              onLongPress={dispararSOS}
              delayLongPress={2000}
              activeOpacity={1}
            >
              <Text style={[styles.botonSOSTexto, { fontSize: isTablet ? sosFontTablet : Math.round(btnFont * 1.2) }]}>{sosPresionando ? 'Aguantá...' : 'SOS'}</Text>
            </TouchableOpacity>
            {sosPresionando && (
              <View style={styles.sosBarra}>
                <Animated.View style={[styles.sosBarraRelleno, {
                  width: sosProgreso.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                }]} />
              </View>
            )}
          </Animated.View>

        </View>

        {/* Fila inferior: No Molestar centrado */}
        <TouchableOpacity
          style={[styles.botonNoMolestar, noMolestar && styles.botonNoMolestarActivo, textScale !== 1 && { paddingHorizontal: Math.round(16 * textScale), paddingVertical: Math.round(8 * textScale), gap: Math.round(6 * textScale), borderRadius: Math.round(20 * textScale) }]}
          onPress={() => {
            const nuevo = !noMolestar;
            setNoMolestar(nuevo);
            if (nuevo) {
              ExpoSpeechRecognitionModule.stop();
              detenerSilbido();
            } else {
              refs.iniciarSpeechRecognition();
              chequearPendientesAlActivar();
            }
          }}
          activeOpacity={0.75}
        >
          <Ionicons name={noMolestar ? 'notifications-off' : 'notifications-outline'} size={icoNM} color={noMolestar ? '#fff' : '#ffffffaa'} />
          <Text style={[styles.botonNoMolestarTexto, noMolestar && { color: '#fff' }, { fontSize: nmFont }]}>No molestar</Text>
        </TouchableOpacity>

      </View>

      {mostrarOnboarding && (
        <TouchableOpacity
          style={styles.onboardingOverlay}
          onPress={() => setMostrarOnboarding(false)}
          activeOpacity={1}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.onboardingCard}>
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
                { icono: 'musical-notes', texto: 'Música',       color: '#7C5200', bg: '#FFE0A0' },
                { icono: 'medkit',        texto: 'Medicamentos',  color: '#004785', bg: '#D3E4FF' },
                { icono: 'partly-sunny',  texto: 'Clima',         color: '#1B5E28', bg: '#C8EFCE' },
                { icono: 'people',        texto: 'Familia',       color: '#5B0073', bg: '#EDD9FF' },
                { icono: 'timer',         texto: 'Timers',        color: '#7D2D00', bg: '#FFDCC8' },
                { icono: 'chatbubble',    texto: 'Charlar',       color: '#004785', bg: '#cef5ff' },
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
            <Ionicons name="alert-circle" size={isTablet ? 83 : 64} color="#fff" />
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
    />
    </>
  );
}

const styles = StyleSheet.create({
  contenedor:         { flex: 1, alignItems: 'center', justifyContent: 'space-evenly' },
  updateId:           { position: 'absolute', bottom: 6, right: 10, fontSize: 10, color: '#ffffffcc' },
  ojoContenedor:      { flexDirection: 'row', alignItems: 'flex-end', overflow: 'visible', marginTop: 120 },
  ecualizadorWrap:    { height: 90, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  botonesZona:        { alignItems: 'center', gap: 12 },
  botonesZonaTablet:  { alignItems: 'center', gap: 16 },
  botonesFilaPrincipal: { alignItems: 'center', justifyContent: 'center', gap: 24 },
  botonesWrap:        { alignItems: 'center', justifyContent: 'center', height: 90 },
  botonContenedor:    { alignItems: 'center', justifyContent: 'center' },
  postIt:             { borderRadius: 6, width: 280, height: 80, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 2, height: 4 }, shadowOpacity: 0.22, shadowRadius: 6, elevation: 5 },
  postItLinea:        { height: 5, width: '100%' },
  postItTitulo:       { fontSize: fs(28), fontWeight: '800', textTransform: 'capitalize' },
  btnGlow:            { position: 'absolute' },
  btnShadow:          { shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 18, elevation: 10 },
  boton:              { backgroundColor: '#FAFAFA', alignItems: 'center', justifyContent: 'center' },
  btnInner:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, overflow: 'hidden' },
  statusDot:          { width: 13, height: 13, borderRadius: 7 },
  botonTexto:         { fontSize: fs(18), fontWeight: '600', color: '#374151' },
  botonDeshabilitado: { opacity: 0.55 },
  botonSOS:             { width: 200, height: 64, borderRadius: 32, backgroundColor: '#CC2222', alignItems: 'center', justifyContent: 'center', shadowColor: '#CC2222', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8, borderWidth: 3, borderColor: 'transparent' },
  botonSOSActivo:       { backgroundColor: '#FF1A1A', borderColor: '#ffffff', shadowOpacity: 0.7, elevation: 16 },
  botonSOSTexto:        { fontSize: fs(18), fontWeight: '700', color: '#fff' },
  sosBarra:             { height: 8, borderRadius: 4, backgroundColor: '#ffffff44', marginTop: 6, overflow: 'hidden' },
  sosBarraRelleno:      { height: '100%', backgroundColor: '#fff', borderRadius: 4 },
  botonSOSHint:         { fontSize: fs(11), color: '#ffffff99' },
  sosModalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  sosModalCard:         { backgroundColor: '#CC2222', borderRadius: 28, paddingVertical: 40, paddingHorizontal: 44, alignItems: 'center', gap: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 20 },
  sosModalTitulo:       { fontSize: fs(32), fontWeight: '800', color: '#fff' },
  sosModalTexto:        { fontSize: fs(22), fontWeight: '500', color: '#ffffffdd', textAlign: 'center', lineHeight: fs(32) },
  botonNoMolestar:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ffffff33', marginTop: 8 },
  botonNoMolestarActivo: { backgroundColor: '#E85D24', borderColor: '#E85D24' },
  botonNoMolestarTexto:  { fontSize: fs(13), color: '#ffffffaa', fontWeight: '500' },
  infoText:           { fontSize: fs(52), fontWeight: '200', color: '#ffffffcc', textAlign: 'center', letterSpacing: 3 },
  relojNoche:         { fontSize: fs(90), fontWeight: '700', color: '#ffffff55', letterSpacing: 2 },
  musicaOverlay:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent', zIndex: 50 },
  onboardingOverlay:    { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 28 },
  onboardingCard:       { backgroundColor: '#f9fafb', borderRadius: 28, width: '100%', maxWidth: 340, overflow: 'hidden', elevation: 6, shadowColor: '#0097b2', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 20 },
  onboardingHeader:     { backgroundColor: '#0097b2', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 28, flexDirection: 'row', alignItems: 'center', gap: 16 },
  onboardingAvatarRing: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' },
  onboardingAvatar:     { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  onboardingHeaderTexts:{ flex: 1 },
  onboardingEyebrow:    { fontSize: 11, fontWeight: '500', color: '#ffffffaa', textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 2 },
  onboardingTitulo:     { fontSize: 34, fontWeight: '300', color: '#ffffff', letterSpacing: -0.5, lineHeight: 38 },
  onboardingGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 20 },
  onboardingChip:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100, minWidth: '44%', flex: 1 },
  onboardingChipText:   { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  onboardingCTA:        { paddingHorizontal: 20, paddingBottom: 24 },
  onboardingCTABtn:     { backgroundColor: '#0097b2', borderRadius: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  onboardingCTAText:    { fontSize: 15, fontWeight: '600', color: '#ffffff', letterSpacing: 0.1 },
});
