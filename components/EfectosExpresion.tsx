import { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';

const { width: SW, height: SH } = Dimensions.get('window');

export const EYE_W = 124;
export const EYE_H = 159;
export const GAP   = 32;
export const OW    = 20 + EYE_W * 2 + GAP + 20; // 320

// ── Lágrimas ──────────────────────────────────────────────────────────────────

function UnaLagrima({ x, delay }: { x: number; delay: number }) {
  const y       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.9, duration: 150,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.8, duration: 1100, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 300,  useNativeDriver: true }),
          ]),
          Animated.timing(y, { toValue: 64, duration: 1550, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(y,       { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return <Animated.View style={[s.lagrima, { left: x, opacity, transform: [{ translateY: y }] }]} />;
}

export function Lagrimas() {
  return (
    <>
      <UnaLagrima x={30}               delay={0}    />
      <UnaLagrima x={62}               delay={850}  />
      <UnaLagrima x={EYE_W + GAP + 30} delay={420}  />
      <UnaLagrima x={EYE_W + GAP + 62} delay={1200} />
    </>
  );
}

// ── Corazones ─────────────────────────────────────────────────────────────────

const HEARTS = [
  { x: 10,  delay: 0,   size: 36 },
  { x: 55,  delay: 350, size: 30 },
  { x: 110, delay: 700, size: 42 },
  { x: 168, delay: 200, size: 34 },
  { x: 222, delay: 550, size: 38 },
  { x: 78,  delay: 900, size: 28 },
];

function UnCorazon({ x, delay, size }: typeof HEARTS[0]) {
  const y       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1,   duration: 280,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.8, duration: 900,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 320,  useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.2, duration: 280, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.0, duration: 900, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.5, duration: 320, useNativeDriver: true }),
          ]),
          Animated.timing(y, { toValue: -80, duration: 1500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(y,       { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.Text style={{ position: 'absolute', left: x, top: EYE_H + 8, fontSize: size, color: '#FF8FAB', opacity, transform: [{ scale }, { translateY: y }] }}>
      ♥
    </Animated.Text>
  );
}

export function Corazones() {
  return <>{HEARTS.map((h, i) => <UnCorazon key={i} {...h} />)}</>;
}

// ── Signos de pregunta ────────────────────────────────────────────────────────

const PREGUNTAS = [
  { x: 16,           delay: 0,   size: 48 },
  { x: EYE_W+GAP+10, delay: 500, size: 42 },
  { x: OW / 2 - 18,  delay: 250, size: 56 },
];

function UnSigno({ x, delay, size }: typeof PREGUNTAS[0]) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.5)).current;
  const y       = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.9, duration: 300,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.7, duration: 900,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 400,  useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.1, duration: 300, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.9, duration: 900, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.5, duration: 400, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(y, { toValue: -6, duration: 300,  useNativeDriver: true }),
            Animated.timing(y, { toValue: 4,  duration: 1300, useNativeDriver: true }),
          ]),
        ]),
        Animated.timing(y, { toValue: 8, duration: 0, useNativeDriver: true }),
        Animated.delay(500),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.Text style={{ position: 'absolute', left: x, top: 2, fontSize: size, fontWeight: '300', color: '#8BC4E8', opacity, transform: [{ scale }, { translateY: y }] }}>
      ?
    </Animated.Text>
  );
}

export function SignosPregunta() {
  return <>{PREGUNTAS.map((p, i) => <UnSigno key={i} {...p} />)}</>;
}

// ── Exclamaciones ─────────────────────────────────────────────────────────────

function UnExclamacion({ x, delay }: { x: number; delay: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.4)).current;
  const y       = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1,    duration: 200, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.85, duration: 700, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,    duration: 300, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.3, duration: 200, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.0, duration: 700, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.4, duration: 300, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(y, { toValue: 0, duration: 200,  useNativeDriver: true }),
            Animated.timing(y, { toValue: 4, duration: 1000, useNativeDriver: true }),
          ]),
        ]),
        Animated.delay(500),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.Text style={{ position: 'absolute', left: x, top: -12, fontSize: 46, fontWeight: '800', color: '#FF6B35', opacity, transform: [{ scale }, { translateY: y }] }}>
      !
    </Animated.Text>
  );
}

export function Exclamaciones() {
  return (
    <>
      <UnExclamacion x={20}             delay={0}   />
      <UnExclamacion x={EYE_W + GAP + 20} delay={300} />
    </>
  );
}

// ── Carcajada ─────────────────────────────────────────────────────────────────

const CARCAJADAS = [
  { x: 8,   delay: 0,   size: 32, color: '#FFD93D' },
  { x: 50,  delay: 200, size: 38, color: '#FF6B35' },
  { x: 100, delay: 100, size: 28, color: '#FFD93D' },
  { x: 148, delay: 300, size: 40, color: '#FF6B35' },
  { x: 198, delay: 150, size: 30, color: '#FFD93D' },
  { x: 244, delay: 250, size: 34, color: '#FF6B35' },
];

function UnaCarcajada({ x, delay, size, color }: typeof CARCAJADAS[0]) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.5)).current;
  const y       = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1,   duration: 150, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.9, duration: 600, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 250, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.3, duration: 150, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.0, duration: 600, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.5, duration: 250, useNativeDriver: true }),
          ]),
          Animated.timing(y, { toValue: -50, duration: 1000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(y,       { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(400),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.Text style={{ position: 'absolute', left: x, top: EYE_H + 4, fontSize: size, color, opacity, transform: [{ scale }, { translateY: y }] }}>
      😄
    </Animated.Text>
  );
}

export function Carcajada() {
  return <>{CARCAJADAS.map((c, i) => <UnaCarcajada key={i} {...c} />)}</>;
}

// ── Notas de música ───────────────────────────────────────────────────────────

const NOTAS = [
  { x: -10, delay: 0,    size: 28, nota: '♪' },
  { x: 60,  delay: 600,  size: 34, nota: '♫' },
  { x: 130, delay: 300,  size: 26, nota: '♪' },
  { x: 195, delay: 900,  size: 32, nota: '♫' },
  { x: 255, delay: 150,  size: 28, nota: '♪' },
];

function UnaNota({ x, delay, size, nota }: typeof NOTAS[0]) {
  const opacity = useRef(new Animated.Value(0)).current;
  const y       = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.95, duration: 400,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.7,  duration: 1000, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,    duration: 500,  useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.1, duration: 400,  useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.9, duration: 1000, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.6, duration: 500,  useNativeDriver: true }),
          ]),
          Animated.timing(y, { toValue: -70, duration: 1900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(y,       { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(300),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.Text style={{ position: 'absolute', left: x, top: -20, fontSize: size, color: '#5DCAA5', opacity, transform: [{ scale }, { translateY: y }] }}>
      {nota}
    </Animated.Text>
  );
}

export function NotasMusica() {
  return <>{NOTAS.map((n, i) => <UnaNota key={i} {...n} />)}</>;
}

// ── Ceño enojado ──────────────────────────────────────────────────────────────

export function CenoEnojado() {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ opacity }}>
      <View style={{ position: 'absolute', left: 25, top: 2, width: EYE_W - 10, height: 10, borderRadius: 5, backgroundColor: '#1A3A5C', transform: [{ rotate: '12deg' }] }} />
      <View style={{ position: 'absolute', left: 181, top: 2, width: EYE_W - 10, height: 10, borderRadius: 5, backgroundColor: '#1A3A5C', transform: [{ rotate: '-12deg' }] }} />
    </Animated.View>
  );
}

// ── Grawlixes ─────────────────────────────────────────────────────────────────

const GRAWLIXES = [
  { x: 20,  y: 30, text: '@', size: 22, delay: 0,   color: '#E53935' },
  { x: 52,  y: 18, text: '#', size: 26, delay: 80,  color: '#FF6F00' },
  { x: 90,  y: 26, text: '$', size: 20, delay: 160, color: '#E53935' },
  { x: 124, y: 16, text: '%', size: 24, delay: 60,  color: '#B71C1C' },
  { x: 160, y: 28, text: '!', size: 28, delay: 120, color: '#FF6F00' },
  { x: 196, y: 18, text: '&', size: 22, delay: 40,  color: '#E53935' },
  { x: 230, y: 24, text: '*', size: 26, delay: 100, color: '#B71C1C' },
];

function UnGrawlix({ x, y, text, size, delay, color }: typeof GRAWLIXES[0]) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty      = useRef(new Animated.Value(6)).current;
  const scale   = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1,   duration: 150, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.8, duration: 500, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 200, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.2, duration: 150, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.0, duration: 500, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.4, duration: 200, useNativeDriver: true }),
          ]),
          Animated.timing(ty, { toValue: -10, duration: 850, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(ty,      { toValue: 6,   duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 0.4, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(300),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.Text style={{ position: 'absolute', left: x, top: y, fontSize: size, fontWeight: '900', color, opacity, transform: [{ translateY: ty }, { scale }] }}>
      {text}
    </Animated.Text>
  );
}

export function Grawlixes() {
  return <>{GRAWLIXES.map((g, i) => <UnGrawlix key={i} {...g} />)}</>;
}

// ── Mejillas (Glow SVG Radial) ────────────────────────────────────────────────

export function Mejillas() {
  const animacion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(animacion, { toValue: 1, duration: 700,  useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(animacion, { toValue: 0, duration: 900,  useNativeDriver: true }),
    ]).start();
  }, [animacion]);

  const w = 120;
  const h = 80;
  const rx = 31;
  const ry = 17;
  const cx = w / 2;
  const cy = h / 2;
  const colorGlow = 'rgba(255, 107, 53, 1)';

  const MejillaSvg = () => (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        <RadialGradient id="glowMejilla" cx="50%" cy="50%" rx="50%" ry="50%" gradientUnits="objectBoundingBox">
          <Stop offset="0%"   stopColor={colorGlow} stopOpacity={0.8} />
          <Stop offset="40%"  stopColor={colorGlow} stopOpacity={0.4} />
          <Stop offset="100%" stopColor={colorGlow} stopOpacity={0}   />
        </RadialGradient>
      </Defs>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#glowMejilla)" />
    </Svg>
  );

  return (
    <Animated.View style={{ opacity: animacion }} pointerEvents="none">
      <View style={{ position: 'absolute', left: 22,  top: 204 }}><MejillaSvg /></View>
      <View style={{ position: 'absolute', left: 178, top: 204 }}><MejillaSvg /></View>
    </Animated.View>
  );
}

// ── Globos de cumpleaños ──────────────────────────────────────────────────────

const GLOBOS_DATA = [
  { x: SW * 0.05, delay: 0,    color: '#FF6B6B', size: 34, dur: 7000 },
  { x: SW * 0.18, delay: 900,  color: '#FFD93D', size: 28, dur: 8200 },
  { x: SW * 0.33, delay: 1800, color: '#6BCB77', size: 36, dur: 7400 },
  { x: SW * 0.50, delay: 400,  color: '#4D96FF', size: 30, dur: 6800 },
  { x: SW * 0.65, delay: 1300, color: '#FF6BFF', size: 32, dur: 7900 },
  { x: SW * 0.80, delay: 700,  color: '#FF9F45', size: 28, dur: 8500 },
  { x: SW * 0.12, delay: 2200, color: '#C77DFF', size: 34, dur: 7200 },
  { x: SW * 0.72, delay: 1600, color: '#80FFDB', size: 30, dur: 7600 },
  { x: SW * 0.44, delay: 2800, color: '#FF6B6B', size: 26, dur: 8000 },
  { x: SW * 0.90, delay: 500,  color: '#FFD93D', size: 32, dur: 7300 },
];

function UnGlobo({ x, delay, color, size, dur, gs }: typeof GLOBOS_DATA[0] & { gs: number }) {
  const vs   = size * gs;
  const y    = useRef(new Animated.Value(SH + vs + 20)).current;
  const dx   = useRef(new Animated.Value(0)).current;
  const sway = Math.round(14 * gs);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(y, { toValue: -(vs + 30), duration: dur, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(dx, { toValue:  sway,       duration: dur * 0.25, useNativeDriver: true }),
            Animated.timing(dx, { toValue: -sway,       duration: dur * 0.25, useNativeDriver: true }),
            Animated.timing(dx, { toValue:  sway * 0.7, duration: dur * 0.25, useNativeDriver: true }),
            Animated.timing(dx, { toValue:  0,          duration: dur * 0.25, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(y,  { toValue: SH + vs + 20, duration: 0, useNativeDriver: true }),
          Animated.timing(dx, { toValue: 0,             duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: 'absolute', left: x, transform: [{ translateY: y }, { translateX: dx }] }} pointerEvents="none">
      <View style={{ width: vs, height: vs * 1.15, borderRadius: vs / 2, backgroundColor: color, opacity: 0.88 }} />
      <View style={{ width: Math.round(6 * gs), height: Math.round(6 * gs), borderRadius: Math.round(3 * gs), backgroundColor: color, alignSelf: 'center', marginTop: -1, opacity: 0.7 }} />
      <View style={{ width: 1.5, height: Math.round(22 * gs), backgroundColor: color + '99', alignSelf: 'center' }} />
    </Animated.View>
  );
}

export function Globos() {
  const { width: screenW } = useWindowDimensions();
  const gs = screenW >= 600 ? Math.min(screenW / 390, 2.0) : 1;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {GLOBOS_DATA.map((g, i) => <UnGlobo key={i} {...g} gs={gs} />)}
    </View>
  );
}

// ── Bonete de cumpleaños ──────────────────────────────────────────────────────
// Se posiciona sobre los ojos, centrado en el lienzo de 320x409.
// El centro horizontal de los dos ojos es OW/2 ≈ 160.

const PUNTITOS_BONETE = [
  { dx: -20, dy: -38, color: '#FFD700', r: 4 },
  { dx:   0, dy: -60, color: '#ffffff', r: 4 },
  { dx:  20, dy: -38, color: '#FFD700', r: 4 },
  { dx: -10, dy: -22, color: '#ffffff', r: 3 },
  { dx:  10, dy: -22, color: '#FFD700', r: 3 },
];

export function Bonete() {
  const opacity = useRef(new Animated.Value(0)).current;
  const balanceo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in suave al aparecer
    Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();

    // Pequeño balanceo continuo para darle vida
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(balanceo, { toValue:  4, duration: 1800, useNativeDriver: true }),
        Animated.timing(balanceo, { toValue: -4, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Centro horizontal del lienzo (entre los dos ojos)
  const cx = OW / 2; // ~160

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cx - 48,   // centrado, el bonete mide ~96px de ancho en la base
        top: -75,        // por encima de los ojos
        opacity,
        transform: [{ rotate: balanceo.interpolate({ inputRange: [-4, 4], outputRange: ['-4deg', '4deg'] }) }],
      }}
    >
      {/* Cuerpo del bonete — triángulo via bordes CSS */}
      <View style={sb.boneteTriangulo} />

      {/* Banda blanca en la base */}
      <View style={sb.boneteBanda} />

      {/* Puntitos decorativos encima del triángulo */}
      {PUNTITOS_BONETE.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 48 + p.dx - p.r,   // 48 = mitad del ancho base
            top:  92 + p.dy - p.r,   // 92 = altura del triángulo
            width: p.r * 2,
            height: p.r * 2,
            borderRadius: p.r,
            backgroundColor: p.color,
          }}
        />
      ))}

      {/* Pompón en la punta */}
      <View style={sb.boneteCompon} />
    </Animated.View>
  );
}

const sb = StyleSheet.create({
  // Triángulo con border trick: base 96px, altura 92px, color rosa fiesta
  boneteTriangulo: {
    width: 0,
    height: 0,
    borderLeftWidth: 48,
    borderRightWidth: 48,
    borderBottomWidth: 92,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FF3366',
    alignSelf: 'center',
  },
  // Banda blanca en la base del triángulo
  boneteBanda: {
    width: 96,
    height: 14,
    borderRadius: 5,
    backgroundColor: '#ffffff',
    alignSelf: 'center',
    marginTop: -2,
  },
  // Pompón amarillo en la punta
  boneteCompon: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFD700',
    alignSelf: 'center',
    left: 38,   // (96/2) - (20/2)
    top: -10,   // justo en la punta del triángulo
  },
});

// ── Gorro navideño ────────────────────────────────────────────────────────────
// Mismo sistema de posicionamiento que el bonete.

export function GorroNavidad() {
  const opacity  = useRef(new Animated.Value(0)).current;
  const balanceo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(balanceo, { toValue:  5, duration: 2200, useNativeDriver: true }),
        Animated.timing(balanceo, { toValue: -3, duration: 2200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const cx = OW / 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cx - 56,
        top: -75,
        opacity,
        transform: [{ rotate: balanceo.interpolate({ inputRange: [-5, 5], outputRange: ['-5deg', '5deg'] }) }],
      }}
    >
      {/* Cuerpo rojo del gorro (triángulo más ancho = gorro de Papá Noel) */}
      <View style={sn.gorroTriangulo} />

      {/* Punta doblada hacia la derecha — simulada con un rectángulo redondeado rotado */}
      <View style={sn.gorroPunta} />

      {/* Pompón blanco en la punta doblada */}
      <View style={sn.gorroPompon} />

      {/* Doblez blanco en la base */}
      <View style={sn.gorroBanda} />
    </Animated.View>
  );
}

const sn = StyleSheet.create({
  // Triángulo rojo — base 112px, altura 100px
  gorroTriangulo: {
    width: 0,
    height: 0,
    borderLeftWidth: 56,
    borderRightWidth: 56,
    borderBottomWidth: 100,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#CC0000',
    alignSelf: 'center',
  },
  // Punta doblada: rectángulo rojo rotado, saliendo por arriba a la derecha
  gorroPunta: {
    position: 'absolute',
    width: 44,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#CC0000',
    top: 10,
    left: 72,   // sale hacia la derecha desde la punta
    transform: [{ rotate: '30deg' }],
  },
  // Pompón blanco al final de la punta
  gorroPompon: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F5F5F5',
    top: 2,
    left: 106,
  },
  // Banda blanca en la base
  gorroBanda: {
    width: 116,
    height: 18,
    borderRadius: 6,
    backgroundColor: '#F5F5F5',
    alignSelf: 'center',
    marginTop: -3,
  },
});

// ── Destellos (feliz — estrellas doradas que suben suave) ────────────────────

const DESTELLOS = [
  { x: 10,  delay: 0,   size: 30, color: '#FFD700' },
  { x: 55,  delay: 280, size: 24, color: '#FFC107' },
  { x: 110, delay: 140, size: 34, color: '#FFD700' },
  { x: 165, delay: 420, size: 26, color: '#FFEB3B' },
  { x: 215, delay: 210, size: 30, color: '#FFC107' },
  { x: 258, delay: 560, size: 22, color: '#FFD700' },
];

function UnDestello({ x, delay, size, color }: typeof DESTELLOS[0]) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.4)).current;
  const y       = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1,   duration: 200,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.8, duration: 800,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 300,  useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.2, duration: 200,  useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.0, duration: 800,  useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.4, duration: 300,  useNativeDriver: true }),
          ]),
          Animated.timing(y, { toValue: -70, duration: 1300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(y,       { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 0.4, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(400),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.Text style={{ position: 'absolute', left: x, top: EYE_H + 4, fontSize: size, color, opacity, transform: [{ scale }, { translateY: y }] }}>
      ✦
    </Animated.Text>
  );
}

export function Destellos() {
  return <>{DESTELLOS.map((d, i) => <UnDestello key={i} {...d} />)}</>;
}

// ── Confetti (entusiasmada — piezas coloridas que suben rápido) ───────────────

const CONFETTI_DATA = [
  { x: 8,   delay: 0,   size: 20, color: '#FF6B6B', symbol: '✦' },
  { x: 45,  delay: 120, size: 24, color: '#FFD93D', symbol: '●' },
  { x: 88,  delay: 60,  size: 18, color: '#6BCB77', symbol: '✦' },
  { x: 130, delay: 220, size: 22, color: '#4D96FF', symbol: '●' },
  { x: 172, delay: 90,  size: 20, color: '#FF6BFF', symbol: '✦' },
  { x: 210, delay: 180, size: 24, color: '#FF9F45', symbol: '●' },
  { x: 250, delay: 40,  size: 18, color: '#C77DFF', symbol: '✦' },
];

function UnConfetti({ x, delay, size, color, symbol }: typeof CONFETTI_DATA[0]) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.3)).current;
  const y       = useRef(new Animated.Value(0)).current;
  const rotate  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1,   duration: 150, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.9, duration: 600, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 250, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.4, duration: 150, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.0, duration: 600, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.3, duration: 250, useNativeDriver: true }),
          ]),
          Animated.timing(y, { toValue: -90, duration: 1000, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(rotate, { toValue: 1,  duration: 500, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: -1, duration: 500, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(y,       { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 0.3, duration: 0, useNativeDriver: true }),
          Animated.timing(rotate,  { toValue: 0,   duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(300),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const rotateInterp = rotate.interpolate({ inputRange: [-1, 1], outputRange: ['-30deg', '30deg'] });

  return (
    <Animated.Text style={{ position: 'absolute', left: x, top: EYE_H, fontSize: size, color, opacity, transform: [{ scale }, { translateY: y }, { rotate: rotateInterp }] }}>
      {symbol}
    </Animated.Text>
  );
}

export function Confetti() {
  return <>{CONFETTI_DATA.map((c, i) => <UnConfetti key={i} {...c} />)}</>;
}

// ── Estilos base ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  lagrima:   { position: 'absolute', top: EYE_H + 2, width: 13, height: 20, borderRadius: 7, backgroundColor: '#7EB8D4' },
  sudorFrio: { position: 'absolute', right: 6, top: 2, width: 16, height: 24, borderRadius: 8, backgroundColor: '#90CAE8' },
});