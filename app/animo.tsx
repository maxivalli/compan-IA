import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cargarEntradasAnimo,
  cargarPerfil,
  limpiarHistorialAnimo,
  EntradaAnimo,
  ExpresionAnimo,
  obtenerPIN,
} from '../lib/memoria';
import PinOverlay from '../components/PinOverlay';

const M3 = {
  primary:          '#0097b2',
  onPrimary:        '#ffffff',
  primaryContainer: '#cef5ff',
  onPrimaryContainer: '#001f26',
  error:            '#ba1a1a',
  errorContainer:   '#ffdad6',
  surface:          '#f9fafb',
  surfaceVariant:   '#dce8ec',
  onSurface:        '#191c1d',
  onSurfaceVariant: '#3f484a',
  outlineVariant:   '#bec8cb',
  surfaceTint:      '#0097b2',
  elevation1:       '#edf6f8',
} as const;

function getEmojis(masc: boolean): Record<ExpresionAnimo, { emoji: string; label: string; color: string; bg: string }> {
  return {
    feliz:       { emoji: '😊', label: masc ? 'Contento'    : 'Contenta',    color: '#7C5200', bg: '#FFE0A0' },
    triste:      { emoji: '😢', label: 'Triste',                              color: '#004785', bg: '#D3E4FF' },
    sorprendida: { emoji: '😮', label: masc ? 'Sorprendido' : 'Sorprendida', color: '#5B0073', bg: '#EDD9FF' },
    pensativa:   { emoji: '🤔', label: masc ? 'Pensativo'   : 'Pensativa',   color: '#7D2D00', bg: '#FFDCC8' },
    neutral:     { emoji: '😐', label: masc ? 'Tranquilo'   : 'Tranquila',   color: '#1B5E28', bg: '#C8EFCE' },
  };
}

type GrupoDia = { fechaLabel: string; entradas: EntradaAnimo[] };

function agruparPorDia(entradas: EntradaAnimo[]): GrupoDia[] {
  const mapa = new Map<string, EntradaAnimo[]>();
  for (const e of [...entradas].reverse()) {
    const fecha = new Date(e.timestamp).toLocaleDateString('es-AR', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    if (!mapa.has(fecha)) mapa.set(fecha, []);
    mapa.get(fecha)!.push(e);
  }
  return Array.from(mapa.entries()).map(([fechaLabel, ents]) => ({ fechaLabel, entradas: ents }));
}

// Calcula la emoción predominante de un grupo
type EmojiEntry = { emoji: string; label: string; color: string; bg: string };
function emocionPredominante(entradas: EntradaAnimo[], masc: boolean): EmojiEntry {
  const conteo: Partial<Record<ExpresionAnimo, number>> = {};
  for (const e of entradas) conteo[e.expresion] = (conteo[e.expresion] ?? 0) + 1;
  const top = (Object.entries(conteo) as [ExpresionAnimo, number][])
    .sort((a, b) => b[1] - a[1])[0][0];
  return getEmojis(masc)[top];
}

export default function Animo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [grupos,          setGrupos]          = useState<GrupoDia[]>([]);
  const [nombre,          setNombre]          = useState('');
  const [nombreAsistente, setNombreAsistente] = useState('la asistente');
  const [pinOverlay,      setPinOverlay]      = useState(false);
  const [desbloqueado,    setDesbloqueado]    = useState(false);
  const [masculino,       setMasculino]       = useState(false);

  function cargar() {
    Promise.all([cargarEntradasAnimo(), cargarPerfil()]).then(([entradas, perfil]) => {
      setGrupos(agruparPorDia(entradas));
      setNombre(perfil.nombreAbuela);
      setNombreAsistente(perfil.nombreAsistente ?? 'la asistente');
      setMasculino(perfil.vozGenero === 'masculina');
    });
  }

  // Verificar PIN cada vez que la pantalla obtiene el foco
  useFocusEffect(useCallback(() => {
    obtenerPIN().then(pin => {
      if (pin) {
        setDesbloqueado(false);
        setPinOverlay(true);
      } else {
        setDesbloqueado(true);
        cargar();
      }
    });
  }, []));

  useEffect(() => {
    if (desbloqueado) cargar();
  }, [desbloqueado]);

  function confirmarLimpiar() {
    Alert.alert(
      'Borrar historial',
      '¿Querés borrar todos los registros de estado de ánimo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: () => limpiarHistorialAnimo().then(cargar) },
      ]
    );
  }

  return (
    <View style={{ flex: 1 }}>
    {pinOverlay && (
      <PinOverlay
        modo="verificar"
        onSuccess={() => { setPinOverlay(false); setDesbloqueado(true); }}
        onCancel={() => { setPinOverlay(false); router.back(); }}
      />
    )}
    <ScrollView style={s.fondo} contentContainerStyle={{ paddingBottom: 48 }}>

      {/* ── Hero top bar ── */}
      <View style={[s.topBar, { paddingTop: insets.top + 16 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.btnIcono, pressed && { backgroundColor: '#ffffff22' }]}
          android_ripple={{ color: '#ffffff44', radius: 20, borderless: true }}
        >
          <Ionicons name="arrow-back" size={24} color={M3.onPrimary} />
        </Pressable>

        <View style={s.topBarHero}>
          <View style={s.avatarRing}>
            <View style={s.avatar}>
              <Ionicons name="happy" size={22} color={M3.primary} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.topBarEyebrow}>historial</Text>
            <Text style={s.topBarTitulo}>Estado de ánimo</Text>
            {nombre ? <Text style={s.topBarSub}>de {nombre}</Text> : null}
          </View>
        </View>

        {grupos.length > 0 && (
          <Pressable
            onPress={confirmarLimpiar}
            style={({ pressed }) => [s.btnIcono, pressed && { backgroundColor: '#ffdad655' }]}
            android_ripple={{ color: '#ffdad6', radius: 20, borderless: true }}
          >
            <Ionicons name="trash-outline" size={22} color="#ffdad6" />
          </Pressable>
        )}
      </View>

      {/* ── Empty state ── */}
      {grupos.length === 0 && (
        <View style={s.vacioCont}>
          <View style={s.vacioIconoCont}>
            <Ionicons name="happy-outline" size={40} color={M3.onPrimaryContainer} />
          </View>
          <Text style={s.vacioTexto}>Todavía no hay registros</Text>
          <Text style={s.vacioSub}>Los registros aparecen después de cada charla con {nombreAsistente}.</Text>
        </View>
      )}

      {/* ── Day groups ── */}
      {grupos.map((g) => {
        const predominante = emocionPredominante(g.entradas, masculino);
        return (
          <View key={g.fechaLabel} style={s.grupo}>

            {/* Día header con chip de emoción predominante */}
            <View style={s.diaHeader}>
              <Text style={s.diaLabel}>{g.fechaLabel.toUpperCase()}</Text>
              <View style={[s.diaChip, { backgroundColor: predominante.bg }]}>
                <Text style={s.diaChipEmoji}>{predominante.emoji}</Text>
                <Text style={[s.diaChipText, { color: predominante.color }]}>{predominante.label}</Text>
              </View>
            </View>

            <View style={s.card}>
              {g.entradas.map((e, i) => {
                const EMOJIS = getEmojis(masculino);
                const { emoji, label, color, bg } = EMOJIS[e.expresion] ?? EMOJIS.neutral;
                const hora = new Date(e.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <View key={i}>
                    {i > 0 && <View style={s.divisor} />}
                    <View style={s.fila}>
                      <View style={[s.emojiCircle, { backgroundColor: bg }]}>
                        <Text style={s.emoji}>{emoji}</Text>
                      </View>
                      <Text style={[s.emocionLabel, { color }]}>{label}</Text>
                      <View style={[s.horaChip, { backgroundColor: bg + '66' }]}>
                        <Text style={[s.hora, { color }]}>{hora}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

    </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: M3.surface },

  topBar: {
    backgroundColor: M3.primary,
    paddingBottom: 24,
    paddingHorizontal: 8,
    elevation: 2,
    shadowColor: M3.surfaceTint,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  btnIcono:   { padding: 10, borderRadius: 100, overflow: 'hidden' },
  topBarHero: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, marginTop: 8 },

  avatarRing: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' },
  avatar:     { width: 42, height: 42, borderRadius: 21, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },

  topBarEyebrow: { fontSize: 11, fontWeight: '500', color: '#ffffffaa', textTransform: 'uppercase', letterSpacing: 1.6 },
  topBarTitulo:  { fontSize: 28, fontWeight: '300', color: '#ffffff', letterSpacing: -0.3, lineHeight: 32 },
  topBarSub:     { fontSize: 12, color: '#ffffffcc', marginTop: 2, letterSpacing: 0.2 },

  vacioCont:      { alignItems: 'center', marginTop: 80, paddingHorizontal: 32, gap: 12 },
  vacioIconoCont: { width: 80, height: 80, borderRadius: 40, backgroundColor: M3.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  vacioTexto:     { fontSize: 16, fontWeight: '500', color: M3.onSurface, letterSpacing: 0.15 },
  vacioSub:       { fontSize: 14, color: M3.onSurfaceVariant, textAlign: 'center', lineHeight: 20, letterSpacing: 0.25 },

  grupo:     { marginTop: 20, paddingHorizontal: 16 },
  diaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  diaLabel:  { fontSize: 11, fontWeight: '600', color: M3.onSurfaceVariant, letterSpacing: 1.4, flex: 1 },
  diaChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 },
  diaChipEmoji: { fontSize: 14 },
  diaChipText:  { fontSize: 12, fontWeight: '600', letterSpacing: 0.1 },

  card: {
    backgroundColor: M3.elevation1,
    borderRadius: 20,
    elevation: 1,
    shadowColor: M3.surfaceTint,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  divisor: { height: 1, backgroundColor: M3.outlineVariant + '88', marginHorizontal: 16 },

  fila: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
    gap: 12, minHeight: 60,
  },
  emojiCircle:  { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  emoji:        { fontSize: 22 },
  emocionLabel: { flex: 1, fontSize: 14, fontWeight: '500', letterSpacing: 0.1 },
  horaChip:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  hora:         { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
});