# CompañIA — Rosita

Compañera virtual de voz con inteligencia artificial. Rosita charla, pone música, recuerda medicamentos, hace juegos, registra el estado de ánimo y alerta a la familia en emergencias.

Construida con React Native + Expo para Android.

---

## Funcionalidades

- **Voz continua** — Rosita escucha siempre, sin necesidad de tocar nada
- **Conversación natural** — responde con calidez, recuerda anécdotas y las usa en futuras charlas
- **Tono adaptado a la edad** — ajusta su forma de hablar según la edad configurada en el perfil
- **Música** — pide "poné un tango" y Rosita busca una radio online al instante
- **Cuentos y juegos** — adivinanzas, trivia, cuentos cortos a pedido
- **Clima** — tiene contexto del clima actual para la charla y consejos del día
- **Recordatorios de medicamentos** — avisa con voz a la hora exacta
- **Modo noche** — a las 23h los ojos se entornan (soñolienta) y se cierran si no hay actividad
- **Bostezo** — después de 5 minutos de inactividad Rosita bosteza con animación personalizada
- **Estado de ánimo** — los familiares pueden ver el registro de expresiones desde la tab Ánimo
- **Charla proactiva** — si pasa mucho tiempo sin charlar, Rosita inicia la conversación
- **Botón SOS** — mantenelo presionado 2 segundos y avisa a toda la familia por Telegram
- **Alertas Telegram** — los contactos configurados reciben notificaciones de emergencia
- **Onboarding** — flujo de configuración inicial con nombre, edad y familiares

---

## Tecnologías

| Qué | Cómo |
|-----|------|
| Framework | React Native + Expo SDK 54 |
| Voz (entrada) | expo-speech-recognition (Google SR, es-AR) |
| Voz (salida) | ElevenLabs TTS (`eleven_flash_v2_5`) |
| Cerebro | Claude Haiku (`claude-haiku-4-5-20251001`) vía backend |
| Transcripción manual | OpenAI Whisper vía backend |
| Música | radio-browser.info API + streams HTTPS de fallback |
| Clima | Open-Meteo (sin API key) + expo-location |
| Alertas | Telegram Bot API vía backend |
| Persistencia | AsyncStorage |
| Build | EAS (Expo Application Services) |

---

## Arquitectura

El proyecto tiene dos partes:

- **AbuApp** — app React Native (este repo)
- **AbuApp_Backend** — servidor Express en Node.js/TypeScript deployado en Railway. Maneja las llamadas a Claude, Whisper y Telegram de forma segura.

Las API keys sensibles viven en el backend. La app solo necesita la URL del backend y una API key propia.

---

## Variables de entorno

Crear un archivo `.env` en la raíz del proyecto (nunca commitear):

```
EXPO_PUBLIC_BACKEND_URL=https://tu-backend.railway.app
EXPO_PUBLIC_APP_API_KEY=tu_clave_de_backend
EXPO_PUBLIC_ELEVENLABS_API_KEY=tu_clave_elevenlabs
```

---

## Correr localmente

```bash
npm install
npx expo start
```

> El reconocimiento de voz y el audio nativo no funcionan en Expo Go. Para probar todas las funcionalidades se necesita un build de desarrollo. En la web, el Accelerometer está deshabilitado automáticamente.

## Build para Android

```bash
eas build --platform android --profile preview
```

---

## Estructura

```
app/
  index.tsx          # Pantalla principal de Rosita
  configuracion.tsx  # Perfil editable (nombre, edad, familiares, medicamentos, Telegram)
  animo.tsx          # Historial de estado de ánimo para familiares
  onboarding.tsx     # Flujo de configuración inicial (primer uso)
  privacidad.tsx     # Pantalla de política de privacidad

components/
  RosaOjos.tsx       # Animación de ojos expresivos con párpados y expresiones
  FondoAnimado.tsx   # Fondo dinámico según clima y hora
  EfectosClima.tsx   # Partículas y efectos visuales de clima
  EfectosExpresion.tsx # Efectos visuales por expresión
  MenuFlotante.tsx   # Menú de acciones rápidas

hooks/
  useRosita.ts       # Lógica principal: SR, TTS, Claude, música, modo noche, bostezo
  useNotificaciones.ts # Recordatorios de medicamentos y fechas importantes

lib/
  memoria.ts         # AsyncStorage: perfil, historial, recuerdos, ánimo, recordatorios, PIN
  claudeParser.ts    # System prompt, tono por edad, parseo de respuestas de Claude
  musica.ts          # Búsqueda y reproducción de radios
  clima.ts           # Obtención del clima actual via Open-Meteo
  ai.ts              # Cliente HTTP para el backend (Claude + Whisper)
  juegos.ts          # Lógica de juegos y adivinanzas
  telegram.ts        # Envío de alertas por Telegram
```
