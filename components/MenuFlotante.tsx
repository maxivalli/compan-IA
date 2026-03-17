import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cargarPerfil } from '../lib/memoria';

const ITEMS = [
  { ruta: '/',              label: 'ASISTENTE',       sub: 'Pantalla principal',    icono: 'heart',            color: '#7C5200', bg: '#FFE0A0' },
  { ruta: '/animo',         label: 'Estado de ánimo', sub: 'Registro del día',      icono: 'happy-outline',    color: '#004785', bg: '#D3E4FF' },
  { ruta: '/configuracion', label: 'Configuración',   sub: 'Perfil y preferencias', icono: 'settings-outline', color: '#1B5E28', bg: '#C8EFCE' },
] as const;

const M3 = {
  primary:          '#0097b2',
  onPrimary:        '#ffffff',
  primaryContainer: '#cef5ff',
  onPrimaryContainer: '#001f26',
  surface:          '#f9fafb',
  surfaceVariant:   '#dce8ec',
  onSurface:        '#191c1d',
  onSurfaceVariant: '#3f484a',
  outline:          '#6f797b',
  outlineVariant:   '#bec8cb',
  scrim:            '#000000',
  surfaceTint:      '#0097b2',
  elevation1:       '#edf6f8',
} as const;

export default function MenuFlotante({ oscuro = false }: { oscuro?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [nombreAsistente, setNombre] = useState('Rosita');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    cargarPerfil().then(p => setNombre(p.nombreAsistente ?? 'Rosita'));
  }, []);

  const slide   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const router   = useRouter();
  const pathname = usePathname();

  function abrir() {
    setAbierto(true);
    Animated.parallel([
      Animated.timing(slide,   { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }

  function cerrar(cb?: () => void) {
    Animated.parallel([
      Animated.timing(slide,   { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => { setAbierto(false); cb?.(); });
  }

  function ir(ruta: string) { cerrar(() => router.push(ruta as any)); }

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });

  return (
    <>
      <Pressable
        style={({ pressed }) => [s.btn, oscuro ? s.btnOscuro : s.btnClaro, pressed && { opacity: 0.75 }]}
        onPress={abrir}
        android_ripple={{ color: M3.primaryContainer, radius: 22 }}
      >
        <Ionicons name="menu" size={22} color={oscuro ? M3.onPrimary : M3.primary} />
      </Pressable>

      {abierto && (
        <>
          <Animated.View style={[s.scrim, { opacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => cerrar()} />
          </Animated.View>

          <Animated.View style={[s.panel, { transform: [{ translateX }] }]}>

            {/* ── Hero header ── */}
            <View style={[s.header, { paddingTop: insets.top + 28 }]}>
              <View style={s.avatarRing}>
                <View style={s.avatar}>
                  <Ionicons name="heart" size={26} color={M3.primary} />
                </View>
              </View>
              <Text style={s.headerEyebrow}>tu compañera</Text>
              <Text style={s.headerTitulo}>{nombreAsistente}</Text>
              <Text style={s.headerFecha}>
                {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            </View>

            {/* ── Nav items como chips tonales ── */}
            <View style={s.lista}>
              {ITEMS.map(({ ruta, label, sub, icono, color, bg }) => {
                const activo = pathname === ruta;
                return (
                  <Pressable
                    key={ruta}
                    onPress={() => ir(ruta)}
                    style={({ pressed }) => [
                      s.item,
                      activo && s.itemActivo,
                      pressed && !activo && { opacity: 0.7 },
                    ]}
                    android_ripple={{ color: bg, radius: 140 }}
                  >
                    <View style={[s.itemIconWrap, { backgroundColor: activo ? bg : M3.surfaceVariant }]}>
                      <Ionicons
                        name={icono as any}
                        size={20}
                        color={activo ? color : M3.onSurfaceVariant}
                      />
                    </View>
                    <View style={s.itemTextos}>
                      <Text style={[s.itemLabel, activo && { color, fontWeight: '700' }]}>
                        {label === 'ASISTENTE' ? nombreAsistente : label}
                      </Text>
                      <Text style={s.itemSub}>{sub}</Text>
                    </View>
                    {activo && <View style={[s.activeDot, { backgroundColor: color }]} />}
                  </Pressable>
                );
              })}
            </View>

            {/* ── Footer ── */}
            <View style={s.footer}>
              <View style={s.footerChip}>
                <Ionicons name="shield-checkmark-outline" size={12} color={M3.onSurfaceVariant} />
                <Text style={s.footerText}>Tus datos son privados</Text>
              </View>
            </View>

          </Animated.View>
        </>
      )}
    </>
  );
}

const s = StyleSheet.create({
  btn:      { position: 'absolute', top: 52, right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 100, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  btnOscuro:{ backgroundColor: '#ffffff1a' },
  btnClaro: { backgroundColor: '#cef5ff' },
  scrim:    { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000066', zIndex: 20 },

  panel: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: 300,
    backgroundColor: '#f9fafb',
    zIndex: 30,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    elevation: 6,
    shadowColor: '#0097b2',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    overflow: 'hidden',
  },

  header: {
    backgroundColor: '#0097b2',
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  avatarRing: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#ffffff22',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#ffffff',
    alignItems: 'center', justifyContent: 'center',
  },
  headerEyebrow: { fontSize: 11, fontWeight: '500', color: '#ffffffaa', textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 2 },
  headerTitulo:  { fontSize: 34, fontWeight: '300', color: '#ffffff', letterSpacing: -0.5, lineHeight: 38 },
  headerFecha:   { fontSize: 12, color: '#ffffffcc', marginTop: 6, letterSpacing: 0.2, textTransform: 'capitalize' },

  lista: { flex: 1, paddingTop: 16, paddingHorizontal: 16, gap: 4 },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 100,
    minHeight: 56,
    overflow: 'hidden',
  },
  itemActivo: { backgroundColor: '#edf6f8' },

  itemIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },

  itemTextos: { flex: 1 },
  itemLabel:  { fontSize: 14, fontWeight: '500', letterSpacing: 0.1, color: '#191c1d' },
  itemSub:    { fontSize: 11, color: '#3f484a', marginTop: 1, letterSpacing: 0.3 },

  activeDot: { width: 6, height: 6, borderRadius: 3 },

  footer:     { paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center' },
  footerChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#dce8ec', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  footerText: { fontSize: 11, color: '#3f484a', letterSpacing: 0.3 },
});