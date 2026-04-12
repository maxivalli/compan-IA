package expo.modules.audiocapture

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*

class AudioCaptureModule : Module() {
  private var audioRecord: AudioRecord? = null
  private var job: Job? = null
  private val scope = CoroutineScope(Dispatchers.IO)

  override fun definition() = ModuleDefinition {
    Name("AudioCaptureModule")

    Events("onAudioData")

    Function("start") { sampleRate: Int, channels: Int, chunkMs: Int ->
      stopCapture()
      val channelConfig = if (channels == 1)
        AudioFormat.CHANNEL_IN_MONO else AudioFormat.CHANNEL_IN_STEREO

      val minBuf = AudioRecord.getMinBufferSize(
        sampleRate, channelConfig, AudioFormat.ENCODING_PCM_16BIT
      )
      val chunkBytes = (sampleRate * channels * 2 * chunkMs) / 1000
      val bufferSize = maxOf(minBuf, chunkBytes * 2)

      audioRecord = AudioRecord(
        MediaRecorder.AudioSource.MIC,
        sampleRate,
        channelConfig,
        AudioFormat.ENCODING_PCM_16BIT,
        bufferSize,
      )
      audioRecord?.startRecording()

      job = scope.launch {
        val buffer = ByteArray(chunkBytes)
        while (isActive) {
          val read = audioRecord?.read(buffer, 0, buffer.size) ?: break
          if (read > 0) {
            val b64 = Base64.encodeToString(
              if (read == buffer.size) buffer else buffer.copyOf(read),
              Base64.NO_WRAP,
            )
            sendEvent("onAudioData", mapOf("data" to b64))
          }
        }
      }
    }

    Function("stop") {
      stopCapture()
    }
  }

  private fun stopCapture() {
    job?.cancel()
    job = null
    try { audioRecord?.stop() } catch (_: Exception) {}
    try { audioRecord?.release() } catch (_: Exception) {}
    audioRecord = null
  }
}
