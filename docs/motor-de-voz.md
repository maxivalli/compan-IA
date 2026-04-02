# Motor de voz — CompañIA / Rosita

Documento de referencia para entender el flujo completo, los tiempos reales y dónde se puede optimizar.

---

## 1. Visión general del flujo

```
Usuario habla
     │
     ▼
[expo-speech-recognition]  ← corre siempre en loop
     │
     │  300–490ms (nativo Android/iOS)
     ▼
Texto reconocido
     │
     ▼
Filtros de relevancia ──── descartado si no pasa
     │
     ├──► ¿Es respuesta rápida? (saludo, gracias, despedida, afirmación)
     │         │
     │         └──► hablar() desde CACHE DISCO → 35ms e2e ✅
     │
     └──► Procesamiento normal
               │
               ├──► Muletilla (cache disco) ──────────────────────────┐
               │                                                        │ en paralelo
               └──► Claude (LLM) ──► TTS Fish Audio ──► hablar()      │
                                                              │         │
                                                              ▼         ▼
                                                         Usuario escucha Rosita
```

---

## 2. Tiempos reales (medidos en logs Railway)

### Desde que el usuario deja de hablar hasta que Rosita responde:

| Paso | Tiempo |
|------|--------|
| Fin de habla → SR entrega resultado | 300–490 ms |
| SR → Claude request sale | ~10 ms |
| Claude connected (con cache) | 390–540 ms |
| Claude first token | 390–600 ms |
| Claude stream completo (respuesta corta) | 750–950 ms |
| Claude stream completo (respuesta larga) | 1000–1400 ms |
| Fish Audio REST (texto < 40 chars) | 800–1000 ms |
| Fish Audio REST (texto 40–100 chars) | 1200–1600 ms |
| Fish Audio REST (texto > 100 chars) | 1800–2500 ms |

### e2e_first_audio_ms reales por tipo de turn:

| Tipo | Tiempo |
|------|--------|
| Respuesta rápida (saludo, gracias) | **~35 ms** |
| Comando domótica (1 oración) | **2000–2800 ms** |
| Pregunta conversacional corta | **2000–2200 ms** |
| Pregunta conversacional larga | **2400–2800 ms** |
| Búsqueda web / Wikipedia | **3500–4000 ms** |

### Totales (e2e_total_ms — hasta que Rosita termina de hablar):

| Tipo | Tiempo |
|------|--------|
| Comando domótica (1 oración) | 6000–8000 ms |
| Pregunta corta (1 oración) | 7000–9000 ms |
| Pregunta larga (2 oraciones) | 11000–17000 ms |
| Búsqueda web (2 oraciones) | 8000–15000 ms |

---

## 3. Capas de cache

### Capa 1 — Cache de boot (al iniciar la app)

Se descargan y guardan en disco **todas** las muletillas y respuestas rápidas.

```
Boot
 └──► precachearMuletillas()
       ├── MULETILLAS (por categoría y género)
       │     ├── empatico:  "Estoy acá.", "Te escucho.", "Contame."
       │     ├── default:   "Te sigo...", "A ver...", "Sí..."
       │     ├── comando:   "¡Dale!", "¡Ahora mismo!", "¡Claro!"
       │     ├── busqueda:  "Ya miro.", "Dame un momento.", "Enseguida."
       │     └── nostalgia: "Qué lindo eso.", "Me contás más?", "Contame."
       │
       └── RESPUESTAS_RAPIDAS (por categoría y género)
             ├── saludo:     "¡Hola! ¿Cómo andás hoy?", etc.
             ├── gracias:    "¡De nada!", etc.
             ├── despedida:  "¡Chau! Cuidate mucho.", etc.
             └── afirmacion: "¡Bien!", etc.
```

**Total de audios pre-cacheados:** ~30–40 archivos .mp3 en disco.
**Tiempo de reproducción:** 0ms extra (directo desde FileSystem).

---

### Capa 2 — Cache de primera frase (durante el stream de Claude)

Mientras Claude está streamando, el parser detecta la primera oración completa
y dispara `precachearTexto(primera)` inmediatamente.

```
Claude stream arranca
     │
     │  ...tokens llegando...
     │
     ├── primera oración detectada (~8+ chars terminados en . ! ?)
     │         └──► precachearTexto(primera, emotion)  ← fire and forget
     │
     │  ...más tokens...
     │
     └── stream completo
```

**Utilidad real hoy:** baja — el TTS REST tarda menos que Claude en la mayoría de los casos,
entonces cuando `hablar()` llega a ese texto ya lo tiene Fish Audio más rápido que el precache.
**Útil cuando:** Claude tarda > 2s (respuestas largas o listas).

---

### Capa 3 — Cache de respuesta completa (cuando Claude termina antes del race)

Si Claude termina ANTES de que el sistema detecte primera frase:

```
claudeOutcomePromise resuelve antes que primeraFraseDisparada
     │
     └──► parsearRespuesta()
           └──► splitEnOraciones()
                 └──► precachearTexto(oración, emotion)  ← para cada oración
```

---

### Capa 4 — Cache domótica (paralelo con SmartThings)

```
parsed.domotica detectado
     │
     ├──► ejecutarAccionDomotica()   ← POST controlar + GET estado (~2s)
     └──► precachearTexto(respuesta) ← Fish Audio en paralelo

ambos terminan ─► hablar() → cache HIT → reproducción inmediata
```

---

### Capa 5 — Cache de disco (persistente 7 días)

Todo audio generado se guarda como `tts_v5_<hash>.mp3` en el FileSystem del dispositivo.
La misma frase con la misma emotion no vuelve a llamar a Fish Audio hasta 7 días después.

---

## 4. Sistema de muletillas

Las muletillas **no reducen el lag real** — son audio de "mientras espero" que tapa la espera.

```
Texto del usuario reconocido
     │
     └──► categorización inmediata
           │
           ├── "apagá / prendé / ponele / bajale" → categoria: comando
           ├── "clima / noticias / dónde queda"   → categoria: busqueda
           ├── "qué pasó / cómo estás / me ayudás"→ categoria: empatico
           ├── "antes / en mi época / de joven"   → categoria: nostalgia
           └── todo lo demás                      → categoria: default
```

### Selección de muletilla:

- Se elige por índice rotativo para no repetir la misma siempre
- Si la misma categoría ya salió hace menos de X turns, rota al siguiente

### Timing de muletilla:

```
SR resultado llega
├── ~10ms → muletilla arranca (cache disco)
└── ~10ms → Claude request sale  ← en paralelo

Muletilla dura: ~600–900ms (textos cortos como "¡Dale!", "Ya miro.")
Claude tarda:   ~750–1400ms

[muletilla]─────────────┐
[Claude stream]─────────────────────┐
                         │           │
                    muletilla   Claude listo
                    terminó,         │
                    espera           │
                    Claude...        │
                                [Fish Audio]────┐  ~850ms
                                                │
                                     Rosita habla ✅
```

---

## 5. Respuestas rápidas (sin Claude)

Para 4 categorías, Rosita responde **sin llamar a Claude**:

| Categoría | Condición de disparo | e2e |
|-----------|---------------------|-----|
| saludo | "hola", "buenas", "buen día" | ~35ms |
| gracias | "gracias", "muchas gracias" | ~35ms |
| despedida | "chau", "hasta luego", "me voy" | ~35ms |
| afirmacion | "sí", "dale", "bueno" (charla social breve) | ~35ms |

**Condición que bloquea la respuesta rápida:** si el historial tiene una pregunta sin responder
(Rosita hizo una pregunta en el turno anterior), Claude procesa igual para mantener coherencia.

---

## 6. Fast path vs Slow path

```
Texto categorizado
     │
     ├── Fast path (sin búsqueda externa)
     │     │
     │     ├── Claude con datos del system_payload (clima ya cargado, etc.)
     │     ├── Memoria episódica: solo si NO es charla social liviana
     │     └── Tecleo: solo si muletilla es categoria "busqueda"
     │
     └── Slow path (con búsqueda externa)
           │
           ├── buscarWeb() / buscarWikipedia() / buscarNoticias() / buscarLugares()
           ├── memoriaPromise
           └── Tecleo: SIEMPRE (suena hasta que terminan las búsquedas)

           Todo en Promise.all() → Claude arranca cuando todo está listo
```

### Diferencia de tiempo Fast vs Slow:

| Path | Extra time |
|------|-----------|
| Fast | 0ms extra |
| Slow (web) | +600–1200ms (Serper API) |
| Slow (Wikipedia) | +400–800ms (Wikipedia API) |
| Slow (lugares) | +500–800ms (Overpass API) |

---

## 7. Barge-in (interrumpir a Rosita)

El usuario puede empezar a hablar mientras Rosita está hablando:

```
Rosita empieza a hablar
     │
     │  2600ms  (BARGE_IN_ARM_DELAY_MS)
     ▼
SR se reactiva  ← solo si respuesta >= 110 chars
     │
     └──► Usuario habla >= 1400ms seguidos  (BARGE_IN_MIN_SPEECH_MS)
               │
               └──► player.pause() → procesamiento del nuevo texto
```

---

## 8. Watchdogs y recuperación

| Watchdog | Intervalo | Condición | Acción |
|----------|-----------|-----------|--------|
| SR zombie | 5000ms | SR activo pero sin resultado en 45s | Reinicia SR |
| SR vencido | 5000ms | `srActivoRef` true pero `lastActivation` > 45s | Reinicia SR |
| procesandoRef colgado | 5000ms | Procesando > 20s sin terminar | Reset forzado |
| SR error de red | — | evento error=network | Reinicia en 3000ms |
| SR otro error | — | evento error | Reinicia en 1000ms |
| SR debounce | — | rearranque < 1500ms desde el último | Ignora el arranque |

---

## 9. Race condition de double TTS (corregida)

Antes: `precachearTexto()` y `hablar()` podían lanzar dos llamadas Fish Audio
al mismo texto al mismo tiempo.

Ahora: `precacheInFlightRef` es un `Map<key, Promise>`. Si `hablar()` detecta
que ese key ya está siendo descargado, espera el resultado en vez de lanzar otro request.

```
precachearTexto("Dale, apago el velador.")  ← arranca primero
     │
     │  ~50ms después
     ▼
hablar("Dale, apago el velador.")
     │
     └──► key ya en InFlightRef? → await inFlightPromise → cache HIT → play()
          ↑
          sin segunda llamada Fish Audio ✅
```

---

## 10. Dónde se puede ganar tiempo

### Ordenado por impacto estimado:

**A. WebSocket TTS por turn (Option B) — estimado: -400 a -600ms e2e**

En vez de esperar todo el audio de Fish Audio REST, abrir un WebSocket
y reproducir el primer chunk de audio (~300ms) mientras llegan el resto.
Costo: complejidad, riesgo de 429 si se abusa. Próximo paso natural.

```
Hoy (REST):
  Claude termina ──► Fish Audio descarga todo (850ms) ──► play()

Con WebSocket:
  Claude termina ──► Fish Audio primer chunk (300ms) ──► play()
                          └──► chunks siguientes llegan mientras suena
```

**B. Streaming Claude → TTS solapado — estimado: -200 a -400ms e2e**

Arrancar Fish Audio con la primera oración detectada en el stream
antes de que Claude termine. La respuesta completa se procesa en paralelo.
Costo: más complejo de sincronizar con barge-in y muletillas.

**C. Cache de respuestas frecuentes de domótica — estimado: 0ms (ya implementado)**

Ya está: el TTS de la confirmación se pre-cachea en paralelo con SmartThings.

**D. Reducir tamaño del system prompt — estimado: -50 a -100ms Claude**

Actualmente ~17000 chars / ~4300 tokens cacheables. Cada caché miss suma.
Con Haiku 4.5 el floor ya está activo, el margen es pequeño.

**E. Muletilla más larga — estimado: 0ms real, mejora percepción**

No baja el lag, pero puede reducir la *percepción* de silencio post-muletilla
si la muletilla dura más que Claude + TTS juntos.

---

## 11. Resumen visual de un turn normal

```
t=0ms     Usuario deja de hablar
t=350ms   SR entrega texto
t=360ms   Muletilla arranca (cache) + Claude request sale
t=450ms   Muletilla suena ("¡Dale!")
t=750ms   Muletilla termina
t=900ms   Claude stream completo
t=900ms   Fish Audio REST arranca
t=1750ms  Fish Audio termina
t=1760ms  Rosita empieza a hablar ← e2e_first_audio_ms ≈ 1760ms
t=3800ms  Rosita termina de hablar (1 oración ~35 chars)
```
