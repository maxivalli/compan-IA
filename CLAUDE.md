# CompañIA — Contexto para Claude

## Qué es esto

CompañIA es una app móvil (React Native / Expo SDK 54) con una asistente de voz llamada **Rosita**. Está pensada para cualquier persona que quiera una compañera de voz con IA — con tono adaptado según la edad configurada en el perfil. La app es de pago ($29 USD/mes).

El objetivo es que Rosita sea una compañera cálida: charla, cuenta cuentos, pone música, hace juegos, registra el estado de ánimo y alerta a la familia en emergencias.

---

## Stack técnico

- **React Native + Expo SDK 54** con `newArchEnabled: true` y React Compiler activado
- **expo-router** para navegación (tabs)
- **expo-speech-recognition** — reconocimiento de voz continuo en español (es-AR)
- **expo-audio** — reproducción de TTS y música en streaming
- **ElevenLabs TTS** — modelo `eleven_flash_v2_5`, voz ID `r3lotmx3BZETVvcKm6R6`
- **Claude API** — modelo `claude-haiku-4-5-20251001` (vía backend)
- **OpenAI Whisper** — transcripción de audio cuando se usa el botón manual (vía backend)
- **Open-Meteo** — clima sin API key (free)
- **expo-location** — GPS para contexto de clima
- **AsyncStorage** — persistencia de perfil, historial, recuerdos, estado de ánimo
- **EAS Build** — builds en la nube (no hay Android SDK local)

---

## Arquitectura backend

Las llamadas a Claude y Whisper van al **AbuApp_Backend** (Express/TypeScript en Railway), no directamente desde la app. Esto protege las API keys y permite rate limiting y autenticación por dispositivo.

La app envía:
- `x-api-key` — clave de app para autenticar
- `x-install-id` — UUID del dispositivo, vinculado a una familia en la DB

---

## Estructura de archivos

```
app/
  index.tsx          # Pantalla principal — toda la lógica de Rosita
  configuracion.tsx  # Perfil editable
  animo.tsx          # Historial de estado de ánimo (solo lectura, para familiares)
  onboarding.tsx     # Flujo de configuración inicial (primer uso)
  privacidad.tsx     # Política de privacidad
  _layout.tsx        # Tabs: Rosita | Configuración | Ánimo

components/
  RosaOjos.tsx       # Animación de ojos con párpados, expresiones, modo noche
  FondoAnimado.tsx   # Fondo dinámico según clima y hora
  EfectosClima.tsx   # Partículas de lluvia, nieve, sol, etc.
  EfectosExpresion.tsx # Efectos por expresión (corazones, estrellas, etc.)
  MenuFlotante.tsx   # Menú de acciones rápidas

hooks/
  useRosita.ts       # Hook principal: SR, TTS, Claude, música, modo noche, bostezo, SOS
  useNotificaciones.ts # Recordatorios de medicamentos y fechas importantes

lib/
  memoria.ts         # AsyncStorage: perfil, historial, recuerdos, ánimo, recordatorios, PIN
  claudeParser.ts    # System prompt, tono por edad, parseo de respuestas de Claude
  musica.ts          # Búsqueda de radios vía radio-browser.info + fallbacks HTTPS
  clima.ts           # Clima via Open-Meteo + expo-location
  ai.ts              # Cliente HTTP para backend (Claude + Whisper)
  juegos.ts          # Lógica de juegos y adivinanzas
  telegram.ts        # Envío de alertas Telegram
```

---

## Variables de entorno

```
EXPO_PUBLIC_BACKEND_URL       # URL del backend en Railway
EXPO_PUBLIC_APP_API_KEY       # Clave para autenticar con el backend
EXPO_PUBLIC_ELEVENLABS_API_KEY # ElevenLabs (llamado directo desde la app)
```

---

## Perfil del usuario (Perfil type)

```typescript
type Perfil = {
  nombreAbuela: string;       // nombre de quien usa la app
  nombreAsistente: string;    // nombre de Rosita (default: 'Rosita')
  edad?: number;              // edad — determina el tono de la IA
  familiares: string[];
  gustos: string[];
  medicamentos: string[];
  fechasImportantes: string[];
  recuerdos: string[];
  telegramChatIds: string[];   // legacy
  telegramContactos: TelegramContacto[];
}
```

---

## Tono por edad (claudeParser.ts)

| Rango | Tono |
|-------|------|
| < 18 | Juvenil, energético, lenguaje moderno |
| 18–40 | Directo, de igual a igual, natural |
| 41–60 | Cálido, adulto, cercano |
| > 60 | Frases cortas, paciente, muy cálido |

---

## Flujo principal (index.tsx → useRosita.ts)

1. Al iniciar: carga perfil + historial + clima en paralelo, saluda con TTS
2. Si no hay `nombreAbuela` → navega a `/onboarding` automáticamente
3. SR continuo (`expo-speech-recognition`) escucha siempre en estado `esperando`
4. Voz detectada → `responderConClaude()` → Claude responde con etiqueta de emoción + texto
5. Texto va a ElevenLabs → audio guardado en cache (`tts_v2_` + hash) → se reproduce
6. Al terminar audio → SR se reinicia automáticamente
7. Botón manual: graba audio → Whisper transcribe → mismo flujo desde paso 4

**Watchdog**: cada 2 segundos verifica que SR esté activo cuando debería estarlo.

**Charla proactiva**: si pasan 60 min sin charla entre las 9h y 21h, Rosita inicia conversación.

**Bostezo**: si pasan 5 min de inactividad (en estado `esperando`, de día, sin música), Rosita hace una animación de bostezo. Se repite cada 10 min mínimo.

**SOS**: `onPressIn` inicia animación de 2 segundos; si se mantiene, envía alerta Telegram a todos los contactos configurados.

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

---

## Animación de ojos (RosaOjos.tsx)

Expresiones disponibles: `feliz`, `triste`, `sorprendida`, `pensativa`, `neutral`, `bostezando`

Crítico: **no mezclar** `useNativeDriver: true` con `useNativeDriver: false` en el mismo `Animated.parallel()`.

- `upperLid`, `lowerLid`, `blinkLid` → `useNativeDriver: false` (afectan `height`)
- `pxL`, `pxR`, `py`, `scaleY` → `useNativeDriver: true` (afectan `transform`)

---

## Cache de TTS

Prefix: `tts_v2_` + hash djb2 del texto. Si el archivo existe en `FileSystem.cacheDirectory`, se reproduce sin llamar a ElevenLabs.

---

## Optimizaciones de API

- **System prompt**: memoizado por minuto + perfil + clima en `systemPromptCacheRef`
- **Historial**: se guardan 30 mensajes localmente, pero solo se envían los últimos 10 a Claude
- **Prompt caching**: el backend usa `cache_control: { type: 'ephemeral' }` en el system prompt con header `anthropic-beta: prompt-caching-2024-07-31`

---

## Persistencia (AsyncStorage keys)

| Clave | Contenido |
|-------|-----------|
| `rosa_perfil` | `Perfil` completo |
| `rosa_historial` | Últimos 30 mensajes del chat |
| `rosa_animo` | Hasta 500 entradas `{ expresion, timestamp }` |
| `rosa_recordatorios` | Registro de recordatorios enviados hoy |
| `rosa_recordatorios_personal` | Recordatorios futuros creados por la usuaria |
| `compania_install_id` | UUID del dispositivo |
| `compania_familia_id` | ID de familia en el backend |
| `compania_pin` | PIN de configuración |

---

## Builds

```bash
eas build --platform android --profile preview
```

No hay SDK de Android instalado localmente. Para probar sin buildear usar Expo Go (limitado — no funciona SR ni audio nativo). En la web, el Accelerometer está deshabilitado automáticamente con guard `Platform.OS === 'web'`.
