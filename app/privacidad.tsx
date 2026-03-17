import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const M = { primary: '#0097b2', onPrimary: '#ffffff', onSurface: '#171d1e', onSurfaceVariant: '#3f484a', background: '#f5fafb' };

export default function Privacidad() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: M.background }}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.btnBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color={M.onPrimary} />
        </TouchableOpacity>
        <Text style={s.topTitle}>Política de privacidad</Text>
      </View>

      <ScrollView contentContainerStyle={s.contenido} showsVerticalScrollIndicator={false}>
        <Text style={s.fecha}>Última actualización: marzo 2026</Text>

        <Text style={s.titulo}>¿Qué es CompañIA?</Text>
        <Text style={s.parrafo}>
          CompañIA es una aplicación de asistente de voz para adultos mayores. Permite tener conversaciones por voz, recibir recordatorios de medicamentos, escuchar música y mantenerse en contacto con familiares mediante Telegram.
        </Text>

        <Text style={s.titulo}>Datos que recopilamos</Text>
        <Text style={s.parrafo}>
          <Text style={s.negrita}>Voz y audio:</Text> Cuando usás el botón de grabación manual, el audio se envía a OpenAI Whisper para transcripción. El audio no se almacena en ningún servidor; solo se procesa y se descarta.{'\n\n'}
          <Text style={s.negrita}>Ubicación:</Text> Se usa exclusivamente para obtener el pronóstico del tiempo local mediante Open-Meteo (servicio gratuito sin tracking). No se comparte ni almacena.{'\n\n'}
          <Text style={s.negrita}>Perfil y conversaciones:</Text> El nombre, gustos, medicamentos y fechas importantes se guardan únicamente en el dispositivo (AsyncStorage). Las conversaciones no se almacenan en ningún servidor.{'\n\n'}
          <Text style={s.negrita}>Identificador de dispositivo:</Text> Se genera un ID anónimo (UUID) para asociar tu dispositivo con tu familia en nuestro servidor. No contiene información personal.
        </Text>

        <Text style={s.titulo}>Datos que no recopilamos</Text>
        <Text style={s.parrafo}>
          No recopilamos nombre, correo, edad, teléfono ni ningún dato de identificación personal. No tenemos cuentas de usuario. No vendemos ni compartimos datos con terceros para publicidad.
        </Text>

        <Text style={s.titulo}>Telegram</Text>
        <Text style={s.parrafo}>
          Si configurás contactos de Telegram, los mensajes de alerta y el resumen diario se envían a través del bot de CompañIA. Estos mensajes están sujetos a la{' '}
          <Text style={s.link}>política de privacidad de Telegram</Text>.
          Los IDs de chat de Telegram se almacenan en nuestro servidor únicamente para poder enviar los mensajes.
        </Text>

        <Text style={s.titulo}>Servicios de terceros</Text>
        <Text style={s.parrafo}>
          • <Text style={s.negrita}>Anthropic Claude</Text> — genera las respuestas de la asistente{'\n'}
          • <Text style={s.negrita}>OpenAI Whisper</Text> — transcribe el audio del botón manual{'\n'}
          • <Text style={s.negrita}>ElevenLabs</Text> — sintetiza la voz de la asistente{'\n'}
          • <Text style={s.negrita}>Open-Meteo</Text> — provee el clima sin API key ni tracking{'\n'}
          • <Text style={s.negrita}>Sentry</Text> — registra errores técnicos de forma anónima para mejorar la app
        </Text>

        <Text style={s.titulo}>Seguridad</Text>
        <Text style={s.parrafo}>
          Toda la comunicación entre la app y nuestros servidores usa HTTPS. Las claves de las APIs de IA nunca están en el dispositivo — solo en nuestro servidor.
        </Text>

        <Text style={s.titulo}>Derechos</Text>
        <Text style={s.parrafo}>
          Podés borrar todos tus datos desinstalando la app (borra los datos locales) y contactándonos para eliminar el registro de tu dispositivo en nuestro servidor.
        </Text>

        <Text style={s.titulo}>Contacto</Text>
        <Text style={s.parrafo}>
          Si tenés preguntas sobre esta política, escribinos a través del bot de Telegram o al correo de soporte que encontrás en la página de la app en Google Play.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  topBar:    { backgroundColor: M.primary, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnBack:   { padding: 12, borderRadius: 24 },
  topTitle:  { fontSize: 20, fontWeight: '400', color: M.onPrimary },
  contenido: { padding: 20 },
  fecha:     { fontSize: 12, color: M.onSurfaceVariant, marginBottom: 20 },
  titulo:    { fontSize: 16, fontWeight: '600', color: M.onSurface, marginTop: 20, marginBottom: 6 },
  parrafo:   { fontSize: 14, color: M.onSurfaceVariant, lineHeight: 22 },
  negrita:   { fontWeight: '600', color: M.onSurface },
  link:      { color: M.primary, textDecorationLine: 'underline' },
});
