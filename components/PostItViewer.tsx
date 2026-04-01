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
  { bg: '#FEF9C3', text: '#713F12', linea: '#EAB308' },  // amarillo
  { bg: '#FCE7F3', text: '#831843', linea: '#EC4899' },  // rosa
  { bg: '#DCFCE7', text: '#14532D', linea: '#22C55E' },  // verde
  { bg: '#DBEAFE', text: '#1E3A8A', linea: '#3B82F6' },  // azul
  { bg: '#F3E8FF', text: '#4A1D96', linea: '#A855F7' },  // violeta
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

  // Ajustar idx si listas se reduce mientras está abierto
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

  // Abrir / cerrar
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

  // Gesto nativo via RNGH — coexiste correctamente con ScrollView
  // activeOffsetX: activa solo tras 25px horizontal
  // failOffsetY:   falla si hay movimiento vertical mayor a 15px (cede al ScrollView)
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

  return (
    <Modal visible={showing} transparent animationType="none" onRequestClose={cerrar} statusBarTranslucent>
      {/* GestureHandlerRootView necesario dentro del Modal para que RNGH funcione */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[s.backdrop, { opacity: opacityAnim }]}>

          {/* Toque en el fondo cierra — Pressable no compite con RNGH */}
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrar} />

          <GestureDetector gesture={swipeGesture}>
            <Animated.View
              style={[s.sheet, {
                transform: [{ scale: scaleAnim }, { translateX: slideX }],
              }]}
            >
              <View style={[s.card, { backgroundColor: c.bg }]}>
                {/* Franja de color */}
                <View style={[s.franja, { backgroundColor: c.linea }]} />

                {/* Header */}
                <View style={s.header}>
                  <Text style={[s.titulo, { color: c.text }]} numberOfLines={2}>
                    {lista.nombre}
                  </Text>
                  <TouchableOpacity onPress={cerrar} hitSlop={12}>
                    <Ionicons name="close-circle" size={28} color={c.text + 'aa'} />
                  </TouchableOpacity>
                </View>

                {/* Ítems */}
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
                        <View style={[s.itemCirculo, { borderColor: c.text + '55' }]} />
                        <Text style={[s.itemTexto, { color: c.text }]}>{item}</Text>
                      </View>
                    ))
                  )}
                </ScrollView>

                {/* Footer */}
                <View style={s.footer}>
                  <TouchableOpacity
                    style={[s.btnBorrar, { borderColor: c.text + '33', backgroundColor: c.text + '11' }]}
                    onPress={() => {
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
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color={c.text} />
                    <Text style={[s.btnBorrarTexto, { color: c.text }]}>Borrar esta lista</Text>
                  </TouchableOpacity>
                </View>
              </View>

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
            </Animated.View>
          </GestureDetector>

        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 320,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.38,
    shadowRadius: 24,
    elevation: 22,
  },
  sheet: {
    alignItems: 'center',
    gap: 14,
  },
  franja: {
    height: 8,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 10,
  },
  titulo: {
    fontSize: fs(26),
    fontWeight: '800',
    textTransform: 'capitalize',
    flex: 1,
    marginRight: 10,
    lineHeight: fs(33),
  },
  scroll: {
    flexGrow: 0,
    maxHeight: 310,
    paddingHorizontal: 22,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 14,
  },
  itemCirculo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    flexShrink: 0,
  },
  itemTexto: {
    fontSize: fs(21),
    fontWeight: '700',
    flex: 1,
    lineHeight: fs(29),
  },
  vacio: {
    fontSize: fs(15),
    textAlign: 'center',
    marginVertical: 24,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
    alignItems: 'center',
  },
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
  btnBorrar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  btnBorrarTexto: {
    fontSize: fs(14),
    fontWeight: '600',
  },
});
