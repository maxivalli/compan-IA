/**
 * musicaPlayer — wrapper de react-native-track-player implementando AudioPlayerLike.
 *
 * Permite usar RNTP (audio en segundo plano) con la misma interfaz síncrona
 * que usaba expo-audio en useBrain y useAudioPipeline, sin cambios en esos hooks.
 *
 * Estado (playing, currentTime) se cachea y se actualiza vía eventos RNTP.
 * Las operaciones async se encolan para garantizar el orden replace→play.
 */

import TrackPlayer, { Capability, Event, State } from 'react-native-track-player';

// ── Estado cacheado (lectura síncrona desde el watchdog de useBrain) ──────────

let _playing      = false;
let _currentTime  = 0;
let _volume       = 0.45;
let _pausedByUser = false; // true cuando el usuario pausó desde la notificación/lock screen
let _setupPromise: Promise<void> | null = null;
let _progressTimer: ReturnType<typeof setInterval> | null = null;

function iniciarProgressTimer() {
  if (_progressTimer) return;
  _progressTimer = setInterval(async () => {
    try {
      const p = await TrackPlayer.getProgress();
      _currentTime = p.position;
    } catch {}
  }, 2000);
}

function detenerProgressTimer() {
  if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
}

// ── Setup idempotente ─────────────────────────────────────────────────────────

export function setupMusicaPlayer(): Promise<void> {
  if (_setupPromise) return _setupPromise;
  _setupPromise = (async () => {
    try {
      await TrackPlayer.setupPlayer();
      await TrackPlayer.updateOptions({
        capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      });
      TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
        const wasPlaying = _playing;
        _playing = state === State.Playing || state === State.Buffering;
        if (_playing && !wasPlaying) iniciarProgressTimer();
        else if (!_playing && wasPlaying) detenerProgressTimer();
      });
      TrackPlayer.addEventListener(Event.RemotePause, () => {
        _pausedByUser = true;
        TrackPlayer.pause().catch(() => {});
      });
      TrackPlayer.addEventListener(Event.RemotePlay, () => {
        _pausedByUser = false;
        TrackPlayer.play().catch(() => {});
      });
    } catch {
      // setupPlayer puede lanzar si ya fue llamado — es seguro ignorarlo
    }
  })();
  return _setupPromise;
}

// ── Cola de operaciones (garantiza orden replace→play incluso siendo async) ───

let _opQueue: Promise<void> = Promise.resolve();

function enqueue(fn: () => Promise<void>): void {
  _opQueue = _opQueue.then(fn).catch(() => {});
}

// ── Interfaz pública — satisface AudioPlayerLike de useBrain ─────────────────

export const musicaPlayer = {
  get playing()       { return _playing; },
  get currentTime()   { return _currentTime; },
  get volume()        { return _volume; },
  get pausedByUser()  { return _pausedByUser; },

  set volume(v: number) {
    _volume = v;
    enqueue(async () => { await TrackPlayer.setVolume(v); });
  },

  /** Carga un stream de radio o archivo de audio. Llamar play() después. */
  replace(source: object | null): void {
    const streamUri = source ? (source as { uri?: string }).uri ?? null : null;
    if (!streamUri) {
      _playing     = false;
      _currentTime = 0;
      detenerProgressTimer();
      enqueue(async () => { try { await TrackPlayer.reset(); } catch {} });
      return;
    }
    // Streams en vivo: radios y HLS sin extensión de archivo estática.
    const isLive = !streamUri.match(/\.(mp3|aac|m4a|ogg|flac|wav|opus)(\?|$)/i);
    _currentTime  = 0;
    _pausedByUser = false;
    enqueue(async () => {
      await setupMusicaPlayer();
      await TrackPlayer.reset();
      await TrackPlayer.add({
        url: streamUri,
        title:       isLive ? 'Radio' : 'Audio',
        artist:      'CompañIA',
        isLiveStream: isLive,
      });
      await TrackPlayer.setVolume(_volume);
    });
  },

  play(): void {
    enqueue(async () => {
      await setupMusicaPlayer();
      await TrackPlayer.play();
    });
  },

  pause(): void {
    enqueue(async () => { try { await TrackPlayer.pause(); } catch {} });
  },
};
