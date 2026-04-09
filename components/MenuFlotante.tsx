import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cargarPerfil } from '../lib/memoria';
import { obtenerEstadoSmartThings } from '../lib/smartthings';

const ITEMS = [
  { ruta: '/',               label: 'ASISTENTE',       sub: 'Pantalla principal',    icono: 'heart',                  color: '#7C5200', bg: '#FFE0A0' },
  { ruta: '/animo',          label: 'Estado de ánimo', sub: 'Registro del día',      icono: 'happy-outline',          color: '#004785', bg: '#D3E4FF' },
  { ruta: '/recordatorios',  label: 'Recordatorios',   sub: 'Avisos y pendientes',   icono: 'alarm-outline',          color: '#7D2D00', bg: '#FFDCC8' },
  { ruta: '/notas',          label: 'Notas',           sub: 'Recetas e información', icono: 'document-text-outline',  color: '#1B5E28', bg: '#C8EFCE' },
  { ruta: '/configuracion',  label: 'Configuración',   sub: 'Perfil y preferencias', icono: 'settings-outline',       color: '#5B0073', bg: '#EDD9FF' },
  { ruta: '/guia',           label: 'Guía de uso',     sub: 'Funciones y comandos',  icono: 'book-outline',           color: '#6A0D91', bg: '#F0DEFF' },
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
  const [nombreAsistente, setNombre]   = useState('Rosita');
  const [vozGenero, setVozGenero]      = useState<'femenina' | 'masculina'>('femenina');
  const [smartLinkVisible, setSmartLinkVisible] = useState(false);
  const insets = useSafeAreaInsets();

  const { width: screenW } = useWindowDimensions();
  const isTablet  = screenW >= 600;
  const ms        = isTablet ? Math.min(screenW / 390, 1.6) : 1; // menu scale
  const panelW    = Math.round(300 * ms);
  const btnSize   = Math.round(44  * ms);
  const icoMenu   = Math.round(22  * ms);
  const icoNav    = Math.round(20  * ms);
  const icoHeart  = Math.round(26  * ms);
  const avatarOut = Math.round(64  * ms);
  const avatarIn  = Math.round(52  * ms);
  const itemH     = Math.round(56  * ms);
  const iconWrap  = Math.round(40  * ms);

  useEffect(() => {
    cargarPerfil().then(p => {
      setNombre(p.nombreAsistente ?? 'Rosita');
      setVozGenero(p.vozGenero ?? 'femenina');
    });
  }, []);

  const slide   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!abierto) return;
    let viva = true;
    obtenerEstadoSmartThings().then(({ vinculado }) => {
      if (viva) setSmartLinkVisible(vinculado);
    }).catch(() => {
      if (viva) setSmartLinkVisible(false);
    });
    return () => { viva = false; };
  }, [abierto, pathname]);

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

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [panelW + 20, 0] });
  const items = smartLinkVisible
    ? [
        ITEMS[0],
        ITEMS[1],
        ITEMS[2],
        ITEMS[3],
        { ruta: '/smartlink', label: 'SmartLink',  sub: 'Luces y dispositivos', icono: 'bulb-outline',           color: '#8E5A00', bg: '#FFE7BE' },
        ITEMS[4],
        ITEMS[5],
      ]
    : ITEMS;

  return (
    <>
      <Pressable
        style={({ pressed }) => [s.btn, oscuro ? s.btnOscuro : s.btnClaro, pressed && { opacity: 0.75 }, { width: btnSize, height: btnSize }]}
        onPress={abrir}
        android_ripple={{ color: M3.primaryContainer, radius: btnSize / 2 }}
      >
        <Ionicons name="menu" size={icoMenu} color={oscuro ? M3.onPrimary : M3.primary} />
      </Pressable>

      {abierto && (
        <>
          <Animated.View style={[s.scrim, { opacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => cerrar()} />
          </Animated.View>

          <Animated.View style={[s.panel, { width: panelW, transform: [{ translateX }] }]}>

            {/* ── Hero header ── */}
            <View style={[s.header, { paddingTop: insets.top + 28 }]}>
              <View style={[s.avatarRing, { width: avatarOut, height: avatarOut, borderRadius: avatarOut / 2 }]}>
                <View style={[s.avatar, { width: avatarIn, height: avatarIn, borderRadius: avatarIn / 2 }]}>
                  <Ionicons name="heart" size={icoHeart} color={M3.primary} />
                </View>
              </View>
              <Text style={[s.headerEyebrow, isTablet && { fontSize: 14 }]}>{vozGenero === 'masculina' ? 'tu compañero' : 'tu compañera'}</Text>
              <Text style={[s.headerTitulo,  isTablet && { fontSize: 42 }]}>{nombreAsistente}</Text>
              <Text style={[s.headerFecha,   isTablet && { fontSize: 15 }]}>
                {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            </View>

            {/* ── Nav items como chips tonales ── */}
            <View style={s.lista}>
              {items.map(({ ruta, label, sub, icono, color, bg }) => {
                const activo = pathname === ruta;
                return (
                  <Pressable
                    key={ruta}
                    onPress={() => ir(ruta)}
                    style={({ pressed }) => [
                      s.item,
                      activo && s.itemActivo,
                      pressed && !activo && { opacity: 0.7 },
                      { minHeight: itemH },
                    ]}
                    android_ripple={{ color: bg, radius: 140 }}
                  >
                    <View style={[s.itemIconWrap, { backgroundColor: activo ? bg : M3.surfaceVariant, width: iconWrap, height: iconWrap, borderRadius: iconWrap / 2 }]}>
                      <Ionicons
                        name={icono as any}
                        size={icoNav}
                        color={activo ? color : M3.onSurfaceVariant}
                      />
                    </View>
                    <View style={s.itemTextos}>
                      <Text style={[s.itemLabel, activo && { color, fontWeight: '700' }, isTablet && { fontSize: 18 }]}>
                        {label === 'ASISTENTE' ? nombreAsistente : label}
                      </Text>
                      <Text style={[s.itemSub, isTablet && { fontSize: 14 }]}>{sub}</Text>
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
