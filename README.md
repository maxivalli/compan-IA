# CompañIA - Aplicación Móvil

Asistente de voz conversacional con IA para acompañamiento de adultos mayores, construido con React Native y Expo.

## 🎯 Descripción

CompañIA es una aplicación móvil que proporciona una asistente de voz llamada **Rosita** que conversa, escucha, reproduce audio, guarda memoria conversacional, registra estado de ánimo, maneja recordatorios, interactúa con Telegram y puede controlar dispositivos domóticos vía SmartThings.

## 🛠 Stack Tecnológico

- **Expo SDK 54** + **React 19** + **React Native 0.81**
- **expo-router** - Navegación basada en archivos
- **Deepgram Nova-3** - Reconocimiento de voz continuo vía WebSocket
- **audio-capture** - Módulo nativo local para captura de audio (PCM16 16kHz mono)
- **expo-audio** - Reproducción, streaming y grabación de audio
- **AsyncStorage** - Persistencia local de datos
- **TypeScript** - Tipado estático

## 📋 Requisitos Previos

- Node.js 18 o superior
- npm o yarn
- Expo CLI
- Para desarrollo iOS: macOS con Xcode
- Para desarrollo Android: Android Studio

## 🚀 Instalación

```bash
# Clonar el repositorio
cd AbuApp

# Instalar dependencias
npm install

# Aplicar parches (importante)
npm run postinstall
```

## 🔧 Configuración

Crear archivo `.env` en la raíz del proyecto:

```env
EXPO_PUBLIC_BACKEND_URL=https://tu-backend.railway.app
EXPO_PUBLIC_OPENWEATHER_API_KEY=tu_api_key_de_openweather
```

## 📱 Ejecución

```bash
# Desarrollo con Expo Go
npm start

# Desarrollo en iOS
npm run ios

# Desarrollo en Android
npm run android

# Web
npm run web
```

## 🏗 Estructura del Proyecto

```
AbuApp/
├── app/                      # Pantallas (expo-router)
│   ├── index.tsx            # Pantalla principal de Rosita
│   ├── onboarding.tsx       # Configuración inicial
│   ├── configuracion.tsx    # Ajustes y perfil
│   ├── animo.tsx            # Historial de ánimo
│   ├── guia.tsx             # Guía de uso
│   └── privacidad.tsx       # Política de privacidad
├── components/              # Componentes reutilizables
│   ├── RosaOjos.tsx         # Cara animada de Rosita
│   ├── RositaHorizontalLayout.tsx  # Layout para tablets
│   ├── ExpresionOverlay.tsx # Efectos visuales de expresión
│   ├── FondoAnimado.tsx     # Animaciones de fondo
│   └── ...
├── hooks/                   # Lógica de negocio
│   ├── useRosita.ts         # Orquestación principal
│   ├── useBrain.ts          # IA, memoria y acciones
│   ├── useAudioPipeline.ts  # Audio (Deepgram SR + Fish TTS)
│   ├── useDeepgramSR.ts     # Speech Recognition con Deepgram
│   ├── useNotificaciones.ts # Recordatorios y alertas
│   ├── useSmartThings.ts    # Integración domótica
│   ├── useCamaraPresencia.ts # Detección de rostros
│   ├── useBLEBeacon.ts      # Control BLE beacon Holy-IOT
│   └── ...
├── lib/                     # Utilidades y clientes
│   ├── ai.ts                # Cliente del backend
│   ├── memoria.ts           # Persistencia local
│   ├── claudeParser.ts      # Parseo de respuestas IA
│   ├── clima.ts             # Cliente OpenWeather
│   ├── telegram.ts          # Cliente Telegram
│   └── ...
└── assets/                  # Recursos estáticos
```

## 🎨 Características Principales

### 📱 Pantallas de la App

#### Pantalla Principal (index.tsx)
- Cara animada de Rosita con expresiones
- Reconocimiento de voz continuo
- Reproducción de respuestas con TTS
- Modos: normal, no molestar, noche
- Layout adaptativo (vertical/horizontal)
- Controles táctiles: caricia, ojo picado, relámpago
- Botones: foto, música, SOS, configuración

#### Onboarding (onboarding.tsx)
- Configuración inicial del perfil
- Registro de familia con código
- Selección de voz (muestra de voces)
- Vinculación de contactos Telegram

#### Configuración (configuracion.tsx)
- Edición de perfil (nombre, edad, género)
- Gestión de familiares, gustos, medicamentos
- Selección de voz
- Vinculación SmartThings (OAuth o PAT)
- Gestión de contactos Telegram
- Ajustes de monitoreo

#### Recordatorios (recordatorios.tsx)
- Lista de medicamentos con horarios
- Lista de recordatorios puntuales
- Borrado de recordatorios
- Estado vacío con hint

#### Notas (notas.tsx)
- Últimas 10 notas guardadas (async jobs)
- Recetas y búsquedas
- Layout adaptativo (2 columnas en horizontal)
- Navegación a detalle de nota

#### SmartLink (smartlink.tsx)
- Lista de dispositivos SmartThings
- Control on/off por dispositivo
- Iconos por tipo de dispositivo
- Estado online/offline

#### Ánimo (animo.tsx)
- Historial de estado emocional
- Visualización por fecha
- Sincronización con backend

#### Juegos
- **Ta-te-ti** (tateti.tsx): Juego de 3 en raya con voz
- **Ahorcado** (ahorcado.tsx): Adivinar palabra con voz
- **Memoria** (memoria.tsx): Juego de memoria visual con voz

#### Otras
- **Guía** (guia.tsx): Guía de uso de la app
- **Privacidad** (privacidad.tsx): Política de privacidad
- **Prueba** (prueba.tsx): Pantalla de pruebas internas

### 🗣 Reconocimiento de Voz Continuo
- **Deepgram Nova-3** vía WebSocket directo (español latinoamericano)
- Temporary API keys (60s TTL) generadas por el backend
- Transcripciones parciales (especulativas) y finales
- VAD integrado + endpointing inteligente (1000ms)
- Protección anti-eco: pausa AudioCapture durante TTS sin cerrar WebSocket
- Reconexión automática con backoff exponencial
- Watchdogs para reiniciar SR si se cuelga

### 🧠 Inteligencia Artificial
- Integración con Claude Haiku 4.5 vía backend
- Respuestas rápidas locales para interacciones comunes (saludos, gracias, despedidas)
- Memoria episódica con búsqueda semántica
- Contexto enriquecido con clima, ubicación y perfil
- Streaming SSE para respuestas progresivas

### 🔊 Sistema de Audio
- **TTS con Fish Audio**: streaming HTTP directo (~300-400ms first audio)
- Cache local de audio para respuestas frecuentes (7 días)
- Pre-cache de respuestas rápidas y frases de sistema
- Cola de oraciones para respuestas largas
- Reproducción de música y radios
- Concurrency limiter en backend (1 stream Fish activo a la vez)

### 📱 Integraciones

#### Telegram
- Mensajería bidireccional con familiares
- Envío de fotos desde la app
- Recepción de mensajes de voz, texto y fotos
- Alertas automáticas (emergencias, recordatorios)

#### SmartThings
- Control de dispositivos del hogar vía OAuth
- Encender/apagar luces, switches, enchufes
- Consultar estado de dispositivos
- Integración con comandos de voz

#### Claude Vision
- Lectura de texto en imágenes (OCR)
- Descripción de fotos y entorno
- Modo visión continuo para asistencia visual
- Captura con cámara frontal o trasera

#### Juegos Interactivos
- **Ta-te-ti** (pantalla dedicada con voz)
- **Ahorcado** (pantalla dedicada con voz)
- **Memoria** (pantalla dedicada con voz)
- **Trivias, adivinanzas, refranes** (inline con Claude)
- **Chistes** curados para adultos mayores

#### Otros
- **OpenWeather**: clima actual y pronóstico 3 días
- **Búsquedas web**: Serper API (Google Search)
- **Wikipedia**: búsquedas en español
- **Lugares cercanos**: OpenStreetMap Overpass API
- **Noticias diarias**: Serper News API
- **Cámara de presencia**: detección de rostros con expo-face-detector
- **BLE Beacon**: control remoto vía Holy-IOT beacon (nRF52810)
- **Música y radios**: reproducción de streams de audio
- Envío de alertas SOS
- Recepción de mensajes de voz, texto y fotos
- Comandos desde familiares (/informe, /camara, /recordatorio)

#### SmartThings
- Vinculación de dispositivos domóticos
- Control por voz de luces, enchufes, etc.
- Consulta de estado de dispositivos

#### Clima
- Pronóstico actual y de 3 días (OpenWeather)
- Alertas de clima adverso
- Integración visual con efectos animados

### 📊 Seguimiento de Ánimo
- Registro diario de estado emocional
- Sincronización con backend
- Visualización de historial

### 🔔 Notificaciones y Recordatorios
- Recordatorios por voz
- Alertas de cumpleaños
- Polling de mensajes de Telegram
- Informe diario automático

## 🎮 Modos de Operación

### Modo Normal
- Escucha continua
- Respuestas conversacionales
- Expresiones faciales animadas

### Modo No Molestar
- Desactiva escucha automática
- Zipper visual sobre la boca
- Activación manual requerida

### Modo Noche
- Activación automática según hora
- Párpados cerrados
- Reloj digital visible
- Respuestas susurradas

### Modo Horizontal (Tablets)
- Layout optimizado para pantallas anchas
- Controles táctiles simplificados
- Modo reloj de escritorio

## 🔐 Autenticación

La app usa un sistema de **device tokens**:

1. Al instalar, se genera un `installId` único
2. Se llama a `/auth/bootstrap` para obtener un `deviceToken`
3. Todas las peticiones al backend usan el header `x-device-token`
4. El token se vincula a una familia durante el onboarding

## 💾 Persistencia Local

Datos almacenados en AsyncStorage:

- **Perfil**: nombre, voz, configuración
- **Historial**: conversaciones recientes
- **Memoria episódica**: resúmenes de conversaciones importantes
- **Listas**: listas de compras, tareas, etc.
- **Recordatorios**: alarmas y eventos
- **Ánimo**: registro diario de emociones
- **Cache TTS**: audio pre-generado

## 🎯 Flujo Principal

1. Usuario habla → Speech Recognition detecta texto
2. Filtros de relevancia validan si requiere respuesta
3. Si es saludo/gracias/etc → Respuesta rápida local
4. Si no → `useBrain` decide:
   - ¿Necesita búsqueda web/Wikipedia/lugares?
   - ¿Necesita consultar memoria episódica?
   - ¿Es un comando (lista, alarma, domótica)?
5. Se arma `system_payload` con contexto
6. Backend construye prompt y llama a Claude
7. Respuesta se parsea y reproduce con TTS
8. Se guarda en memoria si es relevante

## 🔄 Sincronización con Backend

### Datos que se sincronizan:
- Ánimo diario
- Memorias episódicas
- Contactos de Telegram
- Tokens de SmartThings
- Heartbeat (cada 10 min si monitoreo activo)

### Endpoints principales:
- `POST /auth/bootstrap` - Obtener device token
- `POST /ai/chat-stream` - Conversación con IA
- `GET /ai/tts-stream` - Síntesis de voz
- `POST /ai/animo` - Sincronizar ánimo
- `POST /ai/memorias-sync` - Sincronizar memorias
- `GET /telegram/mensajes` - Obtener mensajes pendientes

## 🧪 Testing

```bash
# Ejecutar linter
npm run lint
```

## 📦 Build y Deploy

### Desarrollo
```bash
# Build de desarrollo
npx expo prebuild

# Build Android
eas build --platform android --profile development

# Build iOS
eas build --platform ios --profile development
```

### Producción
```bash
# Build de producción Android
eas build --platform android --profile production

# Build de producción iOS
eas build --platform ios --profile production

# Publicar actualización OTA
eas update --branch production
```

## 🐛 Debugging

### Logs del cliente
La app envía logs al backend:
```typescript
POST /debug/log
{
  "event": "nombre_evento",
  "data": { ... }
}
```

### Crash reports
Los crashes se reportan automáticamente:
```typescript
POST /debug/crash
{
  "message": "error message",
  "stack": "stack trace",
  "platform": "ios|android",
  "installId": "..."
}
```

## 🔒 Seguridad

- Device tokens de 64 caracteres hex
- No se almacenan API keys en el cliente
- Todas las credenciales sensibles en backend
- Rate limiting por dispositivo
- Validación de payloads en backend

## 📱 Compatibilidad

- **iOS**: 13.0+
- **Android**: API 26+ (Android 8.0+)
- **Tablets**: Optimizado para iPad y tablets Android

## 🎨 Personalización

### Cambiar voz
En `configuracion.tsx` se puede seleccionar entre voces masculinas y femeninas.

### Ajustar sensibilidad de escucha
En `useAudioPipeline.ts` modificar umbrales de relevancia.

### Personalizar expresiones
En `RosaOjos.tsx` y `ExpresionOverlay.tsx`.

## 🤝 Contribución

1. Fork del repositorio
2. Crear rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

Propietario - Todos los derechos reservados

## 👥 Equipo

Desarrollado por el equipo de CompañIA

## 📞 Soporte

Para soporte técnico, contactar a través de los canales oficiales del proyecto.
