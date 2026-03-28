# Motor de Voz — CompañIA

## Estados del sistema

```
                    ┌─────────────┐
                    │   ESPERANDO │ ◄─── estado base
                    └──────┬──────┘
                           │
           ┌───────────────┼───────────────┐
           │ SR detecta voz│               │ Botón presionado
           ▼               │               ▼
    ┌────────────┐          │       ┌─────────────┐
    │ PENSANDO   │          │       │  ESCUCHANDO │
    │(procesando)│          │       │ (grabando)  │
    └─────┬──────┘          │       └──────┬──────┘
          │                 │              │ botón suelto
          │                 │              ▼
          │                 │       ┌────────────┐
          │                 │       │  PENSANDO  │
          │                 │       │(transcribe)│
          │                 │       └─────┬──────┘
          │                 │             │
          └────────┬─────────────────────┘
                   │ Claude responde
                   ▼
            ┌────────────┐
            │  HABLANDO  │
            │  (TTS/MP3) │
            └─────┬──────┘
                  │ audio terminado
                  └──────────────► ESPERANDO
```

---

## Flujo SR (Speech Recognition continuo)

```
Micrófono siempre activo (expo-speech-recognition)
            │
            ▼
   ┌─────────────────────────────────────────────────────┐
   │  useSpeechRecognitionEvent('result')                │
   │                                                     │
   │  Guards (si alguno es true → ignorar):              │
   │    • procesandoRef = true (ya hay respuesta en curso)│
   │    • enFlujoVozRef = true (botón manual activo)     │
   │    • noMolestarRef = true (modo no molestar)        │
   │    • estado = 'pensando' o 'hablando'               │
   │    • texto vacío o < 2 chars                        │
   └──────────────────────┬──────────────────────────────┘
                          │ texto pasó los guards
                          ▼
            ┌─────────────────────────┐
            │   ¿Hay que responder?   │
            │                         │
            │ mencionaNombre          │
            │   regex en primeras 5   │
            │   letras del nombre     │
            │                         │
            │   OR                    │
            │                         │
            │ enConversacion          │
            │   última charla < 10min │
            │   (no aplica si música) │
            │                         │
            │   OR                    │
            │                         │
            │ esPreguntaDirecta       │
            │   empieza con: qué,     │
            │   cómo, pone, dónde...  │
            └────────────┬────────────┘
                         │ sí
                         ▼
               duckMusica() si música activa
               procesandoRef = true
               ExpoSpeechRecognitionModule.stop()
                         │
                         ▼
               responderConClaude(texto)
```

---

## Flujo botón manual

```
onPressIn (botón micrófono)
         │
         ├─ estado ≠ 'esperando' → ignorar
         │
         ▼
  enFlujoVozRef = true  ← bloquea SR durante todo el flujo
  detenerSilbido()
  ExpoSpeechRecognitionModule.stop()
         │
         ▼
  AudioModule.setAudioModeAsync({ allowsRecording: true })
  estado = 'escuchando'
  recorderConv.prepareToRecordAsync()
  recorderConv.record()
  setTimeout(8s) → detener si no lo hace el usuario
         │
         ▼ onPressOut (o timeout)
  recorderConv.stop()
  uri = recorderConv.uri
         │
         ▼
  estado = 'pensando'
  ┌─────────────────────┐
  │  Backend: Whisper   │
  │  POST /ai/transcribe│
  └──────────┬──────────┘
             │ texto transcripto
             ▼
  responderConClaude(texto)
         │
         ▼ finally
  enFlujoVozRef = false
  si estado = 'esperando' → iniciarSpeechRecognition()
```

---

## responderConClaude(texto)

```
  estado = 'pensando'
  agregar mensaje al historial (nuevoHistorial)
         │
         ├─ pideNoticias? → buscarNoticias() → Google News RSS
         ├─ pideBusqueda? → buscarLugares() (Overpass) o buscarWeb() (Serper)
         ├─ pideJuego?    → incluirJuego = true
         ├─ pideCuento/pideChiste? → max_tokens = 700
         │
         ▼
  ┌──────────────────────────────────────────────────────┐
  │  Muletilla (en paralelo con Claude streaming)        │
  │                                                      │
  │  categorizarMuletilla(texto):                        │
  │    PATRON_SKIP   → null (saludos, gracias, etc.)     │
  │    PATRON_EMPATICO → 'empatico'                      │
  │    PATRON_BUSQUEDA → 'busqueda'                      │
  │    PATRON_NOSTALGIA → 'nostalgia'                    │
  │    PATRON_COMANDO → 'comando'                        │
  │    default        → 'default'                        │
  │                                                      │
  │  reproducirMuletilla(cat) → player.replace(cacheUri) │
  │    archivo: muletilla_v10_{cat}_{i}_{slug}.mp3       │
  │    muletillaAbort: señal para ceder el player        │
  └──────────────────────────────────────────────────────┘
         │
         ▼ en paralelo ──────────────────────────────────────────────┐
  ┌─────────────────────────────────────────────────────┐            │
  │  Backend: Claude Haiku streaming                    │            │
  │  POST /ai/chat-stream (SSE)                         │            │
  │                                                     │            │
  │  system: [                                          │            │
  │    { text: instrucciones+tono+tags,                 │            │
  │      cache_control: 'ephemeral' }  ← CACHEABLE      │            │
  │    { text: fecha/hora+clima+perfil+noticias }        │            │
  │  ]                                                  │            │
  │  messages: historial.slice(-8)                      │            │
  │  max_tokens: 180 (normal) / 300 (acción) / 700 (cc) │            │
  │  stream: true                                       │            │
  │                                                     │            │
  │  onPrimeraFrase(primera, tag):                      │            │
  │    • dispara cuando llega oración completa (≥15ch)  │            │
  │    • no requiere segunda oración                    │            │
  │    • llama precachearTexto(primera) INMEDIATAMENTE  │            │
  │      → Cartesia fetch arranca solapado con muletilla│            │
  │    • resuelve primeraFraseDisparada Promise         │            │
  └──────────────────────┬──────────────────────────────┘            │
                         │                                           │
                         ▼                                           │
  Promise.race([primeraFraseDisparada, claudePromise])  ◄────────────┘
         │
         ├─ primera ganó (respuesta de 2+ oraciones o lenta):
         │     muletillaAbort → espera que ceda el player
         │     hablar(primera, tag) ← Cartesia ya en cache o muy adelantado
         │     precachearTexto(restOraciones[0]) ← 1ra oración del resto
         │     en paralelo: esperar claudePromise completo
         │     await hablarPrimeraPromise
         │
         └─ claude ganó (respuesta corta/rápida):
               muletillaAbort → espera que ceda el player
               (continúa al bloque de respuesta completa)
         │
         ▼
  parsearRespuesta(respuestaRaw)
    → tagPrincipal, respuesta, expresion, animoUsuario
    → recuerdos[], recordatorio, timer, mensajeFamiliar, emergencia
    → listas (LISTA_NUEVA, LISTA_AGREGAR, LISTA_BORRAR)
         │
         ├─ [MUSICA: clave]     → buscarRadio() → playerMusica
         ├─ [PARAR_MUSICA]      → playerMusica.pause()
         ├─ [RECUERDO: ...]     → agregarRecuerdo() → AsyncStorage
         ├─ [TIMER: seg]        → setTimeout → hablar aviso
         ├─ [RECORDATORIO:]     → guardarRecordatorio()
         ├─ [ALARMA:]           → guardarRecordatorio(esAlarma: true)
         ├─ [MENSAJE_FAMILIAR:] → enviarAlertaTelegram()
         ├─ [EMERGENCIA:]       → enviarAlertaTelegram() urgente
         ├─ [LISTA_NUEVA:]      → guardarLista()
         ├─ [LISTA_AGREGAR:]    → agregarItemLista()
         └─ [LISTA_BORRAR:]     → borrarLista()
         │
         ▼
  setExpresion(parsed.expresion)
  guardarEntradaAnimo(parsed.animoUsuario)
         │
         ├─ primeraFraseReproducida = true:
         │     extraerPrimeraFrase(respuesta) → resto
         │     hablarConCola(splitEnOraciones(resto), expresion)
         │
         └─ primeraFraseReproducida = false:
               hablarConCola(splitEnOraciones(respuesta), expresion)
```

---

## hablarConCola(oraciones[], emotion)

Pipeline de reproducción que elimina los gaps entre oraciones para respuestas largas.

```
  oraciones = ['Oración 1.', 'Oración 2.', 'Oración 3.']
         │
         ▼
  Para cada oración[i]:
    ├─ precachearTexto(oraciones[i+1]) ← arranca fetch de la siguiente
    ├─ await hablar(oraciones[i])      ← reproduce actual
    └─ await nextPrecache              ← garantiza que la siguiente esté lista
         │
         ▼ siguiente oración → CACHE HIT → cero gap
```

---

## hablar(texto, emotion?) — reproducción TTS

```
  ExpoSpeechRecognitionModule.stop()
  estadoRef = 'hablando'  ← ref inmediato (suprime watchdog)
         │
         ├─ texto > 450 chars → cortar en límite de oración
         │
         ▼
  limpio = limpiarTextoParaTTS(texto)
    → expande °C, %, km/h, números de teléfono, etc.
    → elimina markdown y stage directions (pausa), (risas)
         │
         ▼
  cacheUri = cacheDirectory + 'tts_v4_' + hash(limpio + '|' + emotion) + '.mp3'
         │
         ├─ archivo existe? → uri = cacheUri  (CACHE HIT — sin llamada)
         │
         └─ no existe?
              │
              ▼
         ┌──────────────────────────────────────────┐
         │  Backend: Cartesia TTS                   │
         │  GET /ai/tts-cartesia-stream             │
         │    ?text=...&voiceId=...&speed=...       │
         │    &emotion=...&k=APP_API_KEY            │
         │  model: sonic-3                          │
         │  output: MP3 44100hz                     │
         │  speed: velocidadSegunEdad(edad)          │
         │  emotion: mapeado por expresión           │
         │    feliz→positivity:high                 │
         │    triste→sadness:high                   │
         │    sorprendida→surprise:high             │
         │    etc.                                  │
         └────────────┬─────────────────────────────┘
                      │ MP3 buffered (Content-Length conocido)
                      ▼
              FileSystem.writeAsStringAsync(cacheUri)
         │
         ▼
  setEstado('hablando')  ← visual justo antes de play
  player.replace({ uri })
  player.play()
         │
         ▼  poll cada 150ms
  ┌────────────────────────────────────────────────┐
  │  Detección de fin de audio                     │
  │                                                │
  │  started = false                               │
  │    → si playing: started = true                │
  │       → armar duration-timer (dur + 0.8s)      │
  │       → capturar tAudioStart (debug)           │
  │                                                │
  │  started = true                                │
  │    → playing: silenceCount = 0                 │
  │    → pos ≥ dur - 0.3 → DONE 'near-end'         │
  │    → !playing + pos == lastPos                 │
  │         + pos < dur - 0.3 → STALL              │
  │           → player.play()  (resume)            │
  │    → !playing → silenceCount++                 │
  │         ≥ 15 polls (2.25s) → DONE 'silence'   │
  │                                                │
  │  Timeouts de seguridad:                        │
  │    noStartTimer: 4s sin arrancar → DONE        │
  │    safetyTimeout: 45s absoluto → DONE          │
  │    durationTimer: dur + 0.8s → DONE            │
  └──────────────────────┬─────────────────────────┘
                         │ audio terminado
                         ▼
  setEstado('esperando')
  si !enFlujoVozRef → iniciarSpeechRecognition()
```

---

## Muletillas — pre-cache y reproducción

```
  Al iniciar la app:
  precachearMuletillas(voiceId, nombre)
    → para cada categoría × variante:
        texto = variante.replace('{n}', nombre)
        archivo: muletilla_v10_{cat}_{i}_{slug}.mp3
        si no existe → sintetizarVoz() → Cartesia → guardar

  En responderConClaude, cuando se detecta categoría:
  reproducirMuletilla(cat, abortRef, onPlay?)
    → elige índice aleatorio (evita repetir último)
    → player.replace(cacheUri)
    → player.play()
    → poll cada 80ms:
        si abortRef.current = true → detener y ceder player
        si audio terminó → resolver
```

Categorías y disparadores:

| Categoría | Disparo | Ejemplo |
|-----------|---------|---------|
| `empatico` | dolor, tristeza, miedo, "estoy mal" | "Ay, {n}... estoy acá, contame." |
| `busqueda` | clima, farmacia, noticias, partido | "Dame un segundito que me fijo..." |
| `nostalgia` | recuerdos, familia, "cuando era chica" | "Mirá vos, {n}... contame." |
| `comando` | música, luces, alarma, timer | "¡Dale, {n}!" |
| `default` | todo lo demás (> 10 chars) | "Mmm, {n}..." |
| null | PATRON_SKIP (saludos, gracias, etc.) | — sin muletilla — |

---

## precachearTexto(texto, emotion?)

Función compartida por muletillas, hablarConCola y onPrimeraFrase.
Usa el mismo hash que hablar() → garantiza cache hit.

```
  limpio = limpiarTextoParaTTS(texto)
  cacheUri = 'tts_v4_' + hash(limpio + '|' + emotion)
  si existe → return (ya cacheado)
  sintetizarVoz(limpio, voiceId, speed, emotion)
    → POST /ai/tts (Cartesia bytes, base64)
  writeAsStringAsync(cacheUri, base64)
```

---

## Log de debug (solo si debugChatId configurado en perfil)

Cada respuesta envía por Telegram:

```
👤 <texto del usuario>
🎭 (categoria) "texto muletilla" | play: Xms
🎙 Streaming: primera=Xms | completo=Xms
🔊 Cartesia (cache|stream): play()=Xms | audio_real=Xms
📊 silencio inicial: Xms | gap muletilla→audio: Xms
🤖 [TAG] respuesta de Claude...
```

Métricas clave:
- **silencio inicial**: tiempo desde que el usuario terminó de hablar hasta el primer sonido
- **gap muletilla→audio**: tiempo de silencio entre que termina la muletilla y arranca el audio real de Cartesia
- **audio_real**: momento en que ExoPlayer detectó `playing=true` por primera vez

---

## Crash reporting

```
  app/_layout.tsx:
    ErrorBoundary.componentDidCatch → reportarCrash()
    ErrorUtils.setGlobalHandler     → reportarCrash()

  reportarCrash(message, stack, platform, extra):
    POST /debug/crash { message, stack, platform, installId, extra }
         │
         ▼
    Backend: console.error([CRASH] ...)
    Si DEBUG_TELEGRAM_CHAT_ID configurado:
      → sendMessage(chatId, HTML formateado con stack trace)
```

---

## Watchdog SR (cada 5 segundos)

```
  ┌─────────────────────────────────────────────┐
  │  Condiciones para NO actuar:                │
  │    • enFlujoVozRef = true                   │
  │    • sin perfil cargado                     │
  │    • estado ≠ 'esperando'                   │
  │    • procesandoRef = true                   │
  └──────────────────────┬──────────────────────┘
                         │ todas OK
                         ▼
           srActivoRef = false?
              OR
           srActivoRef = true + sin actividad > 10s (zombie)
              OR
           srActivoRef = true + activo > 45s en Android (silent failure)
                         │ sí
                         ▼
              iniciarSpeechRecognition()

  procesandoRef atascado > 60s → forzar false (recovery)
```

---

## Charla proactiva (verificarCharlaProactiva)

```
  Condiciones para activar:
    • hora entre horaFinNoche y horaInicioNoche (default 9h–23h)
    • última charla hace > 120 min
    • estado = 'esperando'
    • no está procesando
    • sin música activa
    • próxima alarma no en las próximas 2 horas
         │
         ▼
  arrancarCharlaProactiva()
    → llamarClaude(max_tokens: 120)
      tema según momento del día (mañana/mediodía/tarde/noche)
    → hablar(frase)
    → ultimaCharlaRef = now
```

---

## Música y duck

```
  Música activa (playerMusica en streaming desde radio-browser.info):
    │
    ├─ SR detecta voz → duckMusica()
    │     playerMusica.volume = 0.15
    │     setTimeout(8s) → unduckMusica() si no respondió
    │
    ├─ hablar() inicia → volumen ya bajo
    │
    └─ hablar() termina → unduckMusica()
          playerMusica.volume = 1.0

  Con música activa: enConversacion siempre false
    (requiere mencionar el nombre del asistente)

  Health check a los 10s:
    si currentTime < 0.5 → intentar URL alternativa del mismo género
    si alternativa también falla → pararMusica() + hablar aviso
```

---

## Telegram polling (useNotificaciones, cada 15 segundos)

```
  GET https://api.telegram.org/bot.../getUpdates
    offset = telegramOffsetRef + 1
         │
         ▼
  Para cada mensaje nuevo:
    ├─ audio/voz → descargar MP3
    │     → hablar("Mensaje de [nombre]: ...")
    │     → reproducir audio original después del anuncio
    │
    └─ texto → bot responde automáticamente
               (solo se procesan audios)

  Alertas salientes (enviarAlertaTelegram):
    SOS         → todos los contactos
    EMERGENCIA  → todos los contactos (urgente)
    LLAMAR_FAMILIA → todos los contactos (angustia emocional)
    MENSAJE_FAMILIAR → contacto específico
```

---

## Sistema de prompts y cache Anthropic

```
  Cada llamada a Claude envía:

  BLOQUE 1 — Cacheable (cache_control: ephemeral)
  ┌────────────────────────────────────────────────┐
  │ Personalidad, tono, reglas de respuesta,       │
  │ lista de tags [FELIZ], [MUSICA:], [RECUERDO:]  │
  │ ~600 tokens                                    │
  │ Se regenera solo si cambia nombre/edad/voz     │
  │ Costo cache hit: $0.03/MTok (vs $0.80 normal)  │
  └────────────────────────────────────────────────┘

  BLOQUE 2 — Dinámico (sin cache)
  ┌────────────────────────────────────────────────┐
  │ Fecha y hora actual                            │
  │ Clima (OpenWeatherMap): temp, descripción,     │
  │   pronóstico 3 días, ciudad                    │
  │ Perfil: nombre, edad, familiares, recuerdos    │
  │ Búsqueda/noticias (si aplica)                  │
  │ ~200–600 tokens                                │
  └────────────────────────────────────────────────┘

  HISTORIAL
  ┌────────────────────────────────────────────────┐
  │ Últimos 8 mensajes (guardados 30, envían 8)    │
  │ ~200–500 tokens                                │
  └────────────────────────────────────────────────┘

  OUTPUT
  ┌────────────────────────────────────────────────┐
  │ max_tokens: 180 (respuesta normal)             │
  │ max_tokens: 300 (acciones: recordatorio, etc.) │
  │ max_tokens: 700 (cuento, juego, chiste)        │
  │ max_tokens: 120 (charla proactiva)             │
  └────────────────────────────────────────────────┘
```

---

## Modo noche (evaluado cada 10s)

```
  hora entre horaFinNoche y horaInicioNoche → 'despierta'
  (default: 9h–23h, configurable en perfil)

  hora nocturna:
    └─ actividad < 1 min → 'soñolienta'
         → brillo al 50% (setBrightnessAsync)
    └─ sin actividad > 1 min → 'durmiendo'
         → brillo al 50%
         → SR detenido
         → charla proactiva desactivada

  Al volver a 'despierta':
    → useSystemBrightnessAsync() (restaura brillo del sistema)
```

---

## Bostezo y silbido (inactividad)

```
  Sin charla > 5 min + estado 'esperando' + hora diurna + sin música
         │
         ▼
  setExpresion('bostezando') por 2.8s
  siguiente bostezo: mínimo 10 min después

  Sin charla > 15 min (evaluado cada 15s en useNotificaciones)
    + estado 'esperando' + hora diurna + sin música
         │
         ▼
  reproducirSilbido()
    → ElevenLabs sound-generation (cacheado en silbido.mp3)
    → loop hasta 3 repeticiones
    → se detiene al iniciar cualquier interacción
```

---

## Lectura de imágenes / OCR (flujoLeerImagen)

```
  SR detecta: "qué dice acá", "leeme esto", "describime", etc.
         │
         ▼
  hablar("Apuntá la cámara a lo que querés que vea...")
         │
         ▼
  setCamaraFacing('back') → CameraAutoCaptura visible
  cuenta regresiva 3s → disparo automático → base64 JPEG
         │
         ▼
  POST /ai/leer-imagen { imagen: base64 }
    → Claude Haiku Vision (max_tokens: 300)
    → "Respondé en español argentino. Si hay texto, leelo..."
         │
         ▼
  resultado: string
    → formatear números para TTS
         │
         ▼
  hablar(textoFormateado)
```

---

## SmartThings (domótica)

```
  Claude emite: [DOMOTICA:nombre:switch:true/false]
         │
         ▼
  controlarDispositivo(id, boolean)
    → POST /smartthings/controlar { deviceId, value }
    → Backend → Samsung SmartThings API (PAT del usuario)

  controlarTodos(false) → apaga todos los dispositivos online

  Estado inicial: GET /smartthings/estado
    → { vinculado: boolean, dispositivos: Dispositivo[] }
```
