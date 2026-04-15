import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// ── Paleta del display ────────────────────────────────────────────────────────
const LED     = '#E8A030';  // ámbar encendido
const LED_DIM = '#5A3A10';  // ámbar apagado (barra inactiva)
const ALERT   = '#FF7A00';  // naranja para alertas

// ── Ícono de clima ────────────────────────────────────────────────────────────
function iconoClima(desc?: string): string {
  if (!desc) return 'partly-sunny-outline';
  const d = desc.toLowerCase();
  if (/tormenta/.test(d))                      return 'thunderstorm-outline';
  if (/lluvia|llovizna|lloviendo|chaparrón/.test(d)) return 'rainy-outline';
  if (/nieve|granizo/.test(d))                 return 'snow-outline';
  if (/viento|ráfaga/.test(d))                 return 'flag-outline';
  if (/nublado|nuboso|cubierto/.test(d))       return 'cloud-outline';
  if (/parcial|algunas nubes/.test(d))         return 'partly-sunny-outline';
  if (/soleado|despejado|sol/.test(d))         return 'sunny-outline';
  return 'partly-sunny-outline';
}

// ── Waveform animado ──────────────────────────────────────────────────────────
const BAR_N = 7;

function WaveformLED({ activa, color }: { activa: boolean; color: string }) {
  const bars = useRef(
    Array.from({ length: BAR_N }, (_, i) => new Animated.Value(0.2 + (i % 3) * 0.15))
  ).current;
  const animsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    animsRef.current.forEach(a => a.stop());
    animsRef.current = [];

    if (!activa) {
      bars.forEach(b =>
        Animated.timing(b, { toValue: 0.15, duration: 250, useNativeDriver: true }).start()
      );
      return;
    }

    animsRef.current = bars.map((b, i) => {
      const a = Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 0.12, duration: 180 + i * 50, useNativeDriver: true }),
          Animated.timing(b, { toValue: 1,    duration: 180 + i * 50, useNativeDriver: true }),
        ])
      );
      a.start();
      return a;
    });

    return () => { animsRef.current.forEach(a => a.stop()); };
  }, [activa]);

  return (
    <View style={sw.wrap}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            sw.barra,
            {
              transform: [{ scaleY: bar }],
              backgroundColor: activa ? color : LED_DIM,
            },
          ]}
        />
      ))}
    </View>
  );
}

const sw = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 2, height: 16 },
  barra: { width: 2, height: 16, borderRadius: 1 },
});

// ── DisplayCuero ──────────────────────────────────────────────────────────────
type ClimaSummary = {
  temperatura?: number;
  descripcion?: string;
};

type Props = {
  horaMinuto:   string;
  climaObj:     ClimaSummary | null;
  musicaActiva: boolean;
  alertaActiva: boolean;
};

export default function DisplayCuero({ horaMinuto, climaObj, musicaActiva, alertaActiva }: Props) {
  const alertBlink = useRef(new Animated.Value(1)).current;
  const alertAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    alertAnimRef.current?.stop();
    if (!alertaActiva) {
      alertBlink.setValue(1);
      return;
    }
    alertAnimRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(alertBlink, { toValue: 0.15, duration: 500, useNativeDriver: true }),
        Animated.timing(alertBlink, { toValue: 1,    duration: 500, useNativeDriver: true }),
      ])
    );
    alertAnimRef.current.start();
    return () => { alertAnimRef.current?.stop(); };
  }, [alertaActiva]);

  const icono = iconoClima(climaObj?.descripcion);
  const temp  = climaObj?.temperatura != null ? `${Math.round(climaObj.temperatura)}°` : null;
  const color = alertaActiva ? ALERT : LED;

  return (
    <View style={s.pantalla}>

      {/* ── Fondo oscuro recesado ── */}
      <LinearGradient
        colors={['#0A0401', '#160A02', '#120801']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Brillo interno sutil (simula fósforo del tubo) ── */}
      <LinearGradient
        colors={['rgba(232,160,48,0.07)', 'rgba(232,160,48,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 34 }}
      />

      {/* ── Contenido ── */}
      <View style={s.row}>

        {/* Hora */}
        <Text style={[s.hora, { color }]}>{horaMinuto}</Text>

        {/* Separador */}
        <View style={s.sep} />

        {/* Waveform */}
        <View style={s.waveWrap}>
          <WaveformLED activa={musicaActiva} color={color} />
        </View>

        {/* Separador */}
        <View style={s.sep} />

        {/* Clima */}
        <View style={s.climaGroup}>
          {temp ? (
            <>
              <Ionicons name={icono as any} size={17} color={color} style={s.climaIcon} />
              <Animated.Text style={[s.temp, { color, opacity: alertaActiva ? alertBlink : 1 }]}>
                {temp}
              </Animated.Text>
            </>
          ) : (
            <Ionicons name="cloud-offline-outline" size={17} color={LED_DIM} />
          )}
        </View>

      </View>

      {/* ── Bisel interior (sombra en los bordes del display) ── */}
      <View style={s.bevelTop} />
      <View style={s.bevelLeft} />
    </View>
  );
}

const s = StyleSheet.create({
  pantalla: {
    width:         '88%',
    height:        68,
    borderRadius:  8,
    borderWidth:   1.5,
    borderColor:   '#4A2808',
    overflow:      'hidden',
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.70,
    shadowRadius:  8,
    elevation:     8,
  },

  row: {
    flex:             1,
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 14,
    gap:              10,
  },

  hora: {
    fontSize:    30,
    fontWeight:  '300',
    letterSpacing: 3,
    // @ts-ignore — fontVariant soportado en RN
    fontVariant: ['tabular-nums'],
    textShadowColor:  'rgba(232,160,48,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  sep: {
    width:           1,
    height:          36,
    backgroundColor: '#4A2808',
  },

  waveWrap: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    maxHeight:       16,
  },

  climaGroup: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },

  climaIcon: {
    textShadowColor:  'rgba(232,160,48,0.40)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },

  temp: {
    fontSize:    20,
    fontWeight:  '300',
    letterSpacing: 1,
    // @ts-ignore
    fontVariant: ['tabular-nums'],
  },

  // Biseles interiores para dar efecto de pantalla hundida
  bevelTop: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    height:          2,
    backgroundColor: 'rgba(0,0,0,0.60)',
  },
  bevelLeft: {
    position:        'absolute',
    top:             0,
    left:            0,
    width:           2,
    bottom:          0,
    backgroundColor: 'rgba(0,0,0,0.40)',
  },
});
