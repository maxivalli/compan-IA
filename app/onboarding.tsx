import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useAudioPlayer } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { guardarPerfil, cargarPerfil, obtenerInstallId, guardarFamiliaId, guardarCodigoRegistro } from '../lib/memoria';
import { sintetizarVozMuestra } from '../lib/ai';

const VOCES = [
  { id: 'r3lotmx3BZETVvcKm6R6', label: 'Tucumana y enérgica',    genero: 'femenina'  as const, icono: 'woman' as const },
  { id: 'smHMxLX7gVgXrrfD70xq', label: 'Cálida y formal',        genero: 'femenina'  as const, icono: 'woman' as const },
  { id: 'vgekQLm3GYiKMHUnPVvY', label: 'Santafesino y divertido', genero: 'masculina' as const, icono: 'man'   as const },
  { id: 'L7pBVwjueW3IPcQt4Ej9', label: 'Tranquilo y formal',     genero: 'masculina' as const, icono: 'man'   as const },
];
import RosaOjos from '../components/RosaOjos';

const { height: H, width: W } = Dimensions.get('window');

const PEEK     = 28;          // cuánto se ve de la card vecina
const CARD_GAP = 12;
const CARD_W   = W - PEEK * 2 - CARD_GAP * 2;
const CARD_H   = 110;
const SIDE_PAD = PEEK + CARD_GAP;

const STEP_COLORS = [
  '#0097b2', // bienvenida
  '#7C9EFF', // nombre
  '#FF8FAB', // edad
  '#57CC99', // asistente
  '#C77DFF', // familia
  '#0097b2', // listo
];

const TOTAL = 6;

export default function Onboarding() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [paso,            setPaso]            = useState(0);
  const [nombreAbuela,    setNombreAbuela]    = useState('');
  const [edad,            setEdad]            = useState('');
  const [nombreAsistente, setNombreAsistente] = useState('Rosita');
  const [vozId,           setVozId]           = useState(VOCES[0].id);
  const [hijos,           setHijos]           = useState('');
  const [nietos,          setNietos]          = useState('');
  const [hermanos,        setHermanos]        = useState('');
  const [mascotas,        setMascotas]        = useState('');

  const fadeAnim      = useRef(new Animated.Value(1)).current;
  const slideAnim     = useRef(new Animated.Value(0)).current;
  const finalizandoRef = useRef(false);

  const [fontsLoaded] = useFonts({ Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold });
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (!fontsLoaded) return null;

  function irAPaso(n: number) {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0,   duration: 130, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -24, duration: 130, useNativeDriver: true }),
    ]).start(() => {
      setPaso(n);
      slideAnim.setValue(28);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 160, friction: 10 }),
      ]).start();
    });
  }

  async function finalizar() {
    if (finalizandoRef.current) return;
    finalizandoRef.current = true;
    const perfilActual = await cargarPerfil();
    const nombre = nombreAbuela.trim() || 'Abuela';
    const asistente = nombreAsistente.trim() || 'Rosita';
    const vozSeleccionada = VOCES.find(v => v.id === vozId) ?? VOCES[0];
    await guardarPerfil({
      ...perfilActual,
      nombreAbuela:    nombre,
      edad:            edad.trim() ? parseInt(edad.trim(), 10) : undefined,
      nombreAsistente: asistente,
      vozGenero:       vozSeleccionada.genero,
      vozId,
      familiares: [
        hijos.trim()    && `hijos: ${hijos.trim()}`,
        nietos.trim()   && `nietos: ${nietos.trim()}`,
        hermanos.trim() && `hermanos: ${hermanos.trim()}`,
        mascotas.trim() && `mascotas: ${mascotas.trim()}`,
      ].filter(Boolean) as string[],
    });

    // Registrar dispositivo en el backend para habilitar las llamadas a la IA
    try {
      const installId = await obtenerInstallId();
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
      const apiKey = process.env.EXPO_PUBLIC_APP_API_KEY;
      const ctrl = new AbortController();
      const ctrlId = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`${backendUrl}/familia/registrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey! },
        body: JSON.stringify({ nombreAbuela: nombre, nombreAsistente: asistente, installId }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(ctrlId));
      if (res.ok) {
        const data = await res.json();
        if (data.familiaId) await guardarFamiliaId(data.familiaId);
        if (data.codigo) await guardarCodigoRegistro(data.codigo);
      }
    } catch {}

    router.replace('/');
  }

  const color    = STEP_COLORS[paso];
  const esUltimo = paso === TOTAL - 1;

  const tecladoVisible = keyboardHeight > 0;

  return (
    <View style={{ flex: 1, paddingBottom: keyboardHeight }}>

        {/* ── Top: fondo de color ── */}
        <Animated.View style={[s.topArea, { backgroundColor: color, opacity: fadeAnim, height: tecladoVisible ? 0 : H * 0.46, overflow: 'hidden' }]}>
          <View style={[s.puntos, { marginTop: insets.top + 16 }]}>
            {Array.from({ length: TOTAL }).map((_, i) => (
              <View
                key={i}
                style={[
                  s.punto,
                  i === paso ? s.puntoActivo : null,
                  i < paso   ? s.puntoPasado : null,
                ]}
              />
            ))}
          </View>

          <Animated.View style={[s.iconoWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {paso === 0 ? (
              <View style={s.rosaWrap}>
                <RosaOjos estado="esperando" expresion="neutral" />
              </View>
            ) : (
              <View style={s.iconoCirculo}>
                <View style={s.iconoInner}>
                  <Ionicons
                    name={(['person','calendar','chatbubble','people','checkmark-circle'] as const)[paso - 1]}
                    size={78}
                    color="#fff"
                  />
                </View>
              </View>
            )}
          </Animated.View>
        </Animated.View>

        {/* ── Bottom: card blanca ── */}
        <View style={[s.card, tecladoVisible && { borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: 0 }]}>
          <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <StepContent
              paso={paso}
              nombreAbuela={nombreAbuela}       setNombreAbuela={setNombreAbuela}
              edad={edad}                       setEdad={setEdad}
              nombreAsistente={nombreAsistente} setNombreAsistente={setNombreAsistente}
              vozId={vozId}                     setVozId={setVozId}
              hijos={hijos}                     setHijos={setHijos}
              nietos={nietos}                   setNietos={setNietos}
              hermanos={hermanos}               setHermanos={setHermanos}
              mascotas={mascotas}               setMascotas={setMascotas}
            />
          </Animated.View>

          <View style={[s.nav, { paddingBottom: insets.bottom + 16 }]}>
            {paso === 0 ? (
              <View style={{ flex: 1 }} />
            ) : (
              <TouchableOpacity onPress={() => irAPaso(paso - 1)} style={s.skipBtn} activeOpacity={0.6}>
                <Text style={s.skipTxt}>Volver</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.fabBtn, { backgroundColor: color }]}
              onPress={() => {
                if (esUltimo) { finalizar(); return; }
                if (paso === 1 && !nombreAbuela.trim()) return;
                irAPaso(paso + 1);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name={esUltimo ? 'heart' : 'arrow-forward'} size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

    </View>
  );
}

const FEATURES = [
  { icono: 'chatbubble',    label: 'Charla y\ncompañía',     color: '#0097b2' },
  { icono: 'musical-notes', label: 'Música\ny radio',         color: '#7C9EFF' },
  { icono: 'medkit',        label: 'Recordatorios\nde meds',  color: '#FF8FAB' },
  { icono: 'partly-sunny',  label: 'Clima en\ntiempo real',   color: '#57CC99' },
  { icono: 'people',        label: 'Alertas a\nla familia',   color: '#C77DFF' },
  { icono: 'alert-circle',  label: 'Botón de\nemergencia',    color: '#FF7F7F' },
];

function FeatureCarousel() {
  const scrollRef = useRef<any>(null);
  const scrollX   = useRef(new Animated.Value(0)).current;
  const idxRef    = useRef(0);
  const [dotIdx, setDotIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      const next = (idxRef.current + 1) % FEATURES.length;
      if (next === 0) {
        scrollRef.current?.scrollTo({ x: 0, animated: false });
        scrollX.setValue(0);
      } else {
        scrollRef.current?.scrollTo({ x: next * (CARD_W + CARD_GAP), animated: true });
      }
      idxRef.current = next;
      setDotIdx(next);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={fc.root}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + CARD_GAP}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: SIDE_PAD }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {FEATURES.map(({ icono, label, color }, i) => {
          const inputRange = [
            (i - 1) * (CARD_W + CARD_GAP),
            i       * (CARD_W + CARD_GAP),
            (i + 1) * (CARD_W + CARD_GAP),
          ];
          const scale   = scrollX.interpolate({ inputRange, outputRange: [0.93, 1, 0.93], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.72, 1, 0.72], extrapolate: 'clamp' });

          return (
            <Animated.View
              key={label}
              style={[fc.card, { backgroundColor: color, width: CARD_W, height: CARD_H, marginRight: CARD_GAP, transform: [{ scale }], opacity }]}
            >
              {/* Círculos decorativos */}
              <View style={fc.circle1} />
              <View style={fc.circle2} />

              {/* Ícono */}
              <View style={fc.iconWrap}>
                <Ionicons name={icono as any} size={34} color="#fff" />
              </View>

              {/* Label */}
              <Text style={fc.label}>{label}</Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      {/* Dots */}
      <View style={fc.dots}>
        {FEATURES.map((_, i) => (
          <View key={i} style={[fc.dot, i === dotIdx && fc.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const fc = StyleSheet.create({
  root: { marginTop: 8 },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  circle1: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: '#ffffff18', top: -35, right: -25 },
  circle2: { position: 'absolute', width: 70,  height: 70,  borderRadius: 35, backgroundColor: '#ffffff12', bottom: -20, right: 70 },
  iconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffffff28', alignItems: 'center', justifyContent: 'center' },
  label:    { fontFamily: 'Poppins_700Bold', fontSize: 15, color: '#fff', flex: 1, lineHeight: 22 },
  dots:     { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14 },
  dot:      { width: 6,  height: 6, borderRadius: 3, backgroundColor: '#dde3e5' },
  dotActive:{ width: 20, height: 6, borderRadius: 3, backgroundColor: '#0097b2' },
});

// ── Input con etiqueta para familiares ───────────────────────────────────────
function FamiliarInput({ label, icon, value, onChangeText, placeholder }: {
  label: string; icon: string; value: string;
  onChangeText: (t: string) => void; placeholder: string;
}) {
  return (
    <View style={fi.wrap}>
      <View style={fi.labelRow}>
        <Ionicons name={icon as any} size={14} color="#0097b2" />
        <Text style={fi.label}>{label}</Text>
      </View>
      <TextInput
        style={fi.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#b0b8ba"
      />
    </View>
  );
}

const fi = StyleSheet.create({
  wrap:     { gap: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label:    { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#0097b2', letterSpacing: 0.3 },
  input:    { fontFamily: 'Poppins_400Regular', backgroundColor: '#f4f6f7', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, color: '#171d1e', borderWidth: 1.5, borderColor: '#e0e6e8' },
});

// ── Selector de voces con muestra de audio ───────────────────────────────────
function SelectorVoces({ vozId, setVozId, nombreAsistente }: {
  vozId: string;
  setVozId: (id: string) => void;
  nombreAsistente: string;
}) {
  const [cargando, setCargando] = useState<string | null>(null);
  const player = useAudioPlayer(null);

  async function reproducir(id: string) {
    if (cargando) return;
    setCargando(id);
    try {
      const nombre = nombreAsistente.trim() || 'Rosita';
      const base64 = await sintetizarVozMuestra(id, nombre);
      if (!base64) return;
      const uri = FileSystem.cacheDirectory + 'voz_preview.mp3';
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
      player.replace({ uri });
      player.play();
    } catch {}
    finally { setCargando(null); }
  }

  return (
    <View style={sv.grid}>
      {VOCES.map(voz => {
        const activa   = vozId === voz.id;
        const cargandoEsta = cargando === voz.id;
        const color    = voz.genero === 'femenina' ? '#C77DFF' : '#7C9EFF';
        const colorBg  = voz.genero === 'femenina' ? '#f3e8ff' : '#eef0ff';
        return (
          <TouchableOpacity
            key={voz.id}
            style={[sv.card, activa && { borderColor: color, borderWidth: 2, backgroundColor: colorBg }]}
            onPress={() => setVozId(voz.id)}
            activeOpacity={0.8}
          >
            {/* Indicador selección */}
            <View style={[sv.radio, activa && { backgroundColor: color, borderColor: color }]}>
              {activa && <View style={sv.radioDot} />}
            </View>

            {/* Ícono género + label */}
            <View style={sv.info}>
              <View style={[sv.genderChip, { backgroundColor: color + '22' }]}>
                <Ionicons name={voz.icono} size={12} color={color} />
                <Text style={[sv.genderTxt, { color }]}>
                  {voz.genero === 'femenina' ? 'Fem' : 'Masc'}
                </Text>
              </View>
              <Text style={[sv.label, activa && { color: '#171d1e', fontFamily: 'Poppins_600SemiBold' }]}>
                {voz.label}
              </Text>
            </View>

            {/* Botón play */}
            <TouchableOpacity
              style={[sv.playBtn, { backgroundColor: color }]}
              onPress={() => reproducir(voz.id)}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {cargandoEsta
                ? <ActivityIndicator size={14} color="#fff" />
                : <Ionicons name="play" size={14} color="#fff" />}
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const sv = StyleSheet.create({
  grid:      { gap: 10, marginTop: 4 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#f4f6f7', borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: '#e0e6e8',
  },
  radio:     { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#ccd3d5', alignItems: 'center', justifyContent: 'center' },
  radioDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  info:      { flex: 1, gap: 4 },
  genderChip:{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 100 },
  genderTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 10, letterSpacing: 0.3 },
  label:     { fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#3a4548', lineHeight: 18 },
  playBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

// ── Contenido por paso ────────────────────────────────────────────────────────
function StepContent({ paso, nombreAbuela, setNombreAbuela, edad, setEdad, nombreAsistente, setNombreAsistente, vozId, setVozId, hijos, setHijos, nietos, setNietos, hermanos, setHermanos, mascotas, setMascotas }: any) {
  const vozSeleccionada = VOCES.find(v => v.id === vozId) ?? VOCES[0];
  const info = [
    { titulo: '¡Hola! Soy CompañIA',         sub: `Tu ${vozSeleccionada.genero === 'masculina' ? 'compañero' : 'compañera'} de voz con inteligencia artificial.` },
    { titulo: '¿Cómo se llama?',             sub: 'El nombre de quien va a usar la app. Así la va a llamar la asistente.' },
    { titulo: '¿Cuántos años tiene?',        sub: 'La asistente adapta su forma de hablar según la edad. Podés saltear este paso.' },
    { titulo: '¿Cómo la van a llamar?',      sub: `El nombre con el que ${nombreAbuela || 'ella'} llamará a la asistente.` },
    { titulo: 'La familia',                  sub: '¿Quiénes son sus familiares cercanos? Podés completarlo después.' },
    { titulo: `¡Todo listo${nombreAbuela ? ', ' + nombreAbuela : ''}!`, sub: `${nombreAsistente || 'Rosita'} ya sabe quién sos y está ${vozSeleccionada.genero === 'masculina' ? 'listo' : 'lista'} para acompañarte.` },
  ];
  const { titulo, sub } = info[paso];

  if (paso === 0) {
    return (
      <View style={{ flex: 1, paddingTop: 28 }}>
        <Text style={[ct.titulo, { paddingHorizontal: 28 }]}>{titulo}</Text>
        <Text style={[ct.sub,   { paddingHorizontal: 28 }]}>{sub}</Text>
        <FeatureCarousel />
      </View>
    );
  }

  if (paso === 3) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={ct.wrapScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <Text style={ct.titulo}>{titulo}</Text>
        <Text style={ct.sub}>{sub}</Text>
        <TextInput style={ct.input} value={nombreAsistente} onChangeText={setNombreAsistente}
          placeholder="Rosita" placeholderTextColor="#b0b8ba" />
        <Text style={ct.vozLabel}>Elegí una voz</Text>
        <SelectorVoces vozId={vozId} setVozId={setVozId} nombreAsistente={nombreAsistente} />
      </ScrollView>
    );
  }

  if (paso === 4) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={ct.wrapScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <Text style={ct.titulo}>{titulo}</Text>
        <Text style={ct.sub}>{sub}</Text>
        <View style={{ gap: 12, marginTop: 4 }}>
          <FamiliarInput label="Hijos"    icon="people"     value={hijos}    onChangeText={setHijos}    placeholder="Juan, María" />
          <FamiliarInput label="Nietos"   icon="happy"      value={nietos}   onChangeText={setNietos}   placeholder="Sofía, Pedro" />
          <FamiliarInput label="Hermanos" icon="person-add" value={hermanos} onChangeText={setHermanos} placeholder="Carlos, Ana" />
          <FamiliarInput label="Mascotas" icon="paw"        value={mascotas} onChangeText={setMascotas} placeholder="Firulais" />
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={ct.wrap}>
      <Text style={ct.titulo}>{titulo}</Text>
      <Text style={ct.sub}>{sub}</Text>

      {paso === 1 && (
        <TextInput style={ct.input} value={nombreAbuela} onChangeText={setNombreAbuela}
          placeholder="Ej: Negrita, María, Abuela" placeholderTextColor="#b0b8ba" />
      )}
      {paso === 2 && (
        <TextInput style={ct.input} value={edad} onChangeText={t => setEdad(t.replace(/[^0-9]/g, ''))}
          placeholder="Ej: 75" placeholderTextColor="#b0b8ba" keyboardType="numeric" maxLength={3} />
      )}

      {paso === 5 && (
        <>
          <View style={ct.resumen}>
            {[
              { i: 'person',     t: nombreAbuela || '—' },
              ...(edad      ? [{ i: 'calendar',   t: `${edad} años` }] : []),
              { i: 'chatbubble', t: `Asistente: ${nombreAsistente || 'Rosita'}` },
              ...(hijos    ? [{ i: 'people',    t: `Hijos: ${hijos}` }]    : []),
              ...(nietos   ? [{ i: 'happy',     t: `Nietos: ${nietos}` }]  : []),
              ...(hermanos ? [{ i: 'person-add',t: `Hermanos: ${hermanos}` }] : []),
              ...(mascotas ? [{ i: 'paw',       t: `Mascotas: ${mascotas}` }] : []),
            ].map(({ i, t }) => (
              <View key={t} style={ct.resumenFila}>
                <Ionicons name={i as any} size={15} color="#0097b2" />
                <Text style={ct.resumenTxt}>{t}</Text>
              </View>
            ))}
          </View>
          <View style={ct.hint}>
            <Ionicons name="settings-outline" size={15} color="#0097b2" />
            <Text style={ct.hintTxt}>
              Podés editar estos datos y agregar más información desde la pestaña{' '}
              <Text style={ct.hintNegrita}>Configuración</Text>.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  topArea:  { height: H * 0.46, alignItems: 'center', justifyContent: 'flex-start' },
  puntos:   { flexDirection: 'row', gap: 7, alignSelf: 'center' },
  punto:    { width: 7,  height: 7, borderRadius: 3.5, backgroundColor: '#ffffff55' },
  puntoActivo: { width: 22, height: 7, borderRadius: 3.5, backgroundColor: '#fff' },
  puntoPasado: { backgroundColor: '#ffffffaa' },
  iconoWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center' },

  rosaWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },

  iconoCirculo: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#ffffff33',
    alignItems: 'center', justifyContent: 'center',
  },
  iconoInner: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#ffffff22',
    alignItems: 'center', justifyContent: 'center',
  },

  card: {
    flex: 1, backgroundColor: '#fff',
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
    marginTop: -36,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 8,
  },
  nav:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 8 },
  skipBtn: { paddingVertical: 8, paddingRight: 16 },
  skipTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: '#8a9699' },
  fabBtn:  { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
});

const ct = StyleSheet.create({
  wrap:       { flex: 1, paddingHorizontal: 28, paddingTop: 28 },
  titulo:     { fontFamily: 'Poppins_700Bold',      fontSize: 26, color: '#171d1e', marginBottom: 10, lineHeight: 36, textAlign: 'center' },
  sub:        { fontFamily: 'Poppins_400Regular',   fontSize: 14, color: '#5a6468', lineHeight: 22, marginBottom: 20, textAlign: 'center' },
  input:      { fontFamily: 'Poppins_400Regular',   backgroundColor: '#f4f6f7', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 15, fontSize: 16, color: '#171d1e', borderWidth: 1.5, borderColor: '#e0e6e8', marginTop: 4 },
  inputMulti: { minHeight: 80, textAlignVertical: 'top', paddingTop: 14 },
  resumen:    { backgroundColor: '#f0fbfd', borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: '#c8eef5', marginTop: 4 },
  resumenFila:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  resumenTxt: { fontFamily: 'Poppins_400Regular',   fontSize: 14, color: '#1a3a40', flex: 1, lineHeight: 20 },

  vozLabel:   { fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#8a9699', textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 10 },
  wrapScroll: { paddingHorizontal: 28, paddingTop: 28, paddingBottom: 16 },
  hint:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, backgroundColor: '#e6f7fa', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  hintTxt:    { fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#1a4a54', lineHeight: 19, flex: 1 },
  hintNegrita:{ fontFamily: 'Poppins_600SemiBold', color: '#0097b2' },
});
