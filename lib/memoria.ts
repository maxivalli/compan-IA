import AsyncStorage from '@react-native-async-storage/async-storage';

const CLAVE_PERFIL       = 'rosa_perfil';
const CLAVE_HISTORIAL    = 'rosa_historial';
const CLAVE_INSTALL_ID   = 'compania_install_id';
const CLAVE_FAMILIA_ID   = 'compania_familia_id';

// ── Identidad del dispositivo ─────────────────────────────────────────────────

function generarUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export async function obtenerInstallId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(CLAVE_INSTALL_ID);
    if (existing) return existing;
    const id = generarUUID();
    await AsyncStorage.setItem(CLAVE_INSTALL_ID, id);
    return id;
  } catch {
    return 'unknown';
  }
}

export async function obtenerFamiliaId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CLAVE_FAMILIA_ID);
  } catch {
    return null;
  }
}

export async function guardarFamiliaId(id: string): Promise<void> {
  await AsyncStorage.setItem(CLAVE_FAMILIA_ID, id);
}

export type TelegramContacto = { id: string; nombre: string };

export type Perfil = {
  nombreAbuela: string;
  nombreAsistente: string;
  edad?: number;
  familiares: string[];
  gustos: string[];
  medicamentos: string[];
  fechasImportantes: string[];
  recuerdos: string[];
  telegramChatIds: string[];        // legacy — se migra automáticamente
  telegramContactos: TelegramContacto[];
};

export const perfilInicial: Perfil = {
  nombreAbuela: '',
  nombreAsistente: 'Rosita',
  edad: undefined,
  familiares: [],
  gustos: [],
  medicamentos: [],
  fechasImportantes: [],
  recuerdos: [],
  telegramChatIds: [],
  telegramContactos: [],
};

export async function guardarPerfil(perfil: Perfil): Promise<void> {
  await AsyncStorage.setItem(CLAVE_PERFIL, JSON.stringify(perfil));
}

export async function cargarPerfil(): Promise<Perfil> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_PERFIL);
    if (!data) return perfilInicial;
    const guardado = JSON.parse(data);
    const perfil: Perfil = { ...perfilInicial, ...guardado };
    // Migración: si hay IDs legacy sin nombre, convertirlos a contactos sin nombre
    if (!perfil.telegramContactos) perfil.telegramContactos = [];
    if (perfil.telegramChatIds?.length > 0 && perfil.telegramContactos.length === 0) {
      perfil.telegramContactos = perfil.telegramChatIds.map(id => ({ id, nombre: id }));
    }
    return perfil;
  } catch {
    return perfilInicial;
  }
}

export async function guardarHistorial(historial: { role: string; content: string }[]): Promise<void> {
  const ultimos = historial.slice(-30);
  await AsyncStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(ultimos));
}

export async function cargarHistorial(): Promise<{ role: string; content: string }[]> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_HISTORIAL);
    if (data) return JSON.parse(data);
  } catch {}
  return [];
}

// ── Estado de ánimo ──────────────────────────────────────────────────────────

export type ExpresionAnimo = 'feliz' | 'triste' | 'sorprendida' | 'pensativa' | 'neutral';

export type EntradaAnimo = {
  expresion: ExpresionAnimo;
  timestamp: number;
};

const CLAVE_ANIMO = 'rosa_animo';

export async function guardarEntradaAnimo(expresion: ExpresionAnimo): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_ANIMO);
    const historial: EntradaAnimo[] = data ? JSON.parse(data) : [];
    historial.push({ expresion, timestamp: Date.now() });
    await AsyncStorage.setItem(CLAVE_ANIMO, JSON.stringify(historial.slice(-500)));
  } catch {}
}

export async function cargarEntradasAnimo(): Promise<EntradaAnimo[]> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_ANIMO);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function limpiarHistorialAnimo(): Promise<void> {
  await AsyncStorage.removeItem(CLAVE_ANIMO);
}

// ── Recuerdos ────────────────────────────────────────────────────────────────

export async function agregarRecuerdo(texto: string): Promise<void> {
  const perfil = await cargarPerfil();
  const recuerdos = [...(perfil.recuerdos || []), texto].slice(-50);
  await guardarPerfil({ ...perfil, recuerdos });
}

// ── Contexto ─────────────────────────────────────────────────────────────────

export function construirContexto(perfil: Perfil): string {
  const lineas = [
    `El nombre de la persona con quien hablás es ${perfil.nombreAbuela}${perfil.edad ? `, tiene ${perfil.edad} años` : ''}.`,
  ];
  if (perfil.familiares.length > 0)
    lineas.push(`Sus familiares cercanos son: ${perfil.familiares.join(', ')}.`);
  if (perfil.gustos.length > 0)
    lineas.push(`Le gusta: ${perfil.gustos.join(', ')}.`);
  if (perfil.medicamentos.length > 0)
    lineas.push(`Sus medicamentos son: ${perfil.medicamentos.join(', ')}.`);
  if (perfil.fechasImportantes.length > 0)
    lineas.push(`Fechas importantes: ${perfil.fechasImportantes.join(', ')}.`);
  if (perfil.recuerdos.length > 0)
    lineas.push(`Cosas que ha contado: ${perfil.recuerdos.join(', ')}.`);
  return lineas.join('\n');
}
// ── Recordatorios diarios ────────────────────────────────────────────────────
// Guarda qué recordatorios (medicamentos, fechas) ya se enviaron hoy.
// Clave: "recordatorio_YYYY-MM-DD_nombre"

const CLAVE_RECORDATORIOS = 'rosa_recordatorios';

type RegistroRecordatorio = { clave: string; timestamp: number };

function claveHoy(nombre: string): string {
  const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${hoy}_${nombre}`;
}

export async function yaRecordo(nombre: string): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_RECORDATORIOS);
    const registros: RegistroRecordatorio[] = data ? JSON.parse(data) : [];
    return registros.some(r => r.clave === claveHoy(nombre));
  } catch { return false; }
}

export async function marcarRecordado(nombre: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_RECORDATORIOS);
    const registros: RegistroRecordatorio[] = data ? JSON.parse(data) : [];
    registros.push({ clave: claveHoy(nombre), timestamp: Date.now() });
    // Limpiar registros de más de 2 días
    const hace2dias = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const limpios = registros.filter(r => r.timestamp > hace2dias);
    await AsyncStorage.setItem(CLAVE_RECORDATORIOS, JSON.stringify(limpios));
  } catch {}
}

// ── Recordatorios personales ─────────────────────────────────────────────────

export type Recordatorio = {
  id: string;
  texto: string;       // "pagar la luz"
  fechaISO: string;    // "2026-03-21" — día en que hay que recordarlo
  creadoEn: number;    // timestamp
};

const CLAVE_RECORDATORIOS_PERSONAL = 'rosa_recordatorios_personal';

export async function guardarRecordatorio(r: Recordatorio): Promise<void> {
  const data = await AsyncStorage.getItem(CLAVE_RECORDATORIOS_PERSONAL);
  const lista: Recordatorio[] = data ? JSON.parse(data) : [];
  lista.push(r);
  await AsyncStorage.setItem(CLAVE_RECORDATORIOS_PERSONAL, JSON.stringify(lista));
}

export async function cargarRecordatorios(): Promise<Recordatorio[]> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_RECORDATORIOS_PERSONAL);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function borrarRecordatorio(id: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_RECORDATORIOS_PERSONAL);
    const lista: Recordatorio[] = data ? JSON.parse(data) : [];
    const nueva = lista.filter(r => r.id !== id);
    await AsyncStorage.setItem(CLAVE_RECORDATORIOS_PERSONAL, JSON.stringify(nueva));
  } catch {}
}

// ── PIN de configuración ──────────────────────────────────────────────────────

const CLAVE_PIN = 'compania_pin';

export async function obtenerPIN(): Promise<string | null> {
  try { return await AsyncStorage.getItem(CLAVE_PIN); } catch { return null; }
}

export async function guardarPIN(pin: string): Promise<void> {
  await AsyncStorage.setItem(CLAVE_PIN, pin);
}

export async function eliminarPIN(): Promise<void> {
  await AsyncStorage.removeItem(CLAVE_PIN);
}

export async function borrarRecordatoriosViejos(): Promise<void> {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const data = await AsyncStorage.getItem(CLAVE_RECORDATORIOS_PERSONAL);
    const lista: Recordatorio[] = data ? JSON.parse(data) : [];
    const nueva = lista.filter(r => r.fechaISO >= hoy);
    await AsyncStorage.setItem(CLAVE_RECORDATORIOS_PERSONAL, JSON.stringify(nueva));
  } catch {}
}