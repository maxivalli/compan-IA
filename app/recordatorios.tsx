import { useCallback, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { cargarRecordatorios, borrarRecordatorio, Recordatorio, cargarPerfil } from '../lib/memoria';

const M = {
  primary:          '#0097b2',
  onPrimary:        '#ffffff',
  primaryContainer: '#b8eaf4',
  onPrimaryContainer: '#001f26',
  surface:          '#f5fafb',
  onSurface:        '#171d1e',
  onSurfaceVariant: '#3f484a',
  outlineVariant:   '#bfc8ca',
  error:            '#ba1a1a',
  background:       '#f5fafb',
  medContainer:     '#fff8e7',
  medBorder:        '#f59e0b',
  medText:          '#92400e',
};

// ── Parsea todas las horas de un string de medicamento ─────────────────────
function parsearHoras(med: string): string[] {
  const matches = [...med.matchAll(/(\d{1,2})(?::(\d{2}))?\s*h/gi)];
  return matches.map(m => {
    const h = m[1].padStart(2, '0');
    const min = m[2] ? m[2] : '00';
    return `${h}:${min} hs`;
  });
}

// Nombre del medicamento: todo antes del primer número+h
function parsearNombre(med: string): string {
  return med.replace(/\s*\d{1,2}(?::\d{2})?\s*h.*/gi, '').trim() || med;
}

function MedicamentoRow({ texto }: { texto: string }) {
  const nombre = parsearNombre(texto);
  const horas  = parsearHoras(texto);

  return (
    <View style={s.row}>
      <Ionicons name="medical-outline" size={16} color={M.medBorder} style={{ marginTop: 1 }} />
      <View style={s.texts}>
        <Text style={s.texto}>{nombre}</Text>
        {horas.length > 0 && (
          <Text style={s.fecha}>{horas.join(' · ')}</Text>
        )}
      </View>
    </View>
  );
}

function RecordatorioRow({ r, onDelete }: { r: Recordatorio; onDelete: () => void }) {
  const fecha = new Date(r.fechaISO + 'T12:00:00');
  const label = fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  let horaLabel = '';
  if (r.timestampEpoch) {
    const d = new Date(r.timestampEpoch);
    horaLabel = ` · ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return (
    <View style={s.row}>
      <View style={s.dot} />
      <View style={s.texts}>
        <Text style={s.texto}>{r.texto}</Text>
        <Text style={s.fecha}>{label}{horaLabel}</Text>
      </View>
      <TouchableOpacity onPress={onDelete} style={s.del} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={18} color={M.error} />
      </TouchableOpacity>
    </View>
  );
}

export default function RecordatoriosScreen() {
  const router = useRouter();
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [medicamentos,  setMedicamentos]  = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      cargarRecordatorios().then(setRecordatorios);
      cargarPerfil().then(p => setMedicamentos(p.medicamentos ?? []));
    }, [])
  );

  useFocusEffect(useCallback(() => {
    let sub: ReturnType<typeof BackHandler.addEventListener> | null = null;
    const id = setTimeout(() => {
      sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.replace('/');
        return true;
      });
    }, 0);
    return () => { clearTimeout(id); sub?.remove(); };
  }, [router]));

  const sinNada = recordatorios.length === 0 && medicamentos.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: M.background }}>
      <ScreenHeader titulo="Recordatorios" eyebrow="agenda" icono="alarm-outline" />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>

        {/* ── Medicamentos ─────────────────────────────────────── */}
        {medicamentos.length > 0 && (
          <>
            <View style={s.seccionHeader}>
              <Ionicons name="medical-outline" size={14} color={M.medBorder} />
              <Text style={s.seccionLabel}>Medicamentos</Text>
            </View>
            <View style={[s.card, s.cardMed]}>
              {medicamentos.map((med, i) => (
                <View key={i}>
                  {i > 0 && <View style={s.divisor} />}
                  <MedicamentoRow texto={med} />
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Recordatorios puntuales ───────────────────────────── */}
        {recordatorios.length > 0 && (
          <>
            <View style={s.seccionHeader}>
              <Ionicons name="alarm-outline" size={14} color={M.primary} />
              <Text style={[s.seccionLabel, { color: M.primary }]}>Próximos avisos</Text>
            </View>
            <View style={s.card}>
              {recordatorios.map((r, i) => (
                <View key={r.id}>
                  {i > 0 && <View style={s.divisor} />}
                  <RecordatorioRow
                    r={r}
                    onDelete={async () => {
                      await borrarRecordatorio(r.id);
                      setRecordatorios(prev => prev.filter(x => x.id !== r.id));
                    }}
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Estado vacío ─────────────────────────────────────── */}
        {sinNada && (
          <View style={s.empty}>
            <Ionicons name="alarm-outline" size={48} color={M.onSurfaceVariant} style={{ opacity: 0.4 }} />
            <Text style={s.emptyTitle}>Sin recordatorios</Text>
            <Text style={s.emptyHint}>
              Pedile a un familiar que te deje uno desde Telegram con el comando /recordatorios,
              o diciéndoselo a{'\u00a0'}Rosita.
            </Text>
          </View>
        )}

        <View style={s.hint}>
          <Ionicons name="information-circle-outline" size={16} color={M.onSurfaceVariant} />
          <Text style={s.hintText}>
            Los recordatorios se borran automáticamente una vez avisados.
            Un familiar puede agregar uno desde Telegram con /recordatorios.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  seccionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  seccionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: M.medBorder,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    overflow: 'hidden',
  },
  cardMed: {
    borderLeftWidth: 3,
    borderLeftColor: M.medBorder,
  },

  row:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  dot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: M.primary, flexShrink: 0 },
  texts: { flex: 1 },
  texto: { fontSize: 14, fontWeight: '500', color: M.onSurface },
  fecha: { fontSize: 12, color: M.onSurfaceVariant, marginTop: 2 },
  del:   { padding: 4 },

  divisor: { height: 1, backgroundColor: M.outlineVariant, opacity: 0.4, marginHorizontal: 16 },

  empty: {
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '500', color: M.onSurfaceVariant },
  emptyHint:  { fontSize: 13, color: M.onSurfaceVariant, textAlign: 'center', lineHeight: 20, opacity: 0.8 },

  hint: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 12,
    backgroundColor: M.primaryContainer,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  hintText: { flex: 1, fontSize: 12, color: M.onPrimaryContainer, lineHeight: 18 },
});
