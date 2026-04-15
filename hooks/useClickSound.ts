import { useCallback, useRef } from 'react';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

export function useClickSound() {
  const player = useAudioPlayer(require('../assets/audio/click.mp3'));

  const playClick = useCallback(async () => {
    try {
      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Reproducir sonido
      if (player.playing) {
        player.seekTo(0);
      } else {
        player.play();
      }
    } catch (error) {
      console.warn('Error al reproducir click:', error);
    }
  }, [player]);

  return { playClick };
}
