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
 *   5. Backend manda { type: 'final', speech_final: true } → onFinal
 *   6. detenerDG() → cierra WS y detiene AudioCapture
 *   7. Reconexión automática con backoff exponencial (si activoRef = true)
 */

import { useRef, useCallback } from 'react';
import { addAudioDataListener, start as startCapture, stop as stopCapture } from 'audio-capture';
import type { EventSubscription } from 'expo-modules-core';
import { logCliente } from '../lib/ai';

// URL del backend — misma que usa el resto de la app
const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').trim();

export type DGMessage =
  | { type: 'ready' }
  | { type: 'partial'; text: string; confidence: number }
  | { type: 'final';   text: string; speech_final: boolean; confidence: number };

export type UseDeepgramSROptions = {
  onPartial?:  (texto: string) => void; // opcional — para ejecución especulativa
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
  // Guardamos siempre la versión más fresca de los callbacks
  const optsRef        = useRef(opts);
  optsRef.current      = opts;

  const detener = useCallback(() => {
    activoRef.current = false;
    if (reconnTimerRef.current) { clearTimeout(reconnTimerRef.current); reconnTimerRef.current = null; }
    audioSubRef.current?.remove();
    audioSubRef.current = null;
    try { stopCapture(); } catch {}
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    reconnCount.current = 0;
  }, []);

  const iniciar = useCallback(async () => {
    if (activoRef.current) return;
    activoRef.current = true;
    reconnCount.current = 0;

    async function conectar() {
      if (!activoRef.current) return;

      // Pedir stream ticket al backend (reutiliza el mecanismo ya existente)
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

      // Convertir URL HTTP → WS
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
          // WS listo → arrancar captura de audio nativo
          try {
            audioSubRef.current = addAudioDataListener(({ data }) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              try {
                // base64 → ArrayBuffer → enviar como binario PCM16
                const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0));
                ws.send(binary.buffer);
              } catch {}
            });
            startCapture({ sampleRate: 16000, channels: 1, chunkMs: 100 });
            optsRef.current.onReady();
            logCliente('dg_sr_ready', {});
          } catch (e: any) {
            logCliente('dg_capture_start_error', { reason: e?.message ?? 'unknown' });
            optsRef.current.onError('capture start error');
          }

        } else if (msg.type === 'partial') {
          if (msg.text) optsRef.current.onPartial?.(msg.text);

        } else if (msg.type === 'final') {
          if (msg.text && msg.speech_final) {
            logCliente('dg_final', { chars: msg.text.length, conf: Math.round((msg.confidence ?? 0) * 100) });
            optsRef.current.onFinal(msg.text);
          }
        }
      };

      ws.onerror = () => {
        logCliente('dg_ws_error', {});
        optsRef.current.onError('ws error');
      };

      ws.onclose = () => {
        // Limpiar captura de audio
        audioSubRef.current?.remove();
        audioSubRef.current = null;
        try { stopCapture(); } catch {}

        if (!activoRef.current) return; // cierre intencional — no reconectar
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (!activoRef.current) return;
      reconnCount.current += 1;
      // Backoff exponencial: 1s, 1.5s, 2.25s, ... máx 10s
      const delay = Math.min(1000 * Math.pow(1.5, reconnCount.current - 1), 10000);
      logCliente('dg_reconnect', { attempt: reconnCount.current, delay_ms: delay });
      reconnTimerRef.current = setTimeout(conectar, delay);
    }

    await conectar();
  }, []);

  return { iniciarDG: iniciar, detenerDG: detener, dgActivoRef: activoRef };
}
