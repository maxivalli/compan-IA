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
        <Text style={s.topTitle}>Términos y privacidad</Text>
      </View>

      <ScrollView contentContainerStyle={s.contenido} showsVerticalScrollIndicator={false}>
        <Text style={s.fecha}>Última actualización: marzo 2026</Text>

        {/* ── TÉRMINOS Y CONDICIONES ── */}
        <Text style={s.seccion}>TÉRMINOS Y CONDICIONES DE USO</Text>

        <Text style={s.titulo}>1. Naturaleza del servicio</Text>
        <Text style={s.parrafo}>
          CompañIA es una aplicación de asistencia y compañía por voz basada en inteligencia artificial. <Text style={s.negrita}>No es un dispositivo médico certificado</Text> y no reemplaza la atención, el diagnóstico ni el consejo de profesionales de la salud.
        </Text>

        <Text style={s.titulo}>2. Limitación de responsabilidad</Text>
        <Text style={s.parrafo}>
          • Las alertas SOS y de emergencia son herramientas de asistencia. No se garantiza su recepción inmediata ni la respuesta de los destinatarios.{'\n'}
          • Los recordatorios de medicación son avisos de ayuda. La responsabilidad del seguimiento médico corresponde al usuario y a sus familiares o cuidadores.{'\n'}
          • CompañIA no es responsable por decisiones médicas, de salud o de seguridad tomadas en base a las interacciones con la asistente.{'\n'}
          • En caso de emergencia médica activa, llamar al 107 (SAME) o al número de emergencias local.
        </Text>

        <Text style={s.titulo}>3. Consentimiento de datos y monitoreo</Text>
        <Text style={s.parrafo}>
          Al usar la aplicación, el usuario consiente expresamente que:{'\n'}
          • Sus conversaciones pueden ser resumidas y compartidas con los contactos familiares que configure en la app.{'\n'}
          • Su estado de ánimo registrado por la asistente puede ser visible para dichos contactos.{'\n'}
          • Su audio de voz es procesado por servicios de terceros (Anthropic, OpenAI, ElevenLabs) exclusivamente para el funcionamiento del servicio.
        </Text>

        <Text style={s.titulo}>4. Uso previsto</Text>
        <Text style={s.parrafo}>
          La aplicación está diseñada para uso personal como herramienta de compañía, entretenimiento y asistencia en tareas del día a día. No está diseñada para contextos de atención médica profesional.
        </Text>

        <Text style={s.titulo}>5. Servicio de pago y cancelación</Text>
        <Text style={s.parrafo}>
          CompañIA es un servicio de suscripción. La cancelación puede realizarse en cualquier momento desde la tienda de aplicaciones. No se realizan reembolsos por períodos parciales salvo lo que establezca la legislación aplicable.
        </Text>

        <Text style={s.titulo}>6. Ley aplicable</Text>
        <Text style={s.parrafo}>
          Estos términos se rigen por las leyes de la República Argentina. En caso de conflicto, serán competentes los tribunales ordinarios de la Ciudad Autónoma de Buenos Aires.
        </Text>

        {/* ── POLÍTICA DE PRIVACIDAD ── */}
        <Text style={[s.seccion, { marginTop: 32 }]}>POLÍTICA DE PRIVACIDAD</Text>

        <Text style={s.titulo}>¿Qué es CompañIA?</Text>
        <Text style={s.parrafo}>
          CompañIA es una aplicación de asistente de voz para adultos mayores. Permite tener conversaciones por voz, recibir recordatorios de medicamentos, escuchar música y mantenerse en contacto con familiares mediante Telegram.
        </Text>

        <Text style={s.titulo}>Datos que recopilamos</Text>
        <Text style={s.parrafo}>
          <Text style={s.negrita}>Voz y audio:</Text> Cuando usás el botón de grabación manual, el audio se envía a OpenAI Whisper para transcripción. El audio no se almacena en ningún servidor; solo se procesa y se descarta. El texto de las respuestas de la asistente se envía a ElevenLabs para generar la voz, pero ElevenLabs no guarda ese contenido (historial desactivado en nuestra cuenta).{'\n\n'}
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
          • <Text style={s.negrita}>ElevenLabs</Text> — sintetiza la voz de la asistente. El texto enviado no se almacena en sus servidores (historial desactivado).{'\n'}
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
  seccion:   { fontSize: 13, fontWeight: '700', color: M.primary, letterSpacing: 1.2, marginTop: 8, marginBottom: 4 },
  contenido: { padding: 20 },
  fecha:     { fontSize: 12, color: M.onSurfaceVariant, marginBottom: 20 },
  titulo:    { fontSize: 16, fontWeight: '600', color: M.onSurface, marginTop: 20, marginBottom: 6 },
  parrafo:   { fontSize: 14, color: M.onSurfaceVariant, lineHeight: 22 },
  negrita:   { fontWeight: '600', color: M.onSurface },
  link:      { color: M.primary, textDecorationLine: 'underline' },
});
