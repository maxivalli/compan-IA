import ExpoModulesCore
import AVFoundation

public class AudioCaptureModule: Module {
  private var audioEngine: AVAudioEngine?
  private var tapInstalled = false

  public func definition() -> ModuleDefinition {
    Name("AudioCaptureModule")
    Events("onAudioData")

    Function("start") { (sampleRate: Int, channels: Int, chunkMs: Int) in
      self.stopCapture()
      let engine = AVAudioEngine()
      self.audioEngine = engine
      let input = engine.inputNode

      // Pedimos al hardware el formato nativo y convertimos a PCM16 16kHz mono
      let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: Double(sampleRate),
        channels: AVAudioChannelCount(channels),
        interleaved: true
      )!

      let bufferSize = AVAudioFrameCount((sampleRate * chunkMs) / 1000)

      // installTap siempre en el formato nativo del hardware,
      // luego convertimos via AVAudioConverter
      let hardwareFormat = input.outputFormat(forBus: 0)
      let converter = AVAudioConverter(from: hardwareFormat, to: targetFormat)

      let hwBuffer = AVAudioFrameCount(
        Double(bufferSize) * hardwareFormat.sampleRate / targetFormat.sampleRate
      )

      input.installTap(onBus: 0, bufferSize: hwBuffer, format: hardwareFormat) { buffer, _ in
        guard let converter = converter else { return }
        let outBuffer = AVAudioPCMBuffer(
          pcmFormat: targetFormat,
          frameCapacity: bufferSize
        )!
        var error: NSError?
        var inputDone = false
        let status = converter.convert(to: outBuffer, error: &error) { _, outStatus in
          if inputDone {
            outStatus.pointee = .noDataNow
            return nil
          }
          inputDone = true
          outStatus.pointee = .haveData
          return buffer
        }
        guard status != .error, let channelData = outBuffer.int16ChannelData else { return }
        let frameLength = Int(outBuffer.frameLength)
        let bytes = UnsafeBufferPointer(start: channelData[0], count: frameLength)
        let data = Data(buffer: bytes)
        let b64 = data.base64EncodedString()
        self.sendEvent("onAudioData", ["data": b64])
      }
      self.tapInstalled = true

      try? engine.start()
    }

    Function("stop") {
      self.stopCapture()
    }
  }

  private func stopCapture() {
    if tapInstalled {
      audioEngine?.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
    audioEngine?.stop()
    audioEngine = nil
  }
}
