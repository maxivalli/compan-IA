import { useCallback } from 'react';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

export function useClickSound() {
  const player = useAudioPlayer(require('../assets/audio/click.mp3'));

  const playClick = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      player.seekTo(0);
      player.play();
    } catch (error) {
      console.warn('Error al reproducir click:', error);
    }
  }, [player]);

  return { playClick };
}
