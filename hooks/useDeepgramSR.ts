/**
 * useDeepgramSR — Speech Recognition vía Deepgram Nova-3 streaming.
 *
 * Reemplaza expo-speech-recognition con un WebSocket al backend propio
 * que hace de proxy a Deepgram Nova-3 es-419 con interim_results.
 *
 * Flujo:
 *   1. iniciarDG() → obtiene stream ticket → abre WebSocket /audio-ws
 *   2. Al recibir { type: 'ready' } → arranca AudioCapture nativo (PCM16 16kHz)
 *   3. Cada chunk de audio → ws.send(binaryPCM)
 *   4. Backend manda { type: 'partial' } → onPartial (opcional, para especulativo)
 *   5. Backend manda { type: 'final', speech_final: true } → flush acumulador → onFinal
 *      O si pasan 800ms sin nuevo is_final → flush por debounce (fallback)
 *   6. pausarCapturaDG() → para AudioCapture SIN cerrar el WS (anti-eco durante TTS)
 *   7. reanudarCapturaDG() → reactiva AudioCapture; si WS cayó, reconecta primero
 *   8. detenerDG() → cierra WS y detiene AudioCapture
 *   9. Reconexión automática con backoff exponencial (si activoRef = true)
 */

import { useRef, useCallback } from 'react';
import { addAudioDataListener, start as startCapture, stop as stopCapture } from 'audio-capture';
import type { EventSubscription } from 'expo-modules-core';
import { logCliente } from '../lib/ai';

// URL del backend — misma que usa el resto de la app
const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').trim();

// Tiempo sin nuevo is_final antes de forzar el flush del acumulador (fallback
// para cuando speech_final nunca llega).
// Con endpointing:400 Deepgram debería enviar speech_final ~550ms después de que
// el usuario para de hablar (400ms silence + ~150ms red). 300ms garantiza respuesta
// rápida si speech_final falla, sin cortar frases naturales con pausa corta.
const SPEECH_FINAL_DEBOUNCE_MS = 300;

export type DGMessage =
  | { type: 'ready' }
  | { type: 'partial'; text: string; confidence: number }
  | { type: 'final';   text: string; speech_final: boolean; confidence: number };

export type UseDeepgramSROptions = {
  onPartial?:  (texto: string) => void;
  onFinal:     (texto: string) => void;
  onReady:     () => void;
  onError:     (reason: string) => void;
};

export function useDeepgramSR(opts: UseDeepgramSROptions) {
  const wsRef          = useRef<WebSocket | null>(null);
  const activoRef      = useRef(false);
  const audioSubRef    = useRef<EventSubscription | null>(null);
  const reconnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnCount    = useRef(0);
  const optsRef        = useRef(opts);
  optsRef.current      = opts;

  // Acumulador de texto: los is_final llegan como segmentos cortos.
  // Esperamos speech_final=true para el flush; si no llega, forzamos a los 800ms.
  const acumuladorRef  = useRef<string[]>([]);
  const flushTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Anti-eco: cuando Rosita habla, pausamos AudioCapture ─────────────────
  // pausarCapturaDG() para el mic SIN cerrar el WS.
  // reanudarCapturaDG() lo reinicia; si el WS cayó, reconecta primero.
  const capturaActivaRef = useRef(false);

  function detenerAudioCapture() {
    audioSubRef.current?.remove();
    audioSubRef.current = null;
    try { stopCapture(); } catch {}
    capturaActivaRef.current = false;
  }

  function iniciarAudioCapture(ws: WebSocket) {
    if (capturaActivaRef.current) return; // ya activa
    try {
      audioSubRef.current = addAudioDataListener(({ data }) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        try {
          const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
          ws.send(binary.buffer);
        } catch {}
      });
      startCapture({ sampleRate: 16000, channels: 1, chunkMs: 100 });
      capturaActivaRef.current = true;
    } catch (e: any) {
      logCliente('dg_capture_start_error', { reason: e?.message ?? 'unknown' });
    }
  }

  function descartarAcumulador() {
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    acumuladorRef.current = [];
  }

  // Pausa AudioCapture y descarta texto acumulado (anti-eco mientras Rosita habla)
  const pausarCaptura = useCallback(() => {
    descartarAcumulador();
    detenerAudioCapture();
  }, []);

  // Reanuda AudioCapture: si el WS sigue abierto, solo reinicia la captura local.
  // Si el WS está cerrado o no existe, hace una reconexión completa via iniciar().
  const reanudarCaptura = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      iniciarAudioCapture(ws);
    } else {
      // WS caído mientras Rosita hablaba → reconectar
      iniciar();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function flushAcumulador() {
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    const texto = acumuladorRef.current.join(' ').trim();
    acumuladorRef.current = [];
    if (texto) {
      logCliente('dg_final', { chars: texto.length });
      optsRef.current.onFinal(texto);
    }
  }

  function programarFlushDebounce() {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushAcumulador, SPEECH_FINAL_DEBOUNCE_MS);
  }

  const detener = useCallback(() => {
    activoRef.current = false;
    if (reconnTimerRef.current) { clearTimeout(reconnTimerRef.current); reconnTimerRef.current = null; }
    descartarAcumulador();
    detenerAudioCapture();
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    reconnCount.current = 0;
  }, []);

  const iniciar = useCallback(async () => {
    if (activoRef.current) {
      // Si ya está activo pero la captura está pausada, reanudar directo
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && !capturaActivaRef.current) {
        iniciarAudioCapture(ws);
      }
      return;
    }
    activoRef.current = true;
    reconnCount.current = 0;

    async function conectar() {
      if (!activoRef.current) return;

      let ticket: string | null = null;
      try {
        const { obtenerTokenDispositivo } = await import('../lib/ai');
        const deviceToken = await obtenerTokenDispositivo();
        const res = await fetch(`${BACKEND_URL}/ai/stream-ticket`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
        });
        if (res.ok) {
          const data = await res.json();
          ticket = data.ticket ?? null;
        }
      } catch (e: any) {
        logCliente('dg_ticket_error', { reason: e?.message ?? 'unknown' });
      }

      if (!ticket) {
        optsRef.current.onError('sin ticket');
        if (activoRef.current) scheduleReconnect();
        return;
      }

      const wsUrl = BACKEND_URL
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://') + `/audio-ws?tk=${ticket}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnCount.current = 0;
      };

      ws.onmessage = (event) => {
        let msg: DGMessage;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === 'ready') {
          iniciarAudioCapture(ws);
          optsRef.current.onReady();
          logCliente('dg_sr_ready', {});

        } else if (msg.type === 'partial') {
          if (msg.text) optsRef.current.onPartial?.(msg.text);

        } else if (msg.type === 'final') {
          if (!msg.text) return;

          if (msg.speech_final) {
            // speech_final=true: Deepgram confirmó el endpoint de utterance.
            // Reemplazamos el acumulador (en lugar de push) para evitar duplicar
            // el texto: Deepgram envía el mismo transcript en el evento is_final
            // previo (speech_final=false) Y en éste → no acumular dos veces.
            acumuladorRef.current = [msg.text];
            flushAcumulador();
          } else {
            // is_final=true, speech_final=false: segmento intermedio confirmado.
            acumuladorRef.current.push(msg.text);
            programarFlushDebounce();
          }
        }
      };

      ws.onerror = () => {
        logCliente('dg_ws_error', {});
        optsRef.current.onError('ws error');
      };

      ws.onclose = () => {
        detenerAudioCapture();
        descartarAcumulador();
        if (!activoRef.current) return;
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (!activoRef.current) return;
      reconnCount.current += 1;
      const delay = Math.min(1000 * Math.pow(1.5, reconnCount.current - 1), 10000);
      logCliente('dg_reconnect', { attempt: reconnCount.current, delay_ms: delay });
      reconnTimerRef.current = setTimeout(conectar, delay);
    }

    await conectar();
  }, []);

  return {
    iniciarDG:        iniciar,
    detenerDG:        detener,
    pausarCapturaDG:  pausarCaptura,
    reanudarCapturaDG: reanudarCaptura,
  };
}
