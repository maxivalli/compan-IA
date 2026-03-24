import { requireNativeModule } from 'expo-modules-core';

// Graceful fallback cuando corre en Expo Go o web
const noop = () => {};
const noopFalse = () => false;

let Mod: {
  iniciar(ganancia: number): void;
  detener(): void;
  hayAuriculares(): boolean;
  esAuricularesBluetooth(): boolean;
};

try {
  Mod = requireNativeModule('AmplificadorAudio');
} catch {
  Mod = {
    iniciar:               noop,
    detener:               noop,
    hayAuriculares:        noopFalse,
    esAuricularesBluetooth: noopFalse,
  };
}

/** Inicia el amplificador con la ganancia dada (1.0 = sin amplificación, 4.0 = máximo). */
export function iniciar(ganancia: number): void {
  Mod.iniciar(Math.min(Math.max(ganancia, 1.0), 4.0));
}

/** Detiene el amplificador y libera recursos de audio. */
export function detener(): void {
  Mod.detener();
}

/** Devuelve true si hay auriculares conectados (con cable o Bluetooth). */
export function hayAuriculares(): boolean {
  return Mod.hayAuriculares();
}

/** Devuelve true si los auriculares conectados son Bluetooth. */
export function esAuricularesBluetooth(): boolean {
  return Mod.esAuricularesBluetooth();
}
