/**
 * chatWs — Cliente WebSocket persistente para Claude streaming.
 *
 * Mantiene una sola conexión WS al backend (/chat-ws) mientras la app
 * está activa, eliminando el TCP+TLS handshake por turno (~500-700ms).
 *
 * Flujo:
 *   1. initChatWs({ getToken, log }) → abre WS y queda conectado
 *   2. sendTurn(turnId, body, callbacks) → envía el turno, recibe chunks vía callbacks
 *   3. El WS se reconecta automáticamente con backoff si cae
 *   4. Si el WS no está listo, sendTurn retorna null → llamador cae a XHR
 */

const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').trim();
const CHAT_WS_URL = BACKEND_URL.replace(/^http/, 'ws') + '/chat-ws';

const PING_INTERVAL_MS   = 25000; // Railway idle timeout = 30s
const RECONNECT_BASE_MS  = 500;
const RECONNECT_MAX_MS   = 10000;

type TurnCallbacks = {
  onPrimeraFrase?: (primera: string, tag: string) => void;
  onChunk:         (text: string) => void;
  onDone:          (full: string) => void;
  onError:         (reason: string) => void;
};

type PendingTurn = TurnCallbacks & { cancelled: boolean };

type ChatWsOptions = {
  getToken: () => Promise<string>;
  log:      (event: string, data?: Record<string, string | number | boolean>) => void;
};

let ws: WebSocket | null = null;
let opts: ChatWsOptions | null = null;
let active = false;
let reconnCount = 0;
let reconnTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;

const pendingTurns = new Map<string, PendingTurn>();

export function initChatWs(options: ChatWsOptions): void {
  opts = options;
  active = true;
  reconnCount = 0;
  connect();
}

export function destroyChatWs(): void {
  active = false;
  clearTimers();
  pendingTurns.forEach(t => t.onError('ws_destroyed'));
  pendingTurns.clear();
  try { ws?.close(); } catch {}
  ws = null;
}

// Devuelve una función cancel() si el WS está listo, o null si hay que usar XHR.
export function sendTurn(
  turnId: string,
  body: Record<string, unknown>,
  callbacks: TurnCallbacks,
): (() => void) | null {
  if (!ws || ws.readyState !== WebSocket.OPEN) return null;

  const pending: PendingTurn = { ...callbacks, cancelled: false };
  pendingTurns.set(turnId, pending);

  try {
    ws.send(JSON.stringify({ turn_id: turnId, ...body }));
  } catch {
    pendingTurns.delete(turnId);
    return null;
  }

  return () => {
    if (pending.cancelled) return;
    pending.cancelled = true;
    pendingTurns.delete(turnId);
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'cancel', turn_id: turnId })); } catch {}
    }
  };
}

export function isChatWsReady(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

// ── Internals ─────────────────────────────────────────────────────────────────

function clearTimers() {
  if (pingTimer)   { clearInterval(pingTimer);   pingTimer   = null; }
  if (reconnTimer) { clearTimeout(reconnTimer);  reconnTimer = null; }
}

async function connect() {
  if (!active || !opts) return;

  let token: string;
  try { token = await opts.getToken(); } catch (e: any) {
    opts?.log('chat_ws_token_error', { reason: e?.message ?? 'unknown' });
    scheduleReconnect();
    return;
  }

  if (!active) return;

  // RN WebSocket acepta un 3er arg { headers } aunque los tipos no lo declaren
  const RNWebSocket = WebSocket as any;
  const socket: WebSocket = new RNWebSocket(CHAT_WS_URL, [], {
    headers: { 'x-device-token': token },
  });
  ws = socket;

  socket.onopen = () => {
    reconnCount = 0;
    opts?.log('chat_ws_open');
    pingTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ type: 'ping' })); } catch {}
      }
    }, PING_INTERVAL_MS);
  };

  socket.onmessage = (event: MessageEvent) => {
    let msg: any;
    try { msg = JSON.parse(event.data as string); } catch { return; }

    const { turn_id, type } = msg;
    if (!turn_id) return;

    const turn = pendingTurns.get(turn_id);
    if (!turn || turn.cancelled) return;

    if (type === 'primera_frase') {
      turn.onPrimeraFrase?.(String(msg.primera ?? '').trim(), String(msg.tag ?? 'NEUTRAL'));
    } else if (type === 'chunk') {
      turn.onChunk(String(msg.text ?? ''));
    } else if (type === 'done') {
      pendingTurns.delete(turn_id);
      turn.onDone(String(msg.full ?? ''));
    } else if (type === 'error') {
      pendingTurns.delete(turn_id);
      turn.onError(String(msg.reason ?? 'unknown'));
    }
  };

  socket.onerror = () => {
    opts?.log('chat_ws_error');
  };

  socket.onclose = (event: CloseEvent) => {
    clearTimers();
    ws = null;
    opts?.log('chat_ws_close', { code: event.code });

    // Fallar los turnos pendientes para que el llamador pueda manejarlos
    pendingTurns.forEach(t => { if (!t.cancelled) t.onError('ws_closed'); });
    pendingTurns.clear();

    if (active) scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (!active) return;
  reconnCount += 1;
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(1.5, reconnCount - 1), RECONNECT_MAX_MS);
  opts?.log('chat_ws_reconnect', { attempt: reconnCount, delay_ms: delay });
  reconnTimer = setTimeout(connect, delay);
}
