import { requireNativeModule, EventEmitter, Subscription } from 'expo-modules-core';

const PersonaDetectorNative = requireNativeModule('PersonaDetector');
const emitter = new EventEmitter(PersonaDetectorNative);

export function startDetection(): void {
  PersonaDetectorNative.startDetection();
}

export function stopDetection(): void {
  PersonaDetectorNative.stopDetection();
}

export function addPersonDetectedListener(callback: () => void): Subscription {
  return emitter.addListener('onPersonDetected', callback);
}

export function addDebugLabelListener(callback: (label: string) => void): Subscription {
  return emitter.addListener('onDebugLabel', (event: { label: string }) =>
    callback(event.label)
  );
}
