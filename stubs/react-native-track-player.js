// No-op stub for react-native-track-player on web.
// This module uses native APIs (TurboModuleRegistry, NativeModules) that don't
// exist in a browser context. All methods are safe no-ops.

const noop = () => {};
const noopAsync = () => Promise.resolve();

const TrackPlayer = {
  setupPlayer: noopAsync,
  updateOptions: noopAsync,
  add: noopAsync,
  load: noopAsync,
  reset: noopAsync,
  play: noopAsync,
  pause: noopAsync,
  stop: noopAsync,
  seekTo: noopAsync,
  seekBy: noopAsync,
  setVolume: noopAsync,
  getVolume: () => Promise.resolve(1),
  setRate: noopAsync,
  getRate: () => Promise.resolve(1),
  getProgress: () => Promise.resolve({ position: 0, duration: 0, buffered: 0 }),
  getPlaybackState: () => Promise.resolve({ state: 'none' }),
  getQueue: () => Promise.resolve([]),
  getActiveTrackIndex: () => Promise.resolve(undefined),
  getActiveTrack: () => Promise.resolve(undefined),
  skip: noopAsync,
  skipToNext: noopAsync,
  skipToPrevious: noopAsync,
  move: noopAsync,
  remove: noopAsync,
  removeUpcomingTracks: noopAsync,
  setQueue: noopAsync,
  setRepeatMode: noopAsync,
  getRepeatMode: () => Promise.resolve(0),
  updateMetadataForTrack: noopAsync,
  updateNowPlayingMetadata: noopAsync,
  retry: noopAsync,
  registerPlaybackService: noop,
  addEventListener: () => ({ remove: noop }),
};

export const Capability = {
  Play: 1,
  PlayFromId: 2,
  PlayFromSearch: 3,
  Pause: 4,
  Stop: 5,
  SeekTo: 6,
  Skip: 7,
  SkipToNext: 8,
  SkipToPrevious: 9,
  JumpForward: 10,
  JumpBackward: 11,
  SetRating: 12,
};

export const State = {
  None: 'none',
  Ready: 'ready',
  Playing: 'playing',
  Paused: 'paused',
  Stopped: 'stopped',
  Buffering: 'buffering',
  Loading: 'loading',
  Error: 'error',
};

export const Event = {
  PlaybackState: 'playback-state',
  PlaybackError: 'playback-error',
  PlaybackQueueEnded: 'playback-queue-ended',
  PlaybackActiveTrackChanged: 'playback-active-track-changed',
  PlaybackProgressUpdated: 'playback-progress-updated',
  RemotePlay: 'remote-play',
  RemotePause: 'remote-pause',
  RemoteStop: 'remote-stop',
  RemoteSkip: 'remote-skip',
  RemoteSkipToNext: 'remote-next',
  RemoteSkipToPrevious: 'remote-previous',
  RemoteJumpForward: 'remote-jump-forward',
  RemoteJumpBackward: 'remote-jump-backward',
  RemoteSeek: 'remote-seek',
  RemoteSetRating: 'remote-set-rating',
  RemoteDuck: 'remote-duck',
};

export const RepeatMode = {
  Off: 0,
  Track: 1,
  Queue: 2,
};

export const RatingType = {
  Heart: 0,
  ThumbsUpDown: 1,
  ThreeStars: 2,
  FourStars: 3,
  FiveStars: 4,
  Percentage: 5,
};

export function usePlaybackState() {
  return { state: State.None };
}

export function useProgress() {
  return { position: 0, duration: 0, buffered: 0 };
}

export function useActiveTrack() {
  return undefined;
}

export function useActiveTrackIndex() {
  return undefined;
}

export function useQueue() {
  return [];
}

export function useIsPlaying() {
  return { playing: false, bufferingDuringPlay: false };
}

export default TrackPlayer;
