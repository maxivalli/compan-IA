import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export type DetectionOptions = {
  confianzaMinima?: number;
  etiquetas?: string[];
};

const PersonaDetectorNative = requireOptionalNativeModule<{
  startDetection(options: DetectionOptions | null): void;
  stopDetection(): void;
  addListener(event: string, listener: (...args: any[]) => void): EventSubscription;
}>('PersonaDetector');

export const ETIQUETAS_DEFAULT: string[] = [
  'person', 'human', 'people', 'man', 'woman', 'boy', 'girl',
  'adult', 'child', 'elder', 'senior',
  'face', 'head', 'body', 'skin', 'hair',
];

export function startDetection(options?: DetectionOptions): void {
  PersonaDetectorNative?.startDetection(options ?? null);
}

export function stopDetection(): void {
  PersonaDetectorNative?.stopDetection();
}

export function addPersonDetectedListener(callback: () => void): EventSubscription {
  if (!PersonaDetectorNative) return { remove: () => {} };
  return PersonaDetectorNative.addListener('onPersonDetected', callback as any);
}

export function addDebugLabelListener(callback: (label: string) => void): EventSubscription {
  if (!PersonaDetectorNative) return { remove: () => {} };
  return PersonaDetectorNative.addListener('onDebugLabel', (e: { label: string }) =>
    callback(e.label)
  );
}
