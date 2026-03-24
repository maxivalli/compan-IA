package expo.modules.amplificadoraudio

import android.content.Context
import android.media.*
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min

/**
 * Amplificador de audio en tiempo real.
 *
 * Cadena de señal:
 *   AudioRecord (micrófono) → filtro IIR pasa-alto 300 Hz → ganancia → AudioTrack (auricular)
 *
 * El filtro pasa-alto de primer orden elimina el rumble grave (< 300 Hz).
 * La ganancia se aplica linealmente con limitador de pico para evitar distorsión.
 *
 * Usamos:
 *   - VOICE_COMMUNICATION como fuente (incluye cancelación de eco del SO)
 *   - 16000 Hz sample rate — suficiente para voz y minimiza tamaño de buffer (menor latencia)
 *   - STREAM_MUSIC para que enrute automáticamente a auriculares si están conectados
 */
class AmplificadorAudioModule : Module() {

  private var audioRecord: AudioRecord?      = null
  private var audioTrack:  AudioTrack?       = null
  @Volatile private var isRunning            = false
  private var processingThread: Thread?      = null

  override fun definition() = ModuleDefinition {
    Name("AmplificadorAudio")

    Function("iniciar") { ganancia: Double ->
      iniciar(ganancia.toFloat())
    }

    Function("detener") {
      detener()
    }

    Function("hayAuriculares") {
      val am = appContext.reactContext
        ?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      // GET_DEVICES_ALL cubre input + output: algunos auriculares BT solo aparecen
      // como dispositivo de entrada hasta que el audio se enruta activamente
      am?.getDevices(AudioManager.GET_DEVICES_ALL)?.any { device ->
        when (device.type) {
          AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
          AudioDeviceInfo.TYPE_WIRED_HEADSET,
          AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> true
          else -> {
            val s = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            val isBle = s && (device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                              device.type == AudioDeviceInfo.TYPE_BLE_SPEAKER)
            val isBroadcast = Build.VERSION.SDK_INT >= 33 &&
                              device.type == AudioDeviceInfo.TYPE_BLE_BROADCAST
            isBle || isBroadcast
          }
        }
      } ?: false
    }

    Function("esAuricularesBluetooth") {
      val am = appContext.reactContext
        ?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      am?.getDevices(AudioManager.GET_DEVICES_ALL)?.any { device ->
        when (device.type) {
          AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> true
          else -> {
            val s = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            val isBle = s && (device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                              device.type == AudioDeviceInfo.TYPE_BLE_SPEAKER)
            val isBroadcast = Build.VERSION.SDK_INT >= 33 &&
                              device.type == AudioDeviceInfo.TYPE_BLE_BROADCAST
            isBle || isBroadcast
          }
        }
      } ?: false
    }
  }

  // ── Lógica privada ────────────────────────────────────────────────────────

  private fun iniciar(ganancia: Float) {
    detener() // limpiar sesión anterior

    val sampleRate = 16000
    val minBuf     = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    // 2× el mínimo: balance entre latencia y estabilidad
    val bufferSize = minBuf * 2

    audioRecord = AudioRecord(
      MediaRecorder.AudioSource.VOICE_COMMUNICATION, // incluye AEC del sistema
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      bufferSize
    )

    audioTrack = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .build()
      )
      .setBufferSizeInBytes(bufferSize)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()

    isRunning = true
    audioRecord?.startRecording()
    audioTrack?.play()

    val clampedGain = min(max(ganancia, 1.0f), 4.0f)

    // ── Hilo de procesamiento de audio ───────────────────────────────────
    processingThread = Thread {
      val buf = ShortArray(bufferSize / 2)

      // Filtro IIR pasa-alto de primer orden a 300 Hz
      // Elimina el rumble grave sin afectar las frecuencias del habla
      //   y(n) = α * (y(n-1) + x(n) - x(n-1))
      //   α = RC / (RC + dt),  RC = 1 / (2π × fc)
      val rc    = 1.0 / (2.0 * PI * 300.0)
      val dt    = 1.0 / sampleRate
      val alpha = rc / (rc + dt)   // ≈ 0.9998 a 16kHz
      var prevIn  = 0.0
      var prevOut = 0.0

      while (isRunning) {
        val read = audioRecord?.read(buf, 0, buf.size) ?: break
        if (read <= 0) continue

        for (i in 0 until read) {
          // Normalizar a [-1.0, 1.0]
          val x = buf[i].toDouble() / Short.MAX_VALUE

          // Aplicar filtro pasa-alto
          val y = alpha * (prevOut + x - prevIn)
          prevIn  = x
          prevOut = y

          // Amplificar con limitador de pico (previene distorsión)
          val amplified = (y * clampedGain * Short.MAX_VALUE)
            .coerceIn(Short.MIN_VALUE.toDouble(), Short.MAX_VALUE.toDouble())
          buf[i] = amplified.toInt().toShort()
        }

        audioTrack?.write(buf, 0, read)
      }
    }.also { it.start() }
  }

  private fun detener() {
    isRunning = false
    processingThread?.join(300)
    processingThread = null

    audioRecord?.stop()
    audioRecord?.release()
    audioRecord = null

    audioTrack?.stop()
    audioTrack?.release()
    audioTrack = null
  }
}
