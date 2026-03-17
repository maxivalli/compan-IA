# AbuApp — Contexto para Claude

## Qué es esto

AbuApp es una app móvil (React Native / Expo SDK 54) para acompañar a una abuela de 90 años. La asistente de voz se llama **Rosita**. La abuela se llama **Negrita**.

El objetivo es que Rosita sea una compañera cálida: charla, cuenta cuentos, pone música, hace juegos de memoria y registra cómo se siente la abuela. Los familiares pueden ver el registro de estado de ánimo desde la app.

---

## Stack técnico

- **React Native + Expo SDK 54** con `newArchEnabled: true` y React Compiler activado
- **expo-router** para navegación (tabs)
- **expo-speech-recognition** — reconocimiento de voz continuo en español (es-AR)
- **expo-audio** — reproducción de TTS y música en streaming
- **ElevenLabs TTS** — modelo `eleven_flash_v2_5`, voz ID `r3lotmx3BZETVvcKm6R6`
- **Claude API** — modelo `claude-haiku-4-5-20251001` para respuestas y charla proactiva
- **OpenAI Whisper** — transcripción de audio cuando se usa el botón manual
- **Open-Meteo** — clima sin API key (free)
- **expo-location** — GPS para contexto de clima
- **AsyncStorage** — persistencia de perfil, historial, recuerdos, estado de ánimo
- **EAS Build** — builds en la nube (no hay Android SDK local)

---

## Estructura de archivos

```
app/
  index.tsx          # Pantalla principal — toda la lógica de Rosita
  configuracion.tsx  # Perfil editable de la abuela
  animo.tsx          # Historial de estado de ánimo (solo lectura, para familiares)
  _layout.tsx        # Tabs: Rosita | Configuración | Ánimo

components/
  RosaOjos.tsx       # Animación de ojos con párpados, expresiones, modo noche

lib/
  memoria.ts         # AsyncStorage: perfil, historial, recuerdos, estado de ánimo
  musica.ts          # Búsqueda de radios vía radio-browser.info + fallbacks HTTPS
  clima.ts           # Clima via Open-Meteo + expo-location
```

---

## Variables de entorno

Definidas en `.env` con prefijo `EXPO_PUBLIC_` (accesibles en bundle — aceptable para app personal):

```
EXPO_PUBLIC_CLAUDE_API_KEY
EXPO_PUBLIC_OPENAI_API_KEY
EXPO_PUBLIC_ELEVENLABS_API_KEY
```

---

## Flujo principal (index.tsx)

1. Al iniciar: carga perfil + historial + clima en paralelo, saluda con TTS
2. SR continuo (`expo-speech-recognition`) escucha siempre en estado `esperando`
3. Voz detectada → `responderConClaude()` → Claude responde con etiqueta de emoción + texto
4. Texto va a ElevenLabs → audio guardado en cache → se reproduce
5. Al terminar audio → SR se reinicia automáticamente
6. Botón manual: graba audio → Whisper transcribe → mismo flujo desde paso 3

**Watchdog**: cada 2 segundos verifica que SR esté activo cuando debería estarlo.

**Charla proactiva**: si pasan 60 min sin charla entre las 9h y 21h, Rosita inicia conversación con contexto de clima + perfil.

---

## Tags que Claude usa en sus respuestas

La respuesta siempre empieza con un tag:

| Tag | Significado | Expresión resultante |
|-----|-------------|----------------------|
| `[FELIZ]` | Emoción feliz | `feliz` |
| `[TRISTE]` | Emoción triste | `triste` |
| `[SORPRENDIDA]` | Emoción sorpresa | `sorprendida` |
| `[PENSATIVA]` | Emoción pensativa | `pensativa` |
| `[NEUTRAL]` | Sin emoción especial | `neutral` |
| `[CUENTO]` | Cuenta un cuento corto | `feliz` |
| `[JUEGO]` | Inicia adivinanza/trivia | `pensativa` |
| `[MUSICA: genero]` | Pone música | `feliz` |
| `[PARAR_MUSICA]` | Para la música | `neutral` |

Tag opcional al **final** de la respuesta:
- `[RECUERDO: texto breve]` — guarda una anécdota en `perfil.recuerdos[]`

Géneros de música válidos: `tango`, `bolero`, `folklore`, `romantica`, `clasica`, `jazz`, `pop`

---

## Modo noche (modoNoche)

Evaluado cada 10 segundos:

- `despierta` — horario normal (9h–23h)
- `soñolienta` — horario nocturno (23h–9h) con actividad reciente (< 1 min)
- `durmiendo` — horario nocturno sin actividad por 1+ minuto

Al hablarle en modo `durmiendo` o `soñolienta`, Rosita se despierta (vuelve a `soñolienta`/`despierta` según horario).

---

## Animación de ojos (RosaOjos.tsx)

Usa `React Native Animated API`. Crítico: **no mezclar** `useNativeDriver: true` con `useNativeDriver: false` en el mismo `Animated.parallel()`.

- `upperLid`, `lowerLid`, `blinkLid` → `useNativeDriver: false` (afectan `height`)
- `pxL`, `pxR`, `py`, `scaleY` → `useNativeDriver: true` (afectan `transform`)

El estado `soñolienta` usa `scaleY: 0.45` para comprimir el ojo visualmente.

---

## Cache de TTS

Antes de llamar a ElevenLabs, se verifica si existe el archivo en cache (`FileSystem.cacheDirectory + 'tts_' + hash + '.mp3'`). El hash es djb2 del texto. Si existe, se reproduce directamente sin llamar a la API.

---

## Persistencia (AsyncStorage keys)

| Clave | Contenido |
|-------|-----------|
| `rosa_perfil` | `Perfil` (nombre, familiares, gustos, medicamentos, fechas, recuerdos) |
| `rosa_historial` | Últimos 30 mensajes del chat |
| `rosa_animo` | Hasta 500 entradas `{ expresion, timestamp }` |

---

## Builds

Se buildea con **EAS** (Expo Application Services), no localmente:

```bash
eas build --platform android --profile preview
```

No hay SDK de Android instalado localmente. Para probar sin buildear usar Expo Go (limitado — no funciona SR ni audio nativo).
