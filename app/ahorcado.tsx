import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import {
  estadoInicial,
  procesarLetra,
  estaGanado,
  estaPerdido,
  palabraConMascaras,
  parsearLetraDesdeVoz,
  type EstadoAhorcado,
} from '../lib/ahorcado';

// ── Paleta ──────────────────────────────────────────────────────────────────────

const M = {
  bg:       '#0f172a',
  surface:  '#1e293b',
  border:   '#334155',
  text:     '#f1f5f9',
  sub:      '#94a3b8',
  correcta: '#4ade80',
  errada:   '#f87171',
  btn:      '#0097b2',
  btnText:  '#ffffff',
  vida:     '#f43f5e',
  overlay:  'rgba(0,0,0,0.88)',
  letrabg:  '#1e293b',
  letraBorder: '#475569',
};

const MAX_ERRORES = 6;

// Todas las letras del español (sin Ñ al final para acomodar el grid de 9 cols)
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÑ'.split('');

// ── Vidas (corazones animados) ──────────────────────────────────────────────────

function Vidas({ errores }: { errores: number }) {
  const anims = useRef(
    Array.from({ length: MAX_ERRORES }, () => new Animated.Value(1))
  ).current;
  const prevErrores = useRef(errores);

  useEffect(() => {
    if (errores > prevErrores.current) {
      const idx = errores - 1;
      Animated.sequence([
        Animated.timing(anims[idx], { toValue: 1.5, duration: 120, useNativeDriver: true }),
        Animated.timing(anims[idx], { toValue: 0,   duration: 200, useNativeDriver: true }),
      ]).start();
    }
    prevErrores.current = errores;
  }, [errores, anims]);

  return (
    <View style={sv.vidasRow}>
      {Array.from({ length: MAX_ERRORES }).map((_, i) => {
        const viva = i >= errores;
        return (
          <Animated.Text
            key={i}
            style={[sv.corazon, { transform: [{ scale: anims[i] }], opacity: viva ? 1 : 0.18 }]}
          >
            ❤️
          </Animated.Text>
        );
      })}
    </View>
  );
}

// ── Botón de letra ──────────────────────────────────────────────────────────────

function LetraBtn({
  letra, estado, onPress,
}: {
  letra: string;
  estado: 'libre' | 'correcta' | 'errada';
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  function handlePress() {
    if (estado !== 'libre') return;
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    onPress();
  }

  const bg =
    estado === 'correcta' ? M.correcta :
    estado === 'errada'   ? M.errada   :
    M.letrabg;
  const color =
    estado === 'correcta' ? '#052e16' :
    estado === 'errada'   ? '#fff1f2' :
    M.text;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={handlePress}
        disabled={estado !== 'libre'}
        style={[sv.letraBtn, { backgroundColor: bg, borderColor: estado === 'libre' ? M.letraBorder : bg }]}
      >
        <Text style={[sv.letraTxt, { color }]}>{letra}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ── Pantalla principal ──────────────────────────────────────────────────────────

type Fase = 'jugando' | 'ganaste' | 'perdi';

export default function AhorcadoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [juego, setJuego]           = useState<EstadoAhorcado>(estadoInicial());
  const [fase, setFase]             = useState<Fase>('jugando');
  const [escuchando, setEscuchando] = useState(false);
  const [textoVoz, setTextoVoz]     = useState('');
  const overlayAnim                 = useRef(new Animated.Value(0)).current;

  // Animación de letra correcta en la palabra
  const letraRevealAnims = useRef<Record<string, Animated.Value>>({});
  function getLetraAnim(letra: string) {
    if (!letraRevealAnims.current[letra]) {
      letraRevealAnims.current[letra] = new Animated.Value(0);
    }
    return letraRevealAnims.current[letra];
  }

  // ── SR ────────────────────────────────────────────────────────────────────────

  useSpeechRecognitionEvent('result', e => {
    const txt = e.results?.[0]?.transcript ?? '';
    setTextoVoz(txt);
    if (fase !== 'jugando') return;
    const letra = parsearLetraDesdeVoz(txt);
    if (letra) jugarLetra(letra);
  });

  useSpeechRecognitionEvent('end', () => {
    setEscuchando(false);
    if (fase === 'jugando') setTimeout(() => iniciarSR(), 600);
  });

  function iniciarSR() {
    try {
      ExpoSpeechRecognitionModule.start({ lang: 'es-AR', interimResults: false, continuous: false });
      setEscuchando(true);
    } catch {}
  }

  function detenerSR() {
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setEscuchando(false);
  }

  useEffect(() => {
    iniciarSR();
    return () => { detenerSR(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lógica ───────────────────────────────────────────────────────────────────

  function jugarLetra(letra: string) {
    setJuego(prev => {
      const nuevo = procesarLetra(prev, letra);
      if (nuevo === prev) return prev; // ya usada

      const esCorrecta = prev.palabra.includes(letra.toUpperCase());
      if (esCorrecta) {
        // Animar la letra que aparece
        const anim = getLetraAnim(letra.toUpperCase());
        anim.setValue(0);
        Animated.spring(anim, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }).start();
      }

      if (estaGanado(nuevo)) {
        setFase('ganaste');
        detenerSR();
        mostrarOverlay();
      } else if (estaPerdido(nuevo)) {
        setFase('perdi');
        detenerSR();
        mostrarOverlay();
      }
      return nuevo;
    });
  }

  function mostrarOverlay() {
    Animated.timing(overlayAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }

  function reiniciar() {
    overlayAnim.setValue(0);
    letraRevealAnims.current = {};
    setJuego(estadoInicial());
    setFase('jugando');
    setTextoVoz('');
    setTimeout(() => iniciarSR(), 300);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const errores  = juego.letrasErradas.size;
  const mascaras = juego.palabra.split(''); // letras individuales para animar

  const statusTexto =
    fase === 'ganaste' ? '¡Adivinaste! 🎉' :
    fase === 'perdi'   ? `Era: ${juego.palabra}` :
    `${MAX_ERRORES - errores} error${MAX_ERRORES - errores !== 1 ? 'es' : ''} restante${MAX_ERRORES - errores !== 1 ? 's' : ''}`;

  const overlayMsg =
    fase === 'ganaste' ? `¡Felicitaciones!\n"${juego.palabra}" 🎉` :
                         `Era "${juego.palabra}"\n¡La próxima! 💪`;

  return (
    <SafeAreaView style={[sv.safe, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={sv.header}>
        <TouchableOpacity onPress={() => { detenerSR(); router.replace('/'); }} style={sv.btnSalir}>
          <Text style={sv.btnSalirTexto}>✕ Salir</Text>
        </TouchableOpacity>
        <Text style={sv.titulo}>AHORCADO</Text>
        <View style={[sv.srDot, escuchando && sv.srDotActive]} />
      </View>

      {/* Vidas */}
      <Vidas errores={errores} />

      {/* Pista */}
      <Text style={sv.pista}>💡 {juego.pista}</Text>

      {/* Estado */}
      <Text style={sv.statusTexto}>{statusTexto}</Text>

      {/* Palabra con máscaras */}
      <View style={sv.palabraRow}>
        {mascaras.map((letra, i) => {
          const adivinada = juego.letrasAdivinadas.has(letra);
          const anim = getLetraAnim(letra);
          return (
            <View key={i} style={sv.letraCelda}>
              <Animated.Text
                style={[
                  sv.letraTexto,
                  adivinada
                    ? { color: M.correcta, transform: [{ scale: anim }] }
                    : { color: 'transparent' },
                ]}
              >
                {adivinada ? letra : '_'}
              </Animated.Text>
              <View style={sv.letraLinea} />
            </View>
          );
        })}
      </View>

      {/* Texto reconocido por voz */}
      {textoVoz ? <Text style={sv.vozTexto}>🎤 "{textoVoz}"</Text> : null}

      {/* Letras erradas */}
      {juego.letrasErradas.size > 0 && (
        <Text style={sv.erradas}>
          Letras usadas: {[...juego.letrasErradas].join('  ')}
        </Text>
      )}

      {/* Teclado — grilla de letras grandes */}
      <ScrollView
        contentContainerStyle={sv.tecladoWrap}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View style={sv.teclado}>
          {LETRAS.map(letra => {
            const estado =
              juego.letrasAdivinadas.has(letra) ? 'correcta' :
              juego.letrasErradas.has(letra)    ? 'errada'   :
              'libre';
            return (
              <LetraBtn
                key={letra}
                letra={letra}
                estado={estado}
                onPress={() => jugarLetra(letra)}
              />
            );
          })}
        </View>
      </ScrollView>

      {/* Overlay resultado */}
      <Animated.View
        style={[sv.overlay, { opacity: overlayAnim }]}
        pointerEvents={fase === 'jugando' ? 'none' : 'auto'}
      >
        <View style={sv.overlayCard}>
          <Text style={sv.overlayMsg}>{overlayMsg}</Text>
          <TouchableOpacity style={sv.btnOtra} onPress={reiniciar}>
            <Text style={sv.btnOtraTexto}>Jugar otra vez</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sv.btnVolver} onPress={() => { detenerSR(); router.replace('/'); }}>
            <Text style={sv.btnVolverTexto}>Volver a Rosita</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

    </SafeAreaView>
  );
}

// ── Estilos ──────────────────────────────────────────────────────────────────────

const sv = StyleSheet.create({
  safe: { flex: 1, backgroundColor: M.bg, alignItems: 'center' },

  header: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12,
  },
  btnSalir: { backgroundColor: M.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  btnSalirTexto: { color: M.sub, fontSize: 15, fontWeight: '600' },
  titulo: { color: M.text, fontSize: 22, fontWeight: '800', letterSpacing: 3 },
  srDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: M.border },
  srDotActive: { backgroundColor: '#4ade80' },

  vidasRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  corazon: { fontSize: 32 },

  pista: { color: M.sub, fontSize: 14, fontStyle: 'italic', textAlign: 'center', paddingHorizontal: 24, marginBottom: 4 },
  statusTexto: { color: M.text, fontSize: 16, fontWeight: '600', marginBottom: 12 },

  palabraRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 8, paddingHorizontal: 16, marginBottom: 8,
  },
  letraCelda: { alignItems: 'center', minWidth: 32 },
  letraTexto: { fontSize: 36, fontWeight: '900', lineHeight: 44 },
  letraLinea: { width: '100%', height: 3, backgroundColor: M.border, borderRadius: 2, marginTop: 2 },

  vozTexto: { color: M.sub, fontSize: 13, fontStyle: 'italic', marginBottom: 4 },
  erradas: { color: M.errada, fontSize: 14, fontWeight: '600', marginBottom: 8, letterSpacing: 1 },

  tecladoWrap: { paddingBottom: 16, paddingHorizontal: 8 },
  teclado: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6,
  },
  letraBtn: {
    width: 48, height: 52, borderRadius: 10, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  letraTxt: { fontSize: 22, fontWeight: '800' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: M.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: M.surface, borderRadius: 24, padding: 32,
    alignItems: 'center', gap: 16, width: '82%',
  },
  overlayMsg: { color: M.text, fontSize: 26, fontWeight: '800', textAlign: 'center', lineHeight: 36 },
  btnOtra: { backgroundColor: M.btn, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 16, width: '100%', alignItems: 'center' },
  btnOtraTexto: { color: M.btnText, fontSize: 18, fontWeight: '700' },
  btnVolver: { borderWidth: 2, borderColor: M.border, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, width: '100%', alignItems: 'center' },
  btnVolverTexto: { color: M.sub, fontSize: 16, fontWeight: '600' },
});
