import { obtenerTokenDispositivo } from './ai';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

async function h(): Promise<Record<string, string>> {
  const token = await obtenerTokenDispositivo();
  return { 'Content-Type': 'application/json', 'x-device-token': token };
}

function fetchTelegram(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
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

export async function recibirMensajesVoz(chatIds: string[] = []): Promise<MensajeVoz[]> {
  if (!chatIds.length) return [];
  try {
    const res  = await fetchTelegram(`${BACKEND_URL}/telegram/mensajes-voz`, {
      method: 'POST',
      headers: await h(),
      body: JSON.stringify({ chatIds }),
    });
    const data = await res.json();
    return data.mensajes ?? [];
  } catch {
    return [];
  }
}

export async function obtenerUrlArchivo(fileId: string, chatId: string): Promise<string | null> {
  try {
    const res  = await fetch(`${BACKEND_URL}/telegram/archivo`, {
      method: 'POST',
      headers: await h(),
      body: JSON.stringify({ fileId, chatId }),
    });
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
    const res  = await fetchTelegram(`${BACKEND_URL}/telegram/mensajes-foto`, {
      method: 'POST',
      headers: await h(),
      body: JSON.stringify({ chatIds }),
    });
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
    const res  = await fetchTelegram(`${BACKEND_URL}/telegram/mensajes-texto`, {
      method: 'POST',
      headers: await h(),
      body: JSON.stringify({ chatIds }),
    });
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

export async function confirmarInformeEnviado(fechaISO: string): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/telegram/confirmar-informe`, {
      method: 'POST',
      headers: await h(),
      body: JSON.stringify({ fechaISO }),
    });
  } catch {}
}

export async function enviarHeartbeat(activo: boolean): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/familia/heartbeat`, {
      method: 'POST',
      headers: await h(),
      body: JSON.stringify({ activo }),
    });
  } catch {}
}

export type HeartbeatResult =
  | { ok: true }
  | { ok: false; mensaje: string };

/** Para UI al activar monitoreo: distingue red, 403 sin familia y otros errores. */
export async function enviarHeartbeatConResultado(activo: boolean): Promise<HeartbeatResult> {
  const base = BACKEND_URL != null ? String(BACKEND_URL).trim() : '';
  if (!base) {
    return {
      ok: false,
      mensaje: 'Esta versión de la app no tiene configurado el servidor. Reinstalá desde el enlace actual o contactá soporte.',
    };
  }
  try {
    const res = await fetch(`${base}/familia/heartbeat`, {
      method: 'POST',
      headers: await h(),
      body: JSON.stringify({ activo }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 403) {
      return {
        ok: false,
        mensaje:
          'No pudimos activar el monitoreo en el servidor. Guardá tu perfil con nombre y registro completos, o verificá que esta cuenta esté vinculada a una familia.',
      };
    }
    return {
      ok: false,
      mensaje: `El servidor respondió con un error (${res.status}). Probá de nuevo en unos minutos.`,
    };
  } catch {
    return {
      ok: false,
      mensaje: 'Sin conexión o el servidor no responde. Revisá internet y tocá Guardar otra vez.',
    };
  }
}


