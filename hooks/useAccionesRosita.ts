/**
 * useAccionesRosita — interfaz canónica de acciones de la app.
 *
 * Define las acciones de alto nivel que pueden dispararse desde cualquier
 * input: botón táctil, control Bluetooth BLE, teclado accesibilidad, etc.
 *
 * Todas las fuentes de entrada (touch, BLE beacon, futura voz de interrupción)
 * llaman a estas funciones — nunca directamente a los callbacks de useRosita.
 *
 * Gestos del beacon:
 *   Click simple  → para música (si hay) / alterna no molestar
 *   Doble click   → abre flujo foto
 *   Long press 2s → SOS
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { EstadoRosita } from './useBrain';

export interface AccionesRositaDeps {
  estado:                      EstadoRosita;
  musicaActiva:                boolean;
  musicaActivaRef?:            React.MutableRefObject<boolean>;
  bloquearReanudarMusicaRef?:  React.MutableRefObject<boolean>;
  noMolestar:                  boolean;
  pararMusica:                 () => void;
  iniciarFlujoFoto:            () => void;
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
   * Siempre marca la intención explícita del usuario para bloquear reinicios
   * automáticos (p.ej. al terminar una notificación de Telegram que pausó la música).
   */
  const toggleTalkOrStopMusic = useCallback(() => {
    const d = depsRef.current;
    if (d.musicaActiva) { d.pararMusica(); }
    // Bloquear reanudarMusica() aunque musicaActiva ya sea false (p.ej. pausa por notificación)
    if (d.bloquearReanudarMusicaRef) d.bloquearReanudarMusicaRef.current = true;
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
      d.pararSRIntencional();
      d.setNoMolestar(true);
      d.detenerSilbido();
    } else {
      d.setNoMolestar(false);
      // No reiniciar SR si hay música — el SR se apagó por la música, no por No Molestar.
      // Cuando el usuario pare la música, el efecto de musicaActiva arranca el SR solo.
      if (!d.musicaActivaRef?.current) {
        d.iniciarSpeechRecognition();
        d.chequearPendientesAlActivar();
      }
    }
  }, []);

  const pararMusica = useCallback(() => {
    depsRef.current.pararMusica();
  }, []);

  /**
   * Click simple del beacon:
   *  - Si hay música → la para (prioridad máxima)
   *  - Si no → alterna no molestar (on/off)
   */
  const onClickBeacon = useCallback(() => {
    const d = depsRef.current;
    if (d.musicaActiva || d.musicaActivaRef?.current) {
      d.pararMusica();
      if (d.bloquearReanudarMusicaRef) d.bloquearReanudarMusicaRef.current = true;
      return;
    }
    // Alterna no molestar
    toggleDoNotDisturb();
  }, [toggleDoNotDisturb]);

  /**
   * Doble click del beacon → abre el flujo de foto.
   * No hace nada si hay música o si no molestar está activo.
   */
  const onDobleClickBeacon = useCallback(() => {
    const d = depsRef.current;
    if (d.musicaActiva || d.musicaActivaRef?.current) return;
    if (d.noMolestar) return;
    d.iniciarFlujoFoto();
  }, []);

  return useMemo(
    () => ({ toggleTalkOrStopMusic, triggerSOS, toggleDoNotDisturb, pararMusica, onClickBeacon, onDobleClickBeacon }),
    [toggleTalkOrStopMusic, triggerSOS, toggleDoNotDisturb, pararMusica, onClickBeacon, onDobleClickBeacon],
  );
}

export type AccionesRosita = ReturnType<typeof useAccionesRosita>;
