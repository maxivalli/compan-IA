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
  │  transcribirAudio() │
  │  POST /ai/whisper   │
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
  agregar mensaje al historial
         │
         ├─ pideNoticias? (regex: f1, boca, dolar, etc.)
         │     └─ sí → buscarNoticias() → Google News RSS
         │              → contextoNoticias (se pasa en bloque dinámico)
         │
         ├─ pideJuego? → incluirJuego = true
         │
         ▼
  ┌───────────────────────────────────────────────────┐
  │  Backend: Claude Haiku                            │
  │  POST /ai/chat                                    │
  │                                                   │
  │  system: [                                        │
  │    { text: instrucciones+tono+tags,               │
  │      cache_control: 'ephemeral' }  ← CACHEABLE    │
  │    { text: fecha/hora+clima+perfil+noticias }      │
  │  ]                                                │
  │  messages: historial.slice(-10)                   │
  │  max_tokens: 180                                  │
  └──────────────────────┬────────────────────────────┘
                         │ respuestaRaw
                         ▼
  parsearRespuesta()
    → tagPrincipal: [FELIZ|TRISTE|MUSICA|JUEGO|...]
    → respuesta: texto limpio para hablar
    → recuerdos[], animoUsuario, recordatorio, timer...
         │
         ├─ [MUSICA: clave] → buscarRadio() → playerMusica.replace()
         ├─ [PARAR_MUSICA]  → playerMusica.pause()
         ├─ [RECUERDO: ...] → agregarRecuerdo() → AsyncStorage
         ├─ [TIMER: seg]    → setTimeout(seg * 1000) → hablar aviso
         ├─ [RECORDATORIO:] → guardarRecordatorio() → notificación futura
         ├─ [MENSAJE_FAMILIAR:] → enviarAlertaTelegram()
         └─ [EMERGENCIA:]   → enviarAlertaTelegram() urgente
         │
         ▼
  hablar(respuesta)
```

---

## hablar(texto) — reproducción TTS

```
  ExpoSpeechRecognitionModule.stop()
  estadoRef = 'hablando'  ← ref inmediato (suprime watchdog)
         │
         ├─ texto > 450 chars → cortar en límite de oración
         │
         ▼
  cacheUri = cacheDirectory + 'tts_v2_' + hash(texto) + '.mp3'
         │
         ├─ archivo existe? → uri = cacheUri  (CACHE HIT — sin llamada)
         │
         └─ no existe?
              │
              ▼
         ┌──────────────────────────┐
         │  Backend: ElevenLabs     │
         │  POST /ai/tts            │
         │  model: eleven_flash_v2_5│
         │  stability: 0.6          │
         │  similarity_boost: 0.8   │
         │  speed: 0.9              │
         └────────────┬─────────────┘
                      │ base64 MP3
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
  │                                                │
  │  started = true                                │
  │    → playing: silenceCount = 0                 │
  │    → !playing + pos ≥ dur - 0.3 → DONE 'near-end'
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

## Watchdog (cada 5 segundos)

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
           srActivoRef = true pero sin actividad > 20s? (zombie)
                         │ sí
                         ▼
              iniciarSpeechRecognition()
```

---

## Charla proactiva (verificarCharlaProactiva)

```
  Condiciones para activar:
    • hora entre 9h y 21h
    • última charla hace > 120 min
    • estado = 'esperando'
    • no está en proceso
    • sin música activa
         │
         ▼
  arrancarCharlaProactiva()
    → llamarClaude(max_tokens: 120)
      "Iniciá UNA sola frase corta y cálida para charlar"
    → hablar(frase)
    → ultimaCharlaRef = now
```

---

## Música y duck

```
  Música activa (playerMusica en streaming):
    │
    ├─ SR detecta voz → duckMusica()
    │     playerMusica.volume = 0.15
    │     setTimeout(8s) → unduckMusica() si no respondió
    │
    ├─ hablar() inicia → playerMusica.volume ya estaba en 0.15
    │
    └─ hablar() termina → unduckMusica()
          playerMusica.volume = 1.0
```

---

## Telegram polling (cada 15 segundos)

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
    └─ texto → ignorar (bot responde automáticamente
                 indicando que solo se procesan audios)
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
  │ Clima (Open-Meteo)                             │
  │ Perfil: nombre, edad, familiares, recuerdos    │
  │ Noticias (si aplica)                           │
  │ ~200–600 tokens                                │
  └────────────────────────────────────────────────┘

  HISTORIAL
  ┌────────────────────────────────────────────────┐
  │ Últimos 10 mensajes (guardados 30, envían 10)  │
  │ ~200–500 tokens                                │
  └────────────────────────────────────────────────┘

  OUTPUT
  ┌────────────────────────────────────────────────┐
  │ max_tokens: 180 (respuesta normal)             │
  │ max_tokens: 120 (charla proactiva)             │
  └────────────────────────────────────────────────┘
```

---

## Bostezo y silbido (inactividad)

```
  Sin charla > 5 min + estado 'esperando' + hora diurna + sin música
         │
         ▼
  setExpresion('bostezando') por 2.8s
  siguiente bostezo: mínimo 10 min después

  Sin charla > 10 min + estado 'esperando' + hora diurna + sin música
         │
         ▼
  reproducirSilbido() → ElevenLabs sound-generation
  loop cada 2s (máx 3 repeticiones)
  se detiene al iniciar cualquier interacción
```

---

## Modo noche (evaluado cada 10s)

```
  hora 9h–23h → 'despierta'

  hora 23h–9h:
    └─ actividad < 1 min → 'soñolienta'
    └─ sin actividad > 1 min → 'durmiendo'
         SR se detiene, pantalla oscurece
         Rosita no inicia charla proactiva
```
