import { obtenerInstallId } from './memoria';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
const API_KEY     = process.env.EXPO_PUBLIC_APP_API_KEY!;

export type Dispositivo = {
  id: string;
  nombre: string;
  tipo: string;
  online: boolean;
};

async function h(): Promise<Record<string, string>> {
  const installId = await obtenerInstallId();
  return {
    'Content-Type':  'application/json',
    'x-api-key':     API_KEY,
    'x-install-id':  installId,
  };
}

export async function obtenerQRVinculacion(): Promise<{ qrCode: string; expireTime: number } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/tuya/qr`, { headers: await h() });
    if (!res.ok) return null;
    return await res.json() as { qrCode: string; expireTime: number };
  } catch { return null; }
}

export async function vincularConCredenciales(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/tuya/vincular-credenciales`, {
      method:  'POST',
      headers: await h(),
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? 'Error al vincular.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servidor.' };
  }
}

export async function obtenerOAuthUrl(): Promise<{ url: string; redirectUri: string } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/tuya/oauth-url`, { headers: await h() });
    if (!res.ok) return null;
    return await res.json() as { url: string; redirectUri: string };
  } catch {
    return null;
  }
}

export async function obtenerEstadoTuya(): Promise<{ vinculado: boolean; dispositivos: Dispositivo[] }> {
  try {
    const res = await fetch(`${BACKEND_URL}/tuya/estado`, { headers: await h() });
    if (!res.ok) return { vinculado: false, dispositivos: [] };
    return await res.json() as { vinculado: boolean; dispositivos: Dispositivo[] };
  } catch {
    return { vinculado: false, dispositivos: [] };
  }
}

export async function actualizarDispositivos(): Promise<Dispositivo[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/tuya/dispositivos`, { headers: await h() });
    if (!res.ok) return [];
    const data = await res.json() as { dispositivos: Dispositivo[] };
    return data.dispositivos;
  } catch {
    return [];
  }
}

export async function controlarDispositivo(
  deviceId: string,
  codigo: string,
  valor: boolean | number | string,
): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/tuya/controlar`, {
      method:  'POST',
      headers: await h(),
      body:    JSON.stringify({ deviceId, codigo, valor }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { ok: boolean };
    return data.ok;
  } catch {
    return false;
  }
}

export async function desvincularSmartlife(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/tuya/vincular`, {
      method:  'DELETE',
      headers: await h(),
    });
  } catch {
    // silencioso — el usuario verá el estado al recargar
  }
}
