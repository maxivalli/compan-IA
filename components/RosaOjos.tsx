import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';

export type Expresion = 'neutral' | 'feliz' | 'triste' | 'sorprendida' | 'pensativa' | 'chiste' | 'enojada' | 'avergonzada' | 'cansada' | 'bostezando' | 'mimada';
type Estado = 'esperando' | 'escuchando' | 'pensando' | 'hablando';

export const BG = '#0D0D14';

const EYE_W = 108;
const EYE_H = 126;
const IRIS   = 68;
const PUPIL  = 34;
const MAX    = 14;

const EXPR: Record<Expresion, { pxL: number; pxR: number; py: number; upper: number; lower: number; ceno: number; gapOffset: number }> = {
  neutral:     { pxL: 0,   pxR: 0,   py: 0,   upper: EYE_H * 0.06, lower: 0,            ceno: 0,            gapOffset: 0  },
  feliz:       { pxL: 0,   pxR: 0,   py: -4,  upper: EYE_H * 0.30, lower: EYE_H * 0.20, ceno: 0,            gapOffset: 0  },
  triste:      { pxL: 5,   pxR: -5,  py: 7,   upper: EYE_H * 0.28, lower: 0,            ceno: 0,            gapOffset: 0  },
  sorprendida: { pxL: 0,   pxR: 0,   py: -7,  upper: 0,             lower: 0,            ceno: 0,            gapOffset: 8  },
  pensativa:   { pxL: -6,  pxR: -6,  py: -9,  upper: EYE_H * 0.12, lower: 0,            ceno: 0,            gapOffset: -4 },
  chiste:      { pxL: 0,   pxR: 0,   py: 4,   upper: EYE_H * 0.48, lower: EYE_H * 0.32, ceno: 0,            gapOffset: 0  },
  enojada:     { pxL: -3,  pxR: 3,   py: 5,   upper: EYE_H * 0.15, lower: 0,            ceno: EYE_H * 0.28, gapOffset: -6 },
  avergonzada: { pxL: 3,   pxR: -3,  py: 14,  upper: EYE_H * 0.38, lower: 0,            ceno: EYE_H * 0.08, gapOffset: 0  },
  cansada:     { pxL: 0,   pxR: 0,   py: 4,   upper: EYE_H * 0.42, lower: EYE_H * 0.06, ceno: 0,            gapOffset: 0  },
  bostezando:  { pxL: 0,   pxR: 0,   py: 10,  upper: EYE_H * 0.56, lower: EYE_H * 0.12, ceno: 0,            gapOffset: 0  },
  mimada:      { pxL: 0,   pxR: 0,   py: -4,  upper: EYE_H * 0.38, lower: EYE_H * 0.24, ceno: 0,            gapOffset: 0  },
};

// ── Boca ─────────────────────────────────────────────────────────────────────

function Boca({ hablando, expresion, silbando }: { hablando: boolean; expresion: Expresion; silbando: boolean }) {
  const height  = useRef(new Animated.Value(14)).current;
  const width   = useRef(new Animated.Value(86)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loopRef.current?.stop();
    loopRef.current = null;

    // Silbido: círculo que pulsa suavemente — solo si no está hablando
    if (silbando && !hablando) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(height, { toValue: 14, duration: 500, useNativeDriver: false }),
            Animated.timing(width,  { toValue: 14, duration: 500, useNativeDriver: false }),
          ]),
          Animated.parallel([
            Animated.timing(height, { toValue: 26, duration: 500, useNativeDriver: false }),
            Animated.timing(width,  { toValue: 26, duration: 500, useNativeDriver: false }),
          ]),
        ])
      );
      loopRef.current = loop;
      Animated.parallel([
        Animated.timing(height, { toValue: 22, duration: 300, useNativeDriver: false }),
        Animated.timing(width,  { toValue: 22, duration: 300, useNativeDriver: false }),
      ]).start(() => loop.start());
      return;
    }

    if (expresion === 'bostezando' && !hablando && !silbando) {
      // Abrir boca lentamente, sostener, cerrar sola
      Animated.sequence([
        Animated.parallel([
          Animated.timing(height, { toValue: 52, duration: 800, useNativeDriver: false }),
          Animated.timing(width,  { toValue: 54, duration: 800, useNativeDriver: false }),
        ]),
        Animated.delay(1000),
        Animated.parallel([
          Animated.timing(height, { toValue: 14, duration: 700, useNativeDriver: false }),
          Animated.timing(width,  { toValue: 86, duration: 700, useNativeDriver: false }),
        ]),
      ]).start();
      return;
    }

    if (hablando) {
      // Mientras habla, estrechamos la boca un poco para que parezca que vocaliza
      Animated.timing(width, { toValue: 60, duration: 150, useNativeDriver: false }).start();
      
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(height, { toValue: 22, duration: 220, useNativeDriver: false }),
          Animated.timing(height, { toValue: 4,  duration: 200, useNativeDriver: false }),
        ])
      );
      loopRef.current.start();
    } else {
      const reposoHeight =
        expresion === 'sorprendida' ? 20 :
        expresion === 'feliz' || expresion === 'chiste' || expresion === 'mimada' ? 10 :
        expresion === 'enojada' ? 3 :
        expresion === 'cansada' ? 8 :
        expresion === 'neutral' ? 14 : 5; 
        
      // Hacemos el neutral más ancho (86), feliz un poco ancho (76), el resto normal (64)
      const reposoWidth = 
        expresion === 'neutral' ? 86 : 
        expresion === 'feliz' || expresion === 'chiste' || expresion === 'mimada' ? 76 : 64;

      Animated.parallel([
        Animated.timing(height, { toValue: reposoHeight, duration: 350, useNativeDriver: false }),
        Animated.timing(width,  { toValue: reposoWidth,  duration: 350, useNativeDriver: false }),
      ]).start();
    }
    return () => { loopRef.current?.stop(); };
  }, [hablando, expresion, silbando]);

  const esCurvaNeutral = expresion === 'neutral' && !hablando && !silbando;

  const forma = (silbando && !hablando)
    ? { borderTopLeftRadius: 50, borderTopRightRadius: 50, borderBottomLeftRadius: 50, borderBottomRightRadius: 50 }
    :
    expresion === 'feliz' || expresion === 'chiste' || expresion === 'mimada'
      ? { borderTopLeftRadius: 3,  borderTopRightRadius: 3,  borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }
      : expresion === 'triste' || expresion === 'enojada'
      ? { borderTopLeftRadius: 32, borderTopRightRadius: 32, borderBottomLeftRadius: 3,  borderBottomRightRadius: 3  }
      : expresion === 'bostezando'
      ? { borderTopLeftRadius: 50, borderTopRightRadius: 50, borderBottomLeftRadius: 50, borderBottomRightRadius: 50 }
      : expresion === 'sorprendida'
      ? { borderTopLeftRadius: 48, borderTopRightRadius: 48, borderBottomLeftRadius: 2,  borderBottomRightRadius: 2  }
      : expresion === 'neutral'
      ? { borderBottomLeftRadius: 42, borderBottomRightRadius: 42, borderTopLeftRadius: 0, borderTopRightRadius: 0 } // <-- Aumentamos el radio para que acompañe el nuevo ancho
      : { borderTopLeftRadius: 2, borderTopRightRadius: 2, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 };

  return (
    <Animated.View style={[
      sb.boca,
      forma,
      { height, width }, // <-- Aplicamos el ancho dinámico aquí
      esCurvaNeutral && {
        backgroundColor: 'transparent',
        borderBottomWidth: 3,           
        borderLeftWidth: 1.5,           
        borderRightWidth: 1.5,
        borderColor: '#B06050',
      }
    ]} />
  );
}

const sb = StyleSheet.create({
  boca: {
    width: 64,
    backgroundColor: '#B06050',
    marginTop: 80,
  },
});

// ── Cremallera (modo no molestar) ────────────────────────────────────────────
// Cremallera con dientes en X, tope izquierdo y pestillo con tirador colgante.
// Color gris #9E9E9E. Animación de entrada con spring desde el centro.

const GRIS = '#9E9E9E';
const GRIS_OSC = '#757575';
const CR_W = 100;   // ancho total cremallera
const CR_H = 16;    // alto de los dientes
const N_DIENTES = 9;

function Cremallera() {
  const scaleX  = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // Tirador: oscila suavemente hacia abajo
  const tiraY   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrada
    Animated.parallel([
      Animated.spring(scaleX,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    // Tirador oscila
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(tiraY, { toValue: 3,  duration: 1200, useNativeDriver: true }),
        Animated.timing(tiraY, { toValue: -1, duration: 1200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const dienteW  = CR_W / N_DIENTES; // ocupa todo el ancho

  return (
    <Animated.View style={[sc.wrap, { opacity, transform: [{ scaleX }] }]}>

      {/* ── Tope izquierdo ── */}
      <View style={sc.topeIzq} />

      {/* ── Cuerpo de dientes entrelazados ── */}
      {/* Pares bajan desde arriba al centro, impares suben desde abajo al centro */}
      <View style={sc.cuerpo}>
        {Array.from({ length: N_DIENTES * 2 }, (_, i) => {
          const esArriba = i % 2 === 0;
          const idx = Math.floor(i / 2);
          const x = idx * dienteW + (esArriba ? 0 : dienteW / 2);
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: esArriba ? 0 : CR_H / 2,
                width: dienteW - 2,
                height: CR_H / 2,
                borderRadius: 2,
                backgroundColor: GRIS,
              }}
            />
          );
        })}
      </View>

      {/* ── Pestillo (cuerpo del cursor) ── */}
      <View style={sc.pestilloCuerpo}>
        {/* Óvalo del cursor */}
        <View style={sc.pestilloOvalo} />
        {/* Tirador colgante */}
        <Animated.View style={[sc.tiradorWrap, { transform: [{ translateY: tiraY }] }]}>
          <View style={sc.tiradorBarra} />
          <View style={sc.tiradorCuerpo} />
          <View style={sc.tiradorVentana} />
        </Animated.View>
      </View>

    </Animated.View>
  );
}

const sc = StyleSheet.create({
  wrap: {
    width: CR_W + 36, // espacio para pestillo
    height: 60,
    marginTop: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Tope izquierdo — rectángulo redondeado pequeño
  topeIzq: {
    width: 10, height: CR_H + 4,
    borderRadius: 3,
    backgroundColor: GRIS_OSC,
    marginRight: 2,
  },

  // Cuerpo con dientes
  cuerpo: {
    width: CR_W, height: CR_H,
    backgroundColor: GRIS + '33',
    borderRadius: 2,
    overflow: 'visible',
  },





  // Pestillo — agrupa el óvalo y el tirador
  pestilloCuerpo: {
    marginLeft: 2,
    alignItems: 'center',
    marginTop: 28,
  },

  pestilloOvalo: {
    width: 22, height: CR_H + 8,
    borderRadius: 11,
    backgroundColor: GRIS,
  },

  tiradorWrap: {
    alignItems: 'center',
    marginTop: 2,
  },

  tiradorBarra: {
    width: 3, height: 8,
    backgroundColor: GRIS_OSC,
    borderRadius: 1,
  },

  tiradorCuerpo: {
    width: 18, height: 26,
    borderRadius: 4,
    backgroundColor: GRIS,
  },

  tiradorVentana: {
    position: 'absolute',
    bottom: 5,
    width: 10, height: 8,
    borderRadius: 2,
    backgroundColor: '#fff',
    opacity: 0.4,
  },
});

// ── Ojo ──────────────────────────────────────────────────────────────────────

function Ojo({
  pxAnim, pyAnim, upperLid, lowerLid, blinkLid, cenoLid, cenoExpr, scaleY, offsetX, lidBg,
}: {
  pxAnim:   Animated.Value;
  pyAnim:   Animated.Value;
  upperLid: Animated.Value;
  lowerLid: Animated.Value;
  blinkLid: Animated.Value;
  cenoLid:  Animated.Value;
  cenoExpr: Animated.Value;
  scaleY:   Animated.Value;
  offsetX:  Animated.Value;
  lidBg:    string;
}) {
  const totalUpper = Animated.add(Animated.add(Animated.add(upperLid, blinkLid), cenoLid), cenoExpr);

  return (
    <Animated.View style={[s.eyeWhite, { transform: [{ scaleY }, { translateX: offsetX }] }]}>
      <View style={s.iris}>
        <Animated.View style={[s.pupil, { transform: [{ translateX: pxAnim }, { translateY: pyAnim }] }]}>
          <View style={s.reflect1} />
          <View style={s.reflect2} />
        </Animated.View>
      </View>
      <Animated.View style={[s.lid, s.lidTop,    { height: totalUpper, backgroundColor: lidBg }]} />
      <Animated.View style={[s.lid, s.lidBottom, { height: lowerLid,   backgroundColor: lidBg }]} />
    </Animated.View>
  );
}

// ── Principal ─────────────────────────────────────────────────────────────────

export type ModoNoche = 'despierta' | 'soñolienta' | 'durmiendo';

const FACE_W = EYE_W * 2 + 32;
const FACE_H = EYE_H + 120;

export default function RosaOjos({
  estado, expresion, modoNoche = 'despierta', bgColor = BG, silbando = false, noMolestar = false, onOjoPicado, scale = 1,
}: {
  estado: Estado;
  expresion: Expresion;
  modoNoche?: ModoNoche;
  bgColor?: string;
  silbando?: boolean;
  noMolestar?: boolean;
  onOjoPicado?: () => void;
  scale?: number;
}) {
  const pxL      = useRef(new Animated.Value(0)).current;
  const pxR      = useRef(new Animated.Value(0)).current;
  const py       = useRef(new Animated.Value(0)).current;
  const upperLid = useRef(new Animated.Value(EYE_H * 0.06)).current;
  const lowerLid = useRef(new Animated.Value(0)).current;
  const blinkLid = useRef(new Animated.Value(0)).current;
  const cenoLid  = useRef(new Animated.Value(0)).current;
  const cenoExpr = useRef(new Animated.Value(0)).current;
  const scaleY   = useRef(new Animated.Value(1)).current;
  const eyeGapL  = useRef(new Animated.Value(0)).current;
  const eyeGapR  = useRef(new Animated.Value(0)).current;

  const expresionRef  = useRef<Expresion>('neutral');
  const running       = useRef(true);
  const timer         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkTmr      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breathingAnim = useRef<Animated.CompositeAnimation | null>(null);

  // ── Modo noche ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (modoNoche === 'durmiendo') {
      if (timer.current)    clearTimeout(timer.current);
      if (blinkTmr.current) clearTimeout(blinkTmr.current);
      breathingAnim.current?.stop();
      running.current = false;
      Animated.timing(upperLid, { toValue: EYE_H, duration: 1800, useNativeDriver: false }).start();
      Animated.parallel([
        Animated.timing(scaleY,  { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pxL,     { toValue: 0, duration: 800,  useNativeDriver: true }),
        Animated.timing(pxR,     { toValue: 0, duration: 800,  useNativeDriver: true }),
        Animated.timing(py,      { toValue: 4, duration: 800,  useNativeDriver: true }),
        Animated.timing(eyeGapL, { toValue: 0, duration: 800,  useNativeDriver: true }),
        Animated.timing(eyeGapR, { toValue: 0, duration: 800,  useNativeDriver: true }),
      ]).start();
    } else if (modoNoche === 'soñolienta') {
      Animated.parallel([
        Animated.timing(upperLid, { toValue: EYE_H * 0.55, duration: 1200, useNativeDriver: false }),
        Animated.timing(lowerLid, { toValue: EYE_H * 0.10, duration: 1200, useNativeDriver: false }),
        Animated.timing(cenoExpr, { toValue: 0,             duration: 1200, useNativeDriver: false }),
      ]).start();
      Animated.parallel([
        Animated.timing(scaleY,  { toValue: 0.45, duration: 1200, useNativeDriver: true }),
        Animated.timing(py,      { toValue: 4,    duration: 800,  useNativeDriver: true }),
        Animated.timing(eyeGapL, { toValue: 0,    duration: 800,  useNativeDriver: true }),
        Animated.timing(eyeGapR, { toValue: 0,    duration: 800,  useNativeDriver: true }),
      ]).start();
    } else {
      const c = EXPR[expresionRef.current];
      Animated.parallel([
        Animated.timing(upperLid, { toValue: c.upper, duration: 1200, useNativeDriver: false }),
        Animated.timing(lowerLid, { toValue: c.lower, duration: 1200, useNativeDriver: false }),
        Animated.timing(cenoExpr, { toValue: c.ceno,  duration: 1200, useNativeDriver: false }),
      ]).start();
      Animated.parallel([
        Animated.timing(scaleY,  { toValue: 1,            duration: 1200, useNativeDriver: true }),
        Animated.timing(eyeGapL, { toValue: -c.gapOffset, duration: 1200, useNativeDriver: true }),
        Animated.timing(eyeGapR, { toValue:  c.gapOffset, duration: 1200, useNativeDriver: true }),
      ]).start();
    }
  }, [modoNoche]);

  // ── No molestar: ojos entornados + mirada distraída de lado a lado ───────────
  useEffect(() => {
    if (noMolestar) {
      // Entornar párpados
      Animated.parallel([
        Animated.timing(upperLid, { toValue: EYE_H * 0.38, duration: 400, useNativeDriver: false }),
        Animated.timing(cenoLid,  { toValue: EYE_H * 0.10, duration: 400, useNativeDriver: false }),
      ]).start();
      // Iris arriba + movimiento lateral lento — efecto "ojos en blanco" distraído
      const loopMirada = Animated.loop(
        Animated.sequence([
          // Subir el iris hacia arriba primero
          Animated.parallel([
            Animated.timing(py,  { toValue: -MAX * 1.1, duration: 400, useNativeDriver: true }),
            Animated.timing(pxL, { toValue:  MAX * 0.7, duration: 400, useNativeDriver: true }),
            Animated.timing(pxR, { toValue:  MAX * 0.7, duration: 400, useNativeDriver: true }),
          ]),
          Animated.delay(500),
          // Ir al otro lado
          Animated.parallel([
            Animated.timing(pxL, { toValue: -MAX * 0.7, duration: 2000, useNativeDriver: true }),
            Animated.timing(pxR, { toValue: -MAX * 0.7, duration: 2000, useNativeDriver: true }),
          ]),
          Animated.delay(500),
          // Volver al centro un momento
          Animated.parallel([
            Animated.timing(pxL, { toValue: 0, duration: 800, useNativeDriver: true }),
            Animated.timing(pxR, { toValue: 0, duration: 800, useNativeDriver: true }),
          ]),
          Animated.delay(400),
        ])
      );
      loopMirada.start();
      return () => {
        loopMirada.stop();
        // Restaurar al salir del modo
        const c = EXPR[expresionRef.current];
        Animated.parallel([
          Animated.timing(upperLid, { toValue: c.upper, duration: 400, useNativeDriver: false }),
          Animated.timing(cenoLid,  { toValue: 0,       duration: 400, useNativeDriver: false }),
          Animated.timing(pxL,      { toValue: c.pxL,   duration: 400, useNativeDriver: true }),
          Animated.timing(pxR,      { toValue: c.pxR,   duration: 400, useNativeDriver: true }),
          Animated.timing(py,       { toValue: c.py,     duration: 400, useNativeDriver: true }),
        ]).start();
      };
    }
  }, [noMolestar]);

  // ── Expresión: párpados + ceño + gap ─────────────────────────────────────────
  useEffect(() => {
    if (modoNoche !== 'despierta') return;
    expresionRef.current = expresion;
    const c = EXPR[expresion];
    Animated.parallel([
      Animated.timing(upperLid, { toValue: c.upper, duration: 420, useNativeDriver: false }),
      Animated.timing(lowerLid, { toValue: c.lower, duration: 420, useNativeDriver: false }),
      Animated.timing(cenoExpr, { toValue: c.ceno,  duration: 420, useNativeDriver: false }),
    ]).start();
    Animated.parallel([
      Animated.timing(eyeGapL, { toValue: -c.gapOffset, duration: 420, useNativeDriver: true }),
      Animated.timing(eyeGapR, { toValue:  c.gapOffset, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [expresion]);

  // ── Estado: movimiento de pupila + efectos especiales ──────────────────────
  useEffect(() => {
    if (modoNoche === 'durmiendo') return;
    running.current = true;
    breathingAnim.current?.stop();
    if (timer.current)    clearTimeout(timer.current);
    if (blinkTmr.current) clearTimeout(blinkTmr.current);

    function mover(dx: number, dy: number, dur = 600) {
      const c = EXPR[expresionRef.current];
      Animated.parallel([
        Animated.timing(pxL, { toValue: c.pxL + dx, duration: dur, useNativeDriver: true }),
        Animated.timing(pxR, { toValue: c.pxR + dx, duration: dur, useNativeDriver: true }),
        Animated.timing(py,  { toValue: c.py  + dy, duration: dur, useNativeDriver: true }),
      ]).start();
    }

    function parpadear(doble = false) {
      const seq = [
        Animated.timing(blinkLid, { toValue: EYE_H, duration: 65, useNativeDriver: false }),
        Animated.timing(blinkLid, { toValue: 0,     duration: 90, useNativeDriver: false }),
      ];
      if (doble) {
        seq.push(
          Animated.delay(90),
          Animated.timing(blinkLid, { toValue: EYE_H, duration: 60, useNativeDriver: false }),
          Animated.timing(blinkLid, { toValue: 0,     duration: 80, useNativeDriver: false }),
        );
      }
      Animated.sequence(seq).start();
    }

    function programarParpadeo(rapido = false) {
      if (!running.current) return;
      const minMs = rapido ? 700  : 2500;
      const maxMs = rapido ? 1600 : 4000;
      const delay = minMs + Math.random() * (maxMs - minMs);
      blinkTmr.current = setTimeout(() => {
        if (!running.current) return;
        parpadear(Math.random() < 0.25);
        programarParpadeo(rapido);
      }, delay);
    }

    function loopEsperando() {
      if (!running.current) return;
      const micro = Math.random() < 0.4;
      const dx = micro ? (Math.random() - 0.5) * MAX * 0.5 : (Math.random() - 0.5) * 2 * MAX;
      const dy = micro ? (Math.random() - 0.5) * MAX * 0.3 : (Math.random() - 0.5) * MAX * 0.7;
      const dur    = micro ? 400 + Math.random() * 200 : 700 + Math.random() * 400;
      const espera = micro ? 800 + Math.random() * 800 : 2000 + Math.random() * 2500;
      mover(dx, dy, dur);
      timer.current = setTimeout(loopEsperando, espera);
    }

    function loopEscuchando() {
      if (!running.current) return;
      const dx = (Math.random() - 0.5) * MAX * 0.9;
      const dy = -4 + (Math.random() - 0.5) * 4;
      mover(dx, dy, 350 + Math.random() * 200);
      timer.current = setTimeout(loopEscuchando, 500 + Math.random() * 700);
    }

    function loopPensando() {
      if (!running.current) return;
      const poses: [number, number][] = [
        [-MAX * 0.8, -MAX * 0.9],
        [MAX * 0.4,  -MAX * 0.7],
        [-MAX * 0.2, -MAX * 0.5],
        [MAX * 0.7,  -MAX * 0.9],
        [0,          -MAX * 0.6],
      ];
      let i = 0;
      function sig() {
        if (!running.current) return;
        const [dx, dy] = poses[i++ % poses.length];
        mover(dx, dy, 550 + Math.random() * 150);
        timer.current = setTimeout(sig, 900 + Math.random() * 200);
      }
      sig();
    }

    function loopHablando() {
      if (!running.current) return;
      const dx = (Math.random() - 0.5) * MAX * 1.4;
      const dy = (Math.random() - 0.5) * MAX * 0.6;
      mover(dx, dy, 180 + Math.random() * 120);
      timer.current = setTimeout(loopHablando, 280 + Math.random() * 180);
    }

    // Ceño por estado (pensando)
    Animated.timing(cenoLid, {
      toValue: estado === 'pensando' ? EYE_H * 0.22 : 0,
      duration: 400,
      useNativeDriver: false,
    }).start();

    // Respiración suave cuando esperando
    if (estado === 'esperando' && modoNoche === 'despierta') {
      breathingAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleY, { toValue: 1.025, duration: 2800, useNativeDriver: true }),
          Animated.timing(scaleY, { toValue: 0.975, duration: 2800, useNativeDriver: true }),
        ])
      );
      breathingAnim.current.start();
    } else if (modoNoche === 'despierta') {
      Animated.timing(scaleY, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }

    if      (estado === 'esperando')  { loopEsperando();  programarParpadeo(false); }
    else if (estado === 'escuchando') { loopEscuchando(); programarParpadeo(true);  }
    else if (estado === 'pensando')   { loopPensando(); }
    else if (estado === 'hablando')   { loopHablando();   programarParpadeo(false); }

    return () => {
      running.current = false;
      breathingAnim.current?.stop();
      if (timer.current)    clearTimeout(timer.current);
      if (blinkTmr.current) clearTimeout(blinkTmr.current);
    };
  }, [estado, modoNoche]);

  function picarOjo(_lado: 'L' | 'R') {
    // Parpadeo rápido del ojo tocado — usa blinkLid compartido
    const lid = blinkLid;
    Animated.sequence([
      Animated.timing(lid, { toValue: EYE_H, duration: 40,  useNativeDriver: false }),
      Animated.timing(lid, { toValue: 0,     duration: 40,  useNativeDriver: false }),
      Animated.timing(lid, { toValue: EYE_H, duration: 40,  useNativeDriver: false }),
      Animated.timing(lid, { toValue: 0,     duration: 60,  useNativeDriver: false }),
    ]).start();
    // Avisar al padre para cambiar expresión
    onOjoPicado?.();
  }

  return (
    <View style={{ width: FACE_W * scale, height: FACE_H * scale, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
      <View style={[s.wrap, scale !== 1 && { transform: [{ scale }] }]}>
        <View style={s.contenedor}>
          <TouchableOpacity onPress={() => picarOjo('L')} activeOpacity={1}>
            <Ojo pxAnim={pxL} pyAnim={py} upperLid={upperLid} lowerLid={lowerLid} blinkLid={blinkLid} cenoLid={cenoLid} cenoExpr={cenoExpr} scaleY={scaleY} offsetX={eyeGapL} lidBg={bgColor}/>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => picarOjo('R')} activeOpacity={1}>
            <Ojo pxAnim={pxR} pyAnim={py} upperLid={upperLid} lowerLid={lowerLid} blinkLid={blinkLid} cenoLid={cenoLid} cenoExpr={cenoExpr} scaleY={scaleY} offsetX={eyeGapR} lidBg={bgColor}/>
          </TouchableOpacity>
        </View>
        {noMolestar && estado === 'esperando' ? <Cremallera /> : <Boca hablando={estado === 'hablando'} expresion={expresion} silbando={silbando} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { alignItems: 'center', height: EYE_H + 120 },
  contenedor: { flexDirection: 'row', gap: 32, alignItems: 'flex-end' },
  eyeWhite: {
    width: EYE_W, height: EYE_H,
    borderTopLeftRadius: EYE_W / 2, borderTopRightRadius: EYE_W / 2,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    backgroundColor: '#EDE8DF',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  iris: {
    width: IRIS, height: IRIS, borderRadius: IRIS / 2,
    backgroundColor: '#4B7FB5',
    alignItems: 'center', justifyContent: 'center',
  },
  pupil: {
    width: PUPIL, height: PUPIL, borderRadius: PUPIL / 2,
    backgroundColor: '#1A3A5C',
  },
  reflect1: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', top: 5,    left: 5  },
  reflect2: { position: 'absolute', width: 5,  height: 5,  borderRadius: 3, backgroundColor: '#fff', bottom: 5, right: 4 },
  lid:       { position: 'absolute', left: 0, right: 0 },
  lidTop:    { top: 0 },
  lidBottom: { bottom: 0 },
});