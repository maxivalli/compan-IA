import { obtenerInstallId } from './memoria';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
const API_KEY     = process.env.EXPO_PUBLIC_APP_API_KEY!;

export type Dispositivo = {
  id: string;
  nombre: string;
  tipo: string;
  online: boolean;
  estado?: boolean; // true = encendido, false = apagado, undefined = desconocido
};

async function h(): Promise<Record<string, string>> {
  const installId = await obtenerInstallId();
  return {
    'Content-Type':  'application/json',
    'x-api-key':     API_KEY,
    'x-install-id':  installId,
  };
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
