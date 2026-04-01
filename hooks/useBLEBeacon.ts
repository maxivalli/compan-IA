/**
 * useBLEBeacon — control por BLE beacon (Holyiot HOLYIOT-21014 nRF52810).
 *
 * Escanea en background buscando el beacon por UUID de servicio 0x5242.
 * Decodifica el manufacturer data y mapea eventos a las acciones canónicas.
 *
 * Eventos soportados:
 *   Click simple   → toggleTalkOrStopMusic
 *   Click largo 2s → triggerSOS
 *   Doble click    → toggleDoNotDisturb
 *   Caída          → onCaida (solo activo en modo horizontal)
 *
 * ─── PAYLOAD MAPPING (ajustar cuando llegue el dispositivo) ───────────────
 * Los bytes exactos están en BEACON_PAYLOAD. Están marcados con TODO para
 * que sea fácil encontrarlos y ajustarlos una vez que se pruebe el beacon.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * IMPORTANTE: este hook solo funciona en Android/iOS con build nativo.
 * En Expo Go o web queda en modo silencioso (no hace nada, no rompe).
 */

import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { AccionesRosita } from './useAccionesRosita';

// ── Configuración del beacon ───────────────────────────────────────────────

/** UUID de servicio del beacon Holyiot nRF52810. */
const BEACON_SERVICE_UUID = '0x5242';

/**
 * Bytes del manufacturer data que identifican cada evento.
 * TODO: ajustar cuando llegue el dispositivo físico y se pueda verificar.
 */
const BEACON_PAYLOAD = {
  /** Botón presionado (click). */
  BUTTON_PRESS: 0x06,
  /** Movimiento / caída detectada por acelerómetro. */
  FALL_OR_SHAKE: 0x04,
  /** Doble click (si el firmware lo soporta como evento distinto). */
  DOUBLE_CLICK: 0x08,    // TODO: verificar con el dispositivo real
  /** Long press directo del firmware (alternativa al timing de la app). */
  LONG_PRESS: 0x0A,      // TODO: verificar con el dispositivo real
} as const;

/**
 * Índice del byte en el manufacturer data que contiene el tipo de evento.
 * TODO: verificar con el dispositivo real.
 */
const PAYLOAD_EVENT_BYTE_INDEX = 10;

// ── Timing de gestos (app-side) ────────────────────────────────────────────

/** Ventana para detectar doble click (ms). */
const DOUBLE_CLICK_WINDOW_MS = 400;

/** Duración de long press si el firmware no lo reporta directamente (ms). */
const LONG_PRESS_MS = 2000;

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface BLEBeaconDeps {
  acciones:    AccionesRosita;
  /** Solo cuando es true se procesa la detección de caídas. */
  modoHorizontal: boolean;
  /** Callback de caída detectada. */
  onCaida: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useBLEBeacon(deps: BLEBeaconDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const bleManagerRef = useRef<any>(null);
  const bleStateSubRef = useRef<any>(null);
  const gestureSeqRef = useRef(0);

  // Timing de gestos app-side
  const ultimoClickRef    = useRef<number>(0);
  const pendingClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Cancela timers de gesto pendientes. */
  const cancelarTimers = useCallback(() => {
    gestureSeqRef.current += 1;
    if (pendingClickTimer.current) { clearTimeout(pendingClickTimer.current); pendingClickTimer.current = null; }
    if (longPressTimer.current)    { clearTimeout(longPressTimer.current);    longPressTimer.current    = null; }
  }, []);

  /**
   * Procesa un evento de botón recibido del beacon.
   * Lógica de timing:
   *  1. Si llega DOUBLE_CLICK o LONG_PRESS directo del firmware → los usa tal cual.
   *  2. Si llega BUTTON_PRESS → timing app-side:
   *     - Inicia timer de long press (2s).
   *     - Si llega otro BUTTON_PRESS antes de DOUBLE_CLICK_WINDOW_MS → doble click.
   *     - Si no llega nada en DOUBLE_CLICK_WINDOW_MS → click simple (al soltar).
   *
   * Nota: como el beacon emite advertising packets (no conexión), no hay evento
   * "button released". El long press se detecta si el beacon sigue emitiendo el
   * mismo byte durante 2s O si soporta un byte distinto para long press.
   * TODO: ajustar la lógica de long press cuando se pruebe el dispositivo real.
   */
  const procesarEventoBoton = useCallback((eventByte: number) => {
    const { acciones } = depsRef.current;
    const ahora = Date.now();

    // ── Long press reportado por firmware ─────────────────────────────────
    if (eventByte === BEACON_PAYLOAD.LONG_PRESS) {
      cancelarTimers();
      acciones.triggerSOS();
      return;
    }

    // ── Doble click reportado por firmware ────────────────────────────────
    if (eventByte === BEACON_PAYLOAD.DOUBLE_CLICK) {
      cancelarTimers();
      acciones.toggleDoNotDisturb();
      return;
    }

    // ── Click simple: timing app-side ────────────────────────────────────
    if (eventByte === BEACON_PAYLOAD.BUTTON_PRESS) {
      const deltaDesdeUltimo = ahora - ultimoClickRef.current;
      ultimoClickRef.current = ahora;

      // Si ya hay un click pendiente dentro de la ventana → doble click
      if (pendingClickTimer.current && deltaDesdeUltimo < DOUBLE_CLICK_WINDOW_MS) {
        cancelarTimers();
        acciones.toggleDoNotDisturb();
        return;
      }

      // Cancelar longPress anterior (nuevo click llegó antes)
      cancelarTimers();
      const gestureSeq = gestureSeqRef.current;

      // Iniciar timer de long press
      longPressTimer.current = setTimeout(() => {
        if (gestureSeqRef.current !== gestureSeq) return;
        longPressTimer.current = null;
        pendingClickTimer.current = null;
        acciones.triggerSOS();
      }, LONG_PRESS_MS);

      // Iniciar timer de "esperar doble click"
      pendingClickTimer.current = setTimeout(() => {
        if (gestureSeqRef.current !== gestureSeq) return;
        pendingClickTimer.current = null;
        // Si no llegó un segundo click y el long press no disparó → click simple
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
          acciones.toggleTalkOrStopMusic();
        }
      }, DOUBLE_CLICK_WINDOW_MS);
    }
  }, [cancelarTimers]);

  /** Procesa un evento de caída/sacudón del acelerómetro. */
  const procesarCaida = useCallback(() => {
    if (!depsRef.current.modoHorizontal) return; // solo en modo horizontal
    depsRef.current.onCaida();
  }, []);

  /**
   * Parsea el manufacturer data de un advertising packet del beacon.
   * Devuelve el byte de evento en PAYLOAD_EVENT_BYTE_INDEX o null si
   * el paquete no es del beacon esperado.
   * TODO: ajustar el parsing cuando se tenga el dispositivo real.
   */
  const parsearPayload = useCallback((manufacturerData: string | null): number | null => {
    if (!manufacturerData) return null;
    try {
      // manufacturerData viene en base64 desde react-native-ble-plx
      const bytes = Buffer.from(manufacturerData, 'base64');
      if (bytes.length <= PAYLOAD_EVENT_BYTE_INDEX) return null;
      return bytes[PAYLOAD_EVENT_BYTE_INDEX];
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // En web o Expo Go el módulo nativo no existe — modo silencioso
    if (Platform.OS === 'web') return;

    let BleManager: any;

    async function iniciar() {
      try {
        const { BleManager: BM } = await import('react-native-ble-plx');
        BleManager = new BM();
        bleManagerRef.current = BleManager;

        // Esperar a que el adaptador BLE esté encendido
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            bleStateSubRef.current?.remove?.();
            bleStateSubRef.current = null;
            reject(new Error('BLE init timeout'));
          }, 10000);

          const sub = BleManager.onStateChange((state: string) => {
            if (state === 'PoweredOn') {
              clearTimeout(timeout);
              sub.remove();
              bleStateSubRef.current = null;
              resolve();
            }
            if (state === 'Unsupported' || state === 'Unauthorized') {
              clearTimeout(timeout);
              sub.remove();
              bleStateSubRef.current = null;
              reject(new Error(state));
            }
          }, true);
          bleStateSubRef.current = sub;
        });

        // Escaneo continuo — sin conectar, solo advertising packets
        BleManager.startDeviceScan(
          null,           // sin filtro de UUID acá (filtramos por payload abajo)
          { allowDuplicates: true },
          (error: any, device: any) => {
            if (error || !device) return;

            // Filtrar por nombre o UUID de servicio
            // TODO: ajustar el filtro cuando se conozca el nombre exacto del beacon
            const nombre: string = device.name ?? device.localName ?? '';
            const esBeacon =
              nombre.toLowerCase().includes('holyiot') ||
              (device.serviceUUIDs ?? []).some((u: string) =>
                u.toLowerCase() === BEACON_SERVICE_UUID.toLowerCase() ||
                u.toLowerCase() === '5242'
              );

            if (!esBeacon) return;

            const eventByte = parsearPayload(device.manufacturerData);
            if (eventByte === null) return;

            if (eventByte === BEACON_PAYLOAD.FALL_OR_SHAKE) {
              procesarCaida();
            } else {
              procesarEventoBoton(eventByte);
            }
          }
        );

      } catch (err) {
        // BLE no disponible o sin permisos — silencioso
        console.warn('[BLEBeacon] No disponible:', err);
      }
    }

    iniciar();

    return () => {
      cancelarTimers();
      try { bleManagerRef.current?.stopDeviceScan?.(); } catch {}
      try { bleStateSubRef.current?.remove?.(); } catch {}
      bleStateSubRef.current = null;
      bleManagerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
