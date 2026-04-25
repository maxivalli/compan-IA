import { DeviceEventEmitter } from 'react-native';

export const RECORDATORIOS_LOCAL_ACTUALIZADOS = 'compan_recordatorios_local_actualizados';

export function emitRecordatoriosLocalesActualizados(): void {
  DeviceEventEmitter.emit(RECORDATORIOS_LOCAL_ACTUALIZADOS);
}
