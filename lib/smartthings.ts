import { obtenerTokenDispositivo } from './ai';
import * as WebBrowser from 'expo-web-browser';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

export type Dispositivo = {
  id: string;
  nombre: string;
  tipo: string;
  online: boolean;
  estado?: boolean; // true = encendido, false = apagado, undefined = desconocido
};

async function h(): Promise<Record<string, string>> {
  const token = await obtenerTokenDispositivo();
  return {
    'Content-Type':   'application/json',
    'x-device-token': token,
  };
}

export async function iniciarOAuth(): Promise<{ ok: boolean; error?: string }> {
  try {
    // POST /oauth/init devuelve la URL de autorización ya construida.
    // El device token viaja en el header (nunca en la URL del browser).
    const res = await fetch(`${BACKEND_URL}/smartthings/oauth/init`, {
      method: 'POST',
      headers: await h(),
    });
    if (!res.ok) throw new Error('No se pudo iniciar la autorización con SmartThings.');
    const { url } = await res.json() as { url?: string };
    if (!url) throw new Error('El servidor no devolvió una URL de autorización.');

    const result = await WebBrowser.openAuthSessionAsync(url);
    if (result.type === 'success' || result.type === 'dismiss') {
      // El callback ya guardó los tokens en el backend.
      // La pantalla de config re-consulta /estado para confirmar.
      return { ok: true };
    }
    return { ok: false, error: 'Autorización cancelada.' };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Error al abrir el navegador.' };
  }
}

export async function vincularPAT(pat: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/smartthings/token`, {
      method:  'POST',
      headers: await h(),
      body:    JSON.stringify({ pat }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? 'Error al vincular.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servidor.' };
  }
}

export async function obtenerEstadoSmartThings(): Promise<{ vinculado: boolean; dispositivos: Dispositivo[] }> {
  try {
    const res = await fetch(`${BACKEND_URL}/smartthings/estado`, { headers: await h() });
    if (!res.ok) return { vinculado: false, dispositivos: [] };
    return await res.json() as { vinculado: boolean; dispositivos: Dispositivo[] };
  } catch {
    return { vinculado: false, dispositivos: [] };
  }
}

export async function actualizarDispositivos(): Promise<Dispositivo[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/smartthings/dispositivos`, { headers: await h() });
    if (!res.ok) return [];
    const data = await res.json() as { dispositivos: Dispositivo[] };
    return data.dispositivos;
  } catch {
    return [];
  }
}

export async function controlarDispositivo(deviceId: string, valor: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/smartthings/controlar`, {
      method:  'POST',
      headers: await h(),
      body:    JSON.stringify({ deviceId, valor }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { ok: boolean };
    return data.ok;
  } catch {
    return false;
  }
}

export async function desvincularSmartThings(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/smartthings/token`, {
      method:  'DELETE',
      headers: await h(),
    });
  } catch {
    // silencioso
  }
}

export async function obtenerEstadoDispositivo(deviceId: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/smartthings/estado-dispositivo?deviceId=${encodeURIComponent(deviceId)}`,
      { headers: await h() },
    );
    if (!res.ok) return null;
    return await res.json() as Record<string, any>;
  } catch {
    return null;
  }
}

/** Controla todos los dispositivos online a la vez. */
export async function controlarTodos(dispositivos: Dispositivo[], valor: boolean): Promise<void> {
  await Promise.allSettled(
    dispositivos.filter(d => d.online).map(d => controlarDispositivo(d.id, valor))
  );
}
