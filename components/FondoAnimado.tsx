import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

// ── Ecualizador de música ─────────────────────────────────────────────────────

export function AnimacionMusica() {
  const alturas = useRef([0.4, 0.8, 0.5, 1.0, 0.6, 0.3, 0.7].map(v => new Animated.Value(v))).current;

  useEffect(() => {
    alturas.forEach((bar, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, { toValue: 0.15, duration: 250 + i * 60, useNativeDriver: true }),
          Animated.timing(bar, { toValue: 1,    duration: 250 + i * 60, useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);

  return (
    <View style={s.ecualizador}>
      {alturas.map((bar, i) => (
        <Animated.View
          key={i}
          style={[s.barra, { transform: [{ scaleY: bar }] }]}
        />
      ))}
    </View>
  );
}

// ── ZZZs de modo durmiendo ────────────────────────────────────────────────────

export function ZZZ() {
  const zetas = useRef([0, 1, 2].map(i => ({
    y:       new Animated.Value(0),
    opacity: new Animated.Value(0),
    scale:   new Animated.Value(0.6 + i * 0.2),
  }))).current;

  useEffect(() => {
    zetas.forEach((z, i) => {
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
    });
  }, []);

  return (
    <View style={sz.contenedor}>
      {zetas.map((z, i) => (
        <Animated.Text
          key={i}
          style={[sz.z, {
            opacity: z.opacity,
            transform: [{ translateY: z.y }, { scale: z.scale }],
            left: 10 + i * 22,
            bottom: i * 12,
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
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 700 + i * 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.2, duration: 900 + i * 180, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', left: x, top: y,
      width: r * 2, height: r * 2, borderRadius: r,
      backgroundColor: '#D4C5A9', opacity,
    }} />
  );
}

export function CieloNoche({ bgColor }: { bgColor: string }) {
  const floatY = useRef(new Animated.Value(0)).current;
  const lunaOp = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    Animated.loop(
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
    ).start();
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {ESTRELLAS_NOCHE.map((e) => <Estrella key={e.i} {...e} />)}
      <Animated.View style={{
        position: 'absolute', top: 88, left: 24,
        width: 76, height: 76,
        opacity: lunaOp, transform: [{ translateY: floatY }],
      }}>
        <View style={{ position: 'absolute', left: 2, top: 4, width: 66, height: 66, borderRadius: 33, backgroundColor: '#D4C5A9' }} />
        <View style={{ position: 'absolute', left: 20, top: 0, width: 62, height: 62, borderRadius: 31, backgroundColor: bgColor }} />
      </Animated.View>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  ecualizador: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 60 },
  barra:       { width: 7, height: 60, borderRadius: 4, backgroundColor: '#5DCAA5' },
});

const sz = StyleSheet.create({
  contenedor: { position: 'absolute', bottom: '52%', right: '18%', width: 80, height: 90 },
  z:          { position: 'absolute', fontSize: 22, fontWeight: '700', color: '#5DCAA5', opacity: 0 },
});
