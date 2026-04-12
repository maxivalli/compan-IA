import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

// En SDK 52+, el módulo nativo retornado por requireNativeModule ya es un EventEmitter.
// Usamos requireOptionalNativeModule para no crashear en builds JS-only (tests, web).
const AudioCaptureNativeModule = requireOptionalNativeModule<{
  start(sampleRate: number, channels: number, chunkMs: number): void;
  stop(): void;
  addListener(event: string, listener: (...args: any[]) => void): EventSubscription;
}>('AudioCaptureModule');

export interface AudioCaptureOptions {
  sampleRate?: number; // default 16000
  channels?: number;  // default 1 (mono)
  chunkMs?: number;   // default 100
}

export function start(options: AudioCaptureOptions = {}): void {
  AudioCaptureNativeModule?.start(
    options.sampleRate ?? 16000,
    options.channels ?? 1,
    options.chunkMs ?? 100,
  );
}

export function stop(): void {
  AudioCaptureNativeModule?.stop();
}

// Cada chunk: base64 string de PCM16 little-endian
export function addAudioDataListener(
  listener: (chunk: { data: string }) => void,
): EventSubscription {
  if (!AudioCaptureNativeModule) {
    // Fallback no-op para builds sin módulo nativo
    return { remove: () => {} };
  }
  return AudioCaptureNativeModule.addListener('onAudioData', listener as any);
}
