import { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';

const { width: SW, height: SH } = Dimensions.get('window');

export const EYE_W = 108;
export const EYE_H = 126;
export const GAP   = 32;
export const OW    = 20 + EYE_W * 2 + GAP + 20; // 288

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
    <Animated.Text style={{ position: 'absolute', left: x, top: -38, fontSize: size, fontWeight: '300', color: '#8BC4E8', opacity, transform: [{ scale }, { translateY: y }] }}>
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
    <Animated.Text style={{ position: 'absolute', left: x, top: -48, fontSize: 46, fontWeight: '800', color: '#FF6B35', opacity, transform: [{ scale }, { translateY: y }] }}>
      !
    </Animated.Text>
  );
}

export function Exclamaciones() {
  return (
    <>
      <UnExclamacion x={44}               delay={0}   />
      <UnExclamacion x={EYE_W + GAP + 44} delay={420} />
    </>
  );
}

// ── Sudor frío ────────────────────────────────────────────────────────────────

export function SudorFrio() {
  const y       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(300),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.9, duration: 250,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.7, duration: 900,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 350,  useNativeDriver: true }),
          ]),
          Animated.timing(y, { toValue: 36, duration: 1500, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(y,       { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(1000),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return <Animated.View style={[s.sudorFrio, { opacity, transform: [{ translateY: y }] }]} />;
}

// ── Carcajada ─────────────────────────────────────────────────────────────────

const JAS = [
  { x: 6,   y: 20,  text: 'ja',   size: 30, delay: 0   },
  { x: 72,  y: -10, text: 'jaja', size: 24, delay: 250 },
  { x: 160, y: 16,  text: 'ja',   size: 34, delay: 500 },
  { x: 216, y: -6,  text: 'je',   size: 22, delay: 150 },
];

function UnJa({ x, y, text, size, delay }: typeof JAS[0]) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.5)).current;
  const ty      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1,   duration: 200, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.8, duration: 600, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 300, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.3, duration: 200, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1.0, duration: 600, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.5, duration: 300, useNativeDriver: true }),
          ]),
          Animated.timing(ty, { toValue: -32, duration: 1100, useNativeDriver: true }),
        ]),
        Animated.timing(ty, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(400),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.Text style={{ position: 'absolute', left: x, top: y, fontSize: size, fontWeight: '700', color: '#F4A800', opacity, transform: [{ scale }, { translateY: ty }] }}>
      {text}
    </Animated.Text>
  );
}

export function Carcajada() {
  return <>{JAS.map((j, i) => <UnJa key={i} {...j} />)}</>;
}

// ── Notas musicales ───────────────────────────────────────────────────────────

const NOTAS = [
  { x: 5,   delay: 0    },
  { x: 80,  delay: 600  },
  { x: 155, delay: 1200 },
  { x: 230, delay: 400  },
  { x: 50,  delay: 900  },
  { x: 190, delay: 1600 },
];

function UnaNota({ x, delay }: { x: number; delay: number }) {
  const y       = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const nota    = useRef(delay % 1200 < 600 ? '♪' : '♫').current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1,   duration: 300,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.7, duration: 1000, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 400,  useNativeDriver: true }),
          ]),
          Animated.timing(y, { toValue: -70, duration: 1700, useNativeDriver: true }),
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
    <Animated.Text style={{ position: 'absolute', left: x, top: EYE_H - 10, fontSize: 28, color: '#5DCAA5', opacity, transform: [{ translateY: y }] }}>
      {nota}
    </Animated.Text>
  );
}

export function NotasMusica() {
  return <>{NOTAS.map((n, i) => <UnaNota key={i} x={n.x} delay={n.delay} />)}</>;
}

// ── Ceño fruncido ─────────────────────────────────────────────────────────────

export function CenoEnojado() {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, []);
  
  return (
    <Animated.View style={{ opacity }}>
      <View style={{ position: 'absolute', left: 25, top: 2, width: EYE_W - 10, height: 10, borderRadius: 5, backgroundColor: '#1A3A5C', transform: [{ rotate: '12deg' }] }} />
      <View style={{ position: 'absolute', left: 165, top: 2, width: EYE_W - 10, height: 10, borderRadius: 5, backgroundColor: '#1A3A5C', transform: [{ rotate: '-12deg' }] }} />
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

export function Mejillas({ faceScale = 1 }: { faceScale?: number }) {
  const animacion = useRef(new Animated.Value(0)).current;

  // Posiciones originales basadas en tu matemática
  const mejLeft  = 20 / faceScale - 41;
  const mejRight = 20 / faceScale + 227;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(animacion, {
        toValue: 1,
        duration: 700, 
        useNativeDriver: true,
      }),
      Animated.delay(1800), 
      Animated.timing(animacion, {
        toValue: 0,
        duration: 900, 
        useNativeDriver: true,
      }),
    ]).start();
  }, [animacion]);

  // Dimensiones del lienzo SVG para dar espacio al resplandor
  const w = 120;
  const h = 80;
  // Radios del núcleo del óvalo (la mitad de tus 62x34 originales)
  const rx = 31;
  const ry = 17;
  const cx = w / 2;
  const cy = h / 2;

  // Color naranja/rojizo original (#FF6B35) en formato rgba para el gradiente
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

  // Compensamos el offset visual generado por el lienzo SVG de 120x80
  // La diferencia entre 120 y tu 62 original es 58 (29 por lado)
  // La diferencia entre 80 y tu 34 original es 46 (23 por lado)
  const offsetW = 29;
  const offsetH = 23;

  return (
    <Animated.View style={{ opacity: animacion }} pointerEvents="none">
      <View style={{ position: 'absolute', left: mejLeft - offsetW, top: EYE_H + 44 - offsetH }}>
        <MejillaSvg />
      </View>
      <View style={{ position: 'absolute', left: mejRight - offsetW, top: EYE_H + 44 - offsetH }}>
        <MejillaSvg />
      </View>
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
  const vs = size * gs; // tamaño visual escalado
  const y  = useRef(new Animated.Value(SH + vs + 20)).current;
  const dx = useRef(new Animated.Value(0)).current;
  const sway = Math.round(14 * gs);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(y, { toValue: -(vs + 30), duration: dur, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(dx, { toValue:  sway,      duration: dur * 0.25, useNativeDriver: true }),
            Animated.timing(dx, { toValue: -sway,      duration: dur * 0.25, useNativeDriver: true }),
            Animated.timing(dx, { toValue:  sway * 0.7,duration: dur * 0.25, useNativeDriver: true }),
            Animated.timing(dx, { toValue:  0,         duration: dur * 0.25, useNativeDriver: true }),
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
    <Animated.View
      style={{ position: 'absolute', left: x, transform: [{ translateY: y }, { translateX: dx }] }}
      pointerEvents="none"
    >
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

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  lagrima:  { position: 'absolute', top: EYE_H + 2, width: 13, height: 20, borderRadius: 7, backgroundColor: '#7EB8D4' },
  sudorFrio:{ position: 'absolute', right: 6, top: 2, width: 16, height: 24, borderRadius: 8, backgroundColor: '#90CAE8' },
});