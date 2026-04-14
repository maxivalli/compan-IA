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
import { EstadoRosita } from './useBrain';

export interface AccionesRositaDeps {
  estado:                      EstadoRosita;
  musicaActiva:                boolean;
  noMolestar:                  boolean;
  pararMusica:                 () => void;
  dispararSOS:                 () => Promise<void>;
  setNoMolestar:               (v: boolean) => void;
  iniciarSpeechRecognition:    () => void;
  pararSRIntencional:          () => void;
  detenerSilbido:              () => void;
  chequearPendientesAlActivar: () => void;
}

export function useAccionesRosita(deps: AccionesRositaDeps) {
  // depsRef — evita stale closures cuando las acciones se llaman desde BLE
  const depsRef = useRef(deps);
  depsRef.current = deps;

  /**
   * Acción principal: para la música si está sonando (toque en cara, BLE beacon).
   */
  const toggleTalkOrStopMusic = useCallback(() => {
    const d = depsRef.current;
    if (d.musicaActiva) { d.pararMusica(); }
  }, []);

  /** Envía alerta SOS a todos los contactos familiares. */
  const triggerSOS = useCallback(() => {
    // El SOS se dispara aunque noMolestar esté activo — es intencional.
    depsRef.current.dispararSOS();
  }, []);

  /** Alterna el modo No Molestar. Detiene SR al activar; lo reinicia al desactivar. */
  const toggleDoNotDisturb = useCallback(() => {
    const d = depsRef.current;
    const nuevo = !d.noMolestar;
    if (nuevo) {
      // pararSRIntencional pausa AudioCapture (Deepgram) sin cerrar el WS.
      d.pararSRIntencional();
      d.setNoMolestar(true);
      d.detenerSilbido();
    } else {
      d.setNoMolestar(false);
      d.iniciarSpeechRecognition();
      d.chequearPendientesAlActivar();
    }
  }, []);

  return { toggleTalkOrStopMusic, triggerSOS, toggleDoNotDisturb };
}

export type AccionesRosita = ReturnType<typeof useAccionesRosita>;
