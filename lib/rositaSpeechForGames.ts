/**
 * Puente entre useAudioPipeline (pantalla principal) y las pantallas de juego.
 * Al abrir tateti / memoria / ahorcado hay que suspender el SR continuo de Rosita;
 * si no, sigue escuchando y dispara useBrain con cualquier frase.
 */

let suspender: (() => void) | null = null;
let reanudar: (() => void) | null = null;

export function registerRositaSpeechForGames(s: () => void, r: () => void): void {
  suspender = s;
  reanudar = r;
}

export function unregisterRositaSpeechForGames(): void {
  suspender = null;
  reanudar = null;
}

/** Llamar al montar la pantalla de juego (antes de iniciar el SR propio del juego). */
export function pausarSRPrincipalParaJuego(): void {
  suspender?.();
}

/** Llamar al desmontar la pantalla de juego (después de detener el SR del juego). */
export function reanudarSRPrincipalTrasJuego(): void {
  reanudar?.();
}
