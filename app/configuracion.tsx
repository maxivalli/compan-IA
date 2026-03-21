import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { cargarPerfil, guardarPerfil, Perfil, TelegramContacto, cargarRecordatorios, borrarRecordatorio, Recordatorio, obtenerInstallId, obtenerFamiliaId, guardarFamiliaId, obtenerCodigoRegistro, guardarCodigoRegistro, obtenerPIN, guardarPIN, eliminarPIN } from '../lib/memoria';
import PinOverlay from '../components/PinOverlay';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
const API_KEY     = process.env.EXPO_PUBLIC_APP_API_KEY!;

const TAGS_INTERESES = [
  'Libros', 'Televisión', 'Fútbol', 'Jardín', 'Huerta', 'Cocina',
  'Música', 'Tejido', 'Historia', 'Crucigramas', 'Religión', 'Política',
];

// [bg inactivo, texto inactivo, bg activo, texto activo]
const TAG_COLORS: Record<string, [string, string, string, string]> = {
  'Libros':      ['#EDE7F6', '#4527A0', '#7C3AED', '#fff'],
  'Televisión':  ['#E3F2FD', '#1565C0', '#1E88E5', '#fff'],
  'Fútbol':      ['#E8F5E9', '#1B5E20', '#2E7D32', '#fff'],
  'Jardín':      ['#F1F8E9', '#33691E', '#558B2F', '#fff'],
  'Huerta':      ['#FFF8E1', '#E65100', '#F57C00', '#fff'],
  'Cocina':      ['#FBE9E7', '#BF360C', '#E64A19', '#fff'],
  'Música':      ['#FCE4EC', '#880E4F', '#E91E8C', '#fff'],
  'Tejido':      ['#F3E5F5', '#6A1B9A', '#AB47BC', '#fff'],
  'Historia':    ['#EFEBE9', '#4E342E', '#6D4C41', '#fff'],
  'Crucigramas': ['#E0F7FA', '#006064', '#00838F', '#fff'],
  'Religión':    ['#E8EAF6', '#1A237E', '#3949AB', '#fff'],
  'Política':    ['#FFEBEE', '#B71C1C', '#C62828', '#fff'],
};

function fetchTimeout(url: string, ms: number, options?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

// ── Paleta Material You basada en #0097b2 ────────────────────────────────────
const M = {
  primary:          '#0097b2',
  onPrimary:        '#ffffff',
  primaryContainer: '#b8eaf4',
  onPrimaryContainer: '#001f26',
  secondary:        '#4a6268',
  secondaryContainer: '#cde7ed',
  onSecondaryContainer: '#051f24',
  surface:          '#f5fafb',
  surfaceVariant:   '#dbe4e6',
  onSurface:        '#171d1e',
  onSurfaceVariant: '#3f484a',
  outline:          '#6f797a',
  outlineVariant:   '#bfc8ca',
  error:            '#ba1a1a',
  background:       '#f5fafb',
};

// ── Componente FAB-style Save Button ────────────────────────────────────────
function SaveFAB({ onPress, saved }: { onPress: () => void; saved: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const bg    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (saved) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 8 }),
      ]).start();
      Animated.timing(bg, { toValue: 1, duration: 200, useNativeDriver: false }).start();
      setTimeout(() => Animated.timing(bg, { toValue: 0, duration: 400, useNativeDriver: false }).start(), 1800);
    }
  }, [saved]);

  const bgColor = bg.interpolate({ inputRange: [0, 1], outputRange: [M.primary, '#1aa870'] });

  return (
    <Animated.View style={[fab.wrap, { backgroundColor: bgColor }]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={fab.inner}>
          <Ionicons name={saved ? 'checkmark' : 'save-outline'} size={22} color={M.onPrimary} />
          <Text style={fab.label}>{saved ? 'Guardado' : 'Guardar'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const fab = StyleSheet.create({
  wrap:  { borderRadius: 16, marginHorizontal: 16, marginTop: 8, marginBottom: 32, elevation: 3, shadowColor: M.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  label: { fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: 0.1 },
});

// ── Card surface con elevación Material ──────────────────────────────────────
function Surface({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[sur.card, style]}>{children}</View>;
}

const sur = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    overflow: 'hidden',
  },
});

// ── Input estilo onboarding ───────────────────────────────────────────────────
function M3Input({
  label, hint, value, onChangeText, multiline, placeholder,
}: {
  label: string; hint?: string; value: string;
  onChangeText: (t: string) => void; multiline?: boolean; placeholder?: string;
}) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={inp.wrap}>
      <Text style={inp.label}>{label}</Text>
      <TextInput
        style={[inp.input, multiline && inp.inputMulti, isFocused && inp.inputFocused]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={M.outlineVariant}
        underlineColorAndroid="transparent"
        selectionColor={M.primaryContainer}
        cursorColor={M.primary}
      />
      {hint && <Text style={inp.hint}>{hint}</Text>}
    </View>
  );
}

const inp = StyleSheet.create({
  wrap:         { marginHorizontal: 16, marginBottom: 12 },
  label:        { fontSize: 12, fontWeight: '600', color: M.onSurfaceVariant, marginBottom: 6, letterSpacing: 0.3 },
  input:        { backgroundColor: '#f4f6f7', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, fontSize: 15, color: M.onSurface, borderWidth: 1.5, borderColor: '#e0e6e8' },
  inputFocused: { borderColor: M.primary, backgroundColor: '#ffffff' },
  inputMulti:   { minHeight: 72, textAlignVertical: 'top', paddingTop: 14 },
  hint:         { fontSize: 12, color: M.onSurfaceVariant, marginTop: 4, marginLeft: 4 },
});

// ── Chip de sección ──────────────────────────────────────────────────────────
function SectionLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={sl.row}>
      <View style={sl.chip}>
        <Ionicons name={icon as any} size={14} color={M.primary} />
        <Text style={sl.text}>{label}</Text>
      </View>
    </View>
  );
}

const sl = StyleSheet.create({
  row:  { marginHorizontal: 16, marginTop: 24, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: M.primaryContainer, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  text: { fontSize: 12, fontWeight: '600', color: M.onPrimaryContainer, letterSpacing: 0.5 },
});

// ── Contacto row ─────────────────────────────────────────────────────────────
function ContactoRow({ contacto, activo, onToggle }: { contacto: TelegramContacto; activo: boolean; onToggle: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  function press() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 8 }),
    ]).start();
    onToggle();
  }

  const initials = contacto.nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPress={press} activeOpacity={0.7} style={cr.row}>
        <View style={[cr.avatar, activo && cr.avatarActive]}>
          <Text style={[cr.initials, activo && cr.initialsActive]}>{initials}</Text>
        </View>
        <Text style={cr.nombre}>{contacto.nombre}</Text>
        <View style={[cr.check, activo && cr.checkActive]}>
          {activo && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const cr = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 16 },
  avatar:        { width: 42, height: 42, borderRadius: 21, backgroundColor: M.secondaryContainer, alignItems: 'center', justifyContent: 'center' },
  avatarActive:  { backgroundColor: M.primaryContainer },
  initials:      { fontSize: 14, fontWeight: '600', color: M.onSecondaryContainer },
  initialsActive:{ color: M.onPrimaryContainer },
  nombre:        { flex: 1, fontSize: 15, color: M.onSurface },
  check:         { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: M.outlineVariant, alignItems: 'center', justifyContent: 'center' },
  checkActive:   { backgroundColor: M.primary, borderColor: M.primary },
});

// ── Recordatorio row ─────────────────────────────────────────────────────────
function RecordatorioRow({ r, onDelete }: { r: Recordatorio; onDelete: () => void }) {
  const fecha = new Date(r.fechaISO + 'T12:00:00');
  const label = fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <View style={rr.row}>
      <View style={rr.dot} />
      <View style={rr.texts}>
        <Text style={rr.texto}>{r.texto}</Text>
        <Text style={rr.fecha}>{label}</Text>
      </View>
      <TouchableOpacity onPress={onDelete} style={rr.del} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={18} color={M.error} />
      </TouchableOpacity>
    </View>
  );
}

const rr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  dot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: M.primary, flexShrink: 0 },
  texts: { flex: 1 },
  texto: { fontSize: 14, fontWeight: '500', color: M.onSurface },
  fecha: { fontSize: 12, color: M.onSurfaceVariant, marginTop: 2 },
  del:   { padding: 4 },
});


// ── Pantalla principal ───────────────────────────────────────────────────────
export default function Configuracion() {
  const router = useRouter();
  const [perfil, setPerfil]               = useState<Perfil | null>(null);
  const [nombre, setNombre]               = useState('');
  const [edad, setEdad]                   = useState('');
  const [nombreAsistente, setNombreAsistente] = useState('');
  const [vozGenero, setVozGenero]         = useState<'femenina' | 'masculina'>('femenina');
  const [generoUsuario, setGeneroUsuario] = useState<'femenino' | 'masculino'>('femenino');
  const [hijos,      setHijos]            = useState('');
  const [nietos,     setNietos]           = useState('');
  const [hermanos,   setHermanos]         = useState('');
  const [mascotas,   setMascotas]         = useState('');
  const [gustos, setGustos]               = useState('');
  const [medicamentos, setMedicamentos]   = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [fechas, setFechas]               = useState('');
  const [idsActivos, setIdsActivos]       = useState<string[]>([]);
  const [contactos, setContactos]         = useState<TelegramContacto[]>([]);
  const [buscando, setBuscando]           = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [guardado, setGuardado]           = useState(false);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [codigoRegistro, setCodigoRegistro] = useState<string | null>(null);
  const [pinOverlay, setPinOverlay]       = useState<'oculto' | 'verificar' | 'crear' | 'cambiar'>('oculto');
  const [pinConfigurado, setPinConfigurado] = useState(false);
  const [pinDesbloqueado, setPinDesbloqueado] = useState(false);

  useFocusEffect(useCallback(() => {
    obtenerPIN().then(p => {
      if (p) { setPinConfigurado(true); setPinDesbloqueado(false); setPinOverlay('verificar'); }
      else    { setPinConfigurado(false); setPinDesbloqueado(true); }
    });
    cargarRecordatorios().then(setRecordatorios);
  }, []));

  useEffect(() => {
    cargarRecordatorios().then(setRecordatorios);
    obtenerCodigoRegistro().then(setCodigoRegistro);
    cargarPerfil().then(p => {
      setPerfil(p);
      setNombre(p.nombreAbuela);
      setEdad(p.edad ? String(p.edad) : '');
      setNombreAsistente(p.nombreAsistente ?? 'Rosita');
      setVozGenero(p.vozGenero ?? 'femenina');
      setGeneroUsuario(p.generoUsuario ?? 'femenino');
      const findCat = (cat: string) => {
        const e = p.familiares.find(f => f.toLowerCase().startsWith(cat + ':'));
        return e ? e.slice(cat.length + 1).trim() : '';
      };
      setHijos(findCat('hijos'));
      setNietos(findCat('nietos'));
      setHermanos(findCat('hermanos'));
      setMascotas(findCat('mascotas'));
      setGustos(p.gustos.join(', '));
      setMedicamentos(p.medicamentos.join(', '));
      setFechas(p.fechasImportantes.join(', '));
      if (p.fechaNacimiento) {
        const [mm, dd] = p.fechaNacimiento.split('-');
        setFechaNacimiento(`${dd}/${mm}`);
      }
      setIdsActivos((p.telegramContactos || []).map(c => c.id));
      setContactos(p.telegramContactos || []);
    });
  }, []);

  async function buscarContactos() {
    if (!BACKEND_URL) { setErrorBusqueda('Falta EXPO_PUBLIC_BACKEND_URL en .env'); return; }
    setBuscando(true);
    setErrorBusqueda('');
    try {
      const familiaId   = await obtenerFamiliaId() ?? 'default';
      const installId   = await obtenerInstallId();
      const res  = await fetchTimeout(`${BACKEND_URL}/telegram/contactos?familiaId=${familiaId}`, 10000, {
        headers: { 'x-api-key': API_KEY, 'x-install-id': installId },
      });
      const data = await res.json();

      if (!data.contactos?.length) {
        setErrorBusqueda('Nadie escribió al bot todavía. Pedile a cada familiar que busque el bot en Telegram y le mande "hola".');
        return;
      }

      const nuevos: TelegramContacto[] = data.contactos.map((c: any) => ({
        id:     c.chatId,
        nombre: c.nombre,
      }));

      // Merge sin duplicados
      setContactos(prev => {
        const existentes = new Set(prev.map(c => c.id));
        const sinDuplicados = nuevos.filter(c => !existentes.has(c.id));
        return [...prev, ...sinDuplicados];
      });
    } catch {
      setErrorBusqueda('No se pudo conectar al servidor. Verificá tu conexión.');
    } finally {
      setBuscando(false);
    }
  }

  async function guardar() {
    const nombreTrimmed = nombre.trim();
    const contactosActivos = contactos.filter(c => idsActivos.includes(c.id));

    // Registrar familia en el backend la primera vez (o si se cambió el nombre)
    if (nombreTrimmed && BACKEND_URL) {
      const familiaIdExistente = await obtenerFamiliaId();
      if (!familiaIdExistente) {
        try {
          const installId = await obtenerInstallId();
          const res = await fetchTimeout(`${BACKEND_URL}/familia/registrar`, 10000, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({
              nombreAbuela:    nombreTrimmed,
              nombreAsistente: nombreAsistente.trim() || 'Rosita',
              installId,
            }),
          });
          const data = await res.json();
          if (data.familiaId) await guardarFamiliaId(data.familiaId);
          if (data.codigo) { await guardarCodigoRegistro(data.codigo); setCodigoRegistro(data.codigo); }
        } catch {}
      }
    }

    await guardarPerfil({
      nombreAbuela:      nombreTrimmed,
      edad:              edad.trim() ? parseInt(edad.trim(), 10) : undefined,
      nombreAsistente:   nombreAsistente.trim() || 'Rosita',
      vozGenero,
      generoUsuario,
      familiares: [
        hijos.trim()    && `hijos: ${hijos.trim()}`,
        nietos.trim()   && `nietos: ${nietos.trim()}`,
        hermanos.trim() && `hermanos: ${hermanos.trim()}`,
        mascotas.trim() && `mascotas: ${mascotas.trim()}`,
      ].filter(Boolean) as string[],
      gustos:            gustos.split(',').map(s => s.trim()).filter(Boolean),
      medicamentos:      medicamentos.split(',').map(s => s.trim()).filter(Boolean),
      fechasImportantes: fechas.split(',').map(s => s.trim()).filter(Boolean),
      recuerdos:         perfil?.recuerdos || [],
      fechaNacimiento:   (() => {
        const parts = fechaNacimiento.trim().replace(/\s/g, '').split('/');
        if (parts.length === 2) {
          const [dd, mm] = parts.map(Number);
          if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && new Date(2000, mm - 1, dd).getDate() === dd)
            return `${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
        }
        return perfil?.fechaNacimiento;
      })(),
      telegramChatIds:   idsActivos,
      telegramContactos: contactosActivos,
    });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  }

  // Bloquear contenido hasta que el PIN sea verificado
  const bloqueado = pinConfigurado && !pinDesbloqueado;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={s.fondo}
        contentContainerStyle={s.contenido}
        showsVerticalScrollIndicator={false}
        pointerEvents={bloqueado ? 'none' : 'auto'}
      >

        {/* ── Top bar ── */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.btnBack} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={M.onPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.topTitle}>Configuración</Text>
          </View>
        </View>

        {/* ── Hero card ── */}
        <View style={s.heroCard}>
          <View style={s.heroIcon}>
            <Ionicons name="person-circle-outline" size={36} color={M.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>{nombre || 'Sin nombre'}</Text>
            <Text style={s.heroSub}>Asistente: {nombreAsistente || 'Rosita'}</Text>
          </View>
        </View>

        {/* ── Identidad ── */}
        <SectionLabel icon="person-outline" label="Identidad" />
        <M3Input label="Nombre" value={nombre} onChangeText={setNombre} placeholder="María" />
        <M3Input label="Edad" hint="Adapta el trato según la edad" value={edad} onChangeText={t => setEdad(t.replace(/[^0-9]/g, ''))} placeholder="75" />
        <M3Input label="Fecha de nacimiento" hint="DD/MM — para el saludo de cumpleaños" value={fechaNacimiento} onChangeText={t => setFechaNacimiento(t.replace(/[^0-9/]/g, '').slice(0, 5))} placeholder="19/03" />
        <M3Input label="Nombre de la asistente" hint="Por defecto: Rosita" value={nombreAsistente} onChangeText={setNombreAsistente} placeholder="Rosita" />

        <Surface style={{ marginTop: 4 }}>
          <View style={s.vozRow}>
            {(['femenino', 'masculino'] as const).map(g => (
              <TouchableOpacity
                key={g}
                style={[s.vozChip, generoUsuario === g && s.vozChipActivo]}
                onPress={() => setGeneroUsuario(g)}
                activeOpacity={0.75}
              >
                <Ionicons name={g === 'femenino' ? 'woman' : 'man'} size={16} color={generoUsuario === g ? M.onPrimary : M.onSurfaceVariant} />
                <Text style={[s.vozChipTxt, generoUsuario === g && s.vozChipTxtActivo]}>
                  {g === 'femenino' ? 'Soy mujer' : 'Soy hombre'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Surface>

        <Surface style={{ marginTop: 4 }}>
          <View style={s.vozRow}>
            {(['femenina', 'masculina'] as const).map(g => (
              <TouchableOpacity
                key={g}
                style={[s.vozChip, vozGenero === g && s.vozChipActivo]}
                onPress={() => setVozGenero(g)}
                activeOpacity={0.75}
              >
                <Ionicons name={g === 'femenina' ? 'woman' : 'man'} size={16} color={vozGenero === g ? M.onPrimary : M.onSurfaceVariant} />
                <Text style={[s.vozChipTxt, vozGenero === g && s.vozChipTxtActivo]}>
                  {g === 'femenina' ? 'Voz femenina' : 'Voz masculina'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Surface>

        {/* ── Entorno ── */}
        <SectionLabel icon="people-outline" label="Entorno" />
        <M3Input label="Hijos"    hint="Separados por coma" value={hijos}    onChangeText={setHijos}    placeholder="Juan, María" />
        <M3Input label="Nietos"   hint="Separados por coma" value={nietos}   onChangeText={setNietos}   placeholder="Sofía, Pedro" />
        <M3Input label="Hermanos" hint="Separados por coma" value={hermanos} onChangeText={setHermanos} placeholder="Carlos, Ana" />
        <M3Input label="Mascotas" hint="Separados por coma" value={mascotas} onChangeText={setMascotas} placeholder="Firulais" />
        {/* Tags rápidos de intereses */}
        {(() => {
          const activos = gustos.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          const toggleTag = (tag: string) => {
            const lista = gustos.split(',').map(s => s.trim()).filter(Boolean);
            const yaEsta = lista.map(s => s.toLowerCase()).includes(tag.toLowerCase());
            setGustos(yaEsta
              ? lista.filter(s => s.toLowerCase() !== tag.toLowerCase()).join(', ')
              : [...lista, tag].join(', ')
            );
          };
          const rows: string[][] = [];
          for (let i = 0; i < TAGS_INTERESES.length; i += 4)
            rows.push(TAGS_INTERESES.slice(i, i + 4));
          return (
            <View style={s.tagsWrap}>
              {rows.map((row, ri) => (
                <View key={ri} style={s.tagsRow}>
                  {row.map(tag => {
                    const activo = activos.includes(tag.toLowerCase());
                    const [bgIn, txIn, bgAc, txAc] = TAG_COLORS[tag] ?? ['#e0e0e0', '#333', '#666', '#fff'];
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[s.tagChip, { backgroundColor: activo ? bgAc : bgIn, borderColor: activo ? bgAc : '#00000018' }]}
                        onPress={() => toggleTag(tag)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.tagChipTxt, { color: activo ? txAc : txIn }]}>{tag}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })()}
        <M3Input label="Otros gustos y temas" hint="Separados por coma" value={gustos} onChangeText={setGustos} multiline placeholder="tangos, jardín, novelas" />

        {/* ── Salud ── */}
        <SectionLabel icon="medkit-outline" label="Salud" />
        <M3Input label="Medicamentos y horarios" hint="Separados por coma" value={medicamentos} onChangeText={setMedicamentos} multiline placeholder="Enalapril 8hs, Aspirina 12hs" />
        <M3Input label="Fechas importantes" hint="Separados por coma" value={fechas} onChangeText={setFechas} multiline placeholder="cumpleaños Juan 15 marzo" />

        {/* ── Telegram ── */}
        <SectionLabel icon="paper-plane-outline" label="Alertas Telegram" />

        {/* Código de registro */}
        {codigoRegistro && (
          <Surface style={{ marginBottom: 8 }}>
            <View style={s.codigoWrap}>
              <Text style={s.codigoLabel}>Código para familiares</Text>
              <Text style={s.codigoCodigo}>{codigoRegistro}</Text>
              <Text style={s.codigoHint}>El familiar abre @compan_IA_bot en Telegram y manda este código</Text>
            </View>
          </Surface>
        )}

        {/* Guía paso a paso cuando no hay contactos */}
        {contactos.length === 0 && (
          <Surface style={{ marginBottom: 8 }}>
            {[
              { n: '1', texto: 'Cada familiar abre Telegram y busca @compan_IA_bot' },
              { n: '2', texto: `Le manda el código de 6 letras que aparece arriba${codigoRegistro ? ` (${codigoRegistro})` : ''}` },
              { n: '3', texto: 'Volvé acá y tocá "Buscar familiares" — aparecen automáticamente' },
              { n: '4', texto: 'Activá los que querés incluir y guardá' },
            ].map(({ n, texto }, i, arr) => (
              <View key={n}>
                <View style={s.paso}>
                  <View style={s.pasoNum}><Text style={s.pasoNumText}>{n}</Text></View>
                  <Text style={s.pasoTexto}>{texto}</Text>
                </View>
                {i < arr.length - 1 && <View style={s.divisorThin} />}
              </View>
            ))}
          </Surface>
        )}

        <Surface>
          {contactos.length > 0 && (
            <View style={s.telegramInfo}>
              <Ionicons name="information-circle-outline" size={18} color={M.primary} />
              <Text style={s.telegramInfoText}>
                Cada familiar debe abrirle el bot a CompañIA en Telegram y mandarle "hola" antes de buscarlo acá.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={s.botBtn}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://t.me/compan_IA_bot')}
          >
            <Ionicons name="paper-plane" size={18} color={M.onPrimary} />
            <Text style={s.botBtnText}>Abrir @compan_IA_bot en Telegram</Text>
          </TouchableOpacity>

          {contactos.length > 0 && (
            <View style={s.divisorThin} />
          )}

          {contactos.map((c, i) => (
            <View key={c.id}>
              {i > 0 && <View style={s.divisorThin} />}
              <ContactoRow
                contacto={c}
                activo={idsActivos.includes(c.id)}
                onToggle={() => setIdsActivos(prev =>
                  prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                )}
              />
            </View>
          ))}

          {errorBusqueda !== '' && (
            <View style={s.errorWrap}>
              <Ionicons name="alert-circle-outline" size={16} color={M.error} />
              <Text style={s.errorText}>{errorBusqueda}</Text>
            </View>
          )}

          <View style={s.divisorThin} />
          <TouchableOpacity style={s.buscarBtn} onPress={buscarContactos} disabled={buscando} activeOpacity={0.7}>
            {buscando
              ? <ActivityIndicator size="small" color={M.primary} />
              : <Ionicons name="search-outline" size={18} color={M.primary} />
            }
            <Text style={s.buscarText}>
              {buscando ? 'Buscando...' : contactos.length > 0 ? 'Actualizar contactos' : 'Buscar familiares'}
            </Text>
          </TouchableOpacity>
        </Surface>

        {/* ── Recordatorios ── */}
        {recordatorios.length > 0 && (
          <>
            <SectionLabel icon="alarm-outline" label="Recordatorios pendientes" />
            <Surface>
              {recordatorios.map((r, i) => (
                <View key={r.id}>
                  {i > 0 && <View style={s.divisorThin} />}
                  <RecordatorioRow
                    r={r}
                    onDelete={async () => {
                      await borrarRecordatorio(r.id);
                      setRecordatorios(prev => prev.filter(x => x.id !== r.id));
                    }}
                  />
                </View>
              ))}
            </Surface>
          </>
        )}

        {/* ── Seguridad ── */}
        <SectionLabel icon="lock-closed-outline" label="Seguridad" />
        <Surface>
          <TouchableOpacity
            style={s.buscarBtn}
            activeOpacity={0.7}
            onPress={() => setPinOverlay(pinConfigurado ? 'cambiar' : 'crear')}
          >
            <Ionicons name={pinConfigurado ? 'key-outline' : 'lock-open-outline'} size={18} color={M.primary} />
            <Text style={s.buscarText}>{pinConfigurado ? 'Cambiar PIN' : 'Configurar PIN'}</Text>
          </TouchableOpacity>
          {pinConfigurado && (
            <>
              <View style={s.divisorThin} />
              <TouchableOpacity
                style={s.buscarBtn}
                activeOpacity={0.7}
                onPress={async () => { await eliminarPIN(); setPinConfigurado(false); }}
              >
                <Ionicons name="lock-open-outline" size={18} color={M.error} />
                <Text style={[s.buscarText, { color: M.error }]}>Quitar PIN</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={s.divisorThin} />
          <TouchableOpacity style={s.buscarBtn} activeOpacity={0.7} onPress={() => router.push('/privacidad' as any)}>
            <Ionicons name="shield-outline" size={18} color={M.onSurfaceVariant} />
            <Text style={[s.buscarText, { color: M.onSurfaceVariant }]}>Política de privacidad</Text>
          </TouchableOpacity>
        </Surface>

        <View style={{ height: 16 }} />
        <SaveFAB onPress={guardar} saved={guardado} />

      </ScrollView>

      {/* ── Overlay de PIN ── */}
      {pinOverlay !== 'oculto' && (
        <PinOverlay
          modo={pinOverlay === 'verificar' ? 'verificar' : pinOverlay === 'crear' ? 'crear' : 'cambiar'}
          onSuccess={async (nuevoPIN) => {
            if (pinOverlay === 'verificar') {
              setPinDesbloqueado(true);
              setPinOverlay('oculto');
            } else {
              await guardarPIN(nuevoPIN);
              setPinConfigurado(true);
              setPinOverlay('oculto');
            }
          }}
          onCancel={pinOverlay === 'verificar' ? () => router.back() : () => setPinOverlay('oculto')}
        />
      )}

    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fondo:    { flex: 1, backgroundColor: M.background },
  contenido: { paddingBottom: 16 },

  topBar: {
    backgroundColor: M.primary,
    paddingTop: 52, paddingBottom: 16,
    paddingHorizontal: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  btnBack:   { padding: 12, borderRadius: 24 },
  topTitle:  { fontSize: 22, fontWeight: '400', color: M.onPrimary, letterSpacing: 0 },

  heroCard: {
    marginHorizontal: 16, marginTop: 16, marginBottom: 8,
    backgroundColor: M.primaryContainer,
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 16,
  },
  heroIcon:  { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffffff55', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 20, fontWeight: '500', color: M.onPrimaryContainer },
  heroSub:   { fontSize: 13, color: M.onPrimaryContainer, opacity: 0.7, marginTop: 2 },

  codigoWrap:   { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16, gap: 8 },
  codigoLabel:  { fontSize: 11, fontWeight: '600', color: M.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1 },
  codigoCodigo: { fontSize: 36, fontWeight: '700', color: M.primary, letterSpacing: 8 },
  codigoHint:   { fontSize: 12, color: M.onSurfaceVariant, textAlign: 'center', lineHeight: 18 },

  telegramInfo:     { flexDirection: 'row', gap: 10, padding: 16, alignItems: 'flex-start' },
  telegramInfoText: { flex: 1, fontSize: 13, color: M.onSurfaceVariant, lineHeight: 18 },

  paso:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16 },
  pasoNum:     { width: 28, height: 28, borderRadius: 14, backgroundColor: M.primaryContainer, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pasoNumText: { fontSize: 13, fontWeight: '700', color: M.onPrimaryContainer },
  pasoTexto:   { flex: 1, fontSize: 13, color: M.onSurface, lineHeight: 18 },

  errorWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  errorText: { flex: 1, fontSize: 13, color: M.error, lineHeight: 18 },

  buscarBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  buscarText: { fontSize: 14, fontWeight: '500', color: M.primary },

  divisorThin: { height: 1, backgroundColor: M.outlineVariant, opacity: 0.4, marginHorizontal: 16 },

  vozRow:          { flexDirection: 'row', gap: 10, padding: 12 },
  vozChip:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: M.surfaceVariant },
  vozChipActivo:   { backgroundColor: M.primary },
  vozChipTxt:      { fontSize: 14, fontWeight: '500', color: M.onSurfaceVariant },
  vozChipTxtActivo:{ color: M.onPrimary },

  tagsWrap:        { gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  tagsRow:         { flexDirection: 'row', gap: 6 },
  tagChip:         { flex: 1, paddingVertical: 9, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tagChipTxt:      { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  botBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: M.primary, marginHorizontal: 16, marginBottom: 12, paddingVertical: 12, borderRadius: 12 },
  botBtnText:  { fontSize: 14, fontWeight: '500', color: M.onPrimary },
});