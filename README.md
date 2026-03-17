# AbuApp — Rosita

Compañera virtual de voz para abuelas. Rosita charla, cuenta cuentos, pone música, hace juegos de memoria y registra el estado de ánimo para que lo vean los familiares.

Construida con React Native + Expo para Android.

---

## Funcionalidades

- **Voz continua** — Rosita escucha siempre, sin necesidad de tocar nada
- **Conversación natural** — responde con calidez en español rioplatense, recuerda anécdotas y las usa en futuras charlas
- **Música** — pide "poné un tango" y Rosita busca una radio online
- **Cuentos y juegos** — adivinanzas, trivia, cuentos cortos a pedido
- **Clima** — tiene contexto del clima actual para la charla
- **Modo noche** — a las 23h los ojos se entornan (soñolienta) y se cierran si no hay actividad
- **Estado de ánimo** — los familiares pueden ver cómo estuvo la abuela desde la tab "Ánimo"
- **Charla proactiva** — si pasa mucho tiempo sin charlar, Rosita inicia la conversación

---

## Tecnologías

| Qué | Cómo |
|-----|------|
| Framework | React Native + Expo SDK 54 |
| Voz (entrada) | expo-speech-recognition (Google SR, es-AR) |
| Voz (salida) | ElevenLabs TTS (`eleven_flash_v2_5`) |
| Cerebro | Claude API (`claude-haiku-4-5-20251001`) |
| Transcripción manual | OpenAI Whisper |
| Música | radio-browser.info API + streams HTTPS de fallback |
| Clima | Open-Meteo (sin API key) + expo-location |
| Persistencia | AsyncStorage |
| Build | EAS (Expo Application Services) |

---

## Variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```
EXPO_PUBLIC_CLAUDE_API_KEY=tu_clave
EXPO_PUBLIC_OPENAI_API_KEY=tu_clave
EXPO_PUBLIC_ELEVENLABS_API_KEY=tu_clave
```

---

## Correr localmente

```bash
npm install
npx expo start
```

> Nota: el reconocimiento de voz y el audio nativo no funcionan en Expo Go. Para probar todas las funcionalidades se necesita un build de desarrollo o de producción.

## Build para Android

```bash
eas build --platform android --profile preview
```

---

## Estructura

```
app/
  index.tsx          # Pantalla principal de Rosita
  configuracion.tsx  # Perfil de la abuela (nombre, familiares, gustos, etc.)
  animo.tsx          # Historial de estado de ánimo para familiares

components/
  RosaOjos.tsx       # Animación de ojos expresivos

lib/
  memoria.ts         # Persistencia: perfil, historial, recuerdos, ánimo
  musica.ts          # Búsqueda y reproducción de radios
  clima.ts           # Obtención del clima actual
```
