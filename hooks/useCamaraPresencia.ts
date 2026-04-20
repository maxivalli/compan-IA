import { useCallback, useEffect, useRef, useState } from 'react';
import { Perfil } from '../lib/memoria';

const INACTIVIDAD_MS = 2 * 60 * 1000; // TODO: volver a 30 * 60 * 1000 en producción
const COOLDOWN_MS    =      60 * 1000; // 1 minuto entre detecciones
const POLL_MS        =      15 * 1000; // revisar estado cada 15 s

type Deps = {
  ultimaActividadRef: React.MutableRefObject<number>;
  estadoRef:          React.MutableRefObject<string>;
  hablarRef:          React.MutableRefObject<((texto: string) => Promise<void>) | null>;
  perfilRef:          React.MutableRefObject<Perfil | null>;
  noMolestarRef:      React.MutableRefObject<boolean>;
  musicaActivaRef:    React.MutableRefObject<boolean>;
};

export function useCamaraPresencia({
  ultimaActividadRef,
  estadoRef,
  hablarRef,
  perfilRef,
  noMolestarRef,
  musicaActivaRef,
}: Deps) {
  const [modoWatching,  setModoWatching]  = useState(false);
  const modoWatchingRef = useRef(false);
  const ultimaDeteccion = useRef(0);

  // ── Polling: cada 15 s decide si entrar/salir del modo watching ──────────────
  useEffect(() => {
    function tick() {
      const activo = perfilRef.current?.deteccionPresenciaActiva ?? false;
      if (!activo) {
        if (modoWatchingRef.current) {
          modoWatchingRef.current = false;
          setModoWatching(false);
        }
        return;
      }
      const inactividadMs = Date.now() - ultimaActividadRef.current;
      const debeWatching  = inactividadMs >= INACTIVIDAD_MS;
      if (debeWatching !== modoWatchingRef.current) {
        modoWatchingRef.current = debeWatching;
        setModoWatching(debeWatching);
      }
    }

    tick(); // evaluar inmediatamente al montar (no esperar 15s)
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [ultimaActividadRef, perfilRef]);

  // ── Callback que llama el overlay cuando detecta un rostro ──────────────────
  const onPresenciaDetectada = useCallback(() => {
    if (!modoWatchingRef.current) return;
    if (estadoRef.current !== 'esperando') return;
    // No interrumpir si el usuario activó No Molestar
    if (noMolestarRef.current) return;
    // No interrumpir si hay música sonando
    if (musicaActivaRef.current) return;

    const ahora = Date.now();
    if (ahora - ultimaDeteccion.current < COOLDOWN_MS) return;
    ultimaDeteccion.current = ahora;

    // Salir del modo watching — resetear ultimaActividad para que el polling
    // no reactive watching inmediatamente antes de que el usuario responda.
    modoWatchingRef.current = false;
    setModoWatching(false);
    ultimaActividadRef.current = ahora;

    const perfil = perfilRef.current;
    const nombre = perfil?.nombreAbuela ?? '';

    const frases = nombre ? [
      `¡${nombre}! ¡Qué bueno verte! ¿Cómo andás?`,
      `¡Hola ${nombre}! ¿Querés que charlemos un rato?`,
      `¡${nombre}! ¡Te estaba esperando! ¿Cómo va todo?`,
      `¡Ahí estás, ${nombre}! ¿Todo bien?`,
    ] : [
      '¡Hola! ¿Hay alguien ahí? ¡Acercate que te cuento algo!',
      '¡Ohhh! ¿Quién es? ¡Hola!',
      '¡Hola! ¿Me escuchás?',
    ];

    const texto = frases[Math.floor(Math.random() * frases.length)];
    hablarRef.current?.(texto).catch(() => {});
  }, [estadoRef, hablarRef, perfilRef, ultimaActividadRef, noMolestarRef, musicaActivaRef]);

  return { modoWatching, onPresenciaDetectada };
}
