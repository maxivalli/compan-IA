// Servicio de reproducción de react-native-track-player.
// Maneja eventos remotos (notificación, auriculares, pantalla de bloqueo).
// Debe ser un módulo CommonJS — RNTP lo carga desde un worker nativo separado.
import TrackPlayer, { Event } from 'react-native-track-player';

module.exports = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay,  () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop,  () => TrackPlayer.reset());
};
