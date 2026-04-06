import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  Path,
  RadialGradient,
  Rect,
  Stop,
  G,
} from 'react-native-svg';

const AnimatedCircle  = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedRect    = Animated.createAnimatedComponent(Rect);
const AnimatedPath    = Animated.createAnimatedComponent(Path);

export type Expresion = 'neutral' | 'feliz' | 'triste' | 'sorprendida' | 'pensativa' | 'chiste' | 'enojada' | 'avergonzada' | 'cansada' | 'bostezando' | 'mimada' | 'ternura' | 'preocupada' | 'entusiasmada';
type Estado = 'esperando' | 'escuchando' | 'pensando' | 'hablando';

export const BG = '#0D0D14';

export const EYE_W = 124;  // 108 * 1.15
export const EYE_H = 159;  // 138 * 1.15
export const GAP   = 32;
export const OW    = 20 + EYE_W * 2 + GAP + 20; // 318
const IRIS   = 78;  // 68  * 1.15
const PUPIL  = 39;  // 34  * 1.15
const MAX    = 14;

// Centro del iris dentro del SVG — lo bajamos para que quede en la zona ancha del huevo
const CX = EYE_W / 2;        // 54
const CY = EYE_H * 0.58;     // ~80 — iris centrado en mitad baja

/**
 * Silueta del ojo (path SVG con curvas cúbicas, simétrico en X).
 * Valores en fracción de EYE_W / EYE_H salvo puntaSuperiorY y bordeInferior (px).
 *
 * - puntaSuperiorY ↑ → menos “picudo” arriba
 * - bulgeLateralX ↑ → ojo más ancho en el centro
 * - anclaMediaY / anclaBajaY → dónde “abulta” el costado
 */
const EYE_SILUETA = {
  puntaSuperiorY: 6,
  bordeInferior: 5,
  hombroSuperiorX: 0.85,
  bulgeLateralX: 1.055,
  anclaMediaY: 0.37,
  anclaBajaX: 1.0,
  anclaBajaY: 0.635,
  curvaHaciaPuntaX: 0.98,
  curvaHaciaPuntaY: 0.88,
  esquinaInferiorInteriorX: 0.78,
  /** Control X hacia el borde izquierdo (no es espejo del lado derecho). */
  curvaInteriorBajaIzqX: 0.02,
  curvaExteriorIzqX: -0.04,
  vueltaAlCentroIzqX: 0.16,
} as const;

function pathFormaOjoSvg(): string {
  const W = EYE_W;
  const H = EYE_H;
  const s = EYE_SILUETA;
  const top = s.puntaSuperiorY;
  const bot = H - s.bordeInferior;
  return `
    M ${W / 2}, ${top}
    C ${W * s.hombroSuperiorX}, ${top}
      ${W * s.bulgeLateralX}, ${H * s.anclaMediaY}
      ${W * s.anclaBajaX}, ${H * s.anclaBajaY}
    C ${W * s.curvaHaciaPuntaX}, ${H * s.curvaHaciaPuntaY}
      ${W * s.esquinaInferiorInteriorX}, ${bot}
      ${W / 2}, ${bot}
    C ${W * (1 - s.esquinaInferiorInteriorX)}, ${bot}
      ${W * s.curvaInteriorBajaIzqX}, ${H * s.curvaHaciaPuntaY}
      ${0}, ${H * s.anclaBajaY}
    C ${W * s.curvaExteriorIzqX}, ${H * s.anclaMediaY}
      ${W * s.vueltaAlCentroIzqX}, ${top}
      ${W / 2}, ${top}
    Z
  `;
}

const EXPR: Record<Expresion, { pxL: number; pxR: number; py: number; upper: number; lower: number; ceno: number; gapOffset: number }> = {
  neutral:      { pxL: 0,   pxR: 0,   py: 0,   upper: EYE_H * 0.06, lower: 0,            ceno: 0,            gapOffset: 0  },
  feliz:        { pxL: 0,   pxR: 0,   py: -6,  upper: EYE_H * 0.14, lower: EYE_H * 0.20, ceno: 0,            gapOffset: 4  },
  ternura:      { pxL: 0,   pxR: 0,   py: -4,  upper: EYE_H * 0.30, lower: EYE_H * 0.20, ceno: 0,            gapOffset: 0  },
  triste:       { pxL: 5,   pxR: -5,  py: 7,   upper: EYE_H * 0.28, lower: 0,            ceno: 0,            gapOffset: 0  },
  sorprendida:  { pxL: 0,   pxR: 0,   py: -7,  upper: 0,             lower: 0,            ceno: 0,            gapOffset: 8  },
  pensativa:    { pxL: 0,   pxR: 0,   py: -22, upper: EYE_H * 0.20, lower: 0,            ceno: 0,            gapOffset: 0  },
  chiste:       { pxL: 0,   pxR: 0,   py: 4,   upper: EYE_H * 0.48, lower: EYE_H * 0.32, ceno: 0,            gapOffset: 0  },
  enojada:      { pxL: 0,   pxR: 0,   py: 0,   upper: 0,             lower: 0,            ceno: EYE_H * 0.28, gapOffset: -6 },
  avergonzada:  { pxL: 3,   pxR: -3,  py: 14,  upper: EYE_H * 0.38, lower: 0,            ceno: EYE_H * 0.08, gapOffset: 0  },
  cansada:      { pxL: 0,   pxR: 0,   py: 12,  upper: EYE_H * 0.54, lower: EYE_H * 0.06, ceno: 0,            gapOffset: 0  },
  bostezando:   { pxL: 0,   pxR: 0,   py: 10,  upper: EYE_H * 0.56, lower: EYE_H * 0.12, ceno: 0,            gapOffset: 0  },
  mimada:       { pxL: 0,   pxR: 0,   py: -4,  upper: EYE_H * 0.38, lower: EYE_H * 0.24, ceno: 0,            gapOffset: 0  },
  preocupada:   { pxL: 4,   pxR: -4,  py: 3,   upper: EYE_H * 0.18, lower: 0,            ceno: EYE_H * 0.18, gapOffset: -3 },
  entusiasmada: { pxL: 0,   pxR: 0,   py: -8,  upper: EYE_H * 0.06, lower: EYE_H * 0.10, ceno: 0,            gapOffset: 7  },
};

// ── Boca ─────────────────────────────────────────────────────────────────────

// Dimensiones base fijas — la boca escala con transform (nativeDriver: true)
const BOCA_W = 86;
const BOCA_H = 14;

function Boca({ hablando, expresion, silbando }: { hablando: boolean; expresion: Expresion; silbando: boolean }) {
  const scaleY  = useRef(new Animated.Value(1)).current;    // 1 = BOCA_H
  const scaleX  = useRef(new Animated.Value(1)).current;    // 1 = BOCA_W
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const seqRef  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    loopRef.current?.stop();
    loopRef.current = null;
    seqRef.current?.stop();
    seqRef.current = null;

    if (silbando && !hablando) {
      let mounted = true;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scaleY, { toValue: 14/BOCA_H, duration: 500, useNativeDriver: true }),
            Animated.timing(scaleX, { toValue: 14/BOCA_W, duration: 500, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scaleY, { toValue: 26/BOCA_H, duration: 500, useNativeDriver: true }),
            Animated.timing(scaleX, { toValue: 26/BOCA_W, duration: 500, useNativeDriver: true }),
          ]),
        ])
      );
      loopRef.current = loop;
      Animated.parallel([
        Animated.timing(scaleY, { toValue: 22/BOCA_H, duration: 300, useNativeDriver: true }),
        Animated.timing(scaleX, { toValue: 22/BOCA_W, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        if (mounted) loop.start();
      });
      return () => {
        mounted = false;
        loopRef.current?.stop();
        loopRef.current = null;
      };
    }

    if (expresion === 'bostezando' && !hablando && !silbando) {
      const seq = Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleY, { toValue: 52/BOCA_H, duration: 800, useNativeDriver: true }),
          Animated.timing(scaleX, { toValue: 54/BOCA_W, duration: 800, useNativeDriver: true }),
        ]),
        Animated.delay(1000),
        Animated.parallel([
          Animated.timing(scaleY, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(scaleX, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ]);
      seqRef.current = seq;
      seq.start();
      return () => {
        seqRef.current?.stop();
        seqRef.current = null;
      };
    }

    if (hablando) {
      Animated.timing(scaleX, { toValue: 60/BOCA_W, duration: 150, useNativeDriver: true }).start();
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleY, { toValue: 22/BOCA_H, duration: 220, useNativeDriver: true }),
          Animated.timing(scaleY, { toValue: 4/BOCA_H,  duration: 200, useNativeDriver: true }),
        ])
      );
      loopRef.current.start();
    } else {
      const reposoScaleY =
        expresion === 'sorprendida' ? 20/BOCA_H :
        expresion === 'feliz' || expresion === 'chiste' || expresion === 'mimada' || expresion === 'entusiasmada' ? 10/BOCA_H :
        expresion === 'enojada' ? 8/BOCA_H :
        expresion === 'avergonzada' ? 3/BOCA_H :
        expresion === 'cansada' ? 4/BOCA_H :
        expresion === 'neutral' ? 1 : 5/BOCA_H;

      const reposoScaleX =
        expresion === 'neutral' ? 1 :
        expresion === 'feliz' || expresion === 'chiste' || expresion === 'mimada' || expresion === 'entusiasmada' ? 76/BOCA_W :
        expresion === 'enojada' ? 80/BOCA_W : 64/BOCA_W;

      Animated.parallel([
        Animated.timing(scaleY, { toValue: reposoScaleY, duration: 350, useNativeDriver: true }),
        Animated.timing(scaleX, { toValue: reposoScaleX, duration: 350, useNativeDriver: true }),
      ]).start();
    }
    return () => {
      loopRef.current?.stop();
      loopRef.current = null;
    };
  }, [hablando, expresion, silbando]);

  const esCurvaNeutral = expresion === 'neutral' && !hablando && !silbando;

  const forma = (silbando && !hablando)
    ? { borderTopLeftRadius: 50, borderTopRightRadius: 50, borderBottomLeftRadius: 50, borderBottomRightRadius: 50 }
    : expresion === 'feliz' || expresion === 'chiste' || expresion === 'mimada' || expresion === 'entusiasmada'
    ? { borderTopLeftRadius: 3,  borderTopRightRadius: 3,  borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }
    : expresion === 'cansada'
    ? { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 3,  borderBottomRightRadius: 3  }
    : expresion === 'triste' || expresion === 'enojada'
    ? { borderTopLeftRadius: 32, borderTopRightRadius: 32, borderBottomLeftRadius: 3,  borderBottomRightRadius: 3  }
    : expresion === 'bostezando'
    ? { borderTopLeftRadius: 50, borderTopRightRadius: 50, borderBottomLeftRadius: 50, borderBottomRightRadius: 50 }
    : expresion === 'sorprendida'
    ? { borderTopLeftRadius: 48, borderTopRightRadius: 48, borderBottomLeftRadius: 2,  borderBottomRightRadius: 2  }
    : expresion === 'avergonzada'
    ? { borderTopLeftRadius: 3, borderTopRightRadius: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }
    : expresion === 'neutral'
    ? { borderBottomLeftRadius: 42, borderBottomRightRadius: 42, borderTopLeftRadius: 0, borderTopRightRadius: 0 }
    : { borderTopLeftRadius: 2, borderTopRightRadius: 2, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 };

  return (
    <Animated.View style={[
      sb.boca,
      forma,
      { transform: [{ scaleX }, { scaleY }] },
      esCurvaNeutral && {
        backgroundColor: 'transparent',
        borderBottomWidth: 3,
        borderLeftWidth: 1.5,
        borderRightWidth: 1.5,
        borderColor: '#C4996A',
      }
    ]} />
  );
}

const sb = StyleSheet.create({
  boca: {
    width:  BOCA_W,
    height: BOCA_H,
    backgroundColor: '#C4996A',
    marginTop: 80,
    shadowColor: '#3A1A10',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.65,
    shadowRadius: 3,
    elevation: 4,
  },
});

// ── Cremallera (modo no molestar) ────────────────────────────────────────────

const GRIS = '#9E9E9E';
const GRIS_OSC = '#757575';
const CR_W = 100;
const CR_H = 16;
const N_DIENTES = 9;

function Cremallera() {
  const scaleX  = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const tiraY   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleX,  { toValue: 1, useNativeDriver: true, tension: 70, friction: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(tiraY, { toValue: 3,  duration: 1200, useNativeDriver: true }),
        Animated.timing(tiraY, { toValue: -1, duration: 1200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const dienteW = CR_W / N_DIENTES;

  return (
    <Animated.View style={[sc.wrap, { opacity, transform: [{ scaleX }] }]}>
      <View style={sc.topeIzq} />
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
      <View style={sc.pestilloCuerpo}>
        <View style={sc.pestilloOvalo} />
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
    width: CR_W + 36,
    height: 60,
    marginTop: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  topeIzq: {
    width: 10, height: CR_H + 4,
    borderRadius: 3,
    backgroundColor: GRIS_OSC,
    marginRight: 2,
  },
  cuerpo: {
    width: CR_W, height: CR_H,
    backgroundColor: GRIS + '33',
    borderRadius: 2,
    overflow: 'visible',
  },
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

// ── Ojo SVG ───────────────────────────────────────────────────────────────────
// memo: evita re-renders cuando cambia expresion en el padre.
// Las animaciones (párpados, iris) van por Animated y no necesitan re-render.
// Sin memo, un re-render del padre invalida el SVG antes de que su layout esté
// listo en Fabric → RadialGradient.nativeCreateNativeMethod con radius=0 → crash.

const Ojo = memo(function Ojo({
  side, pxAnim, pyAnim, upperLid, lowerLid, blinkLid, cenoLid, cenoExpr, scaleY, offsetX, lidBg, nightAnim,
}: {
  side:     'L' | 'R';
  pxAnim:   Animated.Value;
  pyAnim:   Animated.Value;
  upperLid: Animated.Value;
  lowerLid: Animated.Value;
  blinkLid: Animated.Value;
  cenoLid:  Animated.Value;
  cenoExpr: Animated.Value;
  scaleY:    Animated.Value;
  offsetX:   Animated.Value;
  lidBg:     string;
  nightAnim: Animated.Value;
}) {
  // Nodos de animación estabilizados con useRef para no recrearlos en cada render.
  // Recrear nodos Animated.add mientras el driver nativo está activo causa crashes en new arch.

  // Suma total del párpado superior: expresión + parpadeo + ceño estado + ceño expresión
  const totalUpper = useRef(Animated.add(
    Animated.add(Animated.add(upperLid, blinkLid), cenoLid),
    cenoExpr,
  )).current;

  // Posición del iris dentro del SVG
  const irisX = useRef(Animated.add(pxAnim, new Animated.Value(CX))).current;
  const irisY = useRef(Animated.add(pyAnim, new Animated.Value(CY))).current;

  // Reflexos del iris
  const reflejo1CX = useRef(Animated.add(irisX, new Animated.Value(-PUPIL * 0.28))).current;
  const reflejo1CY = useRef(Animated.add(irisY, new Animated.Value(-PUPIL * 0.30))).current;
  const reflejo2CX = useRef(Animated.add(irisX, new Animated.Value(PUPIL * 0.22))).current;
  const reflejo2CY = useRef(Animated.add(irisY, new Animated.Value(PUPIL * 0.25))).current;

  // Posición Y del párpado inferior: EYE_H - lowerLid
  const lowerLidY = useRef(Animated.add(new Animated.Value(EYE_H), Animated.multiply(lowerLid, -1))).current;

  // El gradiente radial (gradPiel) usa porcentaje del bounding box del rect.
  // Si height llega a 0 (expresión "sorprendida": upper=0), Android tira
  // IllegalArgumentException en RadialGradient.nativeCreate porque radius≤0.
  // Sumamos 2px mínimos — invisibles dentro del clipPath pero evitan el crash.
  const totalUpperGrad = useRef(Animated.add(totalUpper, new Animated.Value(2))).current;

  // Interpolación nocturna (único nodo compartido para todos los usos)
  const nightOpacity = useRef(nightAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 0.82],
  })).current;

  const pathFormaOjo = pathFormaOjoSvg();

  // offsetX (eyeGap) va en un Animated.View SEPARADO con useNativeDriver:false.
  // Si estuviera junto a scaleY (native:true), el redraw nativo a 60fps del SVG
  // podría coincidir con el commit de React y dejar el bounding box en 0 → crash RadialGradient.
  return (
    <Animated.View style={{ transform: [{ translateX: offsetX }] }}>
    <Animated.View style={[s.eyeContainer, { transform: [{ scaleY }] }]}>
      <Svg width={EYE_W} height={EYE_H} viewBox={`0 0 ${EYE_W} ${EYE_H}`}>
        <Defs>
          {/* IDs sufijados con "side" para evitar conflictos entre el ojo L y el R */}
          <ClipPath id={`huevo${side}`}>
            <Path d={pathFormaOjo}/>
          </ClipPath>

          {/* Gradiente radial esclera: blanco cremoso al centro, más oscuro en bordes */}
          <RadialGradient id={`gradEsclera${side}`} cx="50%" cy="45%" rx="55%" ry="52%">
            <Stop offset="0%"   stopColor="#FDFAF4" stopOpacity="1"/>
            <Stop offset="60%"  stopColor="#EDE6D8" stopOpacity="1"/>
            <Stop offset="100%" stopColor="#D4C8B0" stopOpacity="1"/>
          </RadialGradient>

          {/* Gradiente radial iris: celeste brillante al centro, azul oscuro en bordes */}
          <RadialGradient id={`gradIris${side}`} cx="40%" cy="35%" rx="60%" ry="60%">
            <Stop offset="0%"   stopColor="#A8D8F8" stopOpacity="1"/>
            <Stop offset="30%"  stopColor="#5BA8E0" stopOpacity="1"/>
            <Stop offset="65%"  stopColor="#2464B8" stopOpacity="1"/>
            <Stop offset="100%" stopColor="#082E70" stopOpacity="1"/>
          </RadialGradient>

          {/* Gradiente radial pupila: no completamente negro, con profundidad */}
          <RadialGradient id={`gradPupila${side}`} cx="44%" cy="40%" rx="56%" ry="56%">
            <Stop offset="0%"   stopColor="#1E1E38" stopOpacity="1"/>
            <Stop offset="100%" stopColor="#000008" stopOpacity="1"/>
          </RadialGradient>

          {/* Gradiente piel párpado: da volumen al párpado */}
          <RadialGradient id={`gradPiel${side}`} cx="50%" cy="0%" rx="60%" ry="80%">
            <Stop offset="0%"   stopColor="#D4A87A" stopOpacity="1"/>
            <Stop offset="100%" stopColor="#B8864E" stopOpacity="1"/>
          </RadialGradient>

          {/* Sombra suave del párpado sobre el ojo — degradé de oscuro a transparente */}
          <RadialGradient id={`gradSombraParpado${side}`} cx="50%" cy="0%" rx="50%" ry="100%">
            <Stop offset="0%"   stopColor="#000000" stopOpacity="0.18"/>
            <Stop offset="100%" stopColor="#000000" stopOpacity="0"/>
          </RadialGradient>
        </Defs>

        {/* ── Fondo piel (forma recalculated completa) ── */}
        <Path
          d={pathFormaOjo}
          fill="#C4996A"
        />

        {/* ── Contenido del ojo (clippeado a la forma suavizada) ── */}
        <G clipPath={`url(#huevo${side})`}>

          {/* Esclera con gradiente */}
          <Ellipse
            cx={CX}
            cy={EYE_H * 0.68}
            rx={EYE_W * 0.54}
            ry={EYE_H * 0.46}
            fill={`url(#gradEsclera${side})`}
          />

          {/* Iris + pupila animados ── */}
          {/* Iris */}
          <AnimatedCircle
            cx={irisX as any}
            cy={irisY as any}
            r={IRIS / 2}
            fill={`url(#gradIris${side})`}
          />
          {/* Anillo exterior del iris */}
          <AnimatedCircle
            cx={irisX as any}
            cy={irisY as any}
            r={IRIS / 2}
            fill="none"
            stroke="rgba(8,30,80,0.25)"
            strokeWidth={1.5}
          />
          {/* Anillo interior del iris */}
          <AnimatedCircle
            cx={irisX as any}
            cy={irisY as any}
            r={IRIS * 0.6 / 2}
            fill="none"
            stroke="rgba(8,30,80,0.12)"
            strokeWidth={1}
          />
          {/* Pupila */}
          <AnimatedCircle
            cx={irisX as any}
            cy={irisY as any}
            r={PUPIL / 2}
            fill={`url(#gradPupila${side})`}
          />
          {/* Reflejo principal ── */}
          <AnimatedEllipse
            cx={reflejo1CX as any}
            cy={reflejo1CY as any}
            rx={5}
            ry={4}
            fill="white"
            opacity={0.92}
          />
          {/* Reflejo secundario */}
          <AnimatedEllipse
            cx={reflejo2CX as any}
            cy={reflejo2CY as any}
            rx={2.5}
            ry={2}
            fill="white"
            opacity={0.45}
          />

          {/* Sombra suave del párpado cayendo sobre el ojo */}
          <Rect
            x={0} y={0}
            width={EYE_W}
            height={EYE_H * 0.35}
            fill={`url(#gradSombraParpado${side})`}
          />

          {/* ── Párpado superior ── */}
          <AnimatedRect
            x={0}
            y={0}
            width={EYE_W}
            height={totalUpper as any}
            fill={lidBg}
          />
          <AnimatedRect
            x={0}
            y={0}
            width={EYE_W}
            height={totalUpper as any}
            fill="#000000"
            opacity={nightOpacity as any}
          />

          {/* ── Párpado inferior ── */}
          <AnimatedRect
            x={0}
            y={lowerLidY as any}
            width={EYE_W}
            height={lowerLid as any}
            fill="#C4996A"
          />
          <AnimatedRect
            x={0}
            y={lowerLidY as any}
            width={EYE_W}
            height={lowerLid as any}
            fill="#000000"
            opacity={nightOpacity as any}
          />

        </G>

        {/* ── Párpado exterior con gradiente de piel — clippeado a la forma suavizada ── */}
        <G clipPath={`url(#huevo${side})`}>
          <AnimatedRect
            x={0}
            y={0}
            width={EYE_W}
            height={totalUpperGrad as any}
            fill={`url(#gradPiel${side})`}
          />
          {/* Oscurecimiento nocturno encima del gradiente de piel */}
          <AnimatedRect
            x={0}
            y={0}
            width={EYE_W}
            height={totalUpper as any}
            fill="#000000"
            opacity={nightOpacity as any}
          />
        </G>

      </Svg>
    </Animated.View>
    </Animated.View>
  );
});

// ── Principal ─────────────────────────────────────────────────────────────────

export type ModoNoche = 'despierta' | 'soñolienta' | 'durmiendo';

const FACE_W = EYE_W * 2 + 32;
const FACE_H = EYE_H + 120;

export default function RosaOjos({
  estado, expresion, modoNoche = 'despierta', bgColor = BG, silbando = false, noMolestar = false, onOjoPicado, scale = 1, amaneciendo = false, mouthOffsetY = 0, eyeGapExtra = 0, zipperOffsetY = 0, zipperScale = 1,
}: {
  estado: Estado;
  expresion: Expresion;
  modoNoche?: ModoNoche;
  bgColor?: string;
  silbando?: boolean;
  noMolestar?: boolean;
  onOjoPicado?: () => void;
  scale?: number;
  amaneciendo?: boolean;
  mouthOffsetY?: number;
  eyeGapExtra?: number;
  zipperOffsetY?: number;
  zipperScale?: number;
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
  // 0 = despierta, 0.5 = soñolienta, 1 = durmiendo
  const nightAnim = useRef(new Animated.Value(0)).current;

  const expresionRef  = useRef<Expresion>('neutral');
  const running       = useRef(true);
  const timer         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blinkTmr      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breathingAnim = useRef<Animated.CompositeAnimation | null>(null);
  const nightAnimRef  = useRef<Animated.CompositeAnimation | null>(null);
  /** Cierre de párpado al dormir (no pisar nightAnimRef con el parallel de pupila). */
  const nightSleepUpperLidRef = useRef<Animated.CompositeAnimation | null>(null);
  const nightTintAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const noMolestarLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const expresionAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  function stopEstadoTimers() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (blinkTmr.current) {
      clearTimeout(blinkTmr.current);
      blinkTmr.current = null;
    }
  }

  // ── Modo noche ──────────────────────────────────────────────────────────────
  useEffect(() => {
    nightSleepUpperLidRef.current?.stop();
    nightAnimRef.current?.stop();
    nightTintAnimRef.current?.stop();
    stopEstadoTimers();
    breathingAnim.current?.stop();
    if (modoNoche === 'durmiendo') {
      running.current = false;
      nightSleepUpperLidRef.current = Animated.timing(upperLid, { toValue: EYE_H, duration: 1800, useNativeDriver: false });
      nightSleepUpperLidRef.current.start();
      // Si está amaneciendo, no oscurecer los párpados aunque esté durmiendo
      nightTintAnimRef.current = Animated.timing(nightAnim, { toValue: amaneciendo ? 0 : 1, duration: 1800, useNativeDriver: false });
      nightTintAnimRef.current.start();
      nightAnimRef.current = Animated.parallel([
        Animated.timing(scaleY, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pxL,    { toValue: 0, duration: 800,  useNativeDriver: true }),
        Animated.timing(pxR,    { toValue: 0, duration: 800,  useNativeDriver: true }),
        Animated.timing(py,     { toValue: 4, duration: 800,  useNativeDriver: true }),
      ]);
      nightAnimRef.current.start();
      expresionAnimRef.current?.stop();
      expresionAnimRef.current = Animated.parallel([
        Animated.timing(eyeGapL, { toValue: 0, duration: 800, useNativeDriver: false }),
        Animated.timing(eyeGapR, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]);
      expresionAnimRef.current.start();
    } else if (modoNoche === 'soñolienta') {
      nightAnimRef.current = Animated.parallel([
        Animated.timing(upperLid, { toValue: EYE_H * 0.55, duration: 1200, useNativeDriver: false }),
        Animated.timing(lowerLid, { toValue: EYE_H * 0.10, duration: 1200, useNativeDriver: false }),
        Animated.timing(cenoExpr,  { toValue: 0,    duration: 1200, useNativeDriver: false }),
        Animated.timing(nightAnim, { toValue: 0.5,  duration: 1200, useNativeDriver: false }),
      ]);
      nightAnimRef.current.start();
      expresionAnimRef.current?.stop();
      expresionAnimRef.current = Animated.parallel([
        Animated.timing(scaleY, { toValue: 0.45, duration: 1200, useNativeDriver: true }),
        Animated.timing(py,     { toValue: 4,    duration: 800,  useNativeDriver: true }),
      ]);
      expresionAnimRef.current.start();
      noMolestarLoopRef.current?.stop();
      noMolestarLoopRef.current = Animated.parallel([
        Animated.timing(eyeGapL, { toValue: 0, duration: 800, useNativeDriver: false }),
        Animated.timing(eyeGapR, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]);
      noMolestarLoopRef.current.start();
    } else {
      const c = EXPR[expresionRef.current];
      nightAnimRef.current = Animated.parallel([
        Animated.timing(upperLid, { toValue: c.upper, duration: 1200, useNativeDriver: false }),
        Animated.timing(lowerLid, { toValue: c.lower, duration: 1200, useNativeDriver: false }),
        Animated.timing(cenoExpr,  { toValue: c.ceno, duration: 1200, useNativeDriver: false }),
        Animated.timing(nightAnim, { toValue: 0,     duration: 1200, useNativeDriver: false }),
      ]);
      nightAnimRef.current.start();
      expresionAnimRef.current?.stop();
      expresionAnimRef.current = Animated.timing(scaleY, { toValue: 1, duration: 1200, useNativeDriver: true });
      expresionAnimRef.current.start();
      noMolestarLoopRef.current?.stop();
      noMolestarLoopRef.current = Animated.parallel([
        Animated.timing(eyeGapL, { toValue: -c.gapOffset, duration: 1200, useNativeDriver: false }),
        Animated.timing(eyeGapR, { toValue:  c.gapOffset, duration: 1200, useNativeDriver: false }),
      ]);
      noMolestarLoopRef.current.start();
    }
    return () => {
      nightSleepUpperLidRef.current?.stop();
      nightAnimRef.current?.stop();
      nightTintAnimRef.current?.stop();
    };
  }, [modoNoche]);

  // Si cambia amaneciendo mientras ya está durmiendo, actualizar el tinte (solo entonces; no incluir modoNoche en deps
  // para no pisar el timing de 1800ms del efecto principal al entrar en durmiendo).
  useEffect(() => {
    if (modoNoche !== 'durmiendo') return;
    nightTintAnimRef.current?.stop();
    const anim = Animated.timing(nightAnim, { toValue: amaneciendo ? 0 : 1, duration: 1200, useNativeDriver: false });
    nightTintAnimRef.current = anim;
    anim.start();
    return () => {
      anim.stop();
    };
  }, [amaneciendo]);

  // ── No molestar ─────────────────────────────────────────────────────────────
  useEffect(() => {
    noMolestarLoopRef.current?.stop();
    if (noMolestar) {
      expresionAnimRef.current?.stop();
      expresionAnimRef.current = Animated.parallel([
        Animated.timing(upperLid, { toValue: EYE_H * 0.38, duration: 400, useNativeDriver: false }),
        Animated.timing(cenoLid,  { toValue: EYE_H * 0.10, duration: 400, useNativeDriver: false }),
      ]);
      expresionAnimRef.current.start();
      noMolestarLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(py,  { toValue: -MAX * 1.1, duration: 400, useNativeDriver: true }),
            Animated.timing(pxL, { toValue:  MAX * 0.7, duration: 400, useNativeDriver: true }),
            Animated.timing(pxR, { toValue:  MAX * 0.7, duration: 400, useNativeDriver: true }),
          ]),
          Animated.delay(500),
          Animated.parallel([
            Animated.timing(pxL, { toValue: -MAX * 0.7, duration: 2000, useNativeDriver: true }),
            Animated.timing(pxR, { toValue: -MAX * 0.7, duration: 2000, useNativeDriver: true }),
          ]),
          Animated.delay(500),
          Animated.parallel([
            Animated.timing(pxL, { toValue: 0, duration: 800, useNativeDriver: true }),
            Animated.timing(pxR, { toValue: 0, duration: 800, useNativeDriver: true }),
          ]),
          Animated.delay(400),
        ])
      );
      noMolestarLoopRef.current.start();
      return () => {
        noMolestarLoopRef.current?.stop();
        // Usar expresionRef.current (actualizado por el effect [expresion]) para restaurar
        // los párpados al valor correcto de la expresión activa mientras estaba en no-molestar.
        const c = EXPR[expresionRef.current];
        expresionAnimRef.current?.stop();
        expresionAnimRef.current = Animated.parallel([
          Animated.timing(upperLid, { toValue: c.upper, duration: 400, useNativeDriver: false }),
          Animated.timing(lowerLid, { toValue: c.lower, duration: 400, useNativeDriver: false }),
          Animated.timing(cenoExpr, { toValue: c.ceno,  duration: 400, useNativeDriver: false }),
          Animated.timing(cenoLid,  { toValue: 0,       duration: 400, useNativeDriver: false }),
        ]);
        expresionAnimRef.current.start();
        nightAnimRef.current?.stop();
        nightAnimRef.current = Animated.parallel([
          Animated.timing(pxL, { toValue: c.pxL, duration: 400, useNativeDriver: true }),
          Animated.timing(pxR, { toValue: c.pxR, duration: 400, useNativeDriver: true }),
          Animated.timing(py,  { toValue: c.py,  duration: 400, useNativeDriver: true }),
        ]);
        nightAnimRef.current.start();
      };
    }
  }, [noMolestar]);

  // ── Expresión ───────────────────────────────────────────────────────────────
  useEffect(() => {
    expresionRef.current = expresion;
    if (modoNoche !== 'despierta') return;
    const c = EXPR[expresion];
    expresionAnimRef.current?.stop();
    expresionAnimRef.current = Animated.parallel([
      Animated.timing(upperLid, { toValue: c.upper, duration: 420, useNativeDriver: false }),
      Animated.timing(lowerLid, { toValue: c.lower, duration: 420, useNativeDriver: false }),
      Animated.timing(cenoExpr, { toValue: c.ceno,  duration: 420, useNativeDriver: false }),
    ]);
    expresionAnimRef.current.start();
    noMolestarLoopRef.current?.stop();
    noMolestarLoopRef.current = Animated.parallel([
      Animated.timing(eyeGapL, { toValue: -c.gapOffset, duration: 420, useNativeDriver: false }),
      Animated.timing(eyeGapR, { toValue:  c.gapOffset, duration: 420, useNativeDriver: false }),
    ]);
    noMolestarLoopRef.current.start();
  }, [expresion, modoNoche]);

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
        blinkTmr.current = null;
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
      timer.current = setTimeout(() => {
        timer.current = null;
        loopEsperando();
      }, espera);
    }

    function loopEscuchando() {
      if (!running.current) return;
      const dx = (Math.random() - 0.5) * MAX * 0.9;
      const dy = -4 + (Math.random() - 0.5) * 4;
      mover(dx, dy, 350 + Math.random() * 200);
      timer.current = setTimeout(() => {
        timer.current = null;
        loopEscuchando();
      }, 500 + Math.random() * 700);
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
        timer.current = setTimeout(() => {
          timer.current = null;
          sig();
        }, 900 + Math.random() * 200);
      }
      sig();
    }

    function loopHablando() {
      if (!running.current) return;
      const dx = (Math.random() - 0.5) * MAX * 1.4;
      const dy = (Math.random() - 0.5) * MAX * 0.6;
      mover(dx, dy, 180 + Math.random() * 120);
      timer.current = setTimeout(() => {
        timer.current = null;
        loopHablando();
      }, 280 + Math.random() * 180);
    }

    Animated.timing(cenoLid, {
      toValue: estado === 'pensando' ? EYE_H * 0.22 : 0,
      duration: 400,
      useNativeDriver: false,
    }).start();

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
      stopEstadoTimers();
    };
  }, [estado, modoNoche]);

  useEffect(() => {
    return () => {
      running.current = false;
      stopEstadoTimers();
      breathingAnim.current?.stop();
      nightSleepUpperLidRef.current?.stop();
      nightAnimRef.current?.stop();
      nightTintAnimRef.current?.stop();
      noMolestarLoopRef.current?.stop();
      expresionAnimRef.current?.stop();
    };
  }, []);

  function picarOjo(_lado: 'L' | 'R') {
    const lid = blinkLid;
    Animated.sequence([
      Animated.timing(lid, { toValue: EYE_H, duration: 40,  useNativeDriver: false }),
      Animated.timing(lid, { toValue: 0,     duration: 40,  useNativeDriver: false }),
      Animated.timing(lid, { toValue: EYE_H, duration: 40,  useNativeDriver: false }),
      Animated.timing(lid, { toValue: 0,     duration: 60,  useNativeDriver: false }),
    ]).start(({ finished }) => {
      if (finished) onOjoPicado?.();
    });
  }

  return (
    <View style={{ width: FACE_W * scale, height: FACE_H * scale, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
      <View style={[s.wrap, scale !== 1 && { transform: [{ scale }] }]}>
        <View style={[s.contenedor, eyeGapExtra !== 0 && { gap: 32 + eyeGapExtra }]}>
          <TouchableOpacity onPress={() => picarOjo('L')} activeOpacity={1}>
            <Ojo side="L" pxAnim={pxL} pyAnim={py} upperLid={upperLid} lowerLid={lowerLid} blinkLid={blinkLid} cenoLid={cenoLid} cenoExpr={cenoExpr} scaleY={scaleY} offsetX={eyeGapL} lidBg={bgColor} nightAnim={nightAnim}/>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => picarOjo('R')} activeOpacity={1}>
            <Ojo side="R" pxAnim={pxR} pyAnim={py} upperLid={upperLid} lowerLid={lowerLid} blinkLid={blinkLid} cenoLid={cenoLid} cenoExpr={cenoExpr} scaleY={scaleY} offsetX={eyeGapR} lidBg={bgColor} nightAnim={nightAnim}/>
          </TouchableOpacity>
        </View>
        {noMolestar && estado === 'esperando' ? (
          <View style={(zipperOffsetY !== 0 || zipperScale !== 1) ? { transform: [{ translateY: zipperOffsetY }, { scale: zipperScale }] } : undefined}>
            <Cremallera />
          </View>
        ) : (
          <View style={mouthOffsetY !== 0 ? { transform: [{ translateY: mouthOffsetY }] } : undefined}>
            <Boca hablando={estado === 'hablando'} expresion={expresion} silbando={silbando} />
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { alignItems: 'center', height: EYE_H + 120 },
  contenedor: { flexDirection: 'row', gap: 32, alignItems: 'flex-end' },
  eyeContainer: {
    width: EYE_W,
    height: EYE_H,
    overflow: 'visible',
  },
});
