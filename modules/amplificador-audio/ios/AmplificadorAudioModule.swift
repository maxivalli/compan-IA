import ExpoModulesCore
import AVFoundation

// Amplificador de audio en tiempo real usando AVAudioEngine.
// Cadena de señal: micrófono → filtro EQ (pasa-banda 300–3800 Hz) → mixer (ganancia) → auricular
//
// El filtro pasa-banda elimina:
//   - rumble grave (< 300 Hz): ventiladores, golpes, movimiento
//   - silbido agudo (> 3800 Hz): ruido electrónico
// Dejando solo las frecuencias del habla humana (300–3800 Hz).
//
// La ganancia se limita a 4.0× para evitar distorsión y daño auditivo.

public class AmplificadorAudioModule: Module {
  private var engine: AVAudioEngine?

  public func definition() -> ModuleDefinition {
    Name("AmplificadorAudio")

    // Inicia la amplificación. ganancia: 1.0 (sin amplificar) a 4.0 (máximo).
    Function("iniciar") { [weak self] (ganancia: Float) throws in
      try self?.iniciar(ganancia: ganancia)
    }

    // Detiene la amplificación y libera la sesión de audio.
    Function("detener") { [weak self] in
      self?.detener()
    }

    // Devuelve true si hay auriculares conectados (cable o Bluetooth).
    Function("hayAuriculares") { () -> Bool in
      let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
      return outputs.contains {
        $0.portType == .headphones      ||
        $0.portType == .bluetoothHFP    ||
        $0.portType == .bluetoothA2DP
      }
    }

    // Devuelve true si los auriculares son Bluetooth (útil para advertir sobre latencia).
    Function("esAuricularesBluetooth") { () -> Bool in
      let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
      return outputs.contains {
        $0.portType == .bluetoothHFP || $0.portType == .bluetoothA2DP
      }
    }
  }

  // MARK: - Lógica privada

  private func iniciar(ganancia: Float) throws {
    detener() // limpiar sesión anterior si la hay

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord,
      mode: .default,
      // allowBluetooth: enruta a auriculares BT si están conectados
      // mixWithOthers: no interrumpe el TTS de Rosita
      options: [.allowBluetooth, .allowBluetoothA2DP, .mixWithOthers]
    )
    try session.setActive(true)

    let audioEngine = AVAudioEngine()
    let mixerNode   = AVAudioMixerNode()
    let eqNode      = AVAudioUnitEQ(numberOfBands: 2)

    // Pasa-alto a 300 Hz — elimina rumble y vibraciones graves
    eqNode.bands[0].filterType = .highPass
    eqNode.bands[0].frequency  = 300
    eqNode.bands[0].bypass     = false

    // Pasa-bajo a 3800 Hz — elimina hiss y ruido electrónico agudo
    eqNode.bands[1].filterType = .lowPass
    eqNode.bands[1].frequency  = 3800
    eqNode.bands[1].bypass     = false

    audioEngine.attach(eqNode)
    audioEngine.attach(mixerNode)

    let inputNode   = audioEngine.inputNode
    let inputFormat = inputNode.outputFormat(forBus: 0)
    // Usar mono para minimizar latencia y uso de CPU
    let monoFormat  = AVAudioFormat(
      standardFormatWithSampleRate: inputFormat.sampleRate,
      channels: 1
    )!

    // input → EQ → mixer → output
    audioEngine.connect(inputNode, to: eqNode,    format: inputFormat)
    audioEngine.connect(eqNode,    to: mixerNode, format: inputFormat)
    audioEngine.connect(mixerNode, to: audioEngine.outputNode, format: monoFormat)

    // Limitar ganancia: máximo 4× para evitar distorsión
    mixerNode.outputVolume = min(max(ganancia, 1.0), 4.0)

    try audioEngine.start()
    self.engine = audioEngine
  }

  private func detener() {
    engine?.stop()
    engine = nil
    try? AVAudioSession.sharedInstance().setActive(
      false,
      options: .notifyOthersOnDeactivation
    )
  }
}
