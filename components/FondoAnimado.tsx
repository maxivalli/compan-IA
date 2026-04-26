import { useEffect, useRef } from 'react';
import { Animated, InteractionManager, StyleSheet, View, useWindowDimensions } from 'react-native';
import { esDispositivoGamaBaja } from '../lib/dispositivoUtils';
import Svg, { Path, Circle } from 'react-native-svg';

// ── Waveform SR — aparece en el botón cuando el micrófono detecta sonido ──────

export function WaveformDetectando({
  barWidth = 5,
  barHeight = 26,
  gap = 4,
  color = '#ef4444',
}: {
  barWidth?: number;
  barHeight?: number;
  gap?: number;
  color?: string;
} = {}) {
  const alturas = useRef([0.3, 0.7, 0.5, 1.0, 0.4, 0.8, 0.6, 0.9, 0.35].map(v => new Animated.Value(v))).current;

  useEffect(() => {
    const anims = alturas.map((bar, i) => {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(bar, { toValue: 0.12, duration: 200 + i * 45, useNativeDriver: true }),
          Animated.timing(bar, { toValue: 1,    duration: 200 + i * 45, useNativeDriver: true }),
        ])
      );
      anim.start();
      return anim;
    });
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={[s.waveform, { gap, height: barHeight }]}>
      {alturas.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            s.waveBar,
            {
              width: barWidth,
              height: barHeight,
              borderRadius: Math.max(2, Math.round(barWidth / 2)),
              backgroundColor: color,
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
}

// ── Ecualizador de música ─────────────────────────────────────────────────────

export function AnimacionMusica({
  barWidth = 4,
  barHeight = 28,
  gap = 3,
  color = '#33FF66',
}: {
  barWidth?: number;
  barHeight?: number;
  gap?: number;
  color?: string;
} = {}) {
  const alturas = useRef([0.4, 0.8, 0.5, 1.0, 0.6, 0.3, 0.7].map(v => new Animated.Value(v))).current;

  useEffect(() => {
    const anims = alturas.map((bar, i) => {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(bar, { toValue: 0.15, duration: 250 + i * 60, useNativeDriver: true }),
          Animated.timing(bar, { toValue: 1,    duration: 250 + i * 60, useNativeDriver: true }),
        ])
      );
      anim.start();
      return anim;
    });
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={[s.ecualizador, { gap, height: barHeight }]}>
      {alturas.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            s.barra,
            { width: barWidth, height: barHeight, borderRadius: Math.max(2, Math.round(barWidth / 2)), backgroundColor: color },
            { transform: [{ scaleY: bar }] },
          ]}
        />
      ))}
    </View>
  );
}

// ── ZZZs de modo durmiendo ────────────────────────────────────────────────────

export function ZZZ({ modoHorizontal = false }: { modoHorizontal?: boolean } = {}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const esHorizontal = modoHorizontal || screenW > screenH;
  const esTablet = Math.max(screenW, screenH) >= 900;
  const zs = esHorizontal
    ? (esTablet ? 2.9 : 1.9)
    : (esTablet ? 2.45 : (screenW >= 600 ? Math.min(screenW / 390, 1.7) : 1.4));
  const zetas = useRef([0, 1, 2].map(i => ({
    y:       new Animated.Value(0),
    opacity: new Animated.Value(0),
    scale:   new Animated.Value(0.6 + i * 0.2),
  }))).current;

  useEffect(() => {
    let loops: Animated.CompositeAnimation[] = [];
    const task = InteractionManager.runAfterInteractions(() => {
      loops = zetas.map((z, i) => {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(i * 900),
            Animated.parallel([
              Animated.timing(z.opacity, { toValue: 1,   duration: 400,  useNativeDriver: true }),
              Animated.timing(z.y,       { toValue: -70, duration: 2200, useNativeDriver: true }),
            ]),
            Animated.timing(z.opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
            Animated.parallel([
              Animated.timing(z.y,       { toValue: 0, duration: 0, useNativeDriver: true }),
              Animated.timing(z.opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
            ]),
          ])
        );
        loop.start();
        return loop;
      });
    });
    return () => { task.cancel(); loops.forEach(l => l.stop()); };
  }, []);

  return (
    <View
      style={[
        sz.contenedor,
        { width: Math.round(80 * zs), height: Math.round(90 * zs) },
        esHorizontal
          ? {
              right: Math.round(screenW * 0.17),
              bottom: Math.round(screenH * 0.34),
            }
          : (esTablet ? { bottom: '66%' } : (screenW >= 600 ? { bottom: '71%' } : null)),
      ]}
    >
      {zetas.map((z, i) => (
        <Animated.Text
          key={i}
          style={[sz.z, {
            fontSize: Math.round(22 * zs),
            opacity: z.opacity,
            transform: [{ translateY: z.y }, { scale: z.scale }],
            left: Math.round((10 + i * 22) * zs),
            bottom: Math.round(i * 12 * zs),
          }]}
        >
          Z
        </Animated.Text>
      ))}
    </View>
  );
}

// ── Cielo nocturno ────────────────────────────────────────────────────────────

const ESTRELLAS_NOCHE = [
  { x: 28,  y: 88,  r: 6, i: 0  },
  { x: 82,  y: 112, r: 5, i: 1  },
  { x: 144, y: 80,  r: 6, i: 2  },
  { x: 200, y: 106, r: 5, i: 3  },
  { x: 256, y: 86,  r: 6, i: 4  },
  { x: 318, y: 114, r: 5, i: 5  },
  { x: 52,  y: 148, r: 5, i: 6  },
  { x: 116, y: 162, r: 6, i: 7  },
  { x: 178, y: 136, r: 5, i: 8  },
  { x: 236, y: 160, r: 6, i: 9  },
  { x: 292, y: 140, r: 5, i: 10 },
  { x: 346, y: 118, r: 6, i: 11 },
];

function Estrella({ x, y, r, i }: { x: number; y: number; r: number; i: number }) {
  const opacity = useRef(new Animated.Value(0.3 + (i % 3) * 0.2)).current;
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1,   duration: 700 + i * 220, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.2, duration: 900 + i * 180, useNativeDriver: true }),
        ])
      );
      anim.start();
    });
    return () => { task.cancel(); anim?.stop(); };
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', left: x, top: y,
      width: r * 2, height: r * 2, borderRadius: r,
      backgroundColor: '#D4C5A9', opacity,
    }} />
  );
}

// ── Cálculo de fase lunar ─────────────────────────────────────────────────────
// Devuelve un valor de 0 a 1 representando la fase del ciclo lunar.
// 0 = luna nueva, 0.25 = cuarto creciente, 0.5 = luna llena, 0.75 = cuarto menguante.
function calcularFaseLunar(fecha: Date): number {
  // Época de referencia: luna nueva conocida — 6 enero 2000 18:14 UTC
  const LUNA_NUEVA_REF = new Date('2000-01-06T18:14:00Z').getTime();
  const CICLO_MS = 29.53058867 * 24 * 60 * 60 * 1000;
  const diff = fecha.getTime() - LUNA_NUEVA_REF;
  const fase = ((diff % CICLO_MS) + CICLO_MS) % CICLO_MS / CICLO_MS;
  return fase;
}

// Genera el path SVG de la silueta iluminada de la luna.
// El círculo base tiene radio R centrado en (R, R).
// La fase determina qué porción está iluminada y en qué lado.
function lunaPath(R: number, fase: number): string {
  const cx = R;
  const cy = R;

  // 1. Luna Nueva: no dibujamos nada extra
  if (fase < 0.02 || fase > 0.98) return "";
  
  // 2. Luna Llena: fix de SVG con dos semicírculos
  if (fase > 0.48 && fase < 0.52) {
    return `M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx} ${cy + R} A ${R} ${R} 0 0 1 ${cx} ${cy - R} Z`;
  }

  const creciente = fase <= 0.5;
  const t = creciente ? fase * 2 : (1 - fase) * 2;
  const rx = R * Math.abs(1 - t * 2);

  // 3. Lógica para el Hemisferio Sur:
  // Creciente ilumina desde la izquierda (C), Menguante desde la derecha (D)
  const ladoIzquierdo = creciente; 
  
  // sweep_semi: 0 dibuja el borde izquierdo, 1 dibuja el derecho
  const sweep_semi = ladoIzquierdo ? 0 : 1;

  // sweep_term: hacia dónde "pansea" la curva interna
  // Arreglado el bug que convertía gibosas en medialunas
  const sweep_term = ladoIzquierdo
    ? (t < 0.5 ? 1 : 0)
    : (t < 0.5 ? 0 : 1);

  const top    = `${cx} ${cy - R}`;
  const bottom = `${cx} ${cy + R}`;

  const semi = `M ${top} A ${R} ${R} 0 0 ${sweep_semi} ${bottom}`;
  const term = `A ${rx} ${R} 0 0 ${sweep_term} ${top}`;

  return `${semi} ${term} Z`;
}

// ── Luna con fase real ────────────────────────────────────────────────────────

function LunaFase({ size, bgColor, floatY, lunaOp }: {
  size: number;
  bgColor: string;
  floatY: Animated.Value;
  lunaOp: Animated.Value;
}) {
  const fase = calcularFaseLunar(new Date());
  const R    = size / 2;
  const path = lunaPath(R, fase);

  // Luna nueva: muy tenue
  const esNueva = fase < 0.02 || fase > 0.98;
  // Luna llena: más brillante
  const esLlena = fase > 0.48 && fase < 0.52;

  const colorIluminado = esLlena ? '#F5EBC8' : '#D4C5A9';
  const opacityBase    = esNueva ? 0.15 : 1;

  return (
    <Animated.View style={{
      position: 'absolute', top: 88, left: 24,
      width: size, height: size,
      opacity: Animated.multiply(lunaOp, opacityBase as any),
      transform: [{ translateY: floatY }],
    }}>
      <Svg width={size} height={size}>
        {/* Círculo base oscuro (cara no iluminada) */}
        <Circle
          cx={R} cy={R} r={R - 1}
          fill={esNueva ? '#1a1a2e' : '#2a2a3e'}
          opacity={esNueva ? 0.5 : 0.8}
        />
        {/* Silueta iluminada según fase */}
        {!esNueva && (
          <Path
            d={path}
            fill={colorIluminado}
            opacity={esLlena ? 1 : 0.95}
          />
        )}
        {/* Halo para luna llena */}
        {esLlena && (
          <Circle
            cx={R} cy={R} r={R + 4}
            fill="none"
            stroke="#F5EBC8"
            strokeWidth={3}
            opacity={0.25}
          />
        )}
      </Svg>
    </Animated.View>
  );
}

export function CieloNoche({ bgColor }: { bgColor: string }) {
  const { width: screenW } = useWindowDimensions();
  const scaleX   = screenW / 390;
  const skyScale = Math.min(scaleX, 1.8);
  const lunaSize = Math.round(76 * skyScale);

  const floatY = useRef(new Animated.Value(0)).current;
  const lunaOp = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      anim = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(floatY, { toValue: -8,  duration: 2600, useNativeDriver: true }),
            Animated.timing(lunaOp, { toValue: 1,   duration: 2600, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(floatY, { toValue: 0,    duration: 2600, useNativeDriver: true }),
            Animated.timing(lunaOp, { toValue: 0.75, duration: 2600, useNativeDriver: true }),
          ]),
        ])
      );
      anim.start();
    });
    return () => { task.cancel(); anim?.stop(); };
  }, []);

  const estrellas = esDispositivoGamaBaja ? ESTRELLAS_NOCHE.filter((_, i) => i % 2 === 0) : ESTRELLAS_NOCHE;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {estrellas.map((e) => (
        <Estrella key={e.i} x={e.x * scaleX} y={e.y} r={e.r * skyScale} i={e.i} />
      ))}
      <LunaFase
        size={lunaSize}
        bgColor={bgColor}
        floatY={floatY}
        lunaOp={lunaOp}
      />
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  ecualizador: { flexDirection: 'row', alignItems: 'center' },
  barra:       { width: 4, height: 28, borderRadius: 2, backgroundColor: '#33FF66' },
  waveform:    { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26 },
  waveBar:     { width: 5, height: 26, borderRadius: 3, backgroundColor: '#ef4444' },
});

const sz = StyleSheet.create({
  contenedor: { position: 'absolute', bottom: '62%', right: '18%', width: 80, height: 90 },
  z:          { position: 'absolute', fontWeight: '700', color: '#5DCAA5', opacity: 0 },
});
