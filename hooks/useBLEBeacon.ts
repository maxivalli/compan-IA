/**
 * useBLEBeacon — control por BLE beacon Holy-IOT (Holyiot HOLYIOT-21014 nRF52810).
 *
 * Se conecta al beacon via GATT y escucha notificaciones en el Nordic UART Service.
 * Mapea los eventos del botón a las acciones canónicas de Rosita.
 *
 * Protocolo observado (5 bytes):
 *   F3 15 F3 [event] [state]
 *   event 0x01 = botón
 *   state 0x01 = presionado  |  0x00 = suelto
 *
 * Gestos:
 *   Click simple   → para música (si hay música) o abre cámara (si no)
 *   Doble click    → toggleDoNotDisturb
 *   Long press 2s  → triggerSOS
 *
 * Se reconecta automáticamente si el dispositivo se desconecta.
 *
 * IMPORTANTE: solo funciona en Android/iOS con build nativo.
 * En web queda en modo silencioso (no hace nada, no rompe).
 */

import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import { AccionesRosita } from './useAccionesRosita';

// ── Configuración del beacon ───────────────────────────────────────────────

/** Nordic UART Service UUID */
const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

/** TX Characteristic — notificaciones del dispositivo hacia la app */
const NUS_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/** Header fijo de los paquetes del beacon (bytes 0-2) */
const HDR = [0xF3, 0x15, 0xF3] as const;

/** Byte [3]: tipo de evento */
const EV_BUTTON = 0x01;

/** Byte [4]: estado del botón */
const ST_PRESSED  = 0x01;
const ST_RELEASED = 0x00;

// ── Timing de gestos ────────────────────────────────────────────────────────

/** Ventana para detectar doble click (ms). */
const DOUBLE_CLICK_WINDOW_MS = 800;

/** Duración para detectar long press (ms). */
const LONG_PRESS_MS = 2000;

/** Delay antes de reintentar conexión tras desconexión (ms). */
const RECONNECT_DELAY_MS = 3000;

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface BLEBeaconDeps {
  acciones:        AccionesRosita;
  /** Ref externo a actualizar con el estado de conexión BLE. */
  conectadoRef?:   React.MutableRefObject<boolean>;
  /** Callback que se dispara cuando cambia el estado de conexión (para actualizar UI). */
  onConexionChange?: (conectado: boolean) => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useBLEBeacon(deps: BLEBeaconDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  /** Ref estable que indica si el beacon está actualmente conectado. */
  const conectadoRef = useRef(false);

  // ── Timing de gestos ──────────────────────────────────────────────────
  const gestureSeqRef     = useRef(0);
  const pendingClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoPresRef     = useRef<number>(0);
  const isPressedRef      = useRef(false);

  const cancelarTimers = useCallback(() => {
    gestureSeqRef.current += 1;
    if (pendingClickTimer.current) { clearTimeout(pendingClickTimer.current); pendingClickTimer.current = null; }
    if (longPressTimer.current)    { clearTimeout(longPressTimer.current);    longPressTimer.current    = null; }
  }, []);

  /**
   * Lógica al detectar botón presionado.
   *
   * Estados posibles:
   *  - Segundo press dentro de la ventana → doble click inmediato.
   *  - Press nuevo → arranca longPress(2s) y ventana de doble click(400ms).
   *    · Si el timer de 400ms dispara y el usuario ya soltó → click simple.
   *    · Si el timer de 400ms dispara y sigue presionado → espera longPress.
   *    · Si el timer de 2s dispara → SOS.
   */
  const onButtonPressed = useCallback(() => {
    const ahora = Date.now();
    const delta = ahora - ultimoPresRef.current;

    // Segundo press dentro de la ventana → doble click
    if (pendingClickTimer.current && delta < DOUBLE_CLICK_WINDOW_MS) {
      cancelarTimers();
      isPressedRef.current = false;
      depsRef.current.acciones.onDobleClickBeacon();
      return;
    }

    cancelarTimers();
    isPressedRef.current = true;
    ultimoPresRef.current = ahora;
    const seq = gestureSeqRef.current;

    // Timer de long press (2s)
    longPressTimer.current = setTimeout(() => {
      if (gestureSeqRef.current !== seq) return;
      longPressTimer.current    = null;
      pendingClickTimer.current = null;
      isPressedRef.current      = false;
      depsRef.current.acciones.triggerSOS();
    }, LONG_PRESS_MS);

    // Ventana de espera doble click (400ms)
    pendingClickTimer.current = setTimeout(() => {
      if (gestureSeqRef.current !== seq) return;
      pendingClickTimer.current = null;
      if (!isPressedRef.current) {
        // Usuario ya soltó → click simple
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        depsRef.current.acciones.onClickBeacon();
      }
      // Si sigue presionado → el longPress timer lo maneja
    }, DOUBLE_CLICK_WINDOW_MS);
  }, [cancelarTimers]);

  /** Al soltar el botón: cancela long press. El pendingClick sigue corriendo. */
  const onButtonReleased = useCallback(() => {
    isPressedRef.current = false;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  /** Parsea una notificación del beacon y despacha el evento correspondiente. */
  const procesarNotificacion = useCallback((value: string | null) => {
    if (!value) return;
    try {
      const bytes = Buffer.from(value, 'base64');
      if (bytes.length < 5) return;
      if (bytes[0] !== HDR[0] || bytes[1] !== HDR[1] || bytes[2] !== HDR[2]) return;

      const eventType  = bytes[3];
      const eventState = bytes[4];

      if (__DEV__) {
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('-');
        console.log(`[BLEBeacon] notif: ${hex}`);
      }

      if (eventType === EV_BUTTON) {
        if (eventState === ST_PRESSED)  onButtonPressed();
        if (eventState === ST_RELEASED) onButtonReleased();
        return;
      }

    } catch {
      // silencioso
    }
  }, [onButtonPressed, onButtonReleased]);

  // Ref estable para evitar dependencias en el useEffect
  const procesarRef = useRef(procesarNotificacion);
  procesarRef.current = procesarNotificacion;

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let mounted = true;
    let manager: any = null;
    let subscription: any  = null;
    let disconnectSub: any = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function limpiarConexion() {
      try { subscription?.remove?.();   } catch {}
      try { disconnectSub?.remove?.();  } catch {}
      subscription  = null;
      disconnectSub = null;
    }

    function scheduleReconectar() {
      conectadoRef.current = false;
      if (deps.conectadoRef) deps.conectadoRef.current = false;
      depsRef.current.onConexionChange?.(false);
      limpiarConexion();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(() => {
        if (!mounted) return;
        reconnectTimeout = null;
        conectar();
      }, RECONNECT_DELAY_MS);
    }

    async function conectar() {
      if (!mounted || !manager) return;
      limpiarConexion();

      try {
        // Escanear hasta encontrar Holy-IOT
        const device = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            manager.stopDeviceScan();
            reject(new Error('scan timeout'));
          }, 15000);

          manager.startDeviceScan(null, null, (error: any, dev: any) => {
            if (!mounted) { clearTimeout(timeout); manager.stopDeviceScan(); return; }
            if (error)    { clearTimeout(timeout); manager.stopDeviceScan(); reject(error); return; }
            const nombre = (dev?.name ?? dev?.localName ?? '').toUpperCase();
            if (nombre.includes('HOLY-IOT') || nombre.includes('HOLYIOT')) {
              clearTimeout(timeout);
              manager.stopDeviceScan();
              resolve(dev);
            }
          });
        });

        if (!mounted) return;

        const connectTimeout = <T>(ms: number, msg: string): Promise<T> =>
          new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms));

        const connected = await Promise.race([
          device.connect(),
          connectTimeout<never>(10_000, 'connect timeout'),
        ]);
        await Promise.race([
          connected.discoverAllServicesAndCharacteristics(),
          connectTimeout<never>(10_000, 'discover timeout'),
        ]);

        // Manejar desconexión inesperada
        disconnectSub = manager.onDeviceDisconnected(connected.id, () => {
          if (mounted) scheduleReconectar();
        });

        // Suscribir a notificaciones del TX characteristic
        subscription = connected.monitorCharacteristicForService(
          NUS_SERVICE_UUID,
          NUS_TX_UUID,
          (_error: any, char: any) => {
            if (_error) { if (mounted) scheduleReconectar(); return; }
            procesarRef.current(char?.value ?? null);
          }
        );

        conectadoRef.current = true;
        if (deps.conectadoRef) deps.conectadoRef.current = true;
        depsRef.current.onConexionChange?.(true);
        console.log('[BLEBeacon] conectado a Holy-IOT');

      } catch (err) {
        console.warn('[BLEBeacon] error conectando:', err);
        if (mounted) scheduleReconectar();
      }
    }

    async function iniciar() {
      try {
        const { BleManager: BM } = await import('react-native-ble-plx');
        manager = new BM();

        // Esperar a que el adaptador BLE esté encendido
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('BLE init timeout')), 10000);
          const sub = manager.onStateChange((state: string) => {
            if (state === 'PoweredOn') {
              clearTimeout(timeout);
              sub.remove();
              resolve();
            }
            if (state === 'Unsupported' || state === 'Unauthorized') {
              clearTimeout(timeout);
              sub.remove();
              reject(new Error(state));
            }
          }, true);
        });

        await conectar();
      } catch (err) {
        console.warn('[BLEBeacon] No disponible:', err);
      }
    }

    iniciar();

    return () => {
      mounted = false;
      conectadoRef.current = false;
      if (deps.conectadoRef) deps.conectadoRef.current = false;
      cancelarTimers();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      limpiarConexion();
      try { manager?.destroy?.(); } catch {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { conectadoRef };
}
