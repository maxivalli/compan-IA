import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { esDispositivoGamaBaja } from '../lib/dispositivoUtils';

const EFECTO_SCALE       = 1.5;
const EFECTO_TRANSLATE_X = 30;   // nudge derecha (horizontal)
const EFECTO_TRANSLATE_Y = 50;   // nudge abajo   (horizontal)

function useEfectoStyle() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const esHorizontal = screenW > screenH;
  const shortEdge    = Math.min(screenW, screenH);
  const esTablet     = esHorizontal && shortEdge >= 700;
  const leftOffset   = esHorizontal
    ? Math.round(Math.min(screenW * (esTablet ? 0.60 : 0.46), esTablet ? 312 : 240))
    : 0;
  const transform = esHorizontal
    ? [{ scale: EFECTO_SCALE }, { translateX: EFECTO_TRANSLATE_X }, { translateY: EFECTO_TRANSLATE_Y }]
    : [];
  return { leftOffset, transform };
}
import { OW } from './EfectosExpresion';

// ── Lluvia ────────────────────────────────────────────────────────────────────

const GOTAS_FONDO = [
  { x: 15,  delay: 0    }, { x: 48,  delay: 320  }, { x: 82,  delay: 750  },
  { x: 118, delay: 180  }, { x: 152, delay: 560  }, { x: 188, delay: 900  },
  { x: 222, delay: 420  }, { x: 256, delay: 140  }, { x: 35,  delay: 680  },
  { x: 100, delay: 1050 }, { x: 165, delay: 240  }, { x: 235, delay: 780  },
];

const GOTAS_FRENTE = [
  { x: 28,  delay: 0    }, { x: 88,  delay: 480  }, { x: 148, delay: 200  },
  { x: 208, delay: 720  }, { x: 62,  delay: 350  }, { x: 175, delay: 900  },
];

function GotaFondo({ x, delay }: { x: number; delay: number }) {
  const y       = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const dur  = 900 + Math.random() * 200;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.35, duration: 80,        useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.25, duration: dur - 160, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,    duration: 80,        useNativeDriver: true }),
          ]),
          Animated.timing(y, { toValue: 220, duration: dur, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(y,       { toValue: -80, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: 'absolute', left: x, width: 1.5, height: 18, borderRadius: 1, backgroundColor: '#A8C8E8', opacity, transform: [{ translateY: y }, { skewX: '-20deg' }] }} />
  );
}

function SplashFrente({ x, startY }: { x: number; startY: number }) {
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(Math.random() * 1200),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,   duration: 280, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.6, duration: 80,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 200, useNativeDriver: true }),
          ]),
        ]),
        Animated.timing(scale, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(800 + Math.random() * 600),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: 'absolute', left: x - 6, top: startY, width: 12, height: 5, borderRadius: 6, backgroundColor: '#A8C8E8', opacity, transform: [{ scaleX: scale }] }} />
  );
}

function GotaFrente({ x, delay }: { x: number; delay: number }) {
  const y       = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dur     = 1300;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.75, duration: 100,       useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.6,  duration: dur - 200, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,    duration: 100,       useNativeDriver: true }),
          ]),
          Animated.timing(y, { toValue: 210, duration: dur, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(y,       { toValue: -80, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: 'absolute', left: x, width: 2.5, height: 28, borderRadius: 2, backgroundColor: '#C8DFF0', opacity, transform: [{ translateY: y }, { skewX: '-20deg' }] }} />
  );
}

export function GotasLluvia() {
  const { leftOffset, transform } = useEfectoStyle();
  const fondo  = esDispositivoGamaBaja ? GOTAS_FONDO.filter((_, i) => i % 2 === 0) : GOTAS_FONDO;
  const frente = esDispositivoGamaBaja ? GOTAS_FRENTE.slice(0, 3) : GOTAS_FRENTE;
  return (
    <View style={{ position: 'absolute', left: leftOffset, top: 0, bottom: 0, width: OW, transform }}>
      {fondo.map((g, i)  => <GotaFondo   key={`f${i}`} x={g.x} delay={g.delay} />)}
      {frente.map((g, i) => <GotaFrente  key={`p${i}`} x={g.x} delay={g.delay} />)}
      {frente.map((g, i) => <SplashFrente key={`s${i}`} x={g.x + 1} startY={210} />)}
    </View>
  );
}

// ── Nieve ─────────────────────────────────────────────────────────────────────

const COPOS_GRANDE = [
  { x: 20,  delay: 0    }, { x: 110, delay: 800  }, { x: 200, delay: 1600 },
  { x: 60,  delay: 400  }, { x: 155, delay: 1200 },
];
const COPOS_MEDIO = [
  { x: 35,  delay: 200  }, { x: 88,  delay: 700  }, { x: 140, delay: 300  },
  { x: 185, delay: 1000 }, { x: 240, delay: 550  }, { x: 70,  delay: 1400 },
];
const COPOS_CHICO = [
  { x: 15,  delay: 100  }, { x: 55,  delay: 600  }, { x: 100, delay: 1100 },
  { x: 165, delay: 350  }, { x: 215, delay: 900  }, { x: 255, delay: 1500 },
  { x: 45,  delay: 1300 }, { x: 130, delay: 750  },
];

function UnCopo({ x, delay, size, op, dur }: { x: number; delay: number; size: number; op: number; dur: number }) {
  const y    = useRef(new Animated.Value(-40)).current;
  const dx   = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const drift = (x % 3 === 0 ? 12 : x % 3 === 1 ? -10 : 8);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(fade, { toValue: op,        duration: 200,       useNativeDriver: true }),
            Animated.timing(fade, { toValue: op * 0.7,  duration: dur - 400, useNativeDriver: true }),
            Animated.timing(fade, { toValue: 0,         duration: 200,       useNativeDriver: true }),
          ]),
          Animated.timing(y,  { toValue: 220, duration: dur,      useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(dx, { toValue: drift, duration: dur / 2, useNativeDriver: true }),
            Animated.timing(dx, { toValue: 0,     duration: dur / 2, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(y,    { toValue: -40, duration: 0, useNativeDriver: true }),
          Animated.timing(dx,   { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(fade, { toValue: 0,   duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: 'absolute', left: x, width: size, height: size, backgroundColor: '#E8F4FF', opacity: fade, transform: [{ translateY: y }, { translateX: dx }, { rotate: '45deg' }] }} />
  );
}

export function Nieve() {
  const { leftOffset, transform } = useEfectoStyle();
  const grande = esDispositivoGamaBaja ? COPOS_GRANDE.slice(0, 3) : COPOS_GRANDE;
  const medio  = esDispositivoGamaBaja ? COPOS_MEDIO.filter((_, i) => i % 2 === 0) : COPOS_MEDIO;
  const chico  = esDispositivoGamaBaja ? COPOS_CHICO.filter((_, i) => i % 2 === 0) : COPOS_CHICO;
  return (
    <View style={{ position: 'absolute', left: leftOffset, top: 0, bottom: 0, width: OW, transform }}>
      {grande.map((c, i) => <UnCopo key={`ng${i}`} {...c} size={10} op={0.7}  dur={3200} />)}
      {medio.map((c, i)  => <UnCopo key={`nm${i}`} {...c} size={7}  op={0.55} dur={2400} />)}
      {chico.map((c, i)  => <UnCopo key={`nc${i}`} {...c} size={4}  op={0.40} dur={1800} />)}
    </View>
  );
}

// ── Viento ────────────────────────────────────────────────────────────────────

const RAFAGAS = [
  { top: -30, ancho: 180, grosor: 2,   delay: 0,    dur: 1100, opMax: 0.45 },
  { top:  -5, ancho: 140, grosor: 1.5, delay: 200,  dur: 900,  opMax: 0.35 },
  { top:  20, ancho: 220, grosor: 2.5, delay: 500,  dur: 1300, opMax: 0.50 },
  { top:  45, ancho: 100, grosor: 1,   delay: 150,  dur: 800,  opMax: 0.28 },
  { top:  65, ancho: 160, grosor: 2,   delay: 700,  dur: 1000, opMax: 0.40 },
  { top:  85, ancho: 120, grosor: 1.5, delay: 350,  dur: 950,  opMax: 0.32 },
  { top: -18, ancho: 80,  grosor: 1,   delay: 900,  dur: 750,  opMax: 0.25 },
  { top:  35, ancho: 200, grosor: 3,   delay: 600,  dur: 1400, opMax: 0.55 },
  { top:  72, ancho: 90,  grosor: 1.5, delay: 1100, dur: 850,  opMax: 0.30 },
];

function UnaRafaga({ top, ancho, grosor, delay, dur, opMax }: typeof RAFAGAS[0]) {
  const x       = useRef(new Animated.Value(OW + 20)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(x, { toValue: -ancho - 20, duration: dur, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: opMax, duration: dur * 0.15, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: opMax, duration: dur * 0.70, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,     duration: dur * 0.15, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(x,       { toValue: OW + 20, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,        duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(300),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: 'absolute', top, left: 0, width: ancho, height: grosor, borderRadius: grosor, backgroundColor: '#B8CCD8', opacity, transform: [{ translateX: x }] }} />
  );
}

export function Viento() {
  const rafagas = esDispositivoGamaBaja ? RAFAGAS.filter((_, i) => i % 2 === 0) : RAFAGAS;
  return <>{rafagas.map((r, i) => <UnaRafaga key={i} {...r} />)}</>;
}

// ── Calor ─────────────────────────────────────────────────────────────────────

const PARTICULAS_CALOR = [
  { x: 30,  delay: 0    }, { x: 90,  delay: 500  }, { x: 150, delay: 1000 },
  { x: 210, delay: 300  }, { x: 60,  delay: 800  }, { x: 175, delay: 1400 },
];

function ParticulaCalor({ x, delay }: { x: number; delay: number }) {
  const y       = useRef(new Animated.Value(180)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.4)).current;
  const dx      = (x % 2 === 0 ? 8 : -8);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(y,  { toValue: 60,  duration: 2200, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.7, duration: 400,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.5, duration: 1400, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 400,  useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.0, duration: 400,  useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.6, duration: 1800, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(y,       { toValue: 180, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 0, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 0.4, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(600),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: 'absolute', left: x, width: 6, height: 6, backgroundColor: '#FF8C3388', opacity, transform: [{ translateY: y }, { translateX: dx }, { rotate: '45deg' }, { scale }] }} />
  );
}

function OndaCalorGeo({ delay, radio }: { delay: number; radio: number }) {
  const scaleX  = useRef(new Animated.Value(0.1)).current;
  const scaleY  = useRef(new Animated.Value(0.05)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scaleX,  { toValue: 1,    duration: 2400, useNativeDriver: true }),
          Animated.timing(scaleY,  { toValue: 0.35, duration: 2400, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.45, duration: 300,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.2,  duration: 1800, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,    duration: 300,  useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(scaleX,  { toValue: 0.1,  duration: 0, useNativeDriver: true }),
          Animated.timing(scaleY,  { toValue: 0.05, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,    duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(400),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: 'absolute', left: OW / 2 - radio, top: 160, width: radio * 2, height: radio * 2, borderRadius: radio, borderWidth: 2, borderColor: '#FF8C3366', opacity, transform: [{ scaleX }, { scaleY }] }} />
  );
}

export function CalorEfecto() {
  const { leftOffset, transform } = useEfectoStyle();
  const particulas = esDispositivoGamaBaja ? PARTICULAS_CALOR.filter((_, i) => i % 2 === 0) : PARTICULAS_CALOR;
  return (
    <View style={{ position: 'absolute', left: leftOffset, top: 0, bottom: 0, width: OW, transform }}>
      {particulas.map((p, i) => <ParticulaCalor key={i} {...p} />)}
      <OndaCalorGeo delay={0}   radio={60} />
      <OndaCalorGeo delay={800} radio={90} />
      {!esDispositivoGamaBaja && <OndaCalorGeo delay={1600} radio={45} />}
    </View>
  );
}

// ── Sol ───────────────────────────────────────────────────────────────────────

const RAYOS = Array.from({ length: 8 }, (_, i) => i);

export function Sol({ modoHorizontal = false }: { modoHorizontal?: boolean }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const rotacion = useRef(new Animated.Value(0)).current;
  const nucleoSc = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const a1 = Animated.loop(Animated.timing(rotacion, { toValue: 1, duration: 18000, useNativeDriver: true }));
    const a2 = Animated.loop(
      Animated.sequence([
        Animated.timing(nucleoSc, { toValue: 1.06, duration: 1800, useNativeDriver: true }),
        Animated.timing(nucleoSc, { toValue: 0.96, duration: 1800, useNativeDriver: true }),
      ])
    );
    a1.start(); a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, []);

  const rotate = rotacion.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const esHorizontalPantalla = modoHorizontal || screenW > screenH;
  const shortEdge = Math.min(screenW, screenH);
  const esTabletHorizontal = esHorizontalPantalla && shortEdge >= 700;
  const solStyle = esHorizontalPantalla
    ? [
        ss.solWrapHorizontal,
        esTabletHorizontal && ss.solWrapHorizontalTablet,
      ]
    : ss.solWrap;
  const solScale = esHorizontalPantalla ? (esTabletHorizontal ? 0.88 : 0.72) : 1;

  return (
    <View style={solStyle}>
      <Animated.View style={[ss.rayosWrap, { transform: [{ scale: solScale }, { rotate }] }]}>
        {RAYOS.map(i => (
          <View key={i} style={[ss.rayo, { transform: [{ rotate: `${i * 45}deg` }, { translateY: -42 }] }]} />
        ))}
      </Animated.View>
      <Animated.View style={[ss.nucleo, { transform: [{ scale: Animated.multiply(nucleoSc, solScale) }] }]} />
    </View>
  );
}

const ss = StyleSheet.create({
  solWrap:   { position: 'absolute', right: -10, top: -100, width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  solWrapHorizontal: { position: 'absolute', right: 32, top: 46, width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  solWrapHorizontalTablet: { right: 42, top: 54, width: 144, height: 144 },
  rayosWrap: { position: 'absolute', width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  rayo:      { position: 'absolute', width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 16, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#FFD700BB' },
  nucleo:    { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFD700' },
});

// ── Relámpagos ────────────────────────────────────────────────────────────────

export function Relampagos({ onRelampago }: { onRelampago?: () => void }) {
  const rayoOp   = useRef(new Animated.Value(0)).current;
  const rayoSc   = useRef(new Animated.Value(0.8)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef  = useRef<Animated.CompositeAnimation | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    function disparar() {
      if (!mountedRef.current) return;
      try { onRelampago?.(); } catch (e) { console.error('[RELAMPAGO-CB]', e); }
      animRef.current = Animated.sequence([
        Animated.parallel([
          Animated.timing(rayoOp, { toValue: 1,   duration: 60,  useNativeDriver: true }),
          Animated.timing(rayoSc, { toValue: 1,   duration: 60,  useNativeDriver: true }),
        ]),
        Animated.delay(160),
        Animated.timing(rayoOp, { toValue: 0.7, duration: 50,  useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(rayoOp, { toValue: 0,   duration: 200, useNativeDriver: true }),
          Animated.timing(rayoSc, { toValue: 0.8, duration: 200, useNativeDriver: true }),
        ]),
      ]);
      animRef.current.start(({ finished }) => {
        if (finished && mountedRef.current) {
          timerRef.current = setTimeout(disparar, 8000 + Math.random() * 12000);
        }
      });
    }
    timerRef.current = setTimeout(disparar, 2000 + Math.random() * 4000);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      animRef.current?.stop();
    };
  }, []);

  return (
    <Animated.View style={[sr.rayoWrap, { opacity: rayoOp, transform: [{ scaleY: rayoSc }] }]}>
      <View style={[sr.segmento, { top: 0,  left: OW / 2 - 6,  width: 6, height: 22, transform: [{ rotate: '15deg'  }] }]} />
      <View style={[sr.segmento, { top: 20, left: OW / 2 - 16, width: 6, height: 26, transform: [{ rotate: '-20deg' }] }]} />
      <View style={[sr.segmento, { top: 42, left: OW / 2 - 4,  width: 5, height: 22, transform: [{ rotate: '18deg'  }] }]} />
      <View style={[sr.segmento, { top: 60, left: OW / 2 - 12, width: 4, height: 16, transform: [{ rotate: '-15deg' }] }]} />
    </Animated.View>
  );
}

const sr = StyleSheet.create({
  rayoWrap: { position: 'absolute', top: -60, left: 0, right: 0, height: 160 },
  segmento: { position: 'absolute', borderRadius: 2, backgroundColor: '#FFE44D' },
});

// ── Nubes ─────────────────────────────────────────────────────────────────────

const NUBES_FONDO  = [
  { w: 180, h: 48, top: -30, startX: -40,  dur: 14000, delay: 0    },
  { w: 140, h: 38, top:  10, startX: 160,  dur: 16000, delay: 3000 },
  { w: 160, h: 44, top: -10, startX: -100, dur: 18000, delay: 7000 },
];
const NUBES_MEDIO  = [
  { w: 120, h: 34, top:  20, startX: -60,  dur: 10000, delay: 0    },
  { w: 100, h: 28, top:   5, startX: 180,  dur: 12000, delay: 4000 },
  { w: 130, h: 36, top:  30, startX: -20,  dur: 11000, delay: 8000 },
];
const NUBES_FRENTE = [
  { w: 80,  h: 24, top:  35, startX: -30,  dur: 7000,  delay: 0    },
  { w: 70,  h: 20, top:  15, startX: 200,  dur: 8000,  delay: 2500 },
  { w: 90,  h: 26, top:  45, startX: 100,  dur: 6500,  delay: 5500 },
];

function UnaNube({ w, h, top, startX, dur, delay, opacity: op, borderRadius: br, topOffset = 0, leftOffset = 0, scale = 1 }: {
  w: number; h: number; top: number; startX: number;
  dur: number; delay: number; opacity: number; borderRadius: number; topOffset?: number; leftOffset?: number; scale?: number;
}) {
  const x = useRef(new Animated.Value(startX)).current;
  const ANCHO = OW + 80;

  useEffect(() => {
    const haciaIzq = startX > OW / 2;
    const destino  = haciaIzq ? -w - 20 : ANCHO;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(x, { toValue: destino, duration: dur, useNativeDriver: true }),
        Animated.timing(x, { toValue: startX,  duration: 0,   useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: 'absolute', top: top + topOffset, left: leftOffset, width: w, height: h, borderRadius: br, backgroundColor: '#C8D8E8', opacity: op, transform: [{ translateX: x }, { scale }] }} />
  );
}

export function Nubes() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const esHorizontal = screenW > screenH;
  const shortEdge = Math.min(screenW, screenH);
  const esTabletHorizontal = esHorizontal && shortEdge >= 700;
  const cloudScale = esHorizontal ? (shortEdge >= 700 ? 1.45 : 1.15) : 1;
  const cloudTopOffset = esHorizontal ? Math.max(58, Math.round(screenH * 0.16)) : 0;
  const cloudLeftOffset = esHorizontal
    ? Math.round(Math.min(screenW * (esTabletHorizontal ? 0.60 : 0.46), esTabletHorizontal ? 312 : 240))
    : 0;

  return (
    <>
      {NUBES_FONDO.map((n, i)  => <UnaNube key={`nb${i}`} {...n} opacity={0.18} borderRadius={n.h / 2} topOffset={cloudTopOffset} leftOffset={cloudLeftOffset} scale={cloudScale} />)}
      {NUBES_MEDIO.map((n, i)  => <UnaNube key={`nm${i}`} {...n} opacity={0.28} borderRadius={n.h / 2} topOffset={cloudTopOffset} leftOffset={cloudLeftOffset} scale={cloudScale} />)}
      {NUBES_FRENTE.map((n, i) => <UnaNube key={`nf${i}`} {...n} opacity={0.40} borderRadius={n.h / 2} topOffset={cloudTopOffset} leftOffset={cloudLeftOffset} scale={cloudScale} />)}
    </>
  );
}
