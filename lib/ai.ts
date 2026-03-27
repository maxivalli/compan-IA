import { obtenerInstallId } from './memoria';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
const API_KEY     = process.env.EXPO_PUBLIC_APP_API_KEY!;

type Mensaje = { role: 'user' | 'assistant'; content: string };
type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };

async function jsonHeaders(): Promise<Record<string, string>> {
  const installId = await obtenerInstallId();
  return { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'x-install-id': installId };
}

async function formHeaders(): Promise<Record<string, string>> {
  const installId = await obtenerInstallId();
  return { 'x-api-key': API_KEY, 'x-install-id': installId };
}

// ── Claude ────────────────────────────────────────────────────────────────────

function fetchConTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export async function llamarClaude(options: {
  system: string | SystemBlock[];
  messages: Mensaje[];
  maxTokens?: number;
}): Promise<string> {
  const res = await fetchConTimeout(`${BACKEND_URL}/ai/chat`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: options.maxTokens ?? 140,
      system: options.system,
      messages: options.messages,
    }),
  }, 20000);
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
  system: string | SystemBlock[];
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

    const resolveOnce = (text: string) => { if (!resolved) { resolved = true; resolve(text); } };
    const rejectOnce  = (e: Error)      => { if (!resolved) { resolved = true; reject(e); } };

    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') { resolveOnce(fullText); return; }
      try {
        const chunk = JSON.parse(raw) as any;
        if (chunk.error) { rejectOnce(new Error(chunk.error)); return; }
        if (!chunk.text) return;

        fullText += chunk.text;

        if (!tagDetected) {
          const m = fullText.match(/^\[([A-Z_]+)/);
          if (m) tagDetected = m[1];
        }

        if (!primeraFired && tagDetected && STREAMING_SAFE_TAGS.has(tagDetected)) {
          const sinTag = fullText.replace(/^\[[^\]]+\]\s*/, '');
          if (sinTag.length >= 20) {
            const m = sinTag.match(/^.{15,}?[.!?](?:\s+|$)/);
            if (m && sinTag.length > m[0].length) {
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
      if (xhr.status >= 200 && xhr.status < 300) resolveOnce(fullText);
      else rejectOnce(new Error(`Stream ${xhr.status}`));
    };

    xhr.onerror   = () => rejectOnce(new Error('Stream network error'));
    xhr.ontimeout = () => rejectOnce(new Error('Stream timeout'));

    xhr.send(JSON.stringify({
      max_tokens: options.maxTokens ?? 140,
      system: options.system,
      messages: options.messages,
    }));
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
  }, 25000);
  if (!res.ok) throw new Error(`Whisper ${res.status}`);
  const data = await res.json();
  return data.text?.trim() ?? '';
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────

/** Construye la URL del endpoint de streaming de TTS — ElevenLabs (para expo-audio directo). */
export function urlTTSStream(texto: string, voiceId: string, speed?: number): string {
  const params = new URLSearchParams({
    text:    texto,
    voiceId,
    speed:   String(speed ?? 0.92),
    k:       API_KEY,
  });
  return `${BACKEND_URL}/ai/tts-stream?${params}`;
}

/** Construye la URL del endpoint de streaming de TTS — Cartesia Sonic (baja latencia). */
export function urlCartesiaStream(texto: string, voiceId: string, speed?: number): string {
  const params = new URLSearchParams({
    text:    texto,
    voiceId,
    speed:   String(speed ?? 0.92),
    k:       API_KEY,
  });
  return `${BACKEND_URL}/ai/tts-cartesia-stream?${params}`;
}

/** Devuelve el audio sintetizado como string base64, o null si falla. */
export const VOICE_ID_FEMENINA  = 'r3lotmx3BZETVvcKm6R6'; // Tucumana y enérgica
export const VOICE_ID_FEMENINA2 = 'smHMxLX7gVgXrrfD70xq'; // Cálida y formal
export const VOICE_ID_MASCULINA  = 'vgekQLm3GYiKMHUnPVvY'; // Santafesino y divertido
export const VOICE_ID_MASCULINA2 = 'L7pBVwjueW3IPcQt4Ej9'; // Tranquilo y formal

/** TTS para onboarding — no requiere dispositivo registrado. */
export async function sintetizarVozMuestra(voiceId: string, nombre: string): Promise<string | null> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/ai/tts/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ voiceId, nombre }),
    }, 12000);
    if (!res.ok) return null;
    const data = await res.json();
    return data.audio ?? null;
  } catch {
    return null;
  }
}

export async function sintetizarVoz(texto: string, voiceId?: string, speed?: number): Promise<string | null> {
  const res = await fetchConTimeout(`${BACKEND_URL}/ai/tts`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify({ text: texto, voiceId, speed }),
  }, 12000);
  if (!res.ok) return null;
  const data = await res.json();
  return data.audio ?? null;
}

/** Devuelve los comandos pendientes para esta familia (los consume — no se repiten). */
export async function obtenerComandosPendientes(familiaId: string): Promise<string[]> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/telegram/comandos?familiaId=${familiaId}`, {
      headers: await jsonHeaders(),
    }, 8000);
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

/** Envía una imagen al backend para que Claude Vision la lea/describa. */
export async function leerImagen(base64: string): Promise<string | null> {
  try {
    const res = await fetchConTimeout(`${BACKEND_URL}/ai/leer-imagen`, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify({ imagen: base64 }),
    }, 25000);
    if (!res.ok) return null;
    const data = await res.json();
    return data.texto ?? null;
  } catch {
    return null;
  }
}

/** Sincroniza una entrada de ánimo al backend (fire-and-forget). */
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
  const res = await fetchConTimeout(`${BACKEND_URL}/ai/tts/sound`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify({ text: texto, duration_seconds: duracion, prompt_influence: influencia }),
  }, 30000);
  if (!res.ok) return null;
  const data = await res.json();
  return data.audio ?? null;
}
