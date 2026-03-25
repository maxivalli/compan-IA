import { obtenerInstallId } from './memoria';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
const API_KEY     = process.env.EXPO_PUBLIC_APP_API_KEY!;

async function h(): Promise<Record<string, string>> {
  const installId = await obtenerInstallId();
  return { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'x-install-id': installId };
}

export async function enviarAlertaTelegram(chatIds: string[], mensaje: string, nombreAsistente = 'Rosita'): Promise<void> {
  if (!chatIds.length) return;
  try {
    await fetch(`${BACKEND_URL}/telegram/alerta`, {
      method: 'POST',
      headers: await h(),
      body: JSON.stringify({ chatIds, texto: mensaje, nombreAsistente }),
    });
  } catch {}
}

export type MensajeVoz = {
  fileId:   string;
  fromName: string;
  chatId:   string;
  updateId: number;
};

export async function recibirMensajesVoz(
  _offsetRef: { current: number },
  chatIds: string[] = [],
): Promise<MensajeVoz[]> {
  if (!chatIds.length) return [];
  try {
    const params = new URLSearchParams({ chatIds: chatIds.join(',') });
    const res  = await fetch(`${BACKEND_URL}/telegram/mensajes-voz?${params}`, { headers: await h() });
    const data = await res.json();
    return data.mensajes ?? [];
  } catch {
    return [];
  }
}

export async function obtenerUrlArchivo(fileId: string): Promise<string | null> {
  try {
    const res  = await fetch(`${BACKEND_URL}/telegram/archivo?fileId=${fileId}`, { headers: await h() });
    const data = await res.json();
    return data.url ?? null;
  } catch {
    return null;
  }
}

export async function enviarFotoTelegram(chatIds: string[], fotoBase64: string, caption?: string): Promise<void> {
  if (!chatIds.length) return;
  try {
    await fetch(`${BACKEND_URL}/telegram/foto`, {
      method: 'POST',
      headers: await h(),
      body: JSON.stringify({ chatIds, foto: fotoBase64, caption }),
    });
  } catch {}
}

export type MensajeFoto = {
  fromName:   string;
  chatId:     string;
  descripcion: string;
  urlFoto:    string;
};

export async function recibirMensajesFoto(chatIds: string[] = []): Promise<MensajeFoto[]> {
  if (!chatIds.length) return [];
  try {
    const params = new URLSearchParams({ chatIds: chatIds.join(',') });
    const res  = await fetch(`${BACKEND_URL}/telegram/mensajes-foto?${params}`, { headers: await h() });
    const data = await res.json();
    return data.mensajes ?? [];
  } catch {
    return [];
  }
}

export type MensajeTexto = {
  fromName: string;
  chatId:   string;
  texto:    string;
};

export async function recibirMensajesTexto(chatIds: string[] = []): Promise<MensajeTexto[]> {
  if (!chatIds.length) return [];
  try {
    const params = new URLSearchParams({ chatIds: chatIds.join(',') });
    const res  = await fetch(`${BACKEND_URL}/telegram/mensajes-texto?${params}`, { headers: await h() });
    const data = await res.json();
    return data.mensajes ?? [];
  } catch {
    return [];
  }
}

export async function enviarMensajeTelegram(chatIds: string[], texto: string): Promise<void> {
  if (!chatIds.length) return;
  try {
    await fetch(`${BACKEND_URL}/telegram/mensaje`, {
      method: 'POST',
      headers: await h(),
      body: JSON.stringify({ chatIds, texto }),
    });
  } catch {}
}
