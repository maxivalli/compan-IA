import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  iniciar, detener, hayAuriculares, esAuricularesBluetooth,
  moduloNativoCargado, errorCargaModulo,
} from '../modules/amplificador-audio/src';

// Niveles de ganancia disponibles: 1.5× → 2× → 3× → apagado
const NIVELES = [1.5, 2.0, 3.0];

export function useAmplificador() {
  const [activo,      setActivo]      = useState(false);
  const [nivelIdx,    setNivelIdx]    = useState(0);   // índice en NIVELES
  const [auriculares, setAuriculares] = useState(false);
  const [esBluetooth, setEsBluetooth] = useState(false);

  const activoRef = useRef(false);

  // Detectar auriculares cada 2 segundos
  useEffect(() => {
    let id: ReturnType<typeof setInterval>;
    let mounted = true;

    async function iniciarDeteccion() {
      // BLUETOOTH_CONNECT + BLUETOOTH_SCAN son runtime permissions en Android 12+ (API 31+).
      // Sin ellos, AudioManager.getDevices() devuelve lista vacía silenciosamente para BT.
      // IMPORTANTE: esto requiere una build nativa — no funciona vía OTA update.
      if (Platform.OS === 'android' && Platform.Version >= 31) {
        // Solicitar ambos permisos. En Android 12+ ambos son necesarios para
        // que AudioManager.getDevices() incluya dispositivos Bluetooth.
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          // BLUETOOTH_SCAN puede no estar en el enum de RN, usar string literal
          'android.permission.BLUETOOTH_SCAN' as any,
        ]);
        // No bloqueamos si se deniegan: el módulo nativo devolverá false en ese caso.
        // El intervalo igual corre para detectar auriculares con cable.
      }

      if (!mounted) return;

      function detectar() {
        const hay = hayAuriculares();
        const bt  = hay ? esAuricularesBluetooth() : false;
        console.log(`[AMP] modulo=${moduloNativoCargado} error="${errorCargaModulo}" hay=${hay} bt=${bt}`);
        setAuriculares(hay);
        setEsBluetooth(bt);

        // Si sacaron los auriculares y el amplificador está activo, apagarlo
        if (!hay && activoRef.current) {
          activoRef.current = false;
          setActivo(false);
          detener();
        }
      }

      detectar(); // check inmediato al obtener el permiso
      id = setInterval(detectar, 15000);
    }

    iniciarDeteccion();
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Reiniciar amplificador cuando cambia el nivel de ganancia
  useEffect(() => {
    if (activoRef.current) {
      detener();
      iniciar(NIVELES[nivelIdx]);
    }
  }, [nivelIdx]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (activoRef.current) detener();
    };
  }, []);

  /** Enciende / apaga el amplificador. */
  const toggleActivo = useCallback(() => {
    if (activoRef.current) {
      activoRef.current = false;
      setActivo(false);
      detener();
    } else {
      activoRef.current = true;
      setActivo(true);
      iniciar(NIVELES[nivelIdx]);
    }
  }, [nivelIdx]);

  /** Cicla al siguiente nivel de ganancia (si está activo, lo aplica de inmediato). */
  const siguienteNivel = useCallback(() => {
    setNivelIdx(prev => (prev + 1) % NIVELES.length);
  }, []);

  return {
    activo,
    ganancia:    NIVELES[nivelIdx],
    nivelIdx,
    auriculares,
    esBluetooth,
    toggleActivo,
    siguienteNivel,
    etiquetaGanancia: `${NIVELES[nivelIdx]}×`,
    // DEBUG — remover cuando BT funcione
    _debug: `mod=${moduloNativoCargado ? 'OK' : 'FAIL'} hay=${auriculares} bt=${esBluetooth}${errorCargaModulo ? ' err:' + errorCargaModulo.slice(0, 40) : ''}`,
  };
}
