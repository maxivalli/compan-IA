/**
 * useSmartThings — domótica Samsung SmartThings.
 *
 * Responsabilidades:
 *   - Estado en memoria de los dispositivos (dispositivosTuyaRef)
 *   - Carga inicial desde el backend al iniciar sesión
 *   - Ejecución de acciones de domótica: encender, apagar, consultar estado
 *
 * NO gestiona: audio, SR, Claude, historial, sensores, perfil.
 * Recibe hablar() a través de SmartThingsDeps para respuestas de estado.
 */

import { useRef } from 'react';
import {
  obtenerEstadoSmartThings, obtenerEstadoDispositivo,
  controlarDispositivo, controlarTodos,
  Dispositivo,
} from '../lib/smartthings';

// ── Tipo de acción domótica (espeja RespuestaParsed['domotica'] de claudeParser) ──

export type DomoticaAction = {
  tipo: 'control' | 'estado' | 'todo';
  dispositivoNombre: string;
  codigo: string;
  valor?: boolean | number;
};

// ── Interfaz de dependencias ──────────────────────────────────────────────────

export interface SmartThingsDeps {
  /** Hablar en voz alta — para respuestas de consulta de estado. */
  hablar: (texto: string, emotion?: string) => Promise<void>;
}

// ── useSmartThings ────────────────────────────────────────────────────────────

export function useSmartThings(deps: SmartThingsDeps) {
  // depsRef — evita stale closures en funciones async
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // ── Estado de dispositivos ────────────────────────────────────────────────
  const dispositivosTuyaRef = useRef<Dispositivo[]>([]);

  // ── Inicialización: cargar dispositivos y su estado real ──────────────────
  async function inicializar(): Promise<void> {
    obtenerEstadoSmartThings().then(async ({ vinculado, dispositivos }) => {
      if (!vinculado) return;
      // Consultar estado real (encendido/apagado) de cada dispositivo online
      const conEstado = await Promise.all(
        dispositivos.map(async d => {
          if (!d.online) return d;
          try {
            const est = await obtenerEstadoDispositivo(d.id);
            const encendido = est?.['switch'];
            return { ...d, estado: typeof encendido === 'boolean' ? encendido : undefined };
          } catch { return d; }
        })
      );
      dispositivosTuyaRef.current = conEstado;
    }).catch(() => {});
  }

  // ── Ejecutar acción de domótica ───────────────────────────────────────────
  async function ejecutarAccion(action: DomoticaAction): Promise<void> {
    const { tipo, dispositivoNombre, valor } = action;
    const dispositivos = dispositivosTuyaRef.current;

    if (tipo === 'todo') {
      // Apagar todos los dispositivos de una vez
      await controlarTodos(dispositivos, false).catch(() => {});
      dispositivosTuyaRef.current = dispositivos.map(dv =>
        dv.online ? { ...dv, estado: false } : dv
      );

    } else if (tipo === 'control') {
      const dispositivo = dispositivos.find(dv =>
        dv.nombre.toLowerCase().includes(dispositivoNombre.toLowerCase()) ||
        dispositivoNombre.toLowerCase().includes(dv.nombre.toLowerCase())
      );
      if (dispositivo) {
        controlarDispositivo(dispositivo.id, Boolean(valor)).catch(() => {});
        dispositivosTuyaRef.current = dispositivos.map(dv =>
          dv.id === dispositivo.id ? { ...dv, estado: Boolean(valor) } : dv
        );
      }

    } else if (tipo === 'estado') {
      const dispositivo = dispositivos.find(dv =>
        dv.nombre.toLowerCase().includes(dispositivoNombre.toLowerCase()) ||
        dispositivoNombre.toLowerCase().includes(dv.nombre.toLowerCase())
      );
      if (dispositivo) {
        const est = await obtenerEstadoDispositivo(dispositivo.id).catch(() => null);
        if (est) {
          const encendida = est['switch'];
          const descripcion = encendida === true
            ? `La ${dispositivo.nombre} está encendida.`
            : encendida === false
              ? `La ${dispositivo.nombre} está apagada.`
              : `No pude determinar el estado de ${dispositivo.nombre}.`;
          dispositivosTuyaRef.current = dispositivos.map(dv =>
            dv.id === dispositivo.id
              ? { ...dv, estado: typeof encendida === 'boolean' ? encendida : dv.estado }
              : dv
          );
          await depsRef.current.hablar(descripcion);
        }
      }
    }
  }

  return {
    /** Ref con la lista de dispositivos y su estado en memoria. */
    dispositivosTuyaRef,
    /** Carga dispositivos y su estado real desde el backend. Llamar en inicializar(). */
    inicializar,
    /** Ejecuta una acción de domótica parseada de la respuesta de Claude. */
    ejecutarAccion,
  };
}
