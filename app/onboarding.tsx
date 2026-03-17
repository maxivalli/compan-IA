import { useRef, useState } from 'react';
import {
  Animated, Dimensions, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { guardarPerfil, cargarPerfil } from '../lib/memoria';

const { width: W } = Dimensions.get('window');

const M = {
  primary:          '#0097b2',
  primaryDark:      '#007a91',
  onPrimary:        '#ffffff',
  primaryContainer: '#cef5ff',
  onPrimaryContainer: '#001f26',
  surface:          '#f9fafb',
  onSurface:        '#171d1e',
  onSurfaceVariant: '#3f484a',
  outline:          '#6f797a',
};

type Paso = {
  icono:    string;
  titulo:   string;
  subtitulo: string;
  color:    string;
};

const PASOS: Paso[] = [
  { icono: 'heart',              titulo: 'Bienvenida',             subtitulo: 'Tu compañera de todos los días',        color: '#0097b2' },
  { icono: 'person-outline',     titulo: '¿Cómo se llama?',        subtitulo: 'El nombre de quien va a usar la app',   color: '#7C5200' },
  { icono: 'calendar-outline',   titulo: '¿Cuántos años tiene?',   subtitulo: 'Para que la asistente adapte su trato', color: '#B04000' },
  { icono: 'chatbubble-outline', titulo: 'Nombre de la asistente', subtitulo: 'Con qué nombre la va a llamar',         color: '#1B5E28' },
  { icono: 'people-outline',     titulo: 'La familia',             subtitulo: 'Quiénes son sus familiares cercanos',   color: '#5B0073' },
  { icono: 'checkmark-circle',   titulo: '¡Todo listo!',           subtitulo: 'Ya podés empezar a usarla',             color: '#0097b2' },
];

export default function Onboarding() {
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  const progreso = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const [paso, setPaso]                       = useState(0);
  const [nombreAbuela, setNombreAbuela]       = useState('');
  const [edad, setEdad]                       = useState('');
  const [nombreAsistente, setNombreAsistente] = useState('Rosita');
  const [familiares, setFamiliares]           = useState('');

  function irAPaso(n: number) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      scroll.current?.scrollTo({ x: n * W, animated: false });
      Animated.timing(progreso, { toValue: n / (PASOS.length - 1), duration: 300, useNativeDriver: false }).start();
      setPaso(n);
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  }

  async function finalizar() {
    const perfilActual = await cargarPerfil();
    await guardarPerfil({
      ...perfilActual,
      nombreAbuela:    nombreAbuela.trim() || 'Abuela',
      edad:            edad.trim() ? parseInt(edad.trim(), 10) : undefined,
      nombreAsistente: nombreAsistente.trim() || 'Rosita',
      familiares:      familiares.split(',').map(s => s.trim()).filter(Boolean),
    });
    router.replace('/');
  }

  const barraAncho = progreso.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={s.contenedor}>

      {/* Barra de progreso */}
      <View style={s.barraFondo}>
        <Animated.View style={[s.barraRelleno, { width: barraAncho }]} />
      </View>

      <Animated.ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1, opacity: fadeAnim }}
      >
        {/* ── Paso 0: Bienvenida ── */}
        <View style={[s.pagina, { width: W }]}>
          <View style={[s.iconoCirculo, { backgroundColor: '#0097b2' }]}>
            <Ionicons name="heart" size={48} color="#fff" />
          </View>
          <Text style={s.titulo}>CompañIA</Text>
          <Text style={s.subtitulo}>La compañera de voz para adultos mayores</Text>
          <View style={s.features}>
            {[
              { i: 'musical-notes', t: 'Música y radio',        c: '#7C5200', bg: '#FFE0A0' },
              { i: 'medkit',        t: 'Recordatorios de meds',  c: '#004785', bg: '#D3E4FF' },
              { i: 'partly-sunny',  t: 'Clima en tiempo real',   c: '#1B5E28', bg: '#C8EFCE' },
              { i: 'people',        t: 'Alertas a la familia',   c: '#5B0073', bg: '#EDD9FF' },
              { i: 'chatbubble',    t: 'Charla y compañía',      c: '#004785', bg: '#cef5ff' },
              { i: 'alert-circle',  t: 'Botón de emergencia',    c: '#CC2222', bg: '#FFD5D5' },
            ].map(({ i, t, c, bg }) => (
              <View key={t} style={[s.chip, { backgroundColor: bg }]}>
                <Ionicons name={i as any} size={16} color={c} />
                <Text style={[s.chipText, { color: c }]}>{t}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={s.btnPrimario} onPress={() => irAPaso(1)}>
            <Text style={s.btnPrimarioTexto}>Empezar configuración</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Paso 1: Nombre de la abuela ── */}
        <View style={[s.pagina, { width: W }]}>
          <View style={[s.iconoCirculo, { backgroundColor: '#7C5200' }]}>
            <Ionicons name="person-outline" size={40} color="#fff" />
          </View>
          <Text style={s.titulo}>¿Cómo se llama?</Text>
          <Text style={s.subtitulo}>El nombre de quien va a usar la app</Text>
          <TextInput
            style={s.input}
            value={nombreAbuela}
            onChangeText={setNombreAbuela}
            placeholder="Ej: Negrita, María, Abuela"
            placeholderTextColor={M.outline}
            autoFocus
          />
          <Text style={s.hint}>Así la va a llamar la asistente</Text>
          <TouchableOpacity
            style={[s.btnPrimario, !nombreAbuela.trim() && s.btnDeshabilitado]}
            onPress={() => nombreAbuela.trim() && irAPaso(2)}
            disabled={!nombreAbuela.trim()}
          >
            <Text style={s.btnPrimarioTexto}>Continuar</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => irAPaso(0)} style={s.btnVolver}>
            <Ionicons name="arrow-back" size={16} color={M.onSurfaceVariant} />
            <Text style={s.btnVolverTexto}>Volver</Text>
          </TouchableOpacity>
        </View>

        {/* ── Paso 2: Edad ── */}
        <View style={[s.pagina, { width: W }]}>
          <View style={[s.iconoCirculo, { backgroundColor: '#B04000' }]}>
            <Ionicons name="calendar-outline" size={40} color="#fff" />
          </View>
          <Text style={s.titulo}>¿Cuántos años tiene?</Text>
          <Text style={s.subtitulo}>La asistente adapta su forma de hablar según la edad</Text>
          <TextInput
            style={s.input}
            value={edad}
            onChangeText={t => setEdad(t.replace(/[^0-9]/g, ''))}
            placeholder="Ej: 75"
            placeholderTextColor={M.outline}
            keyboardType="numeric"
            maxLength={3}
          />
          <Text style={s.hint}>Opcional. Podés saltear este paso.</Text>
          <TouchableOpacity style={s.btnPrimario} onPress={() => irAPaso(3)}>
            <Text style={s.btnPrimarioTexto}>Continuar</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => irAPaso(1)} style={s.btnVolver}>
            <Ionicons name="arrow-back" size={16} color={M.onSurfaceVariant} />
            <Text style={s.btnVolverTexto}>Volver</Text>
          </TouchableOpacity>
        </View>

        {/* ── Paso 3: Nombre de la asistente ── */}
        <View style={[s.pagina, { width: W }]}>
          <View style={[s.iconoCirculo, { backgroundColor: '#1B5E28' }]}>
            <Ionicons name="chatbubble-outline" size={40} color="#fff" />
          </View>
          <Text style={s.titulo}>¿Cómo la va a llamar?</Text>
          <Text style={s.subtitulo}>El nombre con el que {nombreAbuela || 'ella'} va a llamar a la asistente</Text>
          <TextInput
            style={s.input}
            value={nombreAsistente}
            onChangeText={setNombreAsistente}
            placeholder="Rosita"
            placeholderTextColor={M.outline}
          />
          <Text style={s.hint}>Por defecto: Rosita. Podés cambiarlo después.</Text>
          <TouchableOpacity style={s.btnPrimario} onPress={() => irAPaso(4)}>
            <Text style={s.btnPrimarioTexto}>Continuar</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => irAPaso(2)} style={s.btnVolver}>
            <Ionicons name="arrow-back" size={16} color={M.onSurfaceVariant} />
            <Text style={s.btnVolverTexto}>Volver</Text>
          </TouchableOpacity>
        </View>

        {/* ── Paso 4: Familiares ── */}
        <View style={[s.pagina, { width: W }]}>
          <View style={[s.iconoCirculo, { backgroundColor: '#5B0073' }]}>
            <Ionicons name="people-outline" size={40} color="#fff" />
          </View>
          <Text style={s.titulo}>La familia</Text>
          <Text style={s.subtitulo}>¿Quiénes son sus familiares cercanos?</Text>
          <TextInput
            style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
            value={familiares}
            onChangeText={setFamiliares}
            placeholder="hijo Juan, nieta Sofía, hija María"
            placeholderTextColor={M.outline}
            multiline
          />
          <Text style={s.hint}>Separados por coma. Podés saltear esto y completarlo después.</Text>
          <TouchableOpacity style={s.btnPrimario} onPress={() => irAPaso(5)}>
            <Text style={s.btnPrimarioTexto}>Continuar</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => irAPaso(3)} style={s.btnVolver}>
            <Ionicons name="arrow-back" size={16} color={M.onSurfaceVariant} />
            <Text style={s.btnVolverTexto}>Volver</Text>
          </TouchableOpacity>
        </View>

        {/* ── Paso 5: Listo ── */}
        <View style={[s.pagina, { width: W }]}>
          <View style={[s.iconoCirculo, { backgroundColor: '#0097b2' }]}>
            <Ionicons name="checkmark-circle" size={48} color="#fff" />
          </View>
          <Text style={s.titulo}>¡Todo listo, {nombreAbuela || 'bienvenida'}!</Text>
          <Text style={s.subtitulo}>
            {nombreAsistente || 'Rosita'} ya sabe quién sos y está lista para acompañarte.
          </Text>
          <View style={s.resumen}>
            <View style={s.resumenFila}>
              <Ionicons name="person" size={16} color={M.primary} />
              <Text style={s.resumenTexto}>{nombreAbuela || '—'}</Text>
            </View>
            {edad.trim() !== '' && (
              <View style={s.resumenFila}>
                <Ionicons name="calendar" size={16} color={M.primary} />
                <Text style={s.resumenTexto}>{edad} años</Text>
              </View>
            )}
            <View style={s.resumenFila}>
              <Ionicons name="chatbubble" size={16} color={M.primary} />
              <Text style={s.resumenTexto}>Tu asistente: {nombreAsistente || 'Rosita'}</Text>
            </View>
            {familiares.trim() !== '' && (
              <View style={s.resumenFila}>
                <Ionicons name="people" size={16} color={M.primary} />
                <Text style={s.resumenTexto}>{familiares}</Text>
              </View>
            )}
          </View>
          <Text style={s.hint}>Podés agregar medicamentos, Telegram y más desde Configuración.</Text>
          <TouchableOpacity style={s.btnPrimario} onPress={finalizar}>
            <Text style={s.btnPrimarioTexto}>¡Empezar!</Text>
            <Ionicons name="heart" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </Animated.ScrollView>

      {/* Indicadores de paso */}
      <View style={s.indicadores}>
        {PASOS.map((_, i) => (
          <View key={i} style={[s.punto, i === paso && s.puntoActivo]} />
        ))}
      </View>

    </View>
  );
}

const s = StyleSheet.create({
  contenedor:   { flex: 1, backgroundColor: M.surface, paddingTop: 52 },
  barraFondo:   { height: 3, backgroundColor: '#e0e0e0', marginHorizontal: 0 },
  barraRelleno: { height: 3, backgroundColor: M.primary },

  pagina: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 40 },

  iconoCirculo: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  titulo:    { fontSize: 28, fontWeight: '600', color: M.onSurface, textAlign: 'center', marginBottom: 8 },
  subtitulo: { fontSize: 15, color: M.onSurfaceVariant, textAlign: 'center', lineHeight: 22, marginBottom: 28 },

  features:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 32 },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100 },
  chipText:  { fontSize: 13, fontWeight: '600' },

  input:     { width: '100%', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#dde3e5', paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: M.onSurface, marginBottom: 8 },
  hint:      { fontSize: 12, color: M.onSurfaceVariant, textAlign: 'center', marginBottom: 24, lineHeight: 18 },

  btnPrimario:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: M.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 100, marginBottom: 12 },
  btnPrimarioTexto: { fontSize: 16, fontWeight: '600', color: '#fff' },
  btnDeshabilitado: { opacity: 0.4 },
  btnVolver:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnVolverTexto:   { fontSize: 14, color: M.onSurfaceVariant },

  resumen:     { backgroundColor: M.primaryContainer, borderRadius: 16, padding: 16, width: '100%', marginBottom: 16, gap: 10 },
  resumenFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resumenTexto:{ fontSize: 14, color: M.onPrimaryContainer, flex: 1 },

  indicadores: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  punto:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#dde3e5' },
  puntoActivo: { width: 20, backgroundColor: M.primary },
});
