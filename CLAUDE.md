# CompañIA — Contexto del proyecto

## Alcance de análisis

Este contexto describe el estado actual del workspace a partir del código real.

Regla importante: la carpeta `Archivos proyecto/` queda excluida de análisis, búsquedas, documentación y trabajo operativo. El proyecto útil hoy está en:

- `AbuApp/` — app móvil principal
- `AbuApp_Backend/` — backend Express/TypeScript
- `Landing2/` — landing web separada

---

## Qué es esto

CompañIA es una app móvil construida con React Native + Expo donde una asistente de voz llamada **Rosita** conversa, escucha, reproduce audio, guarda memoria conversacional, registra ánimo, maneja recordatorios, interactúa con Telegram y puede controlar domótica vía SmartThings.

La app principal corre en `AbuApp/`. El backend protege credenciales, centraliza IA/TTS y expone integraciones. `Landing2/` es una landing/promocional independiente del runtime de la app.

---

## Stack actual

- **Expo SDK 54** + **React 19** + **React Native 0.81**
- **expo-router** para navegación
- **Deepgram Nova-3** para reconocimiento de voz continuo (WebSocket directo con temporary API keys)
- **audio-capture** (módulo nativo local) para captura de audio PCM16 16kHz
- **expo-audio** para reproducción y streaming de audio
- **expo-speech-recognition** (solo para permisos, no se usa para SR)
- **AsyncStorage** para perfil, historial, recuerdos, listas, recordatorios y estado local
- **Anthropic Claude Haiku 4.5** vía backend con prompt caching activo (mínimo 4096 tokens)
- **Fish Audio** (TTS principal con streaming HTTP directo) para latencia mínima (~300-400ms first audio)
- **OpenAI text-embedding-ada-002** para embeddings de búsqueda semántica (backend)
- **OpenWeather** para clima y pronóstico
- **Telegram** para alertas, fotos y mensajes familiares
- **SmartThings OAuth** para dispositivos del hogar
- **Cloudinary** para almacenamiento de fotos de Telegram
- **Railway** para deploy del backend con volumen persistente para audio
- **EAS / Expo Updates** para builds y OTA
- **pgvector** para búsqueda semántica de memorias (PostgreSQL)

---

## Estructura real

```text
AbuApp/
  app/
    index.tsx            Pantalla principal de Rosita
    onboarding.tsx       Alta inicial + bootstrap + muestra de voces
    configuracion.tsx    Perfil, familia, voz, SmartThings y ajustes
    animo.tsx            Historial de ánimo
    guia.tsx             Guía de uso
    privacidad.tsx       Privacidad
    prueba.tsx           Pantalla de pruebas
  hooks/
    useRosita.ts         Orquestación principal
    useBrain.ts          Claude, memoria, búsquedas, parseo y acciones
    useAudioPipeline.ts  SR (Deepgram), TTS (Fish), grabación, colas y cache
    useDeepgramSR.ts     WebSocket directo a Deepgram Nova-3
    useNotificaciones.ts Recordatorios, Telegram, clima, cumpleaños, alarmas
    useSmartThings.ts    Integración de domótica
    useAccionesRosita.ts Acciones UI / interacción
    useCamaraPresencia.ts Detección de rostros con expo-face-detector
    useBLEBeacon.ts      Control por BLE beacon Holy-IOT (nRF52810)
    useClickSound.ts     Sonidos de UI
  lib/
    ai.ts                Cliente del backend, bootstrap por device token, búsquedas y TTS
    memoria.ts           Persistencia local y memoria episódica
    claudeParser.ts      Parseo, tags, helpers offline y tono
    systemPayload.ts     Payload estructurado del prompt enviado al backend
    clima.ts             OpenWeather + pronóstico de 3 días
    smartthings.ts       Cliente HTTP de domótica
    telegram.ts          Cliente HTTP de Telegram
    musica.ts            Radios / reproducción
    juegos.ts            Juegos, cuentos y chistes
    tateti.ts            Lógica del juego Ta-te-ti
    ahorcado.ts          Lógica del juego Ahorcado
    rositaSpeechForGames.ts Puente SR entre pantalla principal y juegos

AbuApp_Backend/
  src/index.ts           Servidor Express y middlewares
  src/routes/ai.ts       Claude, TTS, Whisper, búsqueda, visión, ánimo
  src/routes/familia.ts  Registro y vínculos familiares
  src/routes/telegram.ts Integración Telegram
  src/routes/smartthings.ts SmartThings
  src/db.ts              Acceso a base de datos
  src/lib/rositaPrompt.ts Armado del prompt real de Rosita en backend

Landing2/
  index.html / server.js / src/*  Landing web separada
```

---

## Arquitectura funcional

### AbuApp

- `useRosita` arma el sistema grande y conecta brain, audio, notificaciones, sensores y UI.
- `useAudioPipeline` maneja SR continuo con Deepgram Nova-3 (WebSocket directo, temporary API keys), watchdogs, TTS con Fish Audio streaming HTTP (~300-400ms first audio), cache disco y respuestas rápidas.
- `useDeepgramSR` gestiona la conexión WebSocket a Deepgram: obtiene temporary key del backend, envía audio PCM16 16kHz, maneja transcripciones parciales/finales, anti-eco (pausa AudioCapture durante TTS sin cerrar WS), y reconexión automática con backoff exponencial.
- `useBrain` decide si usar respuesta rápida, Claude streaming, búsquedas web/Wikipedia/lugares, memoria episódica, listas, alarmas o domótica.
- `useNotificaciones` procesa recordatorios, cumpleaños, clima adverso, polling de Telegram y respuestas a familiares.
- `useBLEBeacon` conecta con Holy-IOT beacon (nRF52810) vía GATT para control remoto de acciones (música, SOS, etc.).
- `useCamaraPresencia` detecta rostros con expo-face-detector para charla proactiva.
- `app/index.tsx`, `RosaOjos.tsx`, `RositaHorizontalLayout.tsx`, `ExpresionOverlay.tsx` y `FondoAnimado.tsx` concentran la experiencia visual actual, incluyendo layout tablet/horizontal y estados animados.

### Backend

- `POST /auth/bootstrap` emite `deviceToken` por instalación (64 chars hex).
- Todas las rutas privadas usan `x-device-token`; ya no se usa `x-api-key` desde la app.
- `/ai/chat` y `/ai/chat-stream` proxyean a Claude con prompt caching automático (≥4096 tokens).
- `/ai/tts` (Fish Audio REST), `/ai/tts-fish-realtime-stream` (Fish WebSocket streaming HTTP con concurrency limiter).
- `/ai/tts-stream` (ElevenLabs, legacy, no usado actualmente).
- `/ai/stream-ticket` genera tickets de un solo uso para endpoints de streaming (expo-audio no puede enviar headers).
- `/ai/deepgram-token` emite API keys temporales de Deepgram (60s TTL, scope `usage:write`) para SR directo desde app.
- Endpoints de búsqueda: web (Serper), Wikipedia, lugares (OpenStreetMap Overpass), noticias (Serper News), visión (Claude).
- `/ai/memorias-sync` sincroniza memorias episódicas con embeddings (OpenAI text-embedding-ada-002) para búsqueda semántica.
- `/ai/animo` sincroniza estado de ánimo en tiempo real.
- `/audio-ws` proxy WebSocket a Deepgram (alternativa, no usado actualmente).
- Los mensajes de Telegram se guardan por `familia_id`, no solo por `chat_id`, para evitar consumo cruzado.
- Watchdogs: informe diario (22:15 AR), heartbeat (cada 5 min), comandos/mensajes sin procesar (cada 5 min).
- `static/audio/` sirve audio pre-generado (respuestas rápidas, juegos) vía express.static.
- SmartThings OAuth con refresh automático de tokens (cifrados con AES-256-GCM).
- Rate limiting persistido en DB: global (200 req/min por IP), chat (1 req/s burst + 300 req/día por familia).
- Async jobs para búsquedas largas con deduplicación y límite de concurrencia.

---

## Variables de entorno relevantes

### AbuApp

- `EXPO_PUBLIC_BACKEND_URL`
- `EXPO_PUBLIC_OPENWEATHER_API_KEY`

### Backend

- `DATABASE_URL` (PostgreSQL con pgvector)
- `BACKEND_ENCRYPTION_KEY` (requerido para cifrar tokens SmartThings con AES-256-GCM)
- `ANTHROPIC_API_KEY` (Claude Haiku 4.5)
- `FISH_AUDIO_API_KEY` (TTS principal con streaming HTTP)
- `FISH_AUDIO_MODEL` (s2-pro o s1)
- `OPENAI_API_KEY` (embeddings text-embedding-ada-002 para búsqueda semántica)
- `SERPER_API_KEY` (búsquedas web y noticias vía Google Search)
- `OPENWEATHER_API_KEY` (clima)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `DEBUG_TELEGRAM_CHAT_ID` (para crash reports)
- `SMARTTHINGS_CLIENT_ID` y `SMARTTHINGS_CLIENT_SECRET` (OAuth)
- `SMARTTHINGS_REDIRECT_URI`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `DEEPGRAM_PROJECT_ID` y `DEEPGRAM_KEYGEN_API_KEY` (para emitir tokens temporales)
- `WEBHOOK_URL` (URL pública del backend)
- `PORT` y `NODE_ENV`
- `SMARTTHINGS_REDIRECT_URI`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `DEEPGRAM_PROJECT_ID` y `DEEPGRAM_KEYGEN_API_KEY` (para emitir tokens temporales)
- `WEBHOOK_URL` (URL pública del backend)
- `PORT` y `NODE_ENV`

Nota: Ya no se usan `EXPO_PUBLIC_APP_API_KEY`, `EXPO_PUBLIC_ELEVENLABS_API_KEY` ni WeatherAPI del lado de la app.

---

## Flujo principal de voz

1. La app carga perfil, clima, historial, listas y estado general.
2. Si no hay perfil suficiente, manda a onboarding.
3. **Deepgram Nova-3** queda escuchando en modo continuo vía WebSocket directo:
   - App solicita temporary API key al backend (`POST /ai/deepgram-token`, TTL 60s)
   - Conecta a `wss://api.deepgram.com/v1/listen` con subprotocolo `['token', key]`
   - AudioCapture nativo envía PCM16 16kHz directamente a Deepgram
4. El texto reconocido pasa por filtros de relevancia.
5. Si aplica una respuesta rápida (saludo, gracias, despedida), Rosita responde sin llamar a Claude.
6. Si no, `useBrain` puede lanzar búsquedas, contexto extra y Claude streaming.
7. La app arma un `system_payload` estructurado y el backend construye el prompt real de Rosita.
8. Backend responde con streaming SSE, detecta la primera frase completa y la envía con `primera_frase`.
9. `useAudioPipeline` reproduce la primera frase apenas llega (streaming HTTP Fish Audio, ~300-400ms first audio) y continúa con el resto en cola.
10. Durante TTS: `pausarCapturaDG()` detiene AudioCapture sin cerrar WebSocket (anti-eco), envía frames de silencio cada 5s (keepalive).
11. Al terminar TTS: delay 400ms → `reanudarCapturaDG()` reactiva AudioCapture.

---

## Estado actual de IA y memoria

- Claude usa un sistema de prompt cacheado con **prefijo estable por encima del floor de Haiku 4.5**.
- El prompt real ya **no vive completo en el cliente**:
  - la app envía un `system_payload`
  - el backend arma los bloques definitivos en `src/lib/rositaPrompt.ts`
- Claude usa bloques conceptuales:
  - bloque estable cacheado
  - bloque operativo/manual cacheado
  - bloque de perfil/dispositivos cacheado
  - bloque de memoria persistente cacheado
  - bloque temporal dinámico sin cache
- Hay **respuestas rápidas** para saludos, gracias, despedidas y afirmaciones (sin llamar a Claude).
- Se guarda **memoria episódica** resumida para reutilizar en conversaciones futuras.
- Se sincroniza el **ánimo** al backend en tiempo real.
- Soporta lectura de imágenes vía backend.
- El parser de Claude ya tolera texto antes del tag principal sin truncar la frase hablada.

---

## Integraciones actuales

- **Telegram**: 
  - Alertas SOS con ubicación
  - Mensajes de voz (descarga, transcripción y respuesta)
  - Fotos (descripción con Claude Vision + Cloudinary)
  - Mensajes de texto
  - Comandos: /informe, /camara, /recordatorios, /desvincular, /ayuda
  - Polling cada 30s desde la app
  - Webhook para recepción inmediata
  - Proxy firmado para archivos (no expone BOT_TOKEN)
  
- **SmartThings**: 
  - OAuth 2.0 con refresh automático de tokens
  - PAT legacy (deprecado pero funcional)
  - Listar dispositivos
  - Consultar estado
  - Control por voz (on/off, nivel)
  - Tokens cifrados con AES-256-GCM en DB
  
- **Clima**: 
  - OpenWeather con clima actual + pronóstico de 3 días
  - Alertas de clima adverso (tormenta, calor/frío extremo)
  - Integración visual con efectos animados
  
- **Búsquedas**:
  - Lugares físicos cercanos (OpenStreetMap Overpass API)
  - Web general (Google vía Serper)
  - Wikipedia español
  - Noticias del día (Serper News con filtro de contenido violento)
  - Visión (Claude para leer texto o describir imágenes)

---

## Correcciones recientes importantes

- Se volvió a **Anthropic** como proveedor principal y se descartó Gemini para producción actual.
- El cache de Claude Haiku quedó funcional con detección automática de umbral (≥4096 tokens) y ya se observó `cache_write` en primer turno y `cache_read` en siguientes.
- **Fish Audio WebSocket streaming** implementado con concurrency limiter (1 stream activo) y fallback automático a REST en caso de 429 o timeout.
- **Stream tickets** para endpoints de audio (expo-audio no puede enviar headers custom).
- **Deepgram WebSocket** directo desde app con tokens temporales (60s TTL) emitidos por backend.
- La app recibió una tanda grande de hardening:
  - timers y loops con cleanup
  - menos carreras en audio/SR/notificaciones/BLE
  - filtros mejores para eco/barge-in
  - menor latencia percibida en TTS (~300-500ms con Fish streaming)
- `useBrain`, `useNotificaciones`, `useSmartThings`, `useAccionesRosita` y `useBLEBeacon` tuvieron una pasada de robustez completa.
- Se ajustó fuerte la UI horizontal/tablet:
  - tamaño/posición de ojos y boca
  - zipper en modo no molestar
  - sol en clima horizontal
  - tamaño y posición de las `ZZZ`
  - layout adaptativo para tablets vs teléfonos
- Backend endurecido en:
  - validación de payloads de `/ai/chat` con límites estrictos
  - logging de chunks malformados en stream Claude
  - aborto de streams TTS cuando el cliente corta
  - timeout de requests SmartThings
  - rate limiting persistido en DB (sobrevive reinicios)
  - cifrado AES-256-GCM de PAT/tokens sensibles en DB
  - cache corta (5 min) en búsquedas externas repetidas
  - watchdogs para informe diario, heartbeat y comandos sin procesar
  - SmartThings OAuth con refresh automático
  - Telegram: descripción de fotos con Claude Vision + Cloudinary
  - Memoria episódica con embeddings (OpenAI) + pgvector para búsqueda semántica
  - Async jobs con deduplicación y límite de concurrencia

---

## Comportamientos importantes

- `useAudioPipeline` limpia cache TTS viejo y pre-cachea frases frecuentes (respuestas rápidas, juegos).
- Hay watchdogs para reiniciar Speech Recognition si queda colgado.
- Existe modo `noMolestar` con zipper visual sobre la boca.
- Hay charla proactiva por momento del día.
- Hay silbidos locales de inactividad.
- Hay flujo de cámara para sacar o leer fotos (con Claude Vision).
- `useNotificaciones` maneja alarmas, recordatorios, cumpleaños, clima adverso y eventos Telegram.
- Polling de Telegram cada 30s para mensajes de voz, foto y texto.
- Heartbeat cada 10 min si monitoreo activo (para watchdog de disponibilidad).
- Memoria episódica se sincroniza al backend y se busca semánticamente cuando es relevante.
- Ánimo se sincroniza en tiempo real al backend.
- Primera frase de Claude se reproduce apenas está lista (streaming), el resto continúa en background.
- Respuestas rápidas locales para saludos, gracias, despedidas (sin llamar a IA).
- BLE Beacon para control remoto (acciones táctiles simuladas).
- Modo noche automático según hora (párpados cerrados, reloj visible).
- Layout horizontal optimizado para tablets con modo reloj de escritorio.

---

## Estado visual actual

- El layout horizontal fue ajustado para priorizar ojos grandes pero dejando entrar boca y zipper.
- Tablet horizontal y teléfono horizontal ya tienen offsets distintos.
- Las animaciones visuales principales tienen cleanup para evitar loops huérfanos.
- `Landing2` usa como link de descarga Android actual la última build interna publicada en Expo.

---

## Proyectos hermanos

### AbuApp_Backend

Backend Node/Express en TypeScript con bootstrap por dispositivo, proxy a Claude, TTS, búsquedas, Telegram y SmartThings.

### Landing2

Landing separada del runtime principal. No forma parte del flujo de Rosita, pero sí del mismo workspace.

Link operativo de descarga Android que hoy usa la landing:

- `https://expo.dev/artifacts/eas/76UDQERcTmESph1BCe6iVV.apk`

---

## Notas para futuras tareas

- Tomar `useRosita`, `useBrain` y `useAudioPipeline` como fuente de verdad funcional.
- Si hay conflicto entre docs viejas y código, confiar en el código.
- Mantener siempre excluida `Archivos proyecto/`.
- Si se vuelve a experimentar con otro LLM, hacerlo fuera de producción y sin romper el esquema de cache actual.
- Si se toca la landing, actualizar la constante del APK en `Landing2/src/App.tsx`.
