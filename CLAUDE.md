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
- **expo-speech-recognition** para escucha continua
- **expo-audio** para reproducción, streaming y grabación
- **AsyncStorage** para perfil, historial, recuerdos, listas, recordatorios y estado local
- **Anthropic Claude Haiku 4.5** vía backend
- **Whisper** vía backend para transcripción manual
- **Cartesia / TTS backend** para voz cacheada y streaming de baja latencia
- **OpenWeather** para clima y pronóstico
- **Telegram** para alertas, fotos y mensajes familiares
- **SmartThings** para dispositivos del hogar
- **Railway** para deploy del backend
- **EAS / Expo Updates** para builds y OTA

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
    useAudioPipeline.ts  SR, TTS, grabación, colas y cache
    useNotificaciones.ts Recordatorios, Telegram, clima, cumpleaños, alarmas
    useSmartThings.ts    Integración de domótica
    useAccionesRosita.ts Acciones UI / interacción
    useBLEBeacon.ts      Lógica BLE
  lib/
    ai.ts                Cliente del backend, bootstrap por device token, búsquedas y TTS
    memoria.ts           Persistencia local y memoria episódica
    claudeParser.ts      Prompting, tags, parseo y helpers de tono
    clima.ts             OpenWeather + pronóstico de 3 días
    smartthings.ts       Cliente HTTP de domótica
    telegram.ts          Cliente HTTP de Telegram
    musica.ts            Radios / reproducción
    juegos.ts            Juegos, cuentos y chistes

AbuApp_Backend/
  src/index.ts           Servidor Express y middlewares
  src/routes/ai.ts       Claude, TTS, Whisper, búsqueda, visión, ánimo
  src/routes/familia.ts  Registro y vínculos familiares
  src/routes/telegram.ts Integración Telegram
  src/routes/smartthings.ts SmartThings
  src/db.ts              Acceso a base de datos

Landing2/
  index.html / server.js / src/*  Landing web separada
```

---

## Arquitectura funcional

### AbuApp

- `useRosita` arma el sistema grande y conecta brain, audio, notificaciones, sensores y UI.
- `useAudioPipeline` maneja SR continuo, watchdogs, TTS con cache disco, streaming, muletillas y respuestas rápidas.
- `useBrain` decide si usar respuesta rápida, muletilla, Claude streaming, búsquedas web/Wikipedia/lugares, memoria episódica, listas, alarmas o domótica.
- `useNotificaciones` procesa recordatorios, cumpleaños, clima adverso, polling de Telegram y respuestas a familiares.

### Backend

- `POST /auth/bootstrap` emite `deviceToken` por instalación.
- Todas las rutas privadas usan `x-device-token`; ya no se usa `x-api-key` desde la app.
- `/ai/chat` y `/ai/chat-stream` proxyean a Claude con prompt caching.
- `/ai/tts`, `/ai/tts-stream`, `/ai/tts-cartesia-stream` resuelven voz.
- También hay endpoints de búsqueda web, Wikipedia, lugares, visión, sincronización de ánimo y debug.

---

## Variables de entorno relevantes

### AbuApp

- `EXPO_PUBLIC_BACKEND_URL`
- `EXPO_PUBLIC_OPENWEATHER_API_KEY`

### Backend

- `ANTHROPIC_API_KEY`
- `CARTESIA_API_KEY`
- `FISH_AUDIO_API_KEY` (fallback TTS)
- credenciales de Telegram
- credenciales de DB / Railway

Nota: documentación vieja todavía menciona `EXPO_PUBLIC_APP_API_KEY`, `EXPO_PUBLIC_ELEVENLABS_API_KEY` y WeatherAPI, pero el código actual ya no depende de eso del lado de la app.

---

## Flujo principal de voz

1. La app carga perfil, clima, historial, listas y estado general.
2. Si no hay perfil suficiente, manda a onboarding.
3. `expo-speech-recognition` queda escuchando en modo continuo.
4. El texto reconocido pasa por filtros de relevancia.
5. Si aplica una respuesta rápida, Rosita responde sin llamar a Claude.
6. Si no, `useBrain` puede lanzar muletilla, búsquedas, contexto extra y Claude streaming.
7. `useAudioPipeline` reproduce la primera frase apenas está lista y continúa con el resto.
8. Al terminar, vuelve a arrancar Speech Recognition.

---

## Estado actual de IA y memoria

- Claude usa un sistema de **4 bloques**:
  - bloque estable cacheado
  - bloque de perfil/dispositivos cacheado
  - bloque de memoria persistente cacheado
  - bloque temporal dinámico sin cache
- Hay **respuestas rápidas** para saludos, gracias, despedidas y afirmaciones.
- Hay **muletillas** para cubrir latencia antes de que llegue Claude.
- Se guarda **memoria episódica** resumida para reutilizar en conversaciones futuras.
- Se sincroniza el **ánimo** al backend en tiempo real.
- Soporta lectura de imágenes vía backend.

---

## Integraciones actuales

- **Telegram**: alertas SOS, mensajes, fotos, voz entrante y texto.
- **SmartThings**: vincular PAT, listar dispositivos, consultar estado y controlar.
- **Clima**: OpenWeather con clima actual + pronóstico.
- **Búsquedas**:
  - lugares físicos cercanos
  - web general
  - Wikipedia
  - noticias por RSS en algunos casos

---

## Comportamientos importantes

- `useAudioPipeline` limpia cache TTS viejo y pre-cachea frases frecuentes.
- Hay watchdogs para reiniciar Speech Recognition si queda colgado.
- Existe modo `noMolestar`.
- Hay charla proactiva por momento del día.
- Hay silbidos locales de inactividad.
- Hay flujo de cámara para sacar o leer fotos.
- `useNotificaciones` maneja alarmas, recordatorios, cumpleaños y eventos Telegram.

---

## Proyectos hermanos

### AbuApp_Backend

Backend Node/Express en TypeScript con rate limiting, bootstrap por dispositivo, proxy a Claude y servicios auxiliares.

### Landing2

Landing separada del runtime principal. No forma parte del flujo de Rosita, pero sí del mismo workspace.

---

## Notas para futuras tareas

- Tomar `useRosita`, `useBrain` y `useAudioPipeline` como fuente de verdad funcional.
- Si hay conflicto entre docs viejas y código, confiar en el código.
- Mantener siempre excluida `Archivos proyecto/`.
