import { obtenerInstallId, obtenerDeviceToken, guardarDeviceToken } from './memoria';
import { RositaSystemPayload } from './systemPayload';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

type TextBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };
type Mensaje = { role: 'user' | 'assistant'; content: string | TextBlock[] };
type SystemBlock = TextBlock;
type SystemInput = string | SystemBlock[] | RositaSystemPayload;

// ── Device token (reemplaza la API key hardcodeada) ───────────────────────────

let _cachedToken: string | null = null;
let _bootstrapPromise: Promise<string> | null = null;
let _currentTurnId: string | null = null;
let _currentTurnStartedAt = 0;
let _currentTurnFirstAudioAt = 0;

export async function obtenerTokenDispositivo(): Promise<string> {
  if (_cachedToken) return _cachedToken;
  const stored = await obtenerDeviceToken();
  if (stored) { _cachedToken = stored; return stored; }
  if (_bootstrapPromise) return _bootstrapPromise;
  return bootstrapDispositivo();
}

export async function bootstrapDispositivo(): Promise<string> {
  if (_bootstrapPromise) return _bootstrapPromise;
  _bootstrapPromise = (async () => {
    const installId = await obtenerInstallId();
    const res = await fetchConTimeout(`${BACKEND_URL}/auth/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId }),
    }, 10000, 'Bootstrap');
    if (!res.ok) throw new Error(`Bootstrap ${res.status}`);
    const data = await res.json();
    const token: string = data.deviceToken;
    await guardarDeviceToken(token);
    _cachedToken = token;
    return token;
  })();
  try {
    return await _bootstrapPromise;
  } finally {
    _bootstrapPromise = null;
  }
}

async function jsonHeaders(): Promise<Record<string, string>> {
  const token = await obtenerTokenDispositivo();
  return {
    'Content-Type': 'application/json',
    'x-device-token': token,
    ...(_currentTurnId ? { 'x-turn-id': _currentTurnId } : {}),
  };
}

async function formHeaders(): Promise<Record<string, string>> {
  const token = await obtenerTokenDispositivo();
  return {
    'x-device-token': token,
    ...(_currentTurnId ? { 'x-turn-id': _currentTurnId } : {}),
  };
}

function makeTurnId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function beginTurnTelemetry(): string {
  _currentTurnId = makeTurnId();
  _currentTurnStartedAt = Date.now();
  _currentTurnFirstAudioAt = 0;
  return _currentTurnId;
}

export function getCurrentTurnId(): string | null {
  return _currentTurnId;
}

export function getCurrentTurnStartedAt(): number {
  return _currentTurnStartedAt;
}

export function markTurnFirstAudio(): { turnId: string | null; e2eFirstAudioMs: number | null; firstForTurn: boolean } {
  if (!_currentTurnId || !_currentTurnStartedAt) {
    return { turnId: _currentTurnId, e2eFirstAudioMs: null, firstForTurn: false };
  }
  if (_currentTurnFirstAudioAt) {
    return {
      turnId: _currentTurnId,
      e2eFirstAudioMs: _currentTurnFirstAudioAt - _currentTurnStartedAt,
      firstForTurn: false,
    };
  }
  _currentTurnFirstAudioAt = Date.now();
  return {
    turnId: _currentTurnId,
    e2eFirstAudioMs: _currentTurnFirstAudioAt - _currentTurnStartedAt,
    firstForTurn: true,
  };
}

export function getCurrentTurnMetrics(): { turnId: string | null; e2eFirstAudioMs: number | null; e2eNowMs: number | null } {
  if (!_currentTurnId || !_currentTurnStartedAt) {
    return { turnId: _currentTurnId, e2eFirstAudioMs: null, e2eNowMs: null };
  }
  return {
    turnId: _currentTurnId,
    e2eFirstAudioMs: _currentTurnFirstAudioAt ? _currentTurnFirstAudioAt - _currentTurnStartedAt : null,
    e2eNowMs: Date.now() - _currentTurnStartedAt,
  };
}

// ── Claude ────────────────────────────────────────────────────────────────────

function timeoutError(etiqueta: string, ms: number): Error {
  const error = new Error(`${etiqueta} timeout (${ms}ms)`);
  error.name = 'TimeoutError';
  return error;
}

function fetchConTimeout(url: string, options: RequestInit, ms: number, etiqueta = 'Request'): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal })
    .catch((error: any) => {
      if (error?.name === 'AbortError') throw timeoutError(etiqueta, ms);
      throw error;
    })
    .finally(() => clearTimeout(id));
}

export async function llamarClaude(options: {
  system: SystemInput;
  messages: Mensaje[];
  maxTokens?: number;
}): Promise<string> {
  const body = typeof options.system === 'string' || Array.isArray(options.system)
    ? {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: options.maxTokens ?? 140,
        system: options.system,
        messages: options.messages,
      }
    : {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: options.maxTokens ?? 140,
        system_payload: options.system,
        messages: options.messages,
      };
  const res = await fetchConTimeout(`${BACKEND_URL}/ai/chat`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify(body),
  }, 20000, 'Claude');
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

// ── Claude streaming ──────────────────────────────────────────────────────────

const STREAMING_SAFE_TAGS = new Set([
  'FELIZ','TRISTE','SORPRENDIDA','PENSATIVA','NEUTRAL',
  'CUENTO','JUEGO','CHISTE','ENOJADA','AVERGONZADA','CANSADA',
]);

export async function llamarClaudeConStreaming(options: {
  system: SystemInput;
  messages: Mensaje[];
  maxTokens?: number;
  onPrimeraFrase?: (primera: string, tag: string) => void;
}): Promise<string> {
  const headers = await jsonHeaders();

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BACKEND_URL}/ai/chat-stream`);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.timeout = 30000;

    let fullText = '';
    let processedLength = 0;
    let sseBuffer = '';
    let primeraFired = false;
    let tagDetected = '';
    let resolved = false;

    const cleanup = () => {
      xhr.onprogress = null;
      xhr.onload = null;
      xhr.onerror = null;
      xhr.ontimeout = null;
      try { xhr.abort(); } catch {}
    };
    const resolveOnce = (text: string) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(text);
      }
    };
    const rejectOnce  = (e: Error)      => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(e);
      }
    };

    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') { resolveOnce(fullText); return; }
      try {
        const chunk = JSON.parse(raw) as any;
        if (chunk.error) { rejectOnce(new Error(chunk.error)); return; }
        if (chunk.primera_frase && !primeraFired) {
          const safeTag = typeof chunk.tag === 'string' ? chunk.tag : 'NEUTRAL';
          primeraFired = true;
          tagDetected = safeTag;
          options.onPrimeraFrase?.(String(chunk.primera_frase).trim(), safeTag);
        }
        if (!chunk.text) return;

        fullText += chunk.text;

        if (!tagDetected) {
          const m = fullText.match(/^\[([A-Z_]+)/);
          if (m) tagDetected = m[1];
        }

        if (!primeraFired && tagDetected && STREAMING_SAFE_TAGS.has(tagDetected)) {
          const sinTag = fullText.replace(/^\[[^\]]+\]\s*/, '');
          if (sinTag.length >= 10) {
            const m = sinTag.match(/^.{8,}?[.!?](?:["'”]*)(?:\s+|$)/);
            // Antes requería segunda oración (sinTag.length > m[0].length).
            // Ahora dispara aunque sea la única oración → precachearTexto arranca antes.
            if (m) {
              primeraFired = true;
              options.onPrimeraFrase?.(m[0].trimEnd(), tagDetected);
            }
          }
        }
      } catch {}
    };

    xhr.onprogress = () => {
      const newChunk = xhr.responseText.slice(processedLength);
      processedLength = xhr.responseText.length;
      sseBuffer += newChunk;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() ?? '';
      lines.forEach(processLine);
    };

    xhr.onload = () => {
      if (sseBuffer.trim()) processLine(sseBuffer);
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!fullText.trim()) rejectOnce(new Error('Stream empty'));
        else resolveOnce(fullText);
      }
      else rejectOnce(new Error(`Stream ${xhr.status}`));
    };

    xhr.onerror   = () => rejectOnce(new Error('Stream network error'));
    xhr.ontimeout = () => rejectOnce(new Error('Stream timeout'));

    xhr.send(JSON.stringify(
      typeof options.system === 'string' || Array.isArray(options.system)
        ? {
            max_tokens: options.maxTokens ?? 140,
            system: options.system,
            messages: options.messages,
          }
        : {
            max_tokens: options.maxTokens ?? 140,
            system_payload: options.system,
            messages: options.messages,
          }
    ));
  });
}

// ── Whisper ───────────────────────────────────────────────────────────────────

export async function transcribirAudio(uri: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', { uri, type: 'audio/m4a', name: 'audio.m4a' } as any);
  formData.append('language', 'es');
  const res = await fetchConTimeout(`${BACKEND_URL}/ai/transcribe`, {
    method: 'POST',
    headers: await formHeaders(),
    body: formData,
  }, 25000, 'Whisper');
  if (!res.ok) throw new Error(`Whisper ${res.status}`);
  const data = await res.json();
  return data.text?.trim() ?? '';
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────

/** Construye la URL del endpoint de streaming de TTS — ElevenLabs (para expo-audio directo).
 *  Requiere que `obtenerTokenDispositivo()` haya sido llamado previamente (token en caché). */
export function urlTTSStream(texto: string, voiceId: string, speed?: number): string {
  if (!_cachedToken) {
    // Token aún no disponible (bootstrap no terminó): devolver URL vacía
    // en vez de lanzar. El pipeline de audio deberá manejar el string vacío.
    if (__DEV__) console.warn('[TTS] urlTTSStream llamada sin token cacheado');
    return '';
  }
  const params = new URLSearchParams({
    text:    texto,
    voiceId,
    speed:   String(speed ?? 0.92),
    k:       _cachedToken,
  });
  return `${BACKEND_URL}/ai/tts-stream?${params}`;
}


/** Construye la URL del endpoint experimental de Fish realtime streaming.
 *  Requiere que `obtenerTokenDispositivo()` haya sido llamado previamente. */
export function urlFishRealtimeStream(
  texto: string,
  voiceId: string,
  speed?: number,
  emotion?: string,
  options?: { latency?: 'normal' | 'balanced'; chunkLength?: number },
): string {
  if (!_cachedToken) {
    if (__DEV__) console.warn('[TTS] urlFishRealtimeStream llamada sin token cacheado');
    return '';
  }
  const params = new URLSearchParams({
    text: texto,
    voiceId,
    speed: String(speed ?? 0.92),
    k: _cachedToken,
    ...(emotion ? { emotion } : {}),
    ...(options?.latency ? { latency: options.latency } : {}),
    ...(options?.chunkLength ? { chunkLength: String(options.chunkLength) } : {}),
    ...(_currentTurnId ? { t: _currentTurnId } : {}),
  });
  return `${BACKEND_URL}/ai/tts-fish-realtime-stream?${params}`;
}

/** Devuelve el audio sintetizado como string base64, o null si falla. */
export const VOICE_ID_FEMENINA  = 'r3lotmx3BZETVvcKm6R6'; // Tucumana y enérgica
export const VOICE_ID_FEMENINA2 = 'smHMxLX7gVgXrrfD70xq'; // Cálida y formal
export const VOICE_ID_MASCULINA  = 'vgekQLm3GYiKMHUnPVvY'; // Santafesino y divertido
export const VOICE_ID_MASCULINA2 = 'L7pBVwjueW3IPcQt4Ej9'; // Tranquilo y formal

/** TTS para onboarding — el device token ya existe (bootstrap corre al arrancar la app). */
export async function sintetizarVozMuestra(voiceId: string, nombre: string): Promise<string | null> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/ai/tts/sample`, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify({ voiceId, nombre }),
    }, 12000, 'TTS sample');
    if (!res.ok) return null;
    const data = await res.json();
    return data.audio ?? null;
  } catch {
    return null;
  }
}

export async function sintetizarVoz(texto: string, voiceId?: string, speed?: number, emotion?: string): Promise<string | null> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/ai/tts`, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify({ text: texto, voiceId, speed, emotion }),
    }, 12000, 'TTS');
    if (!res.ok) return null;
    const data = await res.json();
    return data.audio ?? null;
  } catch {
    return null;
  }
}

/** Devuelve los comandos pendientes del dispositivo autenticado (los consume — no se repiten). */
export async function obtenerComandosPendientes(_familiaId?: string): Promise<string[]> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/telegram/comandos`, {
      headers: await jsonHeaders(),
    }, 8000, 'Telegram commands');
    if (!res.ok) return [];
    const data = await res.json();
    return data.comandos ?? [];
  } catch {
    return [];
  }
}

/** Busca lugares físicos cercanos via OpenStreetMap Overpass API. */
export async function buscarLugares(lat: number, lon: number, tipo: string, radioMetros = 3000): Promise<string | null> {
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), tipo, radio: String(radioMetros) });
    const res = await fetchConTimeout(
      `${BACKEND_URL}/ai/places?${params}`,
      { headers: await jsonHeaders() },
      15000,
      'Places',
    );
    if (!res.ok) return null;
    const data = await res.json();
    const places = data.places as string[] | undefined;
    if (!places?.length) return `No encontré ${data.tipo ?? tipo} en un radio de ${radioMetros / 1000}km.`;
    return `${data.tipo ?? tipo} cercanos (radio ${radioMetros / 1000}km):\n${places.map((p: string) => `• ${p}`).join('\n')}`;
  } catch {
    return null;
  }
}

/** Búsqueda web vía Brave Search. Devuelve resultados formateados o null si falla. */
export async function buscarWeb(query: string): Promise<string | null> {
  try {
    const res = await fetchConTimeout(
      `${BACKEND_URL}/ai/search?q=${encodeURIComponent(query)}`,
      { headers: await jsonHeaders() },
      15000,
      'Web search',
    );
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results as { title: string; description: string }[] | undefined;
    if (!results?.length && !data.answer) return null;
    const partes: string[] = [];
    if (data.answer) partes.push(data.answer);
    if (results?.length) partes.push(results.map(r => `• ${r.title}: ${r.description}`).join('\n'));
    const resultado = partes.join('\n\n');
    if (__DEV__) console.log('[TAVILY] resultado:', resultado.slice(0, 300));
    return resultado;
  } catch (e: any) {
    if (__DEV__) console.log('[TAVILY] error:', e?.name ?? 'unknown');
    return null;
  }
}

/** Busca en Wikipedia en español. Devuelve "Título:\nextracto" o null. */
export async function buscarWikipedia(query: string): Promise<string | null> {
  try {
    const res = await fetchConTimeout(
      `${BACKEND_URL}/ai/wikipedia?q=${encodeURIComponent(query)}`,
      { headers: await jsonHeaders() },
      8000,
      'Wikipedia',
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.extracto) return null;
    return `${data.titulo}:\n${data.extracto}`;
  } catch {
    return null;
  }
}

export type NoticiasDia = { titulo: string; resumen: string; url: string };

/** Trae las 4 noticias blandas del día desde el backend. */
export async function fetchNoticiasDiarias(): Promise<NoticiasDia[]> {
  try {
    const res = await fetchConTimeout(
      `${BACKEND_URL}/ai/noticias-del-dia`,
      { method: 'POST', headers: await jsonHeaders() },
      12000,
      'Noticias del día',
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.noticias) ? data.noticias : [];
  } catch {
    return [];
  }
}

/** Envía una imagen al backend (Gemini 2.0 Flash) en modo cámara live. */
export async function verVision(base64: string): Promise<string | null> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/ai/ver-vision`, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify({ imagen: base64 }),
    }, 25000, 'Vision');
    if (!res.ok) return null;
    const data = await res.json();
    return data.texto ?? null;
  } catch {
    return null;
  }
}

/** Envía una imagen al backend para que Claude Vision la lea/describa. */
export async function leerImagen(base64: string): Promise<string | null> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/ai/leer-imagen`, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify({ imagen: base64 }),
    }, 25000, 'Vision');
    if (!res.ok) return null;
    const data = await res.json();
    return data.texto ?? null;
  } catch {
    return null;
  }
}

/** Sincroniza una entrada de ánimo al backend (fire-and-forget). */
/**
 * Manda un ping mínimo a /ai/chat-stream para que el backend escriba el cache
 * de Claude (cache_write). Así el primer turno real del usuario ya encuentra
 * cache_read en vez de pagar el cold-start de ~1000-1500ms extra.
 * Se llama fire-and-forget desde inicializar(), nunca bloquea la UI.
 */
export function calentarCacheClaudeEnBackground(systemPayload: object): void {
  Promise.all([jsonHeaders(), bootstrapDispositivo().catch(() => '')]).then(([headers]) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BACKEND_URL}/ai/chat-stream`);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.setRequestHeader('x-cache-warm', '1');
    xhr.timeout = 15000;
    xhr.send(JSON.stringify({
      system_payload: systemPayload,
      messages: [{ role: 'user', content: '.' }],
      max_tokens: 1,
    }));
    // No procesamos la respuesta — solo nos importa que el backend haya
    // escrito el cache. XHR se abandona pero el servidor completa el request.
    setTimeout(() => { try { xhr.abort(); } catch {} }, 4000);
  }).catch(() => {});
}

export function sincronizarAnimo(expresion: string, timestamp: number): void {
  jsonHeaders().then(headers =>
    fetch(`${BACKEND_URL}/ai/animo`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ expresion, timestamp }),
    })
  ).catch(() => {}); // silencioso — no crítico
}

/** Genera un efecto de sonido y devuelve base64, o null si falla. */
export async function generarSonido(
  texto: string,
  duracion = 8,
  influencia = 0.3,
): Promise<string | null> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/ai/tts/sound`, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify({ text: texto, duration_seconds: duracion, prompt_influence: influencia }),
    }, 30000, 'Sound');
    if (!res.ok) return null;
    const data = await res.json();
    return data.audio ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget: loguea un evento de cliente en Railway. */
export function logCliente(event: string, data?: Record<string, string | number | boolean>): void {
  const payload = _currentTurnId ? { ...data, turn_id: _currentTurnId } : data;
  obtenerTokenDispositivo()
    .then(token => fetch(`${BACKEND_URL}/debug/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-token': token },
      body: JSON.stringify({ event, data: payload }),
    }))
    .catch(() => {});
}

// ── Async Jobs ────────────────────────────────────────────────────────────────

export type AsyncJobListo = {
  id: string;
  tipo: string;
  query: string;
  resultJson: unknown;
  createdAt: string;
};

/** Crea un job asíncrono en el backend. Devuelve el jobId o null si falla. */
export async function crearAsyncJob(tipo: string, query: string): Promise<string | null> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/async-jobs`, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify({ tipo, query }),
    }, 8000, 'AsyncJob create');
    if (!res.ok) return null;
    const data = await res.json();
    return data.jobId ?? null;
  } catch {
    return null;
  }
}

/** Obtiene la lista de jobs listos (done+unread) para este dispositivo. */
export async function fetchAsyncJobsListos(): Promise<AsyncJobListo[]> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/async-jobs?limit=5`, {
      headers: await jsonHeaders(),
    }, 8000, 'AsyncJobs list');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.jobs) ? data.jobs : [];
  } catch {
    return [];
  }
}

/** Marca un job como leído (fire-and-forget). */
export function ackAsyncJob(jobId: string): void {
  jsonHeaders().then(headers =>
    fetch(`${BACKEND_URL}/async-jobs/${encodeURIComponent(jobId)}/ack`, {
      method: 'POST',
      headers,
    })
  ).catch(() => {});
}

export async function reportarCrash(message: string, stack: string, platform: string, extra?: string): Promise<void> {
  try {
    const installId = await obtenerInstallId();
    const token = await obtenerTokenDispositivo();
    await fetch(`${BACKEND_URL}/debug/crash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-token': token },
      body: JSON.stringify({ message, stack: stack.slice(0, 2000), platform, installId, extra }),
    });
  } catch {}
}
