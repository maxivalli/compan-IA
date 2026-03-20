import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Animated, Modal, PanResponder, PixelRatio, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';

// Escala fuentes respetando la accesibilidad del sistema (hasta 1.3x)
function fs(size: number) { return size * Math.min(PixelRatio.getFontScale(), 1.3); }
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { useRosita } from '../hooks/useRosita';
import { useNotificaciones } from '../hooks/useNotificaciones';
import RosaOjos, { BG } from '../components/RosaOjos';
import MenuFlotante from '../components/MenuFlotante';
import ExpresionOverlay from '../components/ExpresionOverlay';
import { AnimacionMusica, ZZZ, CieloNoche } from '../components/FondoAnimado';
import { Globos } from '../components/EfectosExpresion';
import CameraAutoCaptura from '../components/CameraAutoCaptura';

const HORA_DESPERTAR = 7;

export default function Index() {
  const router = useRouter();
  const {
    estado, expresion, cargando, mostrarOnboarding, setMostrarOnboarding,
    musicaActiva, silbando, noMolestar, setNoMolestar,
    modoNoche, horaActual, climaObj, flashAnim,
    iniciarEscucha, detenerEscucha, pararMusica, dispararSOS,
    onOjoPicado, onCaricia, onRelampago, iniciarSilbido, detenerSilbido, reactivar, recargarPerfil,
    mostrarCamara, onFotoCapturada, onFotoCancelada,
    refs, player,
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

  // Conectar hook de notificaciones pasándole todos los refs del hook principal
  const { chequearPendientesAlActivar, esCumpleaños, triggerCumpleaños } = useNotificaciones({ ...refs, pararMusica, iniciarSilbido, detenerSilbido }, player);


  // ── Cálculo del fondo ───────────────────────────────────────────────────────
  const hora           = horaActual;
  const esAtardecerBg  = hora >= 17 && hora < 20;
  const esFondoNoche   = hora >= 20 || hora < HORA_DESPERTAR;
  const esClimaOscuro  = !!climaObj?.descripcion?.toLowerCase().match(/lluvia|lloviendo|llovizna|tormenta|granizo/);
  const bgActual = esFondoNoche ? BG : esClimaOscuro ? '#6B7280' : esAtardecerBg ? '#FFBD59' : '#38B6FF';

  const desc        = climaObj?.descripcion?.toLowerCase() ?? '';
  const cieloTapado = /\bnublado\b/.test(desc) && !/parcial|algunas nubes/.test(desc)
    || /nuboso|cubierto|lluvia|lloviendo|llovizna|tormenta|nevada|nieve|granizo|niebla/.test(desc);

  // ── Hints rotativos en modo espera ──────────────────────────────────────────
  const HINTS = [
    '¿Cómo estás hoy?',
    '¿De qué te gustaría charlar?',
    '¿Querés escuchar música?',
    '¿Qué pasó hoy en las noticias?',
    '¿Jugamos a algo?',
    'Acá estoy para lo que necesités',
  ];
  const [hintIdx, setHintIdx] = useState(0);
  const hintOpacity           = useRef(new Animated.Value(0)).current;
  const hintTranslate         = useRef(new Animated.Value(30)).current;
  const hintActiveRef         = useRef(false);

  useEffect(() => {
    if (estado !== 'esperando' || musicaActiva) {
      hintActiveRef.current = false;
      Animated.timing(hintOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      return;
    }
    hintActiveRef.current = true;
    hintTranslate.setValue(30);
    Animated.parallel([
      Animated.timing(hintOpacity,   { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(hintTranslate, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
    const id = setInterval(() => {
      if (!hintActiveRef.current) return;
      Animated.parallel([
        Animated.timing(hintOpacity,   { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(hintTranslate, { toValue: -30, duration: 400, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished || !hintActiveRef.current) return;
        setHintIdx(prev => (prev + 1) % HINTS.length);
        hintTranslate.setValue(30);
        Animated.parallel([
          Animated.timing(hintOpacity,   { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(hintTranslate, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();
      });
    }, 4500);
    return () => { hintActiveRef.current = false; clearInterval(id); };
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
  const sosPulso   = useRef(new Animated.Value(1)).current;   // scale — useNativeDriver: true
  const sosProgreso = useRef(new Animated.Value(0)).current;  // barra — useNativeDriver: false
  const sosPulsoRef   = useRef<Animated.CompositeAnimation | null>(null);
  const sosProgresoRef = useRef<Animated.CompositeAnimation | null>(null);

  function sosPresionado() {
    setSosPresionando(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Pulso fuerte y repetitivo
    sosPulsoRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulso, { toValue: 1.22, duration: 280, useNativeDriver: true }),
        Animated.timing(sosPulso, { toValue: 1,    duration: 280, useNativeDriver: true }),
      ])
    );
    sosPulsoRef.current.start();

    // Barra de progreso que se llena en 2 segundos
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

  // ── Animación del botón escuchando ──────────────────────────────────────────
  const escuchando    = estado === 'escuchando';
  const botonDisabled = estado === 'pensando' || estado === 'hablando';
  const pulso = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (escuchando) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulso, { toValue: 1.5, duration: 700, useNativeDriver: true }),
          Animated.timing(pulso, { toValue: 1,   duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulso.stopAnimation();
      pulso.setValue(1);
    }
  }, [escuchando]);

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
  const isTablet  = screenW >= 600;
  const faceScale = isTablet ? Math.min(screenW / 390, 1.7) : 1;
  const textScale = faceScale; // mismo scale que la cara — texto proporcional en tablet y teléfono
  const btnW      = isTablet ? Math.round(Math.min(200 * faceScale, 380)) : 200;
  const btnH      = isTablet ? Math.round(64 * textScale) : 64;
  const icoBtn    = Math.round(btnH * 0.46);
  const icoSOS    = Math.round(btnH * 0.50);
  const icoNM     = isTablet ? 28 : 18;
  const btnFont   = isTablet ? fs(50) : fs(18);
  const nmFont    = isTablet ? fs(24) : fs(13);
  // Padding vertical proporcional: deja ~8% arriba y ~8% abajo del espacio libre
  const tabletPadV = isTablet ? Math.round(screenH * 0.08) : 0;

  if (cargando && Platform.OS !== 'web') return <View style={{ flex: 1, backgroundColor: '#fff' }} />;

  return (
    <View style={[styles.contenedor, { backgroundColor: bgActual }, isTablet && { justifyContent: 'space-evenly', paddingVertical: tabletPadV }]}>
      <MenuFlotante oscuro />

      {esFondoNoche && !(hora >= 6 && hora < 10) && !cieloTapado && <CieloNoche bgColor={bgActual} />}
      {modoNoche === 'durmiendo' && <ZZZ />}
      {esCumpleaños && <Globos />}
      <CameraAutoCaptura visible={mostrarCamara} onCaptura={onFotoCapturada} onCancelar={onFotoCancelada} />

      <View style={[styles.ojoContenedor, isTablet && { marginTop: 40 }]} {...panCaricia.panHandlers}>
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
        />
      </View>

      <View style={styles.ecualizadorWrap}>
        {musicaActiva
          ? <AnimacionMusica />
          : <Animated.View style={{ opacity: hintOpacity, transform: [{ translateX: hintTranslate }], width: '100%' }}>
              <Text style={[styles.hintText, textScale !== 1 && { fontSize: fs(27) * textScale, lineHeight: fs(35) * textScale }]}>{HINTS[hintIdx]}</Text>
            </Animated.View>
        }
      </View>

      {musicaActiva && (
        <TouchableOpacity style={styles.musicaOverlay} onPress={pararMusica} activeOpacity={1} />
      )}

      <View style={styles.botonesWrap}>
        <View style={styles.botonContenedor}>
          {escuchando && (
            <Animated.View style={[styles.botonAnillo, { width: btnW + 12, height: btnH + 12, borderRadius: (btnH + 12) / 2, transform: [{ scale: pulso }] }]} />
          )}
          <TouchableOpacity
            style={[styles.boton, escuchando && styles.botonActivo, botonDisabled && styles.botonDeshabilitado, { width: btnW, height: btnH, borderRadius: btnH / 2 }]}
            onPress={escuchando ? detenerEscucha : iniciarEscucha}
            activeOpacity={0.75}
            disabled={botonDisabled}
          >
            <Text style={[styles.botonTexto, { fontSize: btnFont }]}>{escuchando ? 'Escuchando...' : 'Hablar'}</Text>
          </TouchableOpacity>
        </View>
      </View>

{/* Easter egg: toque largo en esquina inferior derecha → cumpleaños */}
      <TouchableOpacity
        onLongPress={triggerCumpleaños}
        style={{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 40 }}
      />

      <Animated.View style={{ transform: [{ scale: sosPulso }] }}>
        <TouchableOpacity
          style={[styles.botonSOS, sosPresionando && styles.botonSOSActivo, { width: btnW, height: btnH, borderRadius: btnH / 2 }]}
          onPress={mostrarHintSOS}
          onPressIn={sosPresionado}
          onPressOut={sosSoltado}
          onLongPress={dispararSOS}
          delayLongPress={2000}
          activeOpacity={1}
        >
          <Text style={[styles.botonSOSTexto, { fontSize: btnFont }]}>{sosPresionando ? 'Aguantá...' : 'SOS'}</Text>
        </TouchableOpacity>
        {sosPresionando && (
          <View style={styles.sosBarra}>
            <Animated.View style={[styles.sosBarraRelleno, {
              width: sosProgreso.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
        )}
      </Animated.View>

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

      {/* Easter egg: toque largo en esquina inferior izquierda → silbido */}
      <TouchableOpacity
        onLongPress={() => silbando ? detenerSilbido() : iniciarSilbido()}
        style={{ position: 'absolute', bottom: 0, left: 0, width: 40, height: 40 }}
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
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor:         { flex: 1, alignItems: 'center', justifyContent: 'space-evenly' },
  updateId:           { position: 'absolute', bottom: 6, right: 10, fontSize: 10, color: '#ffffffcc' },
  ojoContenedor:      { flexDirection: 'row', alignItems: 'flex-end', overflow: 'visible', marginTop: 120 },
  ecualizadorWrap:    { minHeight: 90, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  botonesWrap:        { alignItems: 'center', justifyContent: 'center', height: 90 },
  botonContenedor:    { alignItems: 'center', justifyContent: 'center', width: 240, height: 90 },
  botonAnillo:        { position: 'absolute', width: 212, height: 76, borderRadius: 38, borderWidth: 2.5, borderColor: '#E85D24', opacity: 0.5 },
  boton:              { width: 200, height: 64, borderRadius: 32, backgroundColor: '#FAFAFA', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 8 },
  botonTexto:         { fontSize: fs(18), fontWeight: '600', color: '#3A3A3A' },
  botonActivo:        { backgroundColor: '#E85D24', shadowColor: '#E85D24' },
  botonDeshabilitado: { opacity: 0.3, shadowOpacity: 0 },
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
  hintText:           { fontSize: fs(27), fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontStyle: 'italic', color: '#ffffffdd', textAlign: 'center', paddingHorizontal: 32, lineHeight: fs(35) },
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