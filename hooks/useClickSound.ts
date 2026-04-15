import { useCallback, useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

export function useClickSound() {
  const player = useAudioPlayer(require('../assets/audio/click.mp3'));

  // Calentar el player al montar para que el primer click suene sin demora.
  // seekTo(0) sin play() fuerza la carga y decodificación del audio en background.
  useEffect(() => {
    try { player.seekTo(0); } catch {}
  }, []);

  const playClick = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      player.seekTo(0);
      player.play();
    } catch {}
  }, [player]);

  return { playClick };
}
