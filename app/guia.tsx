import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const M = {
  primary:          '#0097b2',
  onPrimary:        '#ffffff',
  primaryContainer: '#cef5ff',
  surface:          '#f9fafb',
  surfaceVariant:   '#dce8ec',
  onSurface:        '#191c1d',
  onSurfaceVariant: '#3f484a',
  outlineVariant:   '#bec8cb',
  elevation1:       '#edf6f8',
} as const;

type Seccion = {
  icono: string;
  titulo: string;
  descripcion: string;
  color: string;
  bg: string;
  comandos?: string[];
  nota?: string;
};

const SECCIONES: Seccion[] = [
  {
    icono: 'chatbubbles-outline',
    titulo: 'Charlar',
    descripcion: 'Podés hablar de cualquier tema: cómo te sentís, recuerdos, noticias, familia. Rosita te escucha y responde con cariño.',
    color: '#7C5200',
    bg: '#FFE0A0',
    comandos: ['¿Cómo estás hoy?', 'Contame algo', 'Extraño a mi hijo', 'Qué aburrimiento'],
  },
  {
    icono: 'musical-notes-outline',
    titulo: 'Música',
    descripcion: 'Pedí música por género y Rosita la pone al instante. Para pararla, tocá cualquier parte de la pantalla.',
    color: '#6A0D91',
    bg: '#F0DEFF',
    comandos: ['Poné tango', 'Quiero folklore', 'Poneme jazz', 'Música romántica'],
    nota: 'Géneros disponibles: tango, bolero, folklore, romántica, clásica, jazz y pop. Mientras suena música el micrófono se apaga solo — tocá la pantalla para parar.',
  },
  {
    icono: 'newspaper-outline',
    titulo: 'Noticias',
    descripcion: 'Preguntale qué pasó hoy en Argentina y te cuenta los titulares más recientes.',
    color: '#004785',
    bg: '#D3E4FF',
    comandos: ['¿Qué pasó hoy?', 'Contame novedades', '¿Algo del presidente?', '¿Cómo está la economía?'],
  },
  {
    icono: 'partly-sunny-outline',
    titulo: 'Clima',
    descripcion: 'Rosita consulta el tiempo actual según tu ubicación.',
    color: '#1B5E28',
    bg: '#C8EFCE',
    comandos: ['¿Cómo está el tiempo?', '¿Hace calor?', '¿Va a llover?', 'Temperatura de hoy'],
  },
  {
    icono: 'game-controller-outline',
    titulo: 'Juegos y ejercicios',
    descripcion: 'Juegos para entretener y ejercitar la mente. Adivinanzas, trivia, cálculos, trabalenguas, refranes y más.',
    color: '#8B1500',
    bg: '#FFDAD4',
    comandos: ['Juguemos a las adivinanzas', 'Una trivia', 'Contame un refrán', 'Poneme un cálculo', 'Un trabalenguas', 'Juego de memoria'],
  },
  {
    icono: 'mic-circle-outline',
    titulo: 'Chistes',
    descripcion: 'Cuando tengas ganas de reírte, pedile un chiste. Tiene varios preparados.',
    color: '#5C3800',
    bg: '#FFDEAA',
    comandos: ['Contame un chiste', 'Algo gracioso', 'Haceme reír'],
  },
  {
    icono: 'alarm-outline',
    titulo: 'Timers y recordatorios',
    descripcion: 'Podés pedir que te avise en un tiempo o que recuerde una fecha importante.',
    color: '#004785',
    bg: '#D3E4FF',
    comandos: ['Avisame en 10 minutos', 'Poneme un timer de 30 segundos', 'Recordame el viernes que tengo turno'],
    nota: 'Los recordatorios de fecha te avisan el día que corresponde.',
  },
  {
    icono: 'send-outline',
    titulo: 'Mensajes a la familia',
    descripcion: 'Pedile que le mande un mensaje a un familiar y ella lo envía por Telegram.',
    color: '#1B5E28',
    bg: '#C8EFCE',
    comandos: ['Mandále un mensaje a Maxi', 'Avisale a mi hija que la llamé'],
    nota: 'El familiar debe estar configurado con su número de Telegram.',
  },
  {
    icono: 'headset-outline',
    titulo: 'Audios de familia',
    descripcion: 'Cuando un familiar te mande un audio por Telegram, Rosita te avisa y te lo reproduce.',
    color: '#6A0D91',
    bg: '#F0DEFF',
    nota: 'Rosita pregunta si estás disponible antes de reproducir el audio. Podés contestar directamente desde la app.',
  },
  {
    icono: 'bar-chart-outline',
    titulo: 'Resumen diario para la familia',
    descripcion: 'Cada día a las 22hs Rosita le manda a la familia un resumen por Telegram con el estado de ánimo del día, los temas que se hablaron y el tiempo que estuvieron juntos.',
    color: '#004785',
    bg: '#D3E4FF',
    nota: 'La familia recibe el resumen automáticamente, sin que tengas que hacer nada.',
  },
  {
    icono: 'sunny-outline',
    titulo: 'Presencia activa',
    descripcion: 'Rosita te saluda cada mañana, te inicia charla si no hubo conversación en un rato, y silba suavemente si lleva tiempo sola.',
    color: '#7C5200',
    bg: '#FFE0A0',
    nota: 'Todo esto ocurre automáticamente según el horario del día.',
  },
  {
    icono: 'happy-outline',
    titulo: 'Estado de ánimo',
    descripcion: 'Cada conversación registra cómo estás. Podés ver el historial en la sección "Estado de ánimo".',
    color: '#004785',
    bg: '#D3E4FF',
    nota: 'El registro es automático, no hace falta hacer nada.',
  },
  {
    icono: 'moon-outline',
    titulo: 'Modo noche',
    descripcion: 'Después de las 23h Rosita baja el perfil y no inicia conversación. Se reactiva sola al día siguiente.',
    color: '#3D1C6E',
    bg: '#E8D5FF',
    nota: 'Si hablás de noche ella igual te responde, solo no interrumpe.',
  },
  {
    icono: 'alert-circle-outline',
    titulo: 'Botón SOS',
    descripcion: 'Si necesitás ayuda urgente, mantené presionado el botón rojo. Rosita avisa a toda tu familia de inmediato.',
    color: '#B3000C',
    bg: '#FFDAD6',
    nota: 'Mantené presionado 2 segundos para activarlo. No alcanza con un toque.',
  },
];

function Chip({ texto, color, bg }: { texto: string; color: string; bg: string }) {
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Ionicons name="mic-outline" size={11} color={color} style={{ marginRight: 4 }} />
      <Text style={[s.chipTexto, { color }]}>{texto}</Text>
    </View>
  );
}

function TarjetaSeccion({ s: sec }: { s: Seccion }) {
  return (
    <View style={card.wrap}>
      <View style={[card.iconBar, { backgroundColor: sec.bg }]}>
        <View style={[card.iconCircle, { backgroundColor: sec.color + '22' }]}>
          <Ionicons name={sec.icono as any} size={22} color={sec.color} />
        </View>
        <Text style={[card.titulo, { color: sec.color }]}>{sec.titulo}</Text>
      </View>

      <View style={card.body}>
        <Text style={card.descripcion}>{sec.descripcion}</Text>

        {sec.comandos && sec.comandos.length > 0 && (
          <View style={card.chips}>
            {sec.comandos.map(c => (
              <Chip key={c} texto={`"${c}"`} color={sec.color} bg={sec.bg} />
            ))}
          </View>
        )}

        {sec.nota && (
          <View style={card.notaWrap}>
            <Ionicons name="information-circle-outline" size={13} color={M.onSurfaceVariant} />
            <Text style={card.notaTexto}>{sec.nota}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function GuiaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: M.surface }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={M.onPrimary} />
        </Pressable>
        <View style={s.headerTextos}>
          <Text style={s.headerEyebrow}>Cómo usar la app</Text>
          <Text style={s.headerTitulo}>Guía de uso</Text>
        </View>
        <View style={[s.headerIcono]}>
          <Ionicons name="book-outline" size={28} color={M.onPrimary} style={{ opacity: 0.6 }} />
        </View>
      </View>

      {/* Intro */}
      <View style={s.intro}>
        <Ionicons name="mic-outline" size={16} color={M.primary} />
        <Text style={s.introTexto}>Hablá con Rosita en voz alta o usá el botón del micrófono.</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.lista, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {SECCIONES.map(sec => (
          <TarjetaSeccion key={sec.titulo} s={sec} />
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: M.primary,
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  headerTextos: { flex: 1 },
  headerEyebrow: { fontSize: 11, color: '#ffffffaa', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1.4 },
  headerTitulo:  { fontSize: 28, fontWeight: '300', color: '#ffffff', letterSpacing: -0.3, lineHeight: 34 },
  headerIcono:   { marginBottom: 2 },

  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: M.primaryContainer,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: M.outlineVariant,
  },
  introTexto: { fontSize: 13, color: M.onSurface, flex: 1, lineHeight: 18 },

  lista: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  chipTexto: { fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },
});

const card = StyleSheet.create({
  wrap: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#0097b2',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  iconBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  titulo: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
    flex: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  descripcion: {
    fontSize: 13,
    color: '#3f484a',
    lineHeight: 19,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  notaWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#f5fafb',
    borderRadius: 8,
    padding: 10,
  },
  notaTexto: {
    fontSize: 12,
    color: '#6f797b',
    flex: 1,
    lineHeight: 17,
  },
});
