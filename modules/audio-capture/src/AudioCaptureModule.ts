import { NativeModulesProxy, EventEmitter, Subscription } from 'expo-modules-core';

const AudioCaptureNativeModule = NativeModulesProxy.AudioCaptureModule;
const emitter = new EventEmitter(AudioCaptureNativeModule ?? {});

export interface AudioCaptureOptions {
  sampleRate?: number; // default 16000
  channels?: number;  // default 1 (mono)
  chunkMs?: number;   // default 100
}

export function start(options: AudioCaptureOptions = {}): void {
  AudioCaptureNativeModule.start(
    options.sampleRate ?? 16000,
    options.channels ?? 1,
    options.chunkMs ?? 100,
  );
}

export function stop(): void {
  AudioCaptureNativeModule.stop();
}

// Cada chunk: base64 string de PCM16 little-endian
export function addAudioDataListener(
  listener: (chunk: { data: string }) => void,
): Subscription {
  return emitter.addListener('onAudioData', listener);
}
