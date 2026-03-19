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
- **ElevenLabs TTS** — modelo `eleven_flash_v2_5`, voz femenina `r3lotmx3BZETVvcKm6R6`, voz masculina `QK4xDwo9ESPHA4JNUpX3`
- **ElevenLabs Sound Generation** — efectos de sonido (silbido de inactividad), cacheados en `silbido.mp3`
- **Claude API** — modelo `claude-haiku-4-5-20251001` (vía backend), max_tokens 180 (respuesta) / 120 (proactiva)
- **OpenAI Whisper** — transcripción de audio cuando se usa el botón manual (vía backend)
- **Open-Meteo** — clima sin API key (free)
- **expo-location** — GPS para contexto de clima
- **AsyncStorage** — persistencia de perfil, historial, recuerdos, estado de ánimo
- **EAS Build** — builds en la nube bajo cuenta `compan-ia` (no hay Android SDK local)

---

## Arquitectura backend

Las llamadas a Claude, Whisper y ElevenLabs van al **AbuApp_Backend** (Express/TypeScript en Railway), no directamente desde la app. Esto protege las API keys y permite rate limiting y autenticación por dispositivo.

La app envía:
- `x-api-key` — clave de app para autenticar
- `x-install-id` — UUID del dispositivo, vinculado a una familia en la DB

---

## Estructura de archivos

```
app/
  index.tsx          # Pantalla principal — toda la lógica de Rosita
  configuracion.tsx  # Perfil editable (useFocusEffect recarga perfil al volver al tab)
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
  useNotificaciones.ts # Recordatorios, polling Telegram, timer de silbido

lib/
  memoria.ts         # AsyncStorage: perfil, historial, recuerdos, ánimo, recordatorios, PIN
  claudeParser.ts    # System prompt (estable + dinámico), tono por edad, parseo de respuestas
  musica.ts          # Búsqueda de radios vía radio-browser.info (sin fallbacks hardcodeados)
  clima.ts           # Clima via Open-Meteo + expo-location
  ai.ts              # Cliente HTTP para backend (Claude + Whisper + ElevenLabs sound)
  juegos.ts          # Lógica de juegos y adivinanzas
  telegram.ts        # Envío de alertas Telegram

docs/
  motor-de-voz.md    # Esquema visual completo del motor de voz
```

---

## Variables de entorno

```
EXPO_PUBLIC_BACKEND_URL        # URL del backend en Railway
EXPO_PUBLIC_APP_API_KEY        # Clave para autenticar con el backend
EXPO_PUBLIC_ELEVENLABS_API_KEY # ElevenLabs (usado desde el backend)
```

Configuradas en el entorno `preview` de EAS bajo la cuenta `compan-ia`.

---

## Perfil del usuario (Perfil type)

```typescript
type Perfil = {
  nombreAbuela: string;       // nombre de quien usa la app
  nombreAsistente: string;    // nombre de Rosita (default: 'Rosita')
  vozGenero?: 'femenina' | 'masculina';
  edad?: number;              // edad — determina el tono de la IA
  familiares: string[];
  gustos: string[];
  medicamentos: string[];
  fechasImportantes: string[];
  recuerdos: string[];        // hasta 50 items, generados por [RECUERDO:] de Claude
  telegramChatIds: string[];  // legacy
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
4. Voz detectada → filtro de relevancia → `responderConClaude()` → Claude responde con etiqueta de emoción + texto
5. Texto va a ElevenLabs → audio guardado en cache (`tts_v2_` + hash) → se reproduce
6. Al terminar audio → SR se reinicia automáticamente
7. Botón manual: graba audio → Whisper transcribe → mismo flujo desde paso 4

**Watchdog**: cada 5 segundos verifica que SR esté activo. Si lleva >20s activo sin resultado, lo considera zombie y lo reinicia.

**Charla proactiva**: si pasan 120 min sin charla entre las 9h y 21h, Rosita inicia conversación.

**Bostezo**: si pasan 5 min de inactividad (estado `esperando`, de día, sin música), Rosita hace animación de bostezo. Se repite cada 10 min mínimo.

**Silbido**: si pasan 15 min sin charla (evaluado cada 15s en `useNotificaciones`), reproduce `silbido.mp3` en loop hasta 3 veces. Primera vez genera el audio vía ElevenLabs sound-generation y lo cachea permanentemente.

**SOS**: `onPressIn` inicia animación de 2 segundos; si se mantiene, envía alerta Telegram a todos los contactos configurados.

**Recarga de perfil**: al volver al tab principal (`useFocusEffect`), llama `recargarPerfil()` para tomar cambios de configuración sin reiniciar la app.

---

## Filtro de relevancia del SR

Antes de responder, verifica al menos una de estas condiciones:

1. **`mencionaNombre`** — el texto contiene las primeras 5 letras del nombre del asistente
2. **`enConversacion`** — la última charla fue hace menos de 10 minutos (no aplica si hay música)
3. **`esPreguntaDirecta`** — el texto empieza con palabras interrogativas o comandos (`qué`, `cómo`, `pone`, `dónde`, `podés`, etc.)

Si ninguna se cumple, ignora el texto y restaura el volumen de la música.

---

## Tags que Claude usa en sus respuestas

La respuesta siempre empieza con un tag de emoción:

| Tag | Expresión resultante |
|-----|----------------------|
| `[FELIZ]` | `feliz` |
| `[TRISTE]` | `triste` |
| `[SORPRENDIDA]` | `sorprendida` |
| `[PENSATIVA]` | `pensativa` |
| `[NEUTRAL]` | `neutral` |
| `[CUENTO]` | `feliz` |
| `[JUEGO]` | `pensativa` |
| `[CHISTE]` | `feliz` |
| `[ENOJADA]` | `triste` |
| `[AVERGONZADA]` | `neutral` |
| `[CANSADA]` | `pensativa` |
| `[MUSICA: clave]` | `feliz` + inicia radio |
| `[PARAR_MUSICA]` | `neutral` + para música |

Tags opcionales al **final** de la respuesta:
- `[RECUERDO: texto]` — guarda en `perfil.recuerdos[]`
- `[ANIMO_USUARIO: emocion]` — siempre presente, registra el estado de ánimo
- `[TIMER: segundos]` — activa un setTimeout que llama a `hablar()`
- `[RECORDATORIO: fechaISO | texto]` — guarda recordatorio futuro
- `[MENSAJE_FAMILIAR: nombre | texto]` — envía mensaje Telegram al familiar
- `[LLAMAR_FAMILIA: motivo]` — alerta de angustia emocional
- `[EMERGENCIA: síntoma]` — alerta urgente a todos los contactos

Claves de música válidas — géneros: `tango`, `bolero`, `folklore`, `romantica`, `clasica`, `jazz`, `pop` — radios: `cadena3`, `mitre`, `continental`, `rivadavia`, `nacional`, `lared`, `metro`

---

## Sistema de prompts y prompt caching

El system prompt se divide en **dos bloques** para maximizar el cache de Anthropic:

### Bloque 1 — Estable (`cache_control: ephemeral`)
Generado por `construirSystemPromptEstable(p)` en `claudeParser.ts`. Contiene personalidad, tono, reglas de respuesta y lista de tags (~600 tokens). Se regenera solo cuando cambia `nombreAsistente`, `edad` o `vozGenero`. Costo cache hit: ~$0.03/MTok vs $0.80/MTok normal.

### Bloque 2 — Dinámico (sin cache)
Generado por `construirContextoDinamico(p, climaTexto, incluirJuego, extra)`. Contiene fecha/hora actual, clima, perfil completo (incluyendo recuerdos) y noticias opcionales. Cambia en cada llamada sin invalidar el bloque 1.

`llamarClaude()` en `lib/ai.ts` acepta `system: string | SystemBlock[]`. El backend en `routes/ai.ts` ya maneja ambos formatos con `typeof system === 'string' ? [...] : system`.

---

## TTS y detección de fin de audio

`hablar()` en `useRosita.ts`:

1. `estadoRef.current = 'hablando'` inmediatamente (suprime el watchdog)
2. Busca en cache `tts_v2_` + hash djb2. Si no existe, llama a ElevenLabs via backend
3. `setEstado('hablando')` visual justo antes de `player.play()`
4. Poll cada 150ms para detectar fin:
   - `pos ≥ dur - 0.3` → fin por `near-end`
   - `pos === lastPos && pos < dur - 0.3` → audio stallado → `player.play()` para reanudar (problema de Android audio focus)
   - 15 polls sin movimiento → fin por `silence`
   - `duration-timer` (dur + 0.8s) como fallback
   - `safetyTimeout` de 45s como último recurso

**Importante**: `player.playing` es poco confiable en Android (oscila `false` durante reproducción por liberación del audio focus del SR). No usar como señal de fin.

---

## Música y duck

- Radio buscada via `radio-browser.info` — sin URLs hardcodeadas
- Al detectar voz con música activa: `duckMusica()` → `playerMusica.volume = 0.15`
- `unduckMusica()` restaura a 1.0 al terminar de hablar o si no hubo respuesta (timeout 8s)
- Con música activa, `enConversacion` siempre es `false` (requiere mencionar el nombre)

---

## Telegram

- **Polling**: cada 15 segundos en `useNotificaciones.ts`
- **Audios de familiares**: se anuncian y reproducen via `hablar()` + audio original
- **Mensajes de texto**: el bot responde automáticamente indicando que solo se procesan audios
- **Alertas salientes**: `enviarAlertaTelegram()` para SOS, EMERGENCIA, MENSAJE_FAMILIAR

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

## Convenciones técnicas

### Fetch con timeout

Todos los `fetch` a servicios externos (backend, APIs de terceros) usan `AbortController` con timeout para evitar que cuelguen indefinidamente:

```typescript
// Frontend (app/) — patrón inline:
const ctrl = new AbortController();
const id = setTimeout(() => ctrl.abort(), 10000);
const res = await fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));

// configuracion.tsx usa fetchTimeout() helper definido en el mismo archivo
// onboarding.tsx usa AbortController inline en finalizar()
```

```typescript
// Backend (AbuApp_Backend/src/routes/ai.ts) — helper reutilizable:
function fetchConTimeout(url, ms, options?): Promise<globalThis.Response>
// Timeouts: Claude 30s, ElevenLabs TTS/Sound 20s, Whisper 30s
// Nota: return type es globalThis.Response para no colisionar con Express Response
```

### Bostezo (useRosita.ts)

El intervalo de bostezo corre cada 60s pero tiene **dos guardas de tiempo**:
1. `ultimaActividadRef` — no bosteza si la última charla fue hace menos de 5 min
2. `ultimoBostezRef` — no repite si ya bostezó hace menos de 10 min (según spec)

### Animated.loop — siempre guardar referencia

```typescript
// MAL — memory leak
Animated.loop(Animated.timing(...)).start();

// BIEN
const loop = Animated.loop(Animated.timing(...));
loop.start();
return () => loop.stop();
```

### `guardarRecordatorio` (memoria.ts)

Todas las funciones de AsyncStorage tienen try/catch. `guardarRecordatorio` también lo tiene desde la revisión de 2026-03.

---

## Builds

```bash
eas build --platform android --profile preview
```

- Cuenta EAS: `compan-ia`
- `projectId`: `558b21d7-a424-4335-8adc-918f02cb582e`
- No hay SDK de Android instalado localmente
- Variables de entorno configuradas en el entorno `preview` de expo.dev
- Para probar sin buildear usar Expo Go (limitado — no funciona SR ni audio nativo)
- En la web, el Accelerometer está deshabilitado automáticamente con guard `Platform.OS === 'web'`
