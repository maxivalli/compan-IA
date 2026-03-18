import { obtenerInstallId } from './memoria';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
const API_KEY     = process.env.EXPO_PUBLIC_APP_API_KEY!;

type Mensaje = { role: 'user' | 'assistant'; content: string };

async function jsonHeaders(): Promise<Record<string, string>> {
  const installId = await obtenerInstallId();
  return { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'x-install-id': installId };
}

async function formHeaders(): Promise<Record<string, string>> {
  const installId = await obtenerInstallId();
  return { 'x-api-key': API_KEY, 'x-install-id': installId };
}

// ── Claude ────────────────────────────────────────────────────────────────────

export async function llamarClaude(options: {
  system: string;
  messages: Mensaje[];
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/ai/chat`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: options.maxTokens ?? 180,
      system: options.system,
      messages: options.messages,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

// ── Whisper ───────────────────────────────────────────────────────────────────

export async function transcribirAudio(uri: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', { uri, type: 'audio/m4a', name: 'audio.m4a' } as any);
  formData.append('language', 'es');
  const res = await fetch(`${BACKEND_URL}/ai/transcribe`, {
    method: 'POST',
    headers: await formHeaders(),
    body: formData,
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}`);
  const data = await res.json();
  return data.text?.trim() ?? '';
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────

/** Devuelve el audio sintetizado como string base64, o null si falla. */
export const VOICE_ID_FEMENINA = 'r3lotmx3BZETVvcKm6R6';
export const VOICE_ID_MASCULINA = 'QK4xDwo9ESPHA4JNUpX3';

export async function sintetizarVoz(texto: string, voiceId?: string): Promise<string | null> {
  const res = await fetch(`${BACKEND_URL}/ai/tts`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify({ text: texto, voiceId }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.audio ?? null;
}

/** Genera un efecto de sonido y devuelve base64, o null si falla. */
export async function generarSonido(
  texto: string,
  duracion = 8,
  influencia = 0.3,
): Promise<string | null> {
  const res = await fetch(`${BACKEND_URL}/ai/tts/sound`, {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify({ text: texto, duration_seconds: duracion, prompt_influence: influencia }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.audio ?? null;
}
