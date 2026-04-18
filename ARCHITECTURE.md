# Arquitectura de CompañIA App

## 📐 Visión General

CompañIA sigue una arquitectura basada en **hooks personalizados** que encapsulan lógica de negocio compleja, con un flujo de datos unidireccional y separación clara de responsabilidades.

## 🏛 Capas de la Aplicación

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer (app/)                       │
│  - Pantallas con expo-router                            │
│  - Componentes visuales (components/)                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Business Logic Layer (hooks/)               │
│  - useRosita: Orquestación principal                    │
│  - useBrain: IA y toma de decisiones                    │
│  - useAudioPipeline: Audio y SR                         │
│  - useNotificaciones: Alertas y recordatorios           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Service Layer (lib/)                        │
│  - ai.ts: Cliente HTTP del backend                      │
│  - memoria.ts: Persistencia AsyncStorage                │
│  - clima.ts: Cliente OpenWeather                        │
│  - telegram.ts: Cliente Telegram                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              External Services                           │
│  - Backend (Railway)                                     │
│  - OpenWeather API                                       │
│  - AsyncStorage                                          │
└─────────────────────────────────────────────────────────┘
```

## 🎯 Hook Principal: useRosita

`useRosita` es el **orquestador central** que:

1. Inicializa todos los subsistemas
2. Gestiona el estado global de la app
3. Coordina hooks especializados
4. Expone API unificada a las pantallas

### Responsabilidades

```typescript
useRosita() {
  // Estado visual
  const [estado, setEstado] = useState<'esperando' | 'pensando' | 'hablando'>()
  const [expresion, setExpresion] = useState<Expresion>()
  
  // Modos de operación
  const [modoNoche, setModoNoche] = useState<'despierta' | 'durmiendo'>()
  const [noMolestar, setNoMolestar] = useState(false)
  const [musicaActiva, setMusicaActiva] = useState(false)
  
  // Subsistemas
  const brain = useBrain(...)
  const audio = useAudioPipeline(...)
  const notif = useNotificaciones(...)
  
  // Acciones
  return {
    estado, expresion, modoNoche,
    onCaricia, onOjoPicado, onRelampago,
    iniciarFlujoFoto, pararMusica, dispararSOS,
    refs: { /* refs compartidos */ }
  }
}
```

## 🧠 useBrain: Inteligencia y Decisiones

Responsable de:
- Decidir si usar respuesta rápida o llamar a Claude
- Gestionar memoria episódica
- Ejecutar búsquedas externas (web, Wikipedia, lugares)
- Parsear respuestas de IA
- Ejecutar acciones (listas, alarmas, domótica)

### Flujo de Decisión

```
Usuario habla
    ↓
¿Es saludo/gracias/despedida?
    ↓ Sí
Respuesta rápida local
    ↓ No
¿Necesita búsqueda externa?
    ↓ Sí
Ejecutar búsqueda → Agregar a contexto
    ↓
¿Necesita memoria episódica?
    ↓ Sí
Buscar memorias relevantes → Agregar a contexto
    ↓
Armar system_payload con:
  - Perfil del usuario
  - Clima actual
  - Dispositivos SmartThings
  - Memoria persistente
  - Contexto temporal
    ↓
Enviar a backend → Claude streaming
    ↓
Parsear respuesta:
  - Extraer tag [EMOCION]
  - Extraer acciones <accion>...</accion>
  - Extraer texto a hablar
    ↓
Ejecutar acciones detectadas
    ↓
Devolver texto para TTS
```

### Respuestas Rápidas

Patrones que no requieren IA:

```typescript
const RESPUESTAS_RAPIDAS = {
  saludo: /^(hola|buenos días|buenas tardes|buenas noches)/i,
  gracias: /^(gracias|muchas gracias|te agradezco)/i,
  despedida: /^(chau|adiós|hasta luego|nos vemos)/i,
  afirmacion: /^(sí|si|ok|dale|bueno|está bien)/i,
}
```

### Memoria Episódica

Sistema de memoria de largo plazo:

```typescript
interface MemoriaEpisodica {
  id: string
  resumen: string           // Resumen de la conversación
  keywords: string[]        // Palabras clave para búsqueda
  categoria?: string        // Categoría (familia, salud, etc.)
  createdAt: number
  updatedAt: number
  lastAskedAt: number       // Última vez que se mencionó
  mentions: number          // Veces que se ha mencionado
}
```

**Búsqueda semántica**: El backend usa embeddings (OpenAI) + pgvector para encontrar memorias relevantes por similitud semántica.

## 🔊 useAudioPipeline: Audio y Reconocimiento de Voz

Gestiona todo el ciclo de audio: Speech Recognition (Deepgram Nova-3), TTS (Fish Audio streaming), muletillas, y protección anti-eco.

### Speech Recognition (SR) — Deepgram Nova-3

**Módulo nativo:** `audio-capture` (ubicado en `AbuApp/modules/audio-capture/`)
- Implementación Kotlin para Android (AudioRecord con MediaRecorder.AudioSource.MIC)
- Captura PCM16 16kHz mono en chunks configurables
- Emite eventos `onAudioData` con audio en base64
- No requiere permisos adicionales (expo-speech-recognition solo para permisos)

**Arquitectura:**
```
App (audio-capture nativo) → WebSocket directo → Deepgram Nova-3
                              ↓
                           Temporary API key (60s TTL)
                              ↓
                           Backend (/ai/deepgram-token)
```

**Flujo de conexión (`useDeepgramSR`):**
1. `iniciarDG()` solicita temporary key al backend
2. Backend genera key con `POST /v1/projects/{id}/keys` (scope: `usage:write`, TTL: 60s)
3. App abre WebSocket a `wss://api.deepgram.com/v1/listen` con subprotocolo `['token', key]`
4. Al conectar → arranca AudioCapture nativo (PCM16 16kHz mono)
5. Cada chunk de audio (100ms) → `ws.send(binaryPCM)`

**Manejo de transcripciones:**
```typescript
// Partials (especulativos)
is_final=false → onPartial(texto)
  → Activa waveform visual
  → Actualiza ultimaActivacionSrRef (evita watchdog durante voz)

// Finals (frases completas)
is_final=true, speech_final=true → onFinal(texto)
  → Marca speechEndTsRef (para lag_speech_end_ms)
  → Procesa texto reconocido

// Debounce y merge
- Debounce 300ms para frases sin speech_final
- Merge window 1500ms para frases incompletas (terminan en artículo/preposición)
```

**Anti-eco durante TTS:**
```typescript
// Pausa AudioCapture SIN cerrar WebSocket
pausarCapturaDG()
  → stopCapture()
  → Envía frames de silencio cada 5s (keepalive, evita timeout 1011)

// Reanuda AudioCapture al terminar TTS
reanudarCapturaDG()
  → startCapture() si WS abierto
  → O reconecta si WS cayó
```

**Watchdog y reconexión:**
- Watchdog cada 3s verifica si SR está activo
- SR zombie (>8s sin actividad) → reinicio
- SR vencido (>15s) → reinicio forzado
- Reconexión automática con backoff exponencial (1.5^n, max 10s)
- Recupera `procesandoRef` colgado (>20s sin hablar)

### Text-to-Speech (TTS) — Fish Audio Streaming

**Arquitectura:**
```
App → Backend (/ai/tts-fish-realtime-stream)
       ↓
    Fish Audio WebSocket → HTTP chunks
       ↓
    ExoPlayer (expo-audio) → reproducción progresiva
```

**Pipeline TTS (`hablar()`):**
```typescript
1. Limpieza de texto (limpiarTextoParaTTS)
   - Números: 70000 → "setenta mil"
   - Monedas: $70.000 → "setenta mil pesos"
   - Unidades: 25°C → "veinticinco grados"
   - Markup: **bold**, (pausa) → eliminado

2. Cache lookup
   tts_v6_{hash}.mp3 en FileSystem.cacheDirectory
   ↓ Hit → reproducción inmediata
   ↓ Miss → streaming HTTP

3. Streaming HTTP (path principal)
   - Backend abre WebSocket a Fish Audio
   - Recibe chunks y los reenvía vía HTTP chunked
   - ExoPlayer empieza en ~300-400ms (primeros chunks)
   - Cache en background (in-flight map evita double call)
   - Fallback a REST si streaming falla

4. Anti-eco
   pausarCapturaDG() durante reproducción
   → Detiene AudioCapture sin cerrar WS
   → Envía frames de silencio cada 5s

5. Fin de reproducción
   - Polling cada 150ms de duration y currentTime
   - Detección: pos >= dur - 0.15 o silence-polls (15 iteraciones)
   - Delay 400ms antes de reanudar SR (libera hardware)
```

**Cola de oraciones (`hablarConCola()`):**
```typescript
splitEnOraciones(texto) // regex [.!?]+
  → ["Primera frase.", "Segunda frase.", ...]
  → Reproduce secuencialmente con pausa 250ms
  → Permite barge-in: corta si hablarCancelledRef = true
```

**Pre-cache:**
- **Respuestas rápidas**: frases sin `{n}` se descargan desde backend
  - Saludos, gracias, despedidas, afirmaciones
  - Cache: `tts_v6_{hash}.mp3`
- **Frases de sistema**: pre-cache al iniciar (juegos, cuentos)
- Limpieza automática: archivos >7 días se eliminan

**Concurrency limiter (backend):**
- Fish Audio devuelve 429 con múltiples WebSockets simultáneos
- Limiter garantiza 1 stream activo a la vez
- Timeout de 3s → fallback a REST si hay cola

### Respuestas Rápidas

Respuestas locales sin llamar a Claude para interacciones comunes:

```typescript
const RESPUESTAS_RAPIDAS = {
  saludo: { femenina: ["¡Hola {n}!", "¿Cómo estás {n}?"], emotion: "feliz" },
  gracias: { femenina: ["De nada {n}", "Para eso estoy"], emotion: "feliz" },
  despedida: { femenina: ["Chau {n}, hablamos después", "Hasta luego"], emotion: "neutral" },
  // ...
}
```

**Nota:** Las muletillas (frases para cubrir latencia) están actualmente desactivadas (`MULETILLAS_HABILITADAS = false` en `useBrain.ts`). El sistema responde directamente con la primera frase de Claude vía streaming SSE.

## 📬 useNotificaciones: Alertas y Recordatorios

Gestiona:
- **Recordatorios por voz**: Alarmas configuradas por el usuario
- **Cumpleaños**: Detecta y celebra cumpleaños de familiares
- **Clima adverso**: Alerta si hay tormenta, calor extremo, etc.
- **Mensajes de Telegram**: Polling cada 30s para nuevos mensajes
- **Informe diario**: Envío automático a las 22:00

### Polling de Telegram

```typescript
setInterval(async () => {
  const mensajes = await telegram.obtenerMensajes()
  
  for (const msg of mensajes) {
    if (msg.tipo === 'voz') {
      // Descargar y transcribir
      const texto = await transcribirVoz(msg.fileId)
      // Rosita responde
      await responderMensaje(msg.chatId, texto)
    }
    else if (msg.tipo === 'foto') {
      // Mostrar foto en pantalla
      mostrarFoto(msg.url, msg.descripcion)
    }
    else if (msg.tipo === 'texto') {
      // Rosita lee el mensaje
      await leerMensaje(msg.texto, msg.fromName)
    }
  }
}, 30000)
```

## 🏠 useSmartThings: Domótica

Integración con SmartThings:

### Vinculación

1. Usuario proporciona PAT (Personal Access Token)
2. Se guarda cifrado en backend
3. Se listan dispositivos disponibles
4. Se sincronizan con AsyncStorage local

### Control por Voz

```typescript
// Usuario: "Encendé la luz del living"
// Claude detecta: <accion tipo="smartthings" dispositivo="luz_living" comando="on" />

await smartthings.controlarDispositivo({
  dispositivoId: 'luz_living',
  comando: 'on'
})
```

## 🎨 Componentes Visuales

### RosaOjos

Cara animada de Rosita con:
- **Ojos**: Parpadeo, seguimiento, expresiones
- **Boca**: Sincronización con audio, zipper en modo no molestar
- **Párpados**: Cerrados en modo noche
- **Cabeza de gato**: Opcional, con orejas animadas

Estados visuales:
- `esperando`: Ojos abiertos, boca cerrada
- `pensando`: Ojos mirando hacia arriba
- `hablando`: Boca animada sincronizada con audio

### ExpresionOverlay

Efectos visuales sobre la cara:
- **Cejas**: Expresiones emocionales
- **Gotas de sudor**: Calor
- **Copos de nieve**: Frío
- **Rayos**: Tormenta
- **Globos**: Cumpleaños

### FondoAnimado

Animaciones de fondo según contexto:
- **Cielo nocturno**: Estrellas parpadeantes
- **ZZZ**: Cuando duerme
- **Música**: Notas musicales flotantes
- **Clima**: Lluvia, nieve, sol

## 🎨 Componentes Visuales

### Componentes Principales

#### RosaOjos
Cara animada de Rosita con:
- **Ojos**: Parpadeo, seguimiento, expresiones
- **Boca**: Sincronización con audio, zipper en modo no molestar
- **Párpados**: Cerrados en modo noche
- **Cabeza de gato**: Opcional, con orejas animadas

Estados visuales:
- `esperando`: Ojos abiertos, boca cerrada
- `pensando`: Ojos mirando hacia arriba
- `hablando`: Boca animada sincronizada con audio

#### RositaHorizontalLayout
Layout optimizado para tablets y modo horizontal:
- Ojos grandes centrados
- Controles táctiles en los laterales
- Modo reloj de escritorio
- Adaptación automática según orientación

#### ExpresionOverlay
Efectos visuales sobre la cara:
- **Cejas**: Expresiones emocionales
- **Gotas de sudor**: Calor
- **Copos de nieve**: Frío
- **Rayos**: Tormenta
- **Globos**: Cumpleaños

#### FondoAnimado
Animaciones de fondo según contexto:
- **Cielo nocturno**: Estrellas parpadeantes
- **ZZZ**: Cuando duerme
- **Música**: Notas musicales flotantes
- **Clima**: Lluvia, nieve, sol

### Componentes de Funcionalidad

#### AmplificadorBoton
Botón para activar/desactivar amplificador de audio:
- Pulso animado cuando activo
- Selector de nivel de ganancia (bajo, medio, alto)
- Advertencia cuando usa Bluetooth
- Feature de accesibilidad para mejorar audición

#### CamaraPresenciaOverlay
Detección de presencia por movimiento (frame diff):
- Compara fotogramas consecutivos (cada 2.5s)
- Detecta movimiento sin requerir mirar a cámara
- Calidad mínima (0.05) para performance
- Umbrales: 18% tamaño JPEG, 6% diff bytes
- Dispara charla proactiva cuando detecta presencia

#### ListasModal
Modal para gestión de listas (compras, tareas):
- Agregar/eliminar items
- Marcar como completado
- Sincronización con backend

#### MenuFlotante
Menú contextual flotante:
- Acciones rápidas
- Configuración
- Navegación

#### PinOverlay
Overlay para ingreso de PIN:
- Protección de configuración sensible
- Teclado numérico

#### ScreenHeader
Header reutilizable para pantallas:
- Título y eyebrow
- Ícono
- Botón de retroceso
- Estilo consistente

### Componentes de Cámara

#### CameraAutoCaptura
Captura automática de fotos:
- Temporizador configurable
- Preview en tiempo real
- Calidad ajustable

#### CamaraPresenciaVisionOverlay
Detección de presencia con Claude Vision:
- Captura periódica
- Análisis con IA
- Descripción de escena

### Componentes de Efectos

#### EfectosClima
Efectos visuales según clima:
- Lluvia animada
- Nieve cayendo
- Sol brillante
- Nubes moviéndose

#### EfectosExpresion
Efectos adicionales de expresión:
- Corazones flotantes
- Estrellas
- Signos de interrogación
- Exclamaciones

### Componentes de Visualización

#### DisplayCuero
Display de información en estilo "cuero":
- Textura visual
- Información destacada

#### PanelCuero
Panel con estilo "cuero":
- Contenedor visual
- Bordes decorativos

#### PostItViewer
Visor de notas estilo post-it:
- Notas adhesivas virtuales
- Colores variados
- Animaciones de entrada/salida

#### AnimatedSplash
Splash screen animado:
- Logo animado
- Transición suave
- Carga inicial

## 🔄 Flujo de Datos

### Estado Global

```typescript
// useRosita mantiene estado compartido
const estadoGlobal = {
  // Visual
  estado: 'esperando' | 'pensando' | 'hablando',
  expresion: Expresion,
  
  // Operacional
  modoNoche: 'despierta' | 'durmiendo',
  noMolestar: boolean,
  musicaActiva: boolean,
  
  // Contexto
  climaObj: ClimaDatos,
  perfil: Perfil,
  listas: Lista[],
  recordatorios: Recordatorio[],
}
```

### Comunicación entre Hooks

Los hooks se comunican mediante:
1. **Props**: Parámetros directos
2. **Refs**: Referencias mutables compartidas
3. **Callbacks**: Funciones pasadas como props
4. **Estado compartido**: Via useRosita

```typescript
// useRosita expone refs compartidos
const refs = {
  perfilRef,
  musicaActivaRef,
  iniciarSpeechRecognition,
  pararSRIntencional,
  reanudarSR,
  suspenderSR,
  // ...
}

// Otros hooks reciben estos refs
useBrain({ ...refs })
useAudioPipeline({ ...refs })
useNotificaciones({ ...refs })
```

## 🔐 Seguridad

### Device Token

```typescript
// 1. Generar installId único
const installId = await getInstallId()

// 2. Bootstrap con backend
const { deviceToken } = await fetch('/auth/bootstrap', {
  body: JSON.stringify({ installId })
})

// 3. Guardar token localmente
await AsyncStorage.setItem('deviceToken', deviceToken)

// 4. Usar en todas las peticiones
fetch('/ai/chat', {
  headers: {
    'x-device-token': deviceToken
  }
})
```

### Datos Sensibles

- **API Keys**: Solo en backend, nunca en cliente
- **Tokens SmartThings**: Cifrados en backend con AES-256-GCM
- **Mensajes**: Eliminados después de 24h
- **Audio**: Cache local, no se sube al backend

## 📊 Performance

### Optimizaciones

1. **Cache TTS**: Reduce latencia en respuestas frecuentes
2. **Respuestas rápidas**: Evita llamadas a IA innecesarias
3. **Muletillas**: Feedback inmediato mientras IA piensa
4. **Streaming**: Primera frase se reproduce antes de terminar generación completa
5. **Memoria episódica**: Solo se busca cuando es relevante
6. **Búsquedas externas**: Solo cuando Claude lo solicita explícitamente

### Métricas Clave

- **Time to First Token (TTFT)**: ~800-1200ms
- **Time to First Audio**: ~1500-2000ms (incluye TTS)
- **SR Latency**: ~200-500ms (reconocimiento local)
- **Cache Hit Rate**: ~60-70% en respuestas frecuentes

## 🧪 Testing

### Estrategia

1. **Unit tests**: Funciones puras en `lib/`
2. **Integration tests**: Hooks con mocks
3. **E2E tests**: Flujos completos con Detox
4. **Manual testing**: Casos de uso reales

### Debugging

```typescript
// Logs estructurados
console.log('[useBrain] Respuesta rápida:', { tipo, texto })
console.log('[useAudioPipeline] TTS cache hit:', { frase, cached: true })
console.log('[useNotificaciones] Recordatorio disparado:', { id, texto })

// Envío a backend para análisis
await fetch('/debug/log', {
  body: JSON.stringify({
    event: 'sr_error',
    data: { error: e.message, timestamp: Date.now() }
  })
})
```

## 🎮 Sistema de Juegos

### Gestión de Speech Recognition en Juegos

**Problema:** Las pantallas de juego (tateti, ahorcado, memoria) necesitan su propio SR, pero el SR principal de Rosita sigue escuchando y dispara `useBrain` con cualquier frase.

**Solución:** `rositaSpeechForGames.ts` (puente entre SR principal y juegos)

```typescript
// Al montar pantalla de juego
pausarSRPrincipalParaJuego()  // Suspende SR de Rosita

// Al desmontar pantalla de juego
reanudarSRPrincipalTrasJuego()  // Reactiva SR de Rosita
```

### Juego de Memoria

**Lógica:** `lib/memoria_juego.ts`

- 4 conjuntos visuales (formas, animales, frutas, objetos)
- 3 niveles: 4, 6 o 9 fichas
- Grid 3×3 con posiciones aleatorias
- Orden de pregunta aleatorio

```typescript
const state = crearJuego(setIndex, numTiles)
const target = getCurrentTarget(state)  // Ficha a buscar
const tile = getTileAtGridPos(state, pos)  // Ficha en posición
```

## 🔄 Sistema de Eventos Internos

### Sincronización de Perfil

**Módulo:** `lib/perfilSync.ts`

Cuando el usuario guarda cambios en Configuración, otras pantallas necesitan actualizar su estado:

```typescript
// En configuracion.tsx (al guardar)
emitPerfilLocalGuardado()

// En useRosita (escucha cambios)
DeviceEventEmitter.addListener(PERFIL_LOCAL_GUARDADO, () => {
  // Recargar perfil, actualizar heartbeat, etc.
})
```

## 📦 Estructura del System Payload

**Módulo:** `lib/systemPayload.ts`

El `system_payload` es el objeto estructurado que la app envía al backend para construir el prompt de Claude:

```typescript
type RositaSystemPayload = {
  version: 'v1'
  perfil: {
    nombreAbuela: string
    nombreAsistente?: string
    vozGenero: 'femenina' | 'masculina'
    generoUsuario?: 'femenino' | 'masculino'
    edad?: number
    familiares: string[]
    gustos: string[]
    medicamentos: string[]
    fechasImportantes: string[]
    recuerdos: string[]
    fechaNacimiento?: string
    condicionFisica?: string
  }
  dispositivos: Array<{
    id: string
    nombre: string
    tipo: string
    online: boolean
    estado?: boolean
  }>
  climaTexto: string
  extraTemporal?: string
  ciudad?: string | null
  coords?: { lat: number; lon: number } | null
  memoriaEpisodica?: string
  seguimientos?: string
}
```

**Construcción:**
```typescript
const payload = buildRositaSystemPayload({
  perfil,
  dispositivos,
  climaTexto,
  extraTemporal,
  ciudad,
  coords,
  memoriaEpisodica,
  seguimientos
})
```

El backend recibe este payload y construye el prompt real en `src/lib/rositaPrompt.ts`.

## 🔮 Futuras Mejoras

1. **Offline mode**: Respuestas básicas sin conexión
2. **Multi-idioma**: Soporte para más idiomas
3. **Personalización visual**: Temas y avatares
4. **Integración con más servicios**: Google Home, Alexa, etc.
5. **Análisis de sentimiento**: Detección proactiva de estado emocional
6. **Videollamadas**: Integración con Zoom/Meet para conectar con familia

## 📚 Referencias

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [SmartThings API](https://developer.smartthings.com/)
