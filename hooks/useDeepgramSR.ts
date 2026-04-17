/**
 * useDeepgramSR — Speech Recognition vía Deepgram Nova-3 streaming.
 *
 * Conecta directamente a wss://api.deepgram.com/v1/listen usando una
 * temporary API key obtenida del backend. Auth vía Sec-WebSocket-Protocol
 * (subprotocolo 'token') — única forma de pasar auth + enviar binario en RN.
 *
 * Flujo:
 *   1. iniciarDG() → obtiene temp key del backend (/ai/deepgram-token)
 *   2. Abre WebSocket directo a Deepgram con subprotocolo ['token', key]
 *   3. Al conectar → arranca AudioCapture nativo (PCM16 16kHz)
 *   4. Cada chunk de audio → ws.send(binaryPCM)
 *   5. Deepgram manda Results con is_final=false → onPartial (especulativo)
 *   6. Deepgram manda Results con is_final=true, speech_final=true → flush → onFinal
 *      O si pasan 300ms sin nuevo is_final → flush por debounce (fallback)
 *   7. pausarCapturaDG() → para AudioCapture SIN cerrar el WS (anti-eco durante TTS)
 *   8. reanudarCapturaDG() → reactiva AudioCapture; si WS cayó, reconecta primero
 *   9. detenerDG() → cierra WS y detiene AudioCapture
 *  10. Reconexión automática con backoff exponencial (si activoRef = true)
 */

import { useRef, useCallback } from 'react';
import { addAudioDataListener, start as startCapture, stop as stopCapture } from 'audio-capture';
import type { EventSubscription } from 'expo-modules-core';
import { logCliente, obtenerTokenDispositivo } from '../lib/ai';

const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').trim();
const DG_WS_URL =
  'wss://api.deepgram.com/v1/listen' +
  '?model=nova-3' +
  '&language=es-419' +
  '&smart_format=true' +
  '&interim_results=true' +
  '&endpointing=250' +
  '&utterance_end_ms=1000' +
  '&vad_events=true' +
  '&encoding=linear16' +
  '&sample_rate=16000' +
  '&channels=1';

const SPEECH_FINAL_DEBOUNCE_MS = 300;

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

  const acumuladorRef  = useRef<string[]>([]);
  const flushTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturaActivaRef = useRef(false);

  function detenerAudioCapture() {
    audioSubRef.current?.remove();
    audioSubRef.current = null;
    try { stopCapture(); } catch {}
    capturaActivaRef.current = false;
  }

  function iniciarAudioCapture(ws: WebSocket) {
    if (capturaActivaRef.current) return;
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

  const pausarCaptura = useCallback(() => {
    descartarAcumulador();
    detenerAudioCapture();
  }, []);

  const reanudarCaptura = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      iniciarAudioCapture(ws);
    } else if (ws && ws.readyState === WebSocket.CONNECTING) {
      return;
    } else {
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

      // Obtener temporary key del backend
      let dgKey: string | null = null;
      try {
        const deviceToken = await obtenerTokenDispositivo();
        const res = await fetch(`${BACKEND_URL}/ai/deepgram-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
        });
        if (res.ok) {
          const data = await res.json();
          dgKey = data.key ?? null;
        }
      } catch (e: any) {
        logCliente('dg_token_error', { reason: e?.message ?? 'unknown' });
      }

      if (!dgKey) {
        optsRef.current.onError('sin token deepgram');
        if (activoRef.current) scheduleReconnect();
        return;
      }

      if (!activoRef.current) return;

      // Subprotocolo 'token' — forma oficial de autenticar desde clientes móviles/web
      // sin usar el tercer argumento del constructor (que rompe binary send en RN).
      const ws = new WebSocket(DG_WS_URL, ['token', dgKey]);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnCount.current = 0;
        iniciarAudioCapture(ws);
        optsRef.current.onReady();
      };

      ws.onmessage = (event) => {
        let msg: any;
        try { msg = JSON.parse(event.data); } catch { return; }

        // Deepgram emite varios tipos: Results, Metadata, SpeechStarted, UtteranceEnd, etc.
        if (msg.type === 'Results') {
          const alt = msg?.channel?.alternatives?.[0];
          const text: string = (alt?.transcript ?? '').trim();
          if (!text) return;

          const isFinal: boolean = msg.is_final ?? false;
          const speechFinal: boolean = msg.speech_final ?? false;

          if (!isFinal) {
            optsRef.current.onPartial?.(text);
          } else if (speechFinal) {
            acumuladorRef.current = [text];
            flushAcumulador();
          } else {
            acumuladorRef.current.push(text);
            programarFlushDebounce();
          }
        }
      };

      ws.onerror = () => {
        logCliente('dg_ws_error', {});
        optsRef.current.onError('ws error');
      };

      ws.onclose = (event) => {
        detenerAudioCapture();
        descartarAcumulador();
        logCliente('dg_ws_close', { code: event.code });
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
    iniciarDG:          iniciar,
    detenerDG:          detener,
    pausarCapturaDG:    pausarCaptura,
    reanudarCapturaDG:  reanudarCaptura,
  };
}
