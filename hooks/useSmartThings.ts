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
  actualizarDispositivos,
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
  const dispositivosRef = useRef<Dispositivo[]>([]);
  const inicializacionRef = useRef<Promise<void> | null>(null);

  const normalizeTexto = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      // Evitar \p{L} y \p{N}: Hermes <0.12 (Android 10-) no soporta
      // Unicode property escapes en regex. Usar allow-list explícita.
      .replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const STOPWORDS = new Set([
    'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'al', 'por', 'favor',
    'prende', 'prender', 'enciende', 'encender',
    'apaga', 'apagar', 'apagae', 'apague',
    'luz', 'luces', 'lampara', 'lamparas', 'foco', 'focos',
    'switch', 'enchufe',
  ]);

  const tokensClave = (texto: string) =>
    normalizeTexto(texto)
      .split(' ')
      .filter(Boolean)
      .filter(token => !STOPWORDS.has(token));

  const findDispositivo = (nombre: string, dispositivos = dispositivosRef.current) => {
    const query = normalizeTexto(nombre);
    if (!query) return undefined;

    const exacto = dispositivos.find(dv => normalizeTexto(dv.nombre) === query);
    if (exacto) return exacto;

    const incluido = dispositivos.find(dv => {
      const nombreNorm = normalizeTexto(dv.nombre);
      return nombreNorm.includes(query) || query.includes(nombreNorm);
    });
    if (incluido) return incluido;

    const queryTokens = tokensClave(nombre);
    if (queryTokens.length === 0) return undefined;

    let mejor: { dispositivo: Dispositivo; score: number } | null = null;
    for (const dispositivo of dispositivos) {
      const nombreTokens = new Set(tokensClave(dispositivo.nombre));
      const score = queryTokens.reduce((acc, token) => acc + (nombreTokens.has(token) ? 1 : 0), 0);
      if (score <= 0) continue;
      if (!mejor || score > mejor.score) mejor = { dispositivo, score };
    }

    return mejor?.dispositivo;
  };

  async function refrescarDispositivos(): Promise<Dispositivo[]> {
    const lista = await actualizarDispositivos().catch(() => []);
    if (lista.length > 0) {
      dispositivosRef.current = lista;
      return lista;
    }
    return dispositivosRef.current;
  }

  // ── Inicialización: cargar dispositivos y su estado real ──────────────────
  async function inicializar(): Promise<void> {
    if (inicializacionRef.current) {
      await inicializacionRef.current;
      return;
    }

    inicializacionRef.current = (async () => {
      try {
        const { vinculado, dispositivos } = await obtenerEstadoSmartThings();
        if (!vinculado) {
          dispositivosRef.current = [];
          return;
        }

        // Consultar estado real (encendido/apagado) de cada dispositivo online
        const conEstado = await Promise.all(
          dispositivos.map(async d => {
            if (!d.online) return d;
            try {
              const est = await obtenerEstadoDispositivo(d.id);
              const encendido = est?.['switch'];
              return { ...d, estado: typeof encendido === 'boolean' ? encendido : undefined };
            } catch {
              return d;
            }
          })
        );

        dispositivosRef.current = conEstado;
      } catch {}
    })();

    try {
      await inicializacionRef.current;
    } finally {
      inicializacionRef.current = null;
    }
  }

  // ── Ejecutar acción de domótica ───────────────────────────────────────────
  async function ejecutarAccion(action: DomoticaAction): Promise<void> {
    const { tipo, dispositivoNombre, valor } = action;
    let dispositivos = dispositivosRef.current;

    if (tipo === 'todo') {
      if (dispositivos.length === 0) {
        dispositivos = await refrescarDispositivos();
      }
      // Apagar todos los dispositivos de una vez
      const ok = await controlarTodos(dispositivos, false).then(() => true).catch(() => false);
      if (ok) {
        dispositivosRef.current = dispositivos.map(dv =>
          dv.online ? { ...dv, estado: false } : dv
        );
        await depsRef.current.hablar('Listo, apagué todos los dispositivos de SmartThings.');
      } else {
        await depsRef.current.hablar('No pude apagar los dispositivos de SmartThings.');
      }

    } else if (tipo === 'control') {
      if (dispositivos.length === 0) {
        dispositivos = await refrescarDispositivos();
      }
      let dispositivo = findDispositivo(dispositivoNombre, dispositivos);
      if (!dispositivo) {
        dispositivos = await refrescarDispositivos();
        dispositivo = findDispositivo(dispositivoNombre, dispositivos);
      }

      if (dispositivo) {
        if (!dispositivo.online) {
          await depsRef.current.hablar(`La ${dispositivo.nombre} aparece sin conexión en SmartThings.`);
          return;
        }

      const ok = await controlarDispositivo(dispositivo.id, Boolean(valor));
        if (ok) {
          const est = await obtenerEstadoDispositivo(dispositivo.id).catch(() => null);
          const encendida = est?.['switch'];
          const esperado = Boolean(valor);

          dispositivosRef.current = dispositivos.map(dv =>
            dv.id === dispositivo!.id
              ? { ...dv, estado: typeof encendida === 'boolean' ? encendida : esperado }
              : dv
          );

          if (typeof encendida === 'boolean' && encendida !== esperado) {
            const estadoTexto = encendida ? 'encendida' : 'apagada';
            await depsRef.current.hablar(`Le mandé la orden a ${dispositivo.nombre}, pero SmartThings todavía la muestra ${estadoTexto}.`);
          } else if (encendida === null || encendida === undefined) {
            // GET de verificación falló — no hablar del estado real, el control
            // igual se envió (ok === true). El estado local queda con 'esperado'.
            if (__DEV__) console.log('[SmartThings] GET estado post-control falló, usando valor esperado');
          }
        } else {
          await depsRef.current.hablar(`No pude controlar ${dispositivo.nombre} desde SmartThings.`);
        }
      } else if (dispositivos.length > 0) {
        const sugerencias = dispositivos.slice(0, 3).map(dv => dv.nombre).join(', ');
        await depsRef.current.hablar(`No encontré ese dispositivo en SmartThings. Veo: ${sugerencias}.`);
      } else {
        await depsRef.current.hablar('Todavía no veo dispositivos de SmartThings para controlar.');
      }

    } else if (tipo === 'estado') {
      if (dispositivos.length === 0) {
        dispositivos = await refrescarDispositivos();
      }
      let dispositivo = findDispositivo(dispositivoNombre, dispositivos);
      // Solo refrescar si hay dispositivos pero el nombre no matchea:
      // si el primer refresh ya vino vacío, un segundo fetch no va a ayudar.
      if (!dispositivo && dispositivos.length > 0) {
        dispositivos = await refrescarDispositivos();
        dispositivo = findDispositivo(dispositivoNombre, dispositivos);
      }

      if (dispositivo) {
        const est = await obtenerEstadoDispositivo(dispositivo.id).catch(() => null);
        if (est) {
          const encendida = est['switch'];
          const descripcion = encendida === true
            ? `La ${dispositivo.nombre} está encendida.`
            : encendida === false
              ? `La ${dispositivo.nombre} está apagada.`
              : `No pude determinar el estado de ${dispositivo.nombre}.`;
          dispositivosRef.current = dispositivos.map(dv =>
            dv.id === dispositivo!.id
              ? { ...dv, estado: typeof encendida === 'boolean' ? encendida : dv.estado }
              : dv
          );
          await depsRef.current.hablar(descripcion);
        } else {
          // GET falló (timeout, red caída, etc.) — sin feedback el usuario queda en silencio
          await depsRef.current.hablar(`No pude consultar el estado de ${dispositivo.nombre} ahora mismo.`);
        }
      } else if (dispositivos.length > 0) {
        await depsRef.current.hablar('No encontré ese dispositivo en SmartThings.');
      } else {
        await depsRef.current.hablar('Todavía no veo dispositivos de SmartThings vinculados.');
      }
    }
  }

  return {
    /** Ref con la lista de dispositivos y su estado en memoria. */
    dispositivosTuyaRef: dispositivosRef,
    /** Carga dispositivos y su estado real desde el backend. Llamar en inicializar(). */
    inicializar,
    /** Ejecuta una acción de domótica parseada de la respuesta de Claude. */
    ejecutarAccion,
  };
}
