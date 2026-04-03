import { useEffect, useRef, useState } from 'react';
import {
  Animated, Modal, PixelRatio, Pressable, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { Lista } from '../lib/memoria';

function fs(size: number) { return size * Math.min(PixelRatio.getFontScale(), 1.3); }

export const POSTIT_COLORES = [
  { bg: '#FEF9C3', text: '#5C3D00', tape: '#ddd9a8', fold: '#ede880' },  // amarillo
  { bg: '#FCE7F3', text: '#6B1040', tape: '#d9b8cc', fold: '#f0bedd' },  // rosa
  { bg: '#DCFCE7', text: '#14532D', tape: '#a8d4b8', fold: '#aaecbf' },  // verde
  { bg: '#DBEAFE', text: '#1E3A8A', tape: '#a8c4e0', fold: '#a8ccf4' },  // azul
  { bg: '#F3E8FF', text: '#4A1D96', tape: '#c8b0e4', fold: '#d8b8f8' },  // violeta
] as const;

type Props = {
  visible: boolean;
  listas: Lista[];
  onBorrar: (nombre: string) => void;
  onClose: () => void;
};

export default function PostItViewer({ visible, listas, onBorrar, onClose }: Props) {
  const [showing, setShowing] = useState(false);
  const [idx, setIdx]         = useState(0);
  const idxRef                = useRef(0);
  const listasRef             = useRef(listas);

  const scaleAnim   = useRef(new Animated.Value(0.15)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const slideX      = useRef(new Animated.Value(0)).current;

  useEffect(() => { listasRef.current = listas; }, [listas]);

  useEffect(() => {
    if (!showing) return;
    if (listas.length === 0) {
      animarSalida(() => { setShowing(false); onClose(); });
    } else if (idx >= listas.length) {
      const safe = listas.length - 1;
      setIdx(safe);
      idxRef.current = safe;
    }
  }, [listas.length]);

  useEffect(() => {
    if (visible) {
      setIdx(0);
      idxRef.current = 0;
      scaleAnim.setValue(0.15);
      opacityAnim.setValue(0);
      slideX.setValue(0);
      setShowing(true);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1, useNativeDriver: true, tension: 160, friction: 12,
        }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else if (showing) {
      animarSalida(() => setShowing(false));
    }
  }, [visible]);

  function animarSalida(cb?: () => void) {
    Animated.parallel([
      Animated.timing(scaleAnim,   { toValue: 0.15, duration: 180, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0,    duration: 180, useNativeDriver: true }),
    ]).start(cb);
  }

  function cerrar() {
    animarSalida(() => { setShowing(false); onClose(); });
  }

  function navegar(direccion: 'izq' | 'der') {
    const ci     = idxRef.current;
    const cl     = listasRef.current;
    const newIdx = direccion === 'izq' ? ci + 1 : ci - 1;
    if (newIdx < 0 || newIdx >= cl.length) return;

    const salida  = direccion === 'izq' ? -420 : 420;
    const entrada = direccion === 'izq' ?  420 : -420;
    idxRef.current = newIdx;

    Animated.timing(slideX, { toValue: salida, duration: 200, useNativeDriver: true }).start(() => {
      setIdx(newIdx);
      slideX.setValue(entrada);
      Animated.spring(slideX, {
        toValue: 0, useNativeDriver: true, tension: 200, friction: 22,
      }).start();
    });
  }

  const swipeGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-25, 25])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      if (e.translationX < -60) navegar('izq');
      else if (e.translationX > 60) navegar('der');
    });

  if (!showing) return null;

  const lista = listas[idx] ?? listas[0] ?? null;
  if (!lista) return null;

  const c = POSTIT_COLORES[idx % POSTIT_COLORES.length];

  function handleBorrar() {
    const nombre   = lista.nombre;
    const esUltima = listas.length <= 1;
    onBorrar(nombre);
    if (esUltima) {
      cerrar();
    } else {
      const newIdx  = idx > 0 ? idx - 1 : 0;
      const salida  = idx > 0 ? 420 : -420;
      const entrada = idx > 0 ? -420 : 420;
      idxRef.current = newIdx;
      Animated.timing(slideX, { toValue: salida, duration: 200, useNativeDriver: true }).start(() => {
        setIdx(Math.min(newIdx, listasRef.current.length - 1));
        idxRef.current = Math.min(newIdx, listasRef.current.length - 1);
        slideX.setValue(entrada);
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, tension: 200, friction: 22 }).start();
      });
    }
  }

  return (
    <Modal visible={showing} transparent animationType="none" onRequestClose={cerrar} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[s.backdrop, { opacity: opacityAnim }]}>

          <Pressable style={StyleSheet.absoluteFill} onPress={cerrar} />

          <View style={s.sheet}>
            <GestureDetector gesture={swipeGesture}>
              <Animated.View style={{ transform: [{ scale: scaleAnim }, { translateX: slideX }] }}>

                <View style={[s.card, { backgroundColor: c.bg }]}>

                  {/* Cinta adhesiva centrada arriba */}
                  <View style={s.tapeWrap} pointerEvents="none">
                    <View style={[s.tape, { backgroundColor: c.tape }]} />
                  </View>

                  {/* Ícono tacho en círculo — arriba a la derecha */}
                  <TouchableOpacity
                    style={[s.trashBtn, { borderColor: c.text + '55' }]}
                    onPress={handleBorrar}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color={c.text} />
                  </TouchableOpacity>

                  {/* Título en mayúsculas bold */}
                  <View style={s.headerArea}>
                    <Text style={[s.titulo, { color: c.text }]} numberOfLines={2}>
                      {lista.nombre.toUpperCase()}:
                    </Text>
                  </View>

                  {/* Ítems con bullet e itálica */}
                  <ScrollView
                    style={s.scroll}
                    contentContainerStyle={s.scrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {lista.items.length === 0 ? (
                      <Text style={[s.vacio, { color: c.text + '77' }]}>Lista vacía</Text>
                    ) : (
                      lista.items.map((item, i) => (
                        <View key={i} style={s.itemRow}>
                          <Text style={[s.bullet, { color: c.text }]}>•</Text>
                          <Text style={[s.itemTexto, { color: c.text }]}>{item}</Text>
                        </View>
                      ))
                    )}
                  </ScrollView>

                  <View style={{ height: 20 }} />

                </View>

              </Animated.View>
            </GestureDetector>

            {listas.length > 1 && (
              <View style={s.dotsOutside}>
                {listas.map((_, i) => (
                  <View
                    key={i}
                    style={[s.dot, {
                      backgroundColor: '#ffffff',
                      opacity: i === idx ? 0.88 : 0.28,
                      width: i === idx ? 22 : 8,
                    }]}
                  />
                ))}
              </View>
            )}
          </View>

        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    alignItems: 'center',
    gap: 18,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    width: 300,
    height: 300,
    borderRadius: 0,
    borderBottomRightRadius: 40,
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 14 },
    shadowOpacity: 0.30,
    shadowRadius: 22,
    elevation: 20,
    overflow: 'hidden',
  },

  // ── Cinta adhesiva ────────────────────────────────────────────────────────
  tapeWrap: {
    position: 'absolute',
    top: -20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  tape: {
    width: 72,
    height: 38,
    borderRadius: 2,
    opacity: 0.72,
    transform: [{ rotate: '-1deg' }],
  },

  // ── Trash button ──────────────────────────────────────────────────────────
  trashBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  // ── Contenido ─────────────────────────────────────────────────────────────
  headerArea: {
    paddingTop: 36,
    paddingHorizontal: 22,
    paddingBottom: 10,
    paddingRight: 60,
  },
  titulo: {
    fontSize: fs(30),
    fontWeight: '800',
    letterSpacing: 0.6,
    lineHeight: fs(38),
  },

  scroll: {
    flex: 1,
    paddingHorizontal: 22,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  bullet: {
    fontSize: fs(28),
    lineHeight: fs(40),
    fontWeight: '700',
  },
  itemTexto: {
    fontSize: fs(28),
    fontStyle: 'italic',
    flex: 1,
    lineHeight: fs(40),
  },
  vacio: {
    fontSize: fs(15),
    textAlign: 'center',
    marginVertical: 24,
    fontStyle: 'italic',
  },

  // ── Dots de navegación ────────────────────────────────────────────────────
  dotsOutside: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 12,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
