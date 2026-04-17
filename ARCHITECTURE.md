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

Gestiona todo el ciclo de audio:

### Speech Recognition (SR)

```typescript
// Iniciar SR continuo
expo-speech-recognition.start({
  lang: 'es-ES',
  continuous: true,
  interimResults: true,
})

// Eventos
onResult → Texto reconocido
onError → Reiniciar con watchdog
onEnd → Reiniciar automáticamente
```

**Watchdogs**: Timers que detectan si SR se cuelga y lo reinician automáticamente.

**Filtros de relevancia**:
- Longitud mínima (3 caracteres)
- No es eco de TTS reciente
- No es ruido ambiente
- Contiene palabras significativas

### Text-to-Speech (TTS)

Flujo de reproducción:

```
Texto a hablar
    ↓
¿Está en cache local?
    ↓ Sí
Reproducir desde cache
    ↓ No
Solicitar a backend:
  - /ai/tts-stream (Fish Audio)
  - /ai/tts-cartesia-stream (Cartesia)
    ↓
Streaming de audio
    ↓
Guardar en cache
    ↓
Reproducir
```

**Cache TTS**: Audio pre-generado para frases frecuentes (muletillas, respuestas rápidas, juegos).

**Streaming**: La primera frase se reproduce apenas está lista, el resto continúa en background.

### Muletillas

Frases cortas para cubrir latencia mientras Claude piensa:

```typescript
const MULETILLAS = [
  "Mmm...",
  "Déjame pensar...",
  "A ver...",
  "Eh...",
]
```

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
