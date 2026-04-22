import { useCallback, useEffect } from 'react';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// Mantener la referencia global, pero iniciarla lazily (en el cliente)
// para evitar que crashee el servidor (SSR) de Expo Router o al evaluar el bundle.
let globalClickPlayer: AudioPlayer | null = null;

export function initClickSound() {
  // Evitar SSR
  if (typeof window === 'undefined' || globalClickPlayer) return;
  try {
    globalClickPlayer = createAudioPlayer(require('../assets/audio/click.mp3'));
    // Warmup silencioso en el arranque
    globalClickPlayer.muted = true;
    globalClickPlayer.play();
    setTimeout(() => {
      try {
        if (globalClickPlayer) {
          globalClickPlayer.pause();
          globalClickPlayer.seekTo(0);
          globalClickPlayer.muted = false;
        }
      } catch {}
    }, 150);
  } catch (err) {
    console.warn('Error iniciando click player:', err);
  }
}

export function useClickSound() {
  useEffect(() => {
    // Fallback por si acaso algún componente lo llama antes que el layout
    initClickSound();
  }, []);

  const playClick = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (globalClickPlayer) {
        globalClickPlayer.seekTo(0);
        globalClickPlayer.play();
      }
    } catch {}
  }, []);

  return { playClick };
}
