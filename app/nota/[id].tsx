import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ASYNC_JOBS_INBOX_KEY = 'asyncJobsInbox';

const M3 = {
  primary:          '#0097b2',
  onPrimary:        '#ffffff',
  primaryContainer: '#cef5ff',
  surface:          '#f9fafb',
  surfaceVariant:   '#dce8ec',
  onSurface:        '#191c1d',
  onSurfaceVariant: '#3f484a',
  outlineVariant:   '#bec8cb',
  elevation1:       '#edf6f8',
  errorContainer:   '#ffdad6',
  error:            '#ba1a1a',
};

type Ingrediente = { item: string; cantidad: string; unidad: string; notas?: string };
type Paso = { n: number; texto: string; tiempo_aprox?: string };
type Fuente = { titulo: string; url: string };

type ResultReceta = {
  titulo: string;
  descripcion_corta?: string;
  tiempo_total?: string;
  porciones?: string;
  ingredientes?: Ingrediente[];
  pasos?: Paso[];
};

type ResultBusqueda = {
  titulo: string;
  resumen?: string;
  puntos_clave?: string[];
  fuentes?: Fuente[];
};

type JobInbox = {
  id: string;
  tipo: string;
  query: string;
  resultJson: unknown;
  createdAt: string;
};

export default function NotaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobInbox | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(ASYNC_JOBS_INBOX_KEY).then(raw => {
      const inbox: JobInbox[] = raw ? JSON.parse(raw) : [];
      setJob(inbox.find(j => j.id === id) ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [router]));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={M3.primary} />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.centered}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={M3.primary} />
        </Pressable>
        <Ionicons name="document-outline" size={48} color={M3.outlineVariant} />
        <Text style={styles.emptyText}>Nota no encontrada</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={16}>
          <Ionicons name="arrow-back" size={30} color={M3.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {job.tipo === 'receta' ? 'Receta' : 'Nota'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {job.tipo === 'receta'
          ? <RecetaViewer data={job.resultJson as ResultReceta} />
          : <BusquedaViewer data={job.resultJson as ResultBusqueda} />
        }
      </ScrollView>
    </View>
  );
}

function RecetaViewer({ data }: { data: ResultReceta }) {
  return (
    <>
      <Text style={styles.titulo}>{data.titulo}</Text>
      {data.descripcion_corta ? <Text style={styles.descripcion}>{data.descripcion_corta}</Text> : null}

      <View style={styles.metaRow}>
        {data.tiempo_total ? (
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={22} color={M3.primary} />
            <Text style={styles.metaText}>{data.tiempo_total}</Text>
          </View>
        ) : null}
        {data.porciones ? (
          <View style={styles.metaChip}>
            <Ionicons name="people-outline" size={22} color={M3.primary} />
            <Text style={styles.metaText}>{data.porciones}</Text>
          </View>
        ) : null}
      </View>

      {data.ingredientes?.length ? (
        <>
          <Text style={styles.seccion}>Ingredientes</Text>
          {data.ingredientes.map((ing, i) => (
            <View key={i} style={styles.ingredienteRow}>
              <View style={styles.bullet} />
              <Text style={styles.ingredienteTexto}>
                {ing.cantidad ? `${ing.cantidad} ${ing.unidad} `.trimEnd() : ''}{ing.item}
                {ing.notas ? <Text style={styles.notas}> ({ing.notas})</Text> : null}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {data.pasos?.length ? (
        <>
          <Text style={styles.seccion}>Preparación</Text>
          {data.pasos.map((paso, i) => (
            <View key={i} style={styles.pasoRow}>
              <View style={styles.numeroBadge}>
                <Text style={styles.numeroBadgeText}>{paso.n ?? i + 1}</Text>
              </View>
              <View style={styles.pasoContent}>
                <Text style={styles.pasoTexto}>{paso.texto}</Text>
                {paso.tiempo_aprox ? <Text style={styles.notas}>{paso.tiempo_aprox}</Text> : null}
              </View>
            </View>
          ))}
        </>
      ) : null}

    </>
  );
}

function BusquedaViewer({ data }: { data: ResultBusqueda }) {
  return (
    <>
      <Text style={styles.titulo}>{data.titulo}</Text>
      {data.resumen ? <Text style={styles.resumen}>{data.resumen}</Text> : null}

      {data.puntos_clave?.length ? (
        <>
          <Text style={styles.seccion}>Puntos clave</Text>
          {data.puntos_clave.map((p, i) => <Text key={i} style={styles.bulletItem}>• {p}</Text>)}
        </>
      ) : null}

      <FuentesSection fuentes={data.fuentes} />
    </>
  );
}

function FuentesSection({ fuentes }: { fuentes?: Fuente[] }) {
  if (!fuentes?.length) return null;
  return (
    <>
      <Text style={styles.seccion}>Fuentes</Text>
      {fuentes.map((f, i) => (
        <View key={i} style={styles.fuenteRow}>
          <Ionicons name="link-outline" size={20} color={M3.primary} style={{ marginTop: 2 }} />
          <Text style={styles.fuenteTexto} numberOfLines={2}>{f.titulo}</Text>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: M3.surface },
  centered:  { flex: 1, backgroundColor: M3.surface, justifyContent: 'center', alignItems: 'center', gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: M3.surface,
    borderBottomWidth: 1,
    borderBottomColor: M3.outlineVariant,
    gap: 8,
  },
  headerTitle: { flex: 1, fontSize: 24, fontWeight: '700', color: M3.onSurface },
  backBtn: { padding: 4 },
  scroll: { padding: 24, paddingBottom: 56 },
  titulo: { fontSize: 30, fontWeight: '800', color: M3.onSurface, marginBottom: 10 },
  descripcion: { fontSize: 20, color: M3.onSurfaceVariant, marginBottom: 14, lineHeight: 30 },
  resumen:     { fontSize: 20, color: M3.onSurface, marginBottom: 14, lineHeight: 30 },
  metaRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: M3.primaryContainer, borderRadius: 24,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  metaText: { fontSize: 18, color: M3.primary, fontWeight: '600' },
  seccion: { fontSize: 22, fontWeight: '700', color: M3.primary, marginTop: 24, marginBottom: 12 },
  ingredienteRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  bullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: M3.primary, marginTop: 10 },
  ingredienteTexto: { flex: 1, fontSize: 20, color: M3.onSurface, lineHeight: 30 },
  notas: { fontSize: 17, color: M3.onSurfaceVariant },
  pasoRow: { flexDirection: 'row', marginBottom: 16, gap: 12, alignItems: 'flex-start' },
  numeroBadge: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: M3.primary, justifyContent: 'center', alignItems: 'center',
    flexShrink: 0, marginTop: 2,
  },
  numeroBadgeText: { color: M3.onPrimary, fontSize: 18, fontWeight: '700' },
  pasoContent: { flex: 1 },
  pasoTexto: { fontSize: 20, color: M3.onSurface, lineHeight: 30 },
  bulletItem: { fontSize: 20, color: M3.onSurface, marginBottom: 10, lineHeight: 30 },
  fuenteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  fuenteTexto: { flex: 1, fontSize: 18, color: M3.onSurfaceVariant, lineHeight: 26 },
  emptyText: { fontSize: 20, color: M3.onSurfaceVariant, marginTop: 8 },
});
