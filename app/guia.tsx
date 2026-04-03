import { BackHandler, ScrollView, StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import { useState, useMemo, useCallback } from 'react';

const M = {
  primary:          '#0097b2',
  onPrimary:        '#ffffff',
  primaryContainer: '#cef5ff',
  surface:          '#f9fafb',
  surfaceVariant:   '#dce8ec',
  onSurface:        '#191c1d',
  onSurfaceVariant: '#3f484a',
  outlineVariant:   '#bec8cb',
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

type Grupo = {
  titulo: string;
  icono: string;
  color: string;
  bg: string;
  secciones: Seccion[];
};

const GRUPOS: Grupo[] = [
  {
    titulo: 'Charlar con Rosita',
    icono: 'chatbubbles-outline',
    color: '#B45309',
    bg: '#FEF3C7',
    secciones: [
      {
        icono: 'chatbubbles-outline',
        titulo: 'Charlar',
        descripcion: 'Podés hablar de cualquier tema: cómo te sentís, recuerdos, noticias, familia. Rosita te escucha y responde con cariño.',
        color: '#7C5200',
        bg: '#FFE0A0',
        comandos: ['¿Cómo estás hoy?', 'Contame algo', 'Extraño a mi hijo', 'Qué aburrimiento'],
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
        icono: 'refresh-outline',
        titulo: 'Repetir lo último',
        descripcion: 'Si no escuchaste bien lo que dijo Rosita, pedile que lo repita y lo vuelve a decir al instante, sin hacer una nueva consulta.',
        color: '#5C3800',
        bg: '#FFDEAA',
        comandos: ['Repetime', 'No te escuché', 'Más alto', 'No te oí'],
        nota: 'Solo funciona si la conversación fue hace menos de 2 minutos.',
      },
    ],
  },
  {
    titulo: 'Información',
    icono: 'globe-outline',
    color: '#1D4ED8',
    bg: '#DBEAFE',
    secciones: [
      {
        icono: 'newspaper-outline',
        titulo: 'Noticias',
        descripcion: 'Preguntale qué pasó hoy en Argentina y te cuenta los titulares más recientes.',
        color: '#004785',
        bg: '#D3E4FF',
        comandos: ['¿Qué pasó hoy?', 'Contame novedades', '¿Algo del presidente?', '¿Cómo está la economía?'],
      },
      {
        icono: 'search-outline',
        titulo: 'Búsqueda local',
        descripcion: 'Si necesitás un teléfono, una dirección o información de un servicio cercano, Rosita busca en internet y te lo cuenta.',
        color: '#5B21B6',
        bg: '#EDE9FE',
        comandos: ['¿Cuál es el número de la municipalidad?', '¿Dónde queda la farmacia más cerca?', '¿El ANSES está abierto hoy?', '¿Hay algún comedor cerca?'],
        nota: 'Rosita hace la búsqueda sola — no hace falta saber usar internet.',
      },
      {
        icono: 'partly-sunny-outline',
        titulo: 'Clima',
        descripcion: 'Rosita detecta tu ciudad automáticamente y consulta el tiempo actual. También usa tu ubicación para encontrar servicios cercanos cuando los necesitás.',
        color: '#1B5E28',
        bg: '#C8EFCE',
        comandos: ['¿Cómo está el tiempo?', '¿Hace calor?', '¿Va a llover?', 'Temperatura de hoy'],
        nota: 'La ciudad se detecta una sola vez al iniciar la app y se usa para personalizar las respuestas de Rosita.',
      },
      {
        icono: 'calendar-outline',
        titulo: 'Feriados',
        descripcion: 'Rosita sabe cuándo hay un feriado nacional y puede mencionarlo en la charla, antes o el mismo día.',
        color: '#7C5200',
        bg: '#FFF3CD',
        nota: 'Se carga automáticamente al iniciar la app, sin que tengas que hacer nada.',
      },
    ],
  },
  {
    titulo: 'Música',
    icono: 'musical-notes-outline',
    color: '#6A0D91',
    bg: '#F0DEFF',
    secciones: [
      {
        icono: 'musical-notes-outline',
        titulo: 'Música',
        descripcion: 'Pedí música por género o por nombre de radio y Rosita la pone al instante. Para pararla, tocá el botón blanco que dice "Parar".',
        color: '#6A0D91',
        bg: '#F0DEFF',
        comandos: ['Poné tango', 'Quiero folklore', 'Poneme jazz', 'Poné Radio Mitre', 'Quiero Radio Nacional'],
        nota: 'Géneros: tango, bolero, folklore, romántica, clásica, jazz, pop. Radios: Mitre, Continental, Rivadavia, Cadena 3, La Red, Metro, Rock & Pop y más. Con música sonando podés hablarle a Rosita mencionando su nombre — baja el volumen, responde y vuelve a subir. Si la música sigue sonando después de las 23hs durante más de 30 minutos, Rosita pregunta si seguís ahí. Si no hay respuesta, la apaga sola.',
      },
    ],
  },
  {
    titulo: 'Familia',
    icono: 'people-outline',
    color: '#15803D',
    bg: '#DCFCE7',
    secciones: [
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
        icono: 'image-outline',
        titulo: 'Fotos de la familia',
        descripcion: 'Cuando un familiar te manda una foto por Telegram, Rosita te avisa, la muestra en pantalla y te la describe en voz alta.',
        color: '#6A0D91',
        bg: '#F0DEFF',
        nota: 'La foto aparece grande en pantalla durante 30 segundos. Rosita pregunta si estás disponible antes de mostrarla.',
      },
      {
        icono: 'camera-outline',
        titulo: 'Foto para la familia',
        descripcion: 'Pedile que te saque una foto y la manda directamente a tu familia por Telegram. La cámara abre sola con una cuenta regresiva y se dispara automáticamente.',
        color: '#1B5E28',
        bg: '#C8EFCE',
        comandos: ['Sacame una foto', 'Mandá una foto a mi hijo'],
        nota: 'La foto se toma con la cámara frontal. No hace falta tocar nada — solo pedirlo.',
      },
      {
        icono: 'bar-chart-outline',
        titulo: 'Resumen diario para la familia',
        descripcion: 'Cada día a las 22hs Rosita le manda a la familia un resumen por Telegram con el estado de ánimo del día, los temas que se hablaron y el tiempo que estuvieron juntos.',
        color: '#004785',
        bg: '#D3E4FF',
        nota: 'La familia también puede pedir el resumen en cualquier momento mandando /informe al bot de Telegram — funciona aunque la app esté cerrada.',
      },
    ],
  },
  {
    titulo: 'Salud y seguridad',
    icono: 'medkit-outline',
    color: '#DC2626',
    bg: '#FEE2E2',
    secciones: [
      {
        icono: 'medkit-outline',
        titulo: 'Medicamentos',
        descripcion: 'Rosita conoce tus medicamentos y puede avisarte cuando es hora de tomarlos o responderte dudas sobre ellos.',
        color: '#8B1500',
        bg: '#FFDAD4',
        comandos: ['¿A qué hora tomo el enalapril?', 'Recordame tomar la pastilla a las 8', '¿Qué medicamentos tomo?'],
        nota: 'Los medicamentos se configuran en tu perfil. Rosita los tiene en cuenta en toda la conversación.',
      },
      {
        icono: 'alarm-outline',
        titulo: 'Timers, recordatorios y alarmas',
        descripcion: 'Podés pedir que te avise en un tiempo, que recuerde una fecha importante, o que te despierte a una hora exacta.',
        color: '#004785',
        bg: '#D3E4FF',
        comandos: ['Avisame en 10 minutos', 'Poneme un timer de 30 segundos', 'Recordame el viernes que tengo turno', 'Despertame mañana a las 10'],
        nota: 'Los recordatorios de fecha te avisan el día que corresponde. Las alarmas suenan a la hora exacta aunque Rosita esté en modo noche.',
      },
      {
        icono: 'alert-circle-outline',
        titulo: 'Botón SOS',
        descripcion: 'Si necesitás ayuda urgente, mantené presionado el botón rojo. Rosita avisa a toda tu familia de inmediato.',
        color: '#B3000C',
        bg: '#FFDAD6',
        nota: 'Mantené presionado 2 segundos para activarlo. No alcanza con un toque.',
      },
      {
        icono: 'body-outline',
        titulo: 'Detección de caídas',
        descripcion: 'El teléfono detecta automáticamente si hubo una caída brusca. En ese caso Rosita pregunta si estás bien y, si no hay respuesta, avisa a la familia de inmediato.',
        color: '#B3000C',
        bg: '#FFDAD6',
        nota: 'La detección funciona en segundo plano mientras la app está abierta. El registro queda en el historial de ánimo del día.',
      },
    ],
  },
  {
    titulo: 'Memoria y bienestar',
    icono: 'heart-outline',
    color: '#4F46E5',
    bg: '#EEF2FF',
    secciones: [
      {
        icono: 'happy-outline',
        titulo: 'Estado de ánimo',
        descripcion: 'Cada conversación registra cómo estás. Podés ver el historial en la sección "Estado de ánimo".',
        color: '#004785',
        bg: '#D3E4FF',
        nota: 'El registro es automático, no hace falta hacer nada.',
      },
      {
        icono: 'bookmark-outline',
        titulo: 'Recuerdos',
        descripcion: 'Cuando contás algo importante — el cumpleaños de un familiar, un gusto, una anécdota — Rosita lo guarda y lo recuerda en futuras charlas.',
        color: '#1B5E28',
        bg: '#C8EFCE',
        nota: 'Los recuerdos se guardan automáticamente. También podés verlos y editarlos desde el perfil.',
      },
      {
        icono: 'clipboard-outline',
        titulo: 'Listas y post-its',
        descripcion: 'Pedile a Rosita que cree listas de compras, tareas pendientes o lo que necesites. Las listas aparecen como post-its apilados en la pantalla principal y podés verlas o borrarlas cuando quieras.',
        color: '#78350F',
        bg: '#FEF3C7',
        comandos: [
          'Hacé una lista del super con leche, pan y huevos',
          'Agregá azúcar a la lista del super',
          'Borrá la lista del super',
          '¿Qué tengo en la lista del super?',
        ],
        nota: 'Si hay listas guardadas, aparecen como post-its amarillos en la pantalla. Tocá los post-its para ver los detalles.',
      },
      {
        icono: 'gift-outline',
        titulo: 'Saludos especiales',
        descripcion: 'El día de tu cumpleaños, Rosita te saluda con un mensaje especial a las 9 de la mañana y la pantalla se llena de globos. También tiene saludos únicos para Navidad y Año Nuevo.',
        color: '#6A0D91',
        bg: '#F0DEFF',
        nota: 'La fecha de cumpleaños se configura en tu perfil. Los saludos de Navidad (25/12) y Año Nuevo (1/1) son automáticos.',
      },
    ],
  },
  {
    titulo: 'App',
    icono: 'settings-outline',
    color: '#475569',
    bg: '#F1F5F9',
    secciones: [
      {
        icono: 'mic-circle-outline',
        titulo: 'Botón de hablar',
        descripcion: 'Si preferís no hablar en voz alta, podés mantener apretado el botón del micrófono. Rosita escucha mientras lo sostenés y responde al soltar.',
        color: '#004785',
        bg: '#D3E4FF',
        nota: 'El botón muestra en todo momento el estado de Rosita: "Escuchando..." mientras capta tu voz, "Pensando..." mientras procesa la respuesta y "Hablando..." mientras te habla. Así siempre sabés qué está haciendo.',
      },
      {
        icono: 'eye-outline',
        titulo: 'Leer textos y documentos',
        descripcion: 'Si tenés algo escrito que no podés leer bien — un papel, una receta, una carta — pedile a Rosita que te lo lea. Apuntás la cámara y ella te dice en voz alta todo lo que ve.',
        color: '#004785',
        bg: '#D3E4FF',
        comandos: ['Rosita, ¿qué dice acá?', '¿Qué pone acá?', 'Leeme esto', 'Describime esto'],
        nota: 'La cámara trasera se abre sola con una cuenta regresiva de 3 segundos. Quedate quieto y Rosita lee todo lo que encuentre.',
      },
      {
        icono: 'color-palette-outline',
        titulo: 'Fondo vivo',
        descripcion: 'El fondo de la app cambia automáticamente según la hora del día y el clima real de tu ciudad. De día es azul cielo, al atardecer se pone naranja, de noche oscuro con estrellas. Si llueve o hay tormenta el cielo se torna gris.',
        color: '#6A0D91',
        bg: '#F0DEFF',
        nota: 'Las animaciones se actualizan solas: caen gotas de lluvia o copos de nieve, aparecen rayos, el sol brilla o el viento sopla — todo en tiempo real según el clima.',
      },
      {
        icono: 'moon-outline',
        titulo: 'Modo noche',
        descripcion: 'Después de las 23h Rosita baja el perfil y no inicia conversación. Se reactiva sola al día siguiente. El horario de descanso se puede personalizar desde Configuración.',
        color: '#3D1C6E',
        bg: '#E8D5FF',
        nota: 'Si hablás de noche ella igual te responde, solo no interrumpe.',
      },
      {
        icono: 'cloud-offline-outline',
        titulo: 'Modo sin conexión',
        descripcion: 'Si no hay internet, Rosita lo detecta y te avisa en lugar de quedarse en silencio. Cuando vuelve la conexión, retoma todo normalmente.',
        color: '#5C3800',
        bg: '#FFDEAA',
        nota: 'La música en streaming y las respuestas de IA requieren conexión. El resto de la app funciona igual.',
      },
      {
        icono: 'home-outline',
        titulo: 'Control del hogar (SmartThings)',
        descripcion: 'Vinculá tu cuenta de Samsung SmartThings para que Rosita pueda controlar tus dispositivos del hogar: luces, enchufes, aires acondicionados y más.',
        color: '#475569',
        bg: '#F1F5F9',
        comandos: ['Apagá la luz', 'Prendé el ventilador', '¿Qué dispositivos tengo?'],
        nota: 'La vinculación se hace desde Configuración, pegando el token de SmartThings. Solo se hace una vez.',
      },
      {
        icono: 'lock-closed-outline',
        titulo: 'PIN de configuración',
        descripcion: 'La sección de configuración está protegida con un PIN para que solo los familiares autorizados puedan hacer cambios.',
        color: '#3f484a',
        bg: '#dce8ec',
        nota: 'El PIN se configura durante el primer uso. Si lo olvidás, podés contactar al soporte.',
      },
    ],
  },
];

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function Chip({ texto, color, bg }: { texto: string; color: string; bg: string }) {
  return (
    <View style={[st.chip, { backgroundColor: bg }]}>
      <Ionicons name="mic-outline" size={11} color={color} style={{ marginRight: 4 }} />
      <Text style={[st.chipTexto, { color }]}>{texto}</Text>
    </View>
  );
}

function TarjetaSeccion({ sec, color, bg, grupoBadge }: { sec: Seccion; color: string; bg: string; grupoBadge?: string }) {
  return (
    <View style={card.wrap}>
      <View style={[card.iconBar, { backgroundColor: bg }]}>
        <View style={[card.iconCircle, { backgroundColor: color + '22' }]}>
          <Ionicons name={sec.icono as any} size={22} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[card.titulo, { color }]}>{sec.titulo}</Text>
          {grupoBadge && (
            <Text style={[card.badge, { color }]}>{grupoBadge}</Text>
          )}
        </View>
      </View>

      <View style={card.body}>
        <Text style={card.descripcion}>{sec.descripcion}</Text>

        {sec.comandos && sec.comandos.length > 0 && (
          <View style={card.chips}>
            {sec.comandos.map(c => (
              <Chip key={c} texto={`"${c}"`} color={color} bg={bg} />
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

function GrupoColapsable({
  grupo,
  expandido,
  onToggle,
}: {
  grupo: Grupo;
  expandido: boolean;
  onToggle: () => void;
}) {
  return (
    <View>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [cab.wrap, { backgroundColor: grupo.bg, borderLeftColor: grupo.color, opacity: pressed ? 0.75 : 1 }]}
      >
        <View style={[cab.iconCircle, { backgroundColor: grupo.color + '20' }]}>
          <Ionicons name={grupo.icono as any} size={16} color={grupo.color} />
        </View>
        <Text style={[cab.titulo, { color: grupo.color, flex: 1 }]}>{grupo.titulo}</Text>
        <View style={[cab.badge, { backgroundColor: grupo.color + '18' }]}>
          <Text style={[cab.badgeTexto, { color: grupo.color }]}>{grupo.secciones.length}</Text>
        </View>
        <Ionicons
          name={expandido ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={grupo.color}
          style={{ marginLeft: 6 }}
        />
      </Pressable>
      {expandido && (
        <View style={st.grupoCards}>
          {grupo.secciones.map(sec => (
            <TarjetaSeccion key={sec.titulo} sec={sec} color={grupo.color} bg={grupo.bg} />
          ))}
        </View>
      )}
    </View>
  );
}

export default function GuiaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});

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

  function toggleGrupo(titulo: string) {
    setExpandidos(prev => ({ ...prev, [titulo]: !prev[titulo] }));
  }

  const resultados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return null;
    const out: { sec: Seccion; grupo: Grupo }[] = [];
    for (const grupo of GRUPOS) {
      for (const sec of grupo.secciones) {
        const hayden = [
          sec.titulo,
          sec.descripcion,
          sec.nota ?? '',
          ...(sec.comandos ?? []),
        ].some(t => normalizar(t).includes(q));
        if (hayden) out.push({ sec, grupo });
      }
    }
    return out;
  }, [busqueda]);

  return (
    <View style={{ flex: 1, backgroundColor: M.surface }}>
      <ScreenHeader titulo="Guía de uso" eyebrow="Cómo usar la app" icono="book-outline" />

      {/* Intro */}
      <View style={st.intro}>
        <Ionicons name="mic-outline" size={16} color={M.primary} />
        <Text style={st.introTexto}>Hablá con Rosita en voz alta o usá el botón del micrófono.</Text>
      </View>

      {/* Buscador */}
      <View style={st.searchWrap}>
        <Ionicons name="search-outline" size={17} color={M.onSurfaceVariant} style={st.searchIcon} />
        <TextInput
          style={st.searchInput}
          placeholder="Buscar en la guía..."
          placeholderTextColor={M.onSurfaceVariant}
          value={busqueda}
          onChangeText={setBusqueda}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
        {busqueda.length > 0 && (
          <Pressable onPress={() => setBusqueda('')} hitSlop={8} style={st.clearBtn}>
            <Ionicons name="close-circle" size={17} color={M.onSurfaceVariant} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[st.lista, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {resultados !== null ? (
          // Vista de búsqueda — resultados planos
          resultados.length === 0 ? (
            <View style={st.sinResultados}>
              <Ionicons name="search-outline" size={32} color={M.outlineVariant} />
              <Text style={st.sinResultadosTexto}>Sin resultados para "{busqueda}"</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {resultados.map(({ sec, grupo }) => (
                <TarjetaSeccion
                  key={grupo.titulo + sec.titulo}
                  sec={sec}
                  color={grupo.color}
                  bg={grupo.bg}
                  grupoBadge={grupo.titulo}
                />
              ))}
            </View>
          )
        ) : (
          // Vista normal — grupos colapsables
          <View style={{ gap: 8 }}>
            {GRUPOS.map(grupo => (
              <GrupoColapsable
                key={grupo.titulo}
                grupo={grupo}
                expandido={!!expandidos[grupo.titulo]}
                onToggle={() => toggleGrupo(grupo.titulo)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
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

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: M.outlineVariant,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: M.onSurface,
    paddingVertical: 6,
  },
  clearBtn: { padding: 2, marginLeft: 4 },

  lista: { paddingHorizontal: 16, paddingTop: 16 },
  grupoCards: { gap: 10, marginTop: 10, marginBottom: 4 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  chipTexto: { fontSize: 12, fontWeight: '500', letterSpacing: 0.2 },

  sinResultados: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  sinResultadosTexto: {
    fontSize: 14,
    color: M.onSurfaceVariant,
    textAlign: 'center',
  },
});

const cab = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  iconCircle: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  titulo: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  badge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeTexto: {
    fontSize: 11,
    fontWeight: '700',
  },
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
  },
  badge: {
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.7,
    marginTop: 1,
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
