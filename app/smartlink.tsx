import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  actualizarDispositivos,
  controlarDispositivo,
  Dispositivo,
  obtenerEstadoDispositivo,
  obtenerEstadoSmartThings,
} from '../lib/smartthings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const M = {
  primary: '#0097b2',
  onPrimary: '#ffffff',
  surface: '#f5fafb',
  surfaceCard: '#ffffff',
  surfaceVariant: '#dbe4e6',
  onSurface: '#171d1e',
  onSurfaceVariant: '#546063',
  outline: '#95a5a6',
  success: '#2E7D32',
  warning: '#8E5A00',
  error: '#ba1a1a',
};

function leerSwitch(payload: Record<string, any> | null, fallback?: boolean): boolean | undefined {
  const value = payload?.switch;
  return typeof value === 'boolean' ? value : fallback;
}

function iconoDispositivo(tipo: string): keyof typeof Ionicons.glyphMap {
  const t = tipo.toLowerCase();
  if (t.includes('light') || t.includes('bulb')) return 'bulb-outline';
  if (t.includes('switch') || t.includes('plug') || t.includes('outlet')) return 'power-outline';
  if (t.includes('air') || t.includes('conditioner')) return 'snow-outline';
  return 'hardware-chip-outline';
}

export default function SmartLinkScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [vinculado, setVinculado] = useState(false);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const cargar = useCallback(async (modo: 'inicial' | 'refresh' = 'inicial') => {
    if (modo === 'refresh') setRefrescando(true);
    else setCargando(true);
    try {
      const estado = await obtenerEstadoSmartThings();
      setVinculado(estado.vinculado);
      if (!estado.vinculado) {
        setDispositivos([]);
        return;
      }
      const base = await actualizarDispositivos();
      const conEstado = await Promise.all(
        base.map(async dispositivo => {
          if (!dispositivo.online) return dispositivo;
          const payload = await obtenerEstadoDispositivo(dispositivo.id).catch(() => null);
          return { ...dispositivo, estado: leerSwitch(payload, dispositivo.estado) };
        }),
      );
      setDispositivos(conEstado);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    cargar('inicial');
  }, [cargar]));

  async function toggleDispositivo(dispositivo: Dispositivo, valor: boolean) {
    if (!dispositivo.online || updatingId) return;
    setUpdatingId(dispositivo.id);
    try {
      const ok = await controlarDispositivo(dispositivo.id, valor);
      const payload = await obtenerEstadoDispositivo(dispositivo.id).catch(() => null);
      const estadoReal = leerSwitch(payload, ok ? valor : dispositivo.estado);
      setDispositivos(prev =>
        prev.map(item =>
          item.id === dispositivo.id ? { ...item, estado: estadoReal } : item
        ),
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 28 }]}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar('refresh')} tintColor={M.primary} />}
      >
        <View style={[s.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={22} color={M.onPrimary} />
          </TouchableOpacity>
          <View style={s.headerTextos}>
            <Text style={s.eyebrow}>Panel del hogar</Text>
            <Text style={s.title}>SmartLink</Text>
          </View>
          <View style={s.headerIcono}>
            <Ionicons name="bulb-outline" size={28} color={M.onPrimary} style={{ opacity: 0.6 }} />
          </View>
        </View>

        <View style={s.intro}>
          <Ionicons name="flash-outline" size={16} color={M.primary} />
          <Text style={s.introTexto}>Estado en vivo y control manual de tus dispositivos vinculados.</Text>
        </View>

        {cargando ? (
          <View style={s.centerCard}>
            <ActivityIndicator size="large" color={M.primary} />
            <Text style={s.centerText}>Cargando dispositivos...</Text>
          </View>
        ) : !vinculado ? (
          <View style={s.centerCard}>
            <Ionicons name="link-outline" size={28} color={M.warning} />
            <Text style={s.centerTitle}>SmartThings no está vinculado</Text>
            <Text style={s.centerText}>Conectalo desde Configuración para ver y controlar tus dispositivos.</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={() => router.push('/configuracion')} activeOpacity={0.8}>
              <Ionicons name="settings-outline" size={18} color={M.onPrimary} />
              <Text style={s.primaryBtnText}>Ir a Configuración</Text>
            </TouchableOpacity>
          </View>
        ) : dispositivos.length === 0 ? (
          <View style={s.centerCard}>
            <Ionicons name="bulb-outline" size={28} color={M.primary} />
            <Text style={s.centerTitle}>No hay dispositivos visibles</Text>
            <Text style={s.centerText}>Deslizá para refrescar o revisá tu cuenta de SmartThings.</Text>
          </View>
        ) : (
          <View style={s.list}>
            {dispositivos.map(dispositivo => {
              const prendido = dispositivo.estado === true;
              const apagado = dispositivo.estado === false;
              const disabled = !dispositivo.online || updatingId === dispositivo.id;
              const iconBg = prendido ? '#FFE6A7' : '#E1E6E8';
              const iconColor = prendido ? '#8E5A00' : M.onSurfaceVariant;
              return (
                <View key={dispositivo.id} style={s.card}>
                  <View style={s.rowTop}>
                    <View style={[s.iconWrap, { backgroundColor: dispositivo.online ? iconBg : M.surfaceVariant }]}>
                      <Ionicons
                        name={iconoDispositivo(dispositivo.tipo)}
                        size={20}
                        color={dispositivo.online ? iconColor : M.onSurfaceVariant}
                      />
                    </View>
                    <View style={s.deviceTextos}>
                      <Text style={s.deviceNombre}>{dispositivo.nombre}</Text>
                      <Text style={s.deviceTipo}>{dispositivo.tipo}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: dispositivo.online ? '#E8F5E9' : '#F4E6E6' }]}>
                      <Text style={[s.badgeText, { color: dispositivo.online ? M.success : M.error }]}>
                        {dispositivo.online ? 'online' : 'offline'}
                      </Text>
                    </View>
                  </View>

                  <View style={s.rowBottom}>
                    <View>
                      <Text style={s.estadoLabel}>Estado</Text>
                      <Text style={s.estadoValor}>
                        {prendido ? 'Encendido' : apagado ? 'Apagado' : 'Sin datos'}
                      </Text>
                    </View>

                    <View style={s.switchWrap}>
                      {updatingId === dispositivo.id && <ActivityIndicator size="small" color={M.primary} style={s.switchSpinner} />}
                      <Switch
                        value={prendido}
                        disabled={disabled}
                        onValueChange={valor => toggleDispositivo(dispositivo, valor)}
                        trackColor={{ false: '#cfd8dc', true: '#90dfe9' }}
                        thumbColor={prendido ? M.primary : '#f4f4f4'}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: M.surface },
  content: { paddingBottom: 28 },
  header: {
    backgroundColor: M.primary,
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  headerTextos: { flex: 1 },
  eyebrow: { fontSize: 11, color: '#ffffffaa', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1.4 },
  title: { fontSize: 28, fontWeight: '300', color: M.onPrimary, letterSpacing: -0.3, lineHeight: 34 },
  headerIcono: { marginBottom: 2 },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#cef5ff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#bec8cb',
    marginBottom: 18,
  },
  introTexto: { fontSize: 13, color: M.onSurface, flex: 1, lineHeight: 18 },
  centerCard: {
    backgroundColor: M.surfaceCard,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  centerTitle: { fontSize: 18, fontWeight: '700', color: M.onSurface, textAlign: 'center' },
  centerText: { fontSize: 14, color: M.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: M.primary,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnText: { color: M.onPrimary, fontWeight: '700', fontSize: 14 },
  list: { gap: 12, paddingHorizontal: 16 },
  card: {
    backgroundColor: M.surfaceCard,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deviceTextos: { flex: 1 },
  deviceNombre: { fontSize: 16, fontWeight: '700', color: M.onSurface },
  deviceTipo: { fontSize: 12, color: M.onSurfaceVariant, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  rowBottom: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#edf1f2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  estadoLabel: { fontSize: 12, color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.4 },
  estadoValor: { fontSize: 15, color: M.onSurface, fontWeight: '600', marginTop: 2 },
  switchWrap: { minWidth: 72, alignItems: 'flex-end', justifyContent: 'center' },
  switchSpinner: { position: 'absolute', left: -26 },
});
