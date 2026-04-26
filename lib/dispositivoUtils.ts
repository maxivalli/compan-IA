import { PixelRatio } from 'react-native';

// PixelRatio ≤ 2 → HD (720p) o menor → teléfono de gama baja / clase ≤3GB RAM.
// Se usa para reducir la cantidad de partículas animadas y aliviar el hilo JS.
// Sin react-native-device-info ni expo-device: evaluado una sola vez al cargar el módulo.
export const esDispositivoGamaBaja: boolean = PixelRatio.get() <= 2;
