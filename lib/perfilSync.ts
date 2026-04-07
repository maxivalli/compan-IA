import { DeviceEventEmitter } from 'react-native';

/** Emite cuando el perfil en disco cambió (p. ej. guardar en Configuración). useRosita escucha para alinear estado y heartbeat. */
export const PERFIL_LOCAL_GUARDADO = 'compan_perfil_local_guardado';

export function emitPerfilLocalGuardado(): void {
  DeviceEventEmitter.emit(PERFIL_LOCAL_GUARDADO);
}
