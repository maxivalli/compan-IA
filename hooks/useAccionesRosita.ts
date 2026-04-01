/**
 * useAccionesRosita — interfaz canónica de acciones de la app.
 *
 * Define las 3 acciones de alto nivel que pueden dispararse desde cualquier
 * input: botón táctil, control Bluetooth BLE, teclado accesibilidad, etc.
 *
 * Todas las fuentes de entrada (touch, BLE beacon, futura voz de interrupción)
 * llaman a estas funciones — nunca directamente a los callbacks de useRosita.
 */

import { useCallback, useRef } from 'react';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { EstadoRosita } from './useBrain';

export interface AccionesRositaDeps {
  estado:                      EstadoRosita;
  musicaActiva:                boolean;
  noMolestar:                  boolean;
  iniciarEscucha:              () => Promise<void>;
  detenerEscucha:              () => Promise<void>;
  pararMusica:                 () => void;
  dispararSOS:                 () => Promise<void>;
  setNoMolestar:               (v: boolean) => void;
  iniciarSpeechRecognition:    () => void;
  detenerSilbido:              () => void;
  chequearPendientesAlActivar: () => void;
}

export function useAccionesRosita(deps: AccionesRositaDeps) {
  // depsRef — evita stale closures cuando las acciones se llaman desde BLE
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const safeStopSpeechRecognition = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
      return true;
    } catch (error) {
      console.warn('[AccionesRosita] No pude detener SR al activar no molestar:', error);
      return false;
    }
  }, []);

  /**
   * Acción principal: hablar si está esperando, parar grabación si está
   * escuchando, o parar música si está sonando.
   */
  const toggleTalkOrStopMusic = useCallback(() => {
    const d = depsRef.current;
    if (d.musicaActiva)            { d.pararMusica();    return; }
    if (d.estado === 'escuchando') { d.detenerEscucha(); return; }
    if (d.estado === 'esperando')  { d.iniciarEscucha();         }
  }, []);

  /** Envía alerta SOS a todos los contactos familiares. */
  const triggerSOS = useCallback(() => {
    depsRef.current.dispararSOS();
  }, []);

  /** Alterna el modo No Molestar. Detiene SR al activar; lo reinicia al desactivar. */
  const toggleDoNotDisturb = useCallback(() => {
    const d = depsRef.current;
    const nuevo = !d.noMolestar;
    if (nuevo) {
      const stopped = safeStopSpeechRecognition();
      if (!stopped) return;
      d.setNoMolestar(true);
      d.detenerSilbido();
    } else {
      d.setNoMolestar(false);
      d.iniciarSpeechRecognition();
      d.chequearPendientesAlActivar();
    }
  }, [safeStopSpeechRecognition]);

  return { toggleTalkOrStopMusic, triggerSOS, toggleDoNotDisturb };
}

export type AccionesRosita = ReturnType<typeof useAccionesRosita>;
