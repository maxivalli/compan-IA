import { useCallback, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenHeader from '../components/ScreenHeader';

const ASYNC_JOBS_INBOX_KEY = 'asyncJobsInbox';
const MAX_NOTAS = 10;

const M = {
  primary:          '#0097b2',
  primaryContainer: '#cef5ff',
  onPrimaryContainer: '#001f26',
  surface:          '#f5fafb',
  surfaceVariant:   '#dce8ec',
  onSurface:        '#171d1e',
  onSurfaceVariant: '#3f484a',
  outlineVariant:   '#bfc8ca',
  background:       '#f5fafb',
};

type JobInbox = {
  id:         string;
  tipo:       string;
  query:      string;
  resultJson: unknown;
  createdAt:  string;
};

function fechaRelativa(isoString: string): string {
  const fecha = new Date(isoString);
  const ahora = new Date();
  const diffMs = ahora.getTime() - fecha.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH   = Math.floor(diffMs / 3_600_000);
  const diffD   = Math.floor(diffMs / 86_400_000);

  if (diffMin < 2)  return 'Hace un momento';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffH   < 24) return `Hace ${diffH} h`;
  if (diffD   === 1) return 'Ayer';
  if (diffD   < 7)  return `Hace ${diffD} días`;
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
}

function tituloNota(job: JobInbox): string {
  const res = job.resultJson as any;
  return res?.titulo ?? job.query ?? 'Nota';
}

function resumenNota(job: JobInbox): string {
  const res = job.resultJson as any;
  if (job.tipo === 'receta') {
    const partes = [res?.tiempo_total, res?.porciones].filter(Boolean);
    return partes.length > 0 ? partes.join(' · ') : 'Receta completa';
  }
  return res?.resumen
    ? String(res.resumen).slice(0, 80) + (String(res.resumen).length > 80 ? '…' : '')
    : 'Información guardada';
}

export default function NotasScreen() {
  const router = useRouter();
  const [notas, setNotas] = useState<JobInbox[]>([]);
  const [cargando, setCargando] = useState(true);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  useFocusEffect(useCallback(() => {
    setCargando(true);
    AsyncStorage.getItem(ASYNC_JOBS_INBOX_KEY)
      .then(raw => {
        const inbox: JobInbox[] = raw ? JSON.parse(raw) : [];
        const ordenadas = [...inbox].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ).slice(0, MAX_NOTAS);
        setNotas(ordenadas);
      })
      .catch(() => setNotas([]))
      .finally(() => setCargando(false));
  }, []));

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router]));

  // Ancho de cada card en modo horizontal (2 columnas con gap de 10)
  const cardWidth = isLandscape ? (width - 32 - 10) / 2 : undefined;

  return (
    <View style={s.flex}>
      <ScreenHeader titulo="Notas" eyebrow="guardadas" icono="document-text-outline" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.contenido, isLandscape && s.contenidoHorizontal]}
        showsVerticalScrollIndicator={false}
      >
        {cargando ? (
          <View style={s.vacio}>
            <Ionicons name="hourglass-outline" size={48} color={M.outlineVariant} />
            <Text style={s.vacioTxt}>Cargando notas…</Text>
          </View>
        ) : notas.length === 0 ? (
          <View style={s.vacio}>
            <Ionicons name="document-outline" size={56} color={M.outlineVariant} />
            <Text style={s.vacioTxt}>Todavía no hay notas guardadas</Text>
            <Text style={s.vacioSub}>
              Cuando Rosita busque una receta o información, la guardará acá para que la puedas ver cuando quieras.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[s.seccionLabel, isLandscape && s.seccionLabelFull]}>
              Últimas {notas.length} notas
            </Text>
            <View style={[s.grid, isLandscape && s.gridHorizontal]}>
              {notas.map(nota => (
                <Pressable
                  key={nota.id}
                  style={({ pressed }) => [s.card, isLandscape && { width: cardWidth }, pressed && s.cardPressed]}
                  onPress={() => router.push(`/nota/${nota.id}` as Parameters<typeof router.push>[0])}
                  android_ripple={{ color: M.primaryContainer, radius: 300 }}
                >
                  {/* Ícono por tipo */}
                  <View style={[s.iconWrap, nota.tipo === 'receta' ? s.iconReceta : s.iconBusqueda]}>
                    <Ionicons
                      name={nota.tipo === 'receta' ? 'restaurant-outline' : 'search-outline'}
                      size={22}
                      color={nota.tipo === 'receta' ? '#7D2D00' : '#004785'}
                    />
                  </View>

                  {/* Textos */}
                  <View style={s.textos}>
                    <View style={s.tipoRow}>
                      <Text style={[s.tipoBadge, nota.tipo === 'receta' ? s.tipoBadgeReceta : s.tipoBadgeBusqueda]}>
                        {nota.tipo === 'receta' ? 'Receta' : 'Búsqueda'}
                      </Text>
                      <Text style={s.fecha}>{fechaRelativa(nota.createdAt)}</Text>
                    </View>
                    <Text style={s.titulo} numberOfLines={2}>{tituloNota(nota)}</Text>
                    <Text style={s.resumen} numberOfLines={2}>{resumenNota(nota)}</Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={M.outlineVariant} />
                </Pressable>
              ))}
            </View>

            <Text style={s.piePagina}>
              Se muestran las últimas {MAX_NOTAS} notas. Las más antiguas se reemplazan automáticamente.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: M.background },
  scroll:  { flex: 1 },
  contenido:           { padding: 16, paddingBottom: 48 },
  contenidoHorizontal: { paddingHorizontal: 16 },

  seccionLabel: {
    fontSize: 12, fontWeight: '600', color: M.onSurfaceVariant,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 12, marginTop: 4, marginLeft: 4,
  },
  seccionLabelFull: { width: '100%' },

  grid:           { gap: 10 },
  gridHorizontal: { flexDirection: 'row', flexWrap: 'wrap' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.85 },

  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  iconReceta:   { backgroundColor: '#FFDCC8' },
  iconBusqueda: { backgroundColor: '#D3E4FF' },

  textos: { flex: 1, gap: 4 },

  tipoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  tipoBadge: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
    textTransform: 'uppercase', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20,
  },
  tipoBadgeReceta:   { backgroundColor: '#FFDCC8', color: '#7D2D00' },
  tipoBadgeBusqueda: { backgroundColor: '#D3E4FF', color: '#004785' },

  fecha:  { fontSize: 11, color: M.onSurfaceVariant },
  titulo: { fontSize: 15, fontWeight: '600', color: M.onSurface, lineHeight: 21 },
  resumen:{ fontSize: 13, color: M.onSurfaceVariant, lineHeight: 19 },

  vacio: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 80, gap: 12,
  },
  vacioTxt: { fontSize: 17, fontWeight: '500', color: M.onSurfaceVariant, textAlign: 'center' },
  vacioSub: { fontSize: 14, color: M.outlineVariant, textAlign: 'center', lineHeight: 22, maxWidth: 280, marginTop: 4 },

  piePagina: {
    fontSize: 11, color: M.outlineVariant, textAlign: 'center',
    marginTop: 16, lineHeight: 17, width: '100%',
  },
});
