import { useCallback, useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

export function useClickSound() {
  const player = useAudioPlayer(require('../assets/audio/click.mp3'));

  // Warmup real: un play() silencioso fuerza al decoder a inicializarse
  // completamente al montar. Solo seekTo(0) no alcanza — el pipeline de
  // audio de expo-audio se activa con el primer play().
  useEffect(() => {
    const warmup = async () => {
      try {
        player.muted = true;
        player.play();
        await new Promise<void>(r => setTimeout(r, 150));
        player.pause();
        player.seekTo(0);
        player.muted = false;
      } catch {}
    };
    warmup();
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
