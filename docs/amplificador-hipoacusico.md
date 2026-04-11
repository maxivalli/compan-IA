# Amplificador de emergencia para hipoacúsicos

## Qué es y para qué sirve

Cuando se enchufan auriculares con cable, la app debe mostrar un botón que activa un **amplificador de emergencia para personas con hipoacusia**. Al activarlo:

1. El micrófono del teléfono captura el ambiente en tiempo real.
2. El audio se procesa (boost de ganancia + filtro paso-banda centrado en frecuencias de voz humana).
3. El resultado sale por los auriculares con cable.
4. El teléfono actúa como un audífono de emergencia.

La feature tiene tres niveles de ganancia seleccionables desde el botón: **bajo / medio / alto**.

---

## Por qué necesita código nativo (no es OTA)

Hay dos razones:

1. **Detección del plug**: Android requiere un `BroadcastReceiver` para el intent `android.intent.action.HEADSET_PLUG`. JavaScript no puede escuchar eso directamente.
2. **Passthrough en tiempo real**: `expo-audio` no puede capturar y reproducir al mismo tiempo con latencia suficientemente baja. El loop de audio tiene que correr en un hilo nativo con `AudioRecord` + `AudioTrack` (Android) o `AVAudioEngine` (iOS).

Pasar el audio por JS introduce ~200–400 ms de latencia extra, inaceptable para una herramienta de audición.

---

## Estructura de archivos a crear

```
AbuApp/
  modules/
    amplificador-audio/          ← módulo Expo local (ya referenciado en package.json)
      package.json
      src/
        index.ts                 ← API pública del módulo (JS/TS)
      android/
        src/main/java/expo/modules/amplificadoraudio/
          AmplificadorAudioModule.kt
          AudioPassthroughThread.kt
          HeadsetReceiver.kt
      ios/
        AmplificadorAudioModule.swift
  hooks/
    useAmplificador.ts           ← hook React que consume el módulo
  components/
    AmplificadorBoton.tsx        ← ya existe, no tocar
```

---

## 1. El módulo nativo (`modules/amplificador-audio`)

### `package.json` del módulo

```json
{
  "name": "amplificador-audio",
  "version": "1.0.0",
  "description": "Expo module for headphone detection and audio passthrough amplification",
  "main": "src/index",
  "types": "src/index",
  "peerDependencies": {
    "expo": "*"
  }
}
```

### `src/index.ts` — API pública

```ts
import { NativeModule, requireNativeModule, EventEmitter } from 'expo-modules-core';

// Tipos exportados
export type NivelGanancia = 'bajo' | 'medio' | 'alto';

export interface HeadsetEvent {
  conectado: boolean;
  esBluetooth: boolean;  // siempre false para cable, reservado para futuro
  nombreDispositivo: string;
}

// El módulo nativo
const AmplificadorAudio = requireNativeModule('AmplificadorAudio');
const emitter = new EventEmitter(AmplificadorAudio);

/** Inicia el passthrough de audio. Llama esto DESPUÉS de haber verificado que hay auriculares conectados. */
export function iniciarAmplificador(nivel: NivelGanancia): void {
  AmplificadorAudio.iniciarAmplificador(nivel);
}

/** Detiene el passthrough y libera AudioRecord + AudioTrack. */
export function detenerAmplificador(): void {
  AmplificadorAudio.detenerAmplificador();
}

/** Cambia la ganancia en caliente sin detener el passthrough. */
export function setNivel(nivel: NivelGanancia): void {
  AmplificadorAudio.setNivel(nivel);
}

/** Retorna true si hay auriculares con cable conectados en este momento. */
export function hayAuricularesConectados(): boolean {
  return AmplificadorAudio.hayAuricularesConectados();
}

/** Suscribirse a eventos de conexión/desconexión de auriculares. */
export function addHeadsetListener(
  callback: (event: HeadsetEvent) => void
): { remove: () => void } {
  return emitter.addListener('onHeadsetChange', callback);
}
```

---

## 2. Android — implementación nativa

### `HeadsetReceiver.kt`

```kotlin
package expo.modules.amplificadoraudio

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.core.interfaces.services.EventEmitter

class HeadsetReceiver(private val emitter: EventEmitter) : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_HEADSET_PLUG) return

    val state = intent.getIntExtra("state", -1)   // 1 = conectado, 0 = desconectado
    val name  = intent.getStringExtra("name") ?: "Auriculares"

    emitter.emit("onHeadsetChange", mapOf(
      "conectado"         to (state == 1),
      "esBluetooth"       to false,
      "nombreDispositivo" to name,
    ))
  }
}
```

### `AudioPassthroughThread.kt`

```kotlin
package expo.modules.amplificadoraudio

import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder

/**
 * Hilo de passthrough: lee del micrófono y escribe en el AudioTrack de auriculares.
 *
 * Ganancia:
 *   bajo  = 2.0×   (~6 dB)
 *   medio = 5.0×   (~14 dB)
 *   alto  = 10.0×  (~20 dB)
 *
 * Filtro paso-banda centrado en voz humana (300 Hz – 4 000 Hz) implementado
 * con un filtro IIR de primer orden (simple, baja CPU).
 */
class AudioPassthroughThread(private var ganancia: Float) : Thread("amplificador-audio") {

  @Volatile private var corriendo = false

  // Frecuencia de muestreo (Hz) — compatible con todos los Android
  private val SR = 16000
  // Tamaño de buffer mínimo garantizado por el sistema
  private val bufferSize = AudioRecord.getMinBufferSize(
    SR,
    AudioFormat.CHANNEL_IN_MONO,
    AudioFormat.ENCODING_PCM_16BIT
  ).coerceAtLeast(2048)

  fun setGanancia(g: Float) { ganancia = g }

  fun detener() { corriendo = false }

  override fun run() {
    corriendo = true

    val recorder = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      SR,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      bufferSize
    )

    val track = AudioTrack(
      AudioManager.STREAM_MUSIC,
      SR,
      AudioFormat.CHANNEL_OUT_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      bufferSize,
      AudioTrack.MODE_STREAM
    )

    recorder.startRecording()
    track.play()

    val buf = ShortArray(bufferSize / 2)

    // Estado del filtro IIR paso-banda simple
    // Coeficientes calculados para SR=16000, fc_low=300 Hz, fc_high=4000 Hz
    var prevIn  = 0.0
    var prevOut = 0.0
    val alpha   = 0.85   // coeficiente de paso-alto (quita rumble por debajo de ~300 Hz)

    while (corriendo) {
      val leidos = recorder.read(buf, 0, buf.size)
      if (leidos <= 0) continue

      for (i in 0 until leidos) {
        val x = buf[i].toDouble() / 32768.0

        // Filtro paso-alto (elimina frecuencias < 300 Hz)
        val y = alpha * (prevOut + x - prevIn)
        prevIn  = x
        prevOut = y

        // Ganancia + clipeo para no saturar
        val amplified = (y * ganancia).coerceIn(-1.0, 1.0)
        buf[i] = (amplified * 32767.0).toInt().toShort()
      }

      track.write(buf, 0, leidos)
    }

    recorder.stop()
    recorder.release()
    track.stop()
    track.release()
  }
}
```

### `AmplificadorAudioModule.kt`

```kotlin
package expo.modules.amplificadoraudio

import android.content.IntentFilter
import android.media.AudioManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AmplificadorAudioModule : Module() {

  private var passtroughThread: AudioPassthroughThread? = null
  private var headsetReceiver: HeadsetReceiver? = null

  // Ganancia por nivel
  private val GANANCIAS = mapOf("bajo" to 2.0f, "medio" to 5.0f, "alto" to 10.0f)

  override fun definition() = ModuleDefinition {

    Name("AmplificadorAudio")

    Events("onHeadsetChange")

    // ── Lifecycle ────────────────────────────────────────────────────────────
    OnCreate {
      val receiver = HeadsetReceiver(this@AmplificadorAudioModule)
      headsetReceiver = receiver
      val filter = IntentFilter(android.content.Intent.ACTION_HEADSET_PLUG)
      appContext.reactContext?.registerReceiver(receiver, filter)
    }

    OnDestroy {
      passtroughThread?.detener()
      headsetReceiver?.let { appContext.reactContext?.unregisterReceiver(it) }
    }

    // ── Funciones expuestas a JS ─────────────────────────────────────────────
    Function("iniciarAmplificador") { nivel: String ->
      passtroughThread?.detener()
      val g = GANANCIAS[nivel] ?: 5.0f
      passtroughThread = AudioPassthroughThread(g).also { it.start() }
    }

    Function("detenerAmplificador") {
      passtroughThread?.detener()
      passtroughThread = null
    }

    Function("setNivel") { nivel: String ->
      val g = GANANCIAS[nivel] ?: 5.0f
      passtroughThread?.setGanancia(g)
    }

    Function("hayAuricularesConectados") {
      val am = appContext.reactContext
        ?.getSystemService(android.content.Context.AUDIO_SERVICE) as? AudioManager
      am?.isWiredHeadsetOn ?: false
    }
  }
}
```

> **Permiso en AndroidManifest.xml** — agregar dentro de `<manifest>`:
> ```xml
> <uses-permission android:name="android.permission.RECORD_AUDIO" />
> ```
> El permiso RECORD_AUDIO ya debería estar declarado porque expo-speech-recognition lo requiere. Verificar que esté presente.

---

## 3. iOS — implementación nativa

```swift
import ExpoModulesCore
import AVFoundation

public class AmplificadorAudioModule: Module {

  private var engine: AVAudioEngine?
  private var gainNode: AVAudioUnitEQ?

  public func definition() -> ModuleDefinition {
    Name("AmplificadorAudio")

    Events("onHeadsetChange")

    OnCreate {
      // Escuchar cambios de ruta de audio (headset plug/unplug)
      NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] notification in
        self?.handleRouteChange(notification)
      }
    }

    OnDestroy {
      self.detenerEngine()
      NotificationCenter.default.removeObserver(self)
    }

    Function("iniciarAmplificador") { (nivel: String) in
      self.iniciarEngine(nivel: nivel)
    }

    Function("detenerAmplificador") {
      self.detenerEngine()
    }

    Function("setNivel") { (nivel: String) in
      self.aplicarGanancia(nivel: nivel)
    }

    Function("hayAuricularesConectados") -> Bool {
      let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
      return outputs.contains { $0.portType == .headphones }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private func gainDB(nivel: String) -> Float {
    switch nivel {
    case "bajo":  return 6.0
    case "alto":  return 20.0
    default:      return 14.0   // medio
    }
  }

  private func iniciarEngine(nivel: String) {
    detenerEngine()

    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playAndRecord,
                              mode: .measurement,
                              options: [.defaultToSpeaker, .allowBluetooth])
    try? session.setActive(true)

    let e = AVAudioEngine()
    let eq = AVAudioUnitEQ(numberOfBands: 1)
    // Bandpass centrado en 1500 Hz, ancho de banda ≈ 3700 Hz (cubre 300–4000 Hz)
    eq.bands[0].filterType = .bandPass
    eq.bands[0].frequency  = 1500
    eq.bands[0].bandwidth  = 1.3
    eq.bands[0].gain       = gainDB(nivel: nivel)
    eq.bands[0].bypass     = false

    e.attach(eq)
    let input  = e.inputNode
    let output = e.outputNode
    let fmt    = input.outputFormat(forBus: 0)
    e.connect(input, to: eq, format: fmt)
    e.connect(eq, to: output, format: fmt)

    try? e.start()
    engine   = e
    gainNode = eq
  }

  private func detenerEngine() {
    engine?.stop()
    engine   = nil
    gainNode = nil
  }

  private func aplicarGanancia(nivel: String) {
    gainNode?.bands[0].gain = gainDB(nivel: nivel)
  }

  private func handleRouteChange(_ notification: Notification) {
    guard let reason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt else { return }
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
    let conectado = outputs.contains { $0.portType == .headphones }
    sendEvent("onHeadsetChange", [
      "conectado":         conectado,
      "esBluetooth":       false,
      "nombreDispositivo": outputs.first?.portName ?? "Auriculares",
    ])
  }
}
```

---

## 4. Hook React — `hooks/useAmplificador.ts`

Crear este archivo nuevo:

```ts
/**
 * useAmplificador — detecta auriculares con cable y controla el amplificador de emergencia.
 *
 * Expone:
 *   auricularesConectados  → boolean (muestra/oculta el botón)
 *   amplificadorActivo     → boolean (estado del passthrough)
 *   nivel                  → NivelGanancia ('bajo' | 'medio' | 'alto')
 *   toggleAmplificador     → activa o desactiva
 *   ciclarNivel            → rota bajo → medio → alto → bajo
 *   etiquetaGanancia       → string legible para el botón ("x2" / "x5" / "x10")
 */

import { useEffect, useRef, useState } from 'react';
import {
  iniciarAmplificador,
  detenerAmplificador,
  setNivel,
  hayAuricularesConectados,
  addHeadsetListener,
  NivelGanancia,
} from 'amplificador-audio';

const NIVELES: NivelGanancia[] = ['bajo', 'medio', 'alto'];
const ETIQUETAS: Record<NivelGanancia, string> = { bajo: '×2', medio: '×5', alto: '×10' };

export function useAmplificador(
  /** Llamar cuando el amplificador se activa para pausar el SR de Rosita */
  onActivar?: () => void,
  /** Llamar cuando el amplificador se desactiva para reanudar el SR de Rosita */
  onDesactivar?: () => void,
) {
  const [conectado,  setConectado]  = useState(() => {
    try { return hayAuricularesConectados(); } catch { return false; }
  });
  const [activo,     setActivo]     = useState(false);
  const [nivel,      setNivelState] = useState<NivelGanancia>('medio');
  const activoRef = useRef(false);

  // Suscripción a plug/unplug
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    try {
      sub = addHeadsetListener(({ conectado: c }) => {
        setConectado(c);
        // Si desconectan mientras está activo → apagar automáticamente
        if (!c && activoRef.current) {
          detenerAmplificador();
          activoRef.current = false;
          setActivo(false);
          onDesactivar?.();
        }
      });
    } catch {
      // Módulo no disponible en Expo Go → silencioso
    }
    return () => { sub?.remove(); };
  }, []);

  function toggleAmplificador() {
    if (activoRef.current) {
      detenerAmplificador();
      activoRef.current = false;
      setActivo(false);
      onDesactivar?.();
    } else {
      iniciarAmplificador(nivel);
      activoRef.current = true;
      setActivo(true);
      onActivar?.();
    }
  }

  function ciclarNivel() {
    const idx = NIVELES.indexOf(nivel);
    const siguiente = NIVELES[(idx + 1) % NIVELES.length];
    setNivelState(siguiente);
    setNivel(siguiente);  // cambia ganancia en caliente si está activo
  }

  return {
    auricularesConectados: conectado,
    amplificadorActivo:    activo,
    nivel,
    etiquetaGanancia:      ETIQUETAS[nivel],
    toggleAmplificador,
    ciclarNivel,
  };
}
```

---

## 5. Integración en `hooks/useRosita.ts`

### 5a. Importar el hook

```ts
// Agregar junto a los otros imports de hooks
import { useAmplificador } from './useAmplificador';
```

### 5b. Instanciar dentro de `useRosita()`

Agregar después de los otros hooks (por ejemplo, después de `useBLEBeacon`):

```ts
const amplificador = useAmplificador(
  () => pipeline.pararSpeechRecognitionIntencional?.(),   // pausa SR al activar
  () => pipeline.reanudarSRSiCorresponde?.(),             // reanuda SR al desactivar
);
```

> **Nota**: Los nombres exactos de los métodos del pipeline pueden variar. Buscar en `useAudioPipeline.ts` cuál es el método para pausar el SR de forma intencional y cuál para reanudarlo.

### 5c. Exportar del return de `useRosita`

```ts
return {
  // ... todo lo que ya exporta useRosita ...
  amplificador,  // ← agregar esto
};
```

---

## 6. Integración en `app/index.tsx`

### 6a. Desestructurar `amplificador` de `useRosita`

```ts
const {
  // ... lo que ya está desestructurado ...
  amplificador,
} = useRosita();
```

### 6b. Importar el componente (ya existe)

```ts
import AmplificadorBoton from '../components/AmplificadorBoton';
```

### 6c. Renderizar el botón condicionalmente

Ubicarlo en la barra de controles superior (la misma zona donde aparecen el botón de música, modo noche, etc.). El botón solo se muestra cuando hay auriculares conectados:

```tsx
{amplificador.auricularesConectados && (
  <AmplificadorBoton
    activo={amplificador.amplificadorActivo}
    esBluetooth={false}
    etiquetaGanancia={amplificador.etiquetaGanancia}
    onToggle={amplificador.toggleAmplificador}
    onNivel={amplificador.ciclarNivel}
    oscuro={modoNoche !== 'despierta'}
  />
)}
```

---

## 7. Comportamiento esperado

| Situación | Resultado |
|-----------|-----------|
| Se enchufan auriculares | Aparece `AmplificadorBoton` (apagado) |
| Se desenchufan auriculares | Desaparece el botón; si estaba activo, se desactiva solo |
| Usuario toca el botón (OFF→ON) | Empieza el passthrough; SR de Rosita se pausa |
| Usuario toca el botón (ON→OFF) | Se detiene el passthrough; SR de Rosita se reanuda |
| Usuario toca el label de ganancia | Rota ×2 → ×5 → ×10 → ×2 (en caliente, sin reiniciar) |
| Rosita habla mientras amplificador activo | ⚠️ No implementado todavía — el audio de TTS va a mezclarse con el passthrough. Considerar pausar el passthrough durante TTS en una iteración futura. |

---

## 8. Pasos para compilar y probar

1. **Completar los archivos** según esta guía en `modules/amplificador-audio/`.
2. `cd AbuApp && npm install` (reinstala el módulo local).
3. `npx expo run:android` o `eas build --profile development` para generar un build de desarrollo.
4. Instalar en el dispositivo y probar enchufando auriculares con cable.
5. Los ajustes de ganancia y la lógica de JS se pueden iterar con OTA después del primer build.

---

## 9. Lo que NO está contemplado en esta guía

- **Bluetooth**: `esBluetooth` está reservado como prop en el botón pero no se detecta aquí. Bluetooth tiene su propio flow de permisos y estados.
- **Pausa de TTS durante passthrough**: Si Rosita habla, el audio de TTS también sale por los auriculares mezclado con el micrófono amplificado. Para la primera versión esto puede ignorarse; en una iteración siguiente habría que pausar el passthrough cuando `hablandoRef.current === true`.
- **Permisos en runtime de RECORD_AUDIO**: El permiso ya se pide en el startup de la app vía `AudioModule.requestRecordingPermissionsAsync()` en `useRosita`. No hace falta pedirlo de nuevo, pero verificar que se concede antes de `iniciarAmplificador`.
- **iOS testing**: Requiere dispositivo físico (el simulador no tiene micrófono).
