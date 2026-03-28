import AsyncStorage from '@react-native-async-storage/async-storage';

const CLAVE_PERFIL         = 'rosa_perfil';
const CLAVE_HISTORIAL      = 'rosa_historial';
const CLAVE_INSTALL_ID     = 'compania_install_id';
const CLAVE_FAMILIA_ID     = 'compania_familia_id';
const CLAVE_CODIGO_REG     = 'compania_codigo_registro';
const CLAVE_BIENVENIDA     = 'compania_bienvenida_dada';
const CLAVE_DEVICE_TOKEN   = 'compania_device_token';

// ── Identidad del dispositivo ─────────────────────────────────────────────────

export async function obtenerDeviceToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(CLAVE_DEVICE_TOKEN); } catch { return null; }
}

export async function guardarDeviceToken(token: string): Promise<void> {
  await AsyncStorage.setItem(CLAVE_DEVICE_TOKEN, token);
}

export async function obtenerInstallId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(CLAVE_INSTALL_ID);
    if (existing) return existing;
    const { randomUUID } = await import('expo-crypto');
    const id = randomUUID();
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

export async function obtenerCodigoRegistro(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CLAVE_CODIGO_REG);
  } catch {
    return null;
  }
}

export async function guardarCodigoRegistro(codigo: string): Promise<void> {
  await AsyncStorage.setItem(CLAVE_CODIGO_REG, codigo);
}

export async function bienvenidaYaDada(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLAVE_BIENVENIDA)) === '1';
  } catch {
    return false;
  }
}

export async function marcarBienvenidaDada(): Promise<void> {
  await AsyncStorage.setItem(CLAVE_BIENVENIDA, '1');
}

export type TelegramContacto = { id: string; nombre: string };

export type Perfil = {
  nombreAbuela: string;
  nombreAsistente: string;
  vozGenero: 'femenina' | 'masculina';
  generoUsuario?: 'femenino' | 'masculino';
  vozId?: string;
  edad?: number;
  familiares: string[];
  gustos: string[];
  medicamentos: string[];
  fechasImportantes: string[];
  recuerdos: string[];
  fechaNacimiento?: string;         // "MM-DD" ej: "03-19" — para cumpleaños propio
  horaInicioNoche?: number;         // hora en que empieza el modo noche (default 23)
  horaFinNoche?: number;            // hora en que termina el modo noche / arrancan charlas (default 9)
  telegramChatIds: string[];        // legacy — se migra automáticamente
  telegramContactos: TelegramContacto[];
};

export const perfilInicial: Perfil = {
  nombreAbuela: '',
  nombreAsistente: 'Rosita',
  vozGenero: 'femenina',
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

function limpiarDato(s: string): string {
  return s.replace(/[\n\r]/g, ' ').replace(/[[\]]/g, '').trim().slice(0, 200);
}

export function construirContexto(perfil: Perfil): string {
  const san = (arr: string[]) => arr.map(limpiarDato).filter(Boolean);
  const cumple = (() => {
    if (!perfil.fechaNacimiento) return '';
    const [mm, dd] = perfil.fechaNacimiento.split('-');
    return ` Su cumpleaños es el ${dd}/${mm}.`;
  })();
  const lineas = [
    `El nombre de la persona con quien hablás es ${limpiarDato(perfil.nombreAbuela)}${perfil.edad ? `, tiene ${perfil.edad} años` : ''}.${cumple}`,
  ];
  if (perfil.familiares.length > 0)
    lineas.push(`Sus familiares cercanos son: ${san(perfil.familiares).join(', ')}.`);
  if (perfil.gustos.length > 0)
    lineas.push(`Le gusta: ${san(perfil.gustos).join(', ')}.`);
  if (perfil.medicamentos.length > 0)
    lineas.push(`Sus medicamentos son: ${san(perfil.medicamentos).join(', ')}.`);
  if (perfil.fechasImportantes.length > 0)
    lineas.push(`Fechas importantes: ${san(perfil.fechasImportantes).join(', ')}.`);
  if (perfil.recuerdos.length > 0)
    lineas.push(`Cosas que ha contado: ${san(perfil.recuerdos).join(', ')}.`);
  return lineas.join('\n');
}
// ── Recordatorios diarios ────────────────────────────────────────────────────
// Guarda qué recordatorios (medicamentos, fechas) ya se enviaron hoy.
// Clave: "recordatorio_YYYY-MM-DD_nombre"

const CLAVE_RECORDATORIOS = 'rosa_recordatorios';

type RegistroRecordatorio = { clave: string; timestamp: number };

export function fechaLocal(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function claveHoy(nombre: string): string {
  return `${fechaLocal()}_${nombre}`;
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
  texto: string;       // "pagar la luz" o mensaje completo si esTimer=true
  fechaISO: string;    // "2026-03-21" — día en que hay que recordarlo
  timestampEpoch?: number; // unix ms — para recordatorios con hora exacta (timers largos)
  esTimer?: boolean;   // true → texto es el mensaje completo a decir directamente
  esAlarma?: boolean;  // true → alarma con hora exacta, se dispara a cualquier hora del día
  creadoEn: number;    // timestamp
};

const CLAVE_RECORDATORIOS_PERSONAL = 'rosa_recordatorios_personal';

export async function guardarRecordatorio(r: Recordatorio): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_RECORDATORIOS_PERSONAL);
    const lista: Recordatorio[] = data ? JSON.parse(data) : [];
    // Deduplicar: no guardar si ya existe uno en la misma fecha con texto muy similar
    const norm = (s: string) => s.toLowerCase().replace(/[^a-záéíóúñ0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const textoNorm = norm(r.texto);
    const yaExiste = lista.some(
      x => x.id === r.id || (x.fechaISO === r.fechaISO && norm(x.texto) === textoNorm),
    );
    if (yaExiste) return;
    lista.push(r);
    await AsyncStorage.setItem(CLAVE_RECORDATORIOS_PERSONAL, JSON.stringify(lista));
  } catch {}
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

// ── Listas ────────────────────────────────────────────────────────────────────

export type Lista = {
  id: string;
  nombre: string;      // "super", "tareas", "medicamentos", etc.
  items: string[];
  creadaEn: number;
};

const CLAVE_LISTAS = 'rosa_listas';

export async function cargarListas(): Promise<Lista[]> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_LISTAS);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export async function guardarLista(lista: Lista): Promise<void> {
  try {
    const todas = await cargarListas();
    // Reemplazar si ya existe una con el mismo nombre (case-insensitive)
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const idx = todas.findIndex(l => norm(l.nombre) === norm(lista.nombre));
    if (idx >= 0) todas[idx] = lista; else todas.push(lista);
    await AsyncStorage.setItem(CLAVE_LISTAS, JSON.stringify(todas));
  } catch {}
}

export async function agregarItemLista(nombreLista: string, item: string): Promise<void> {
  try {
    const todas = await cargarListas();
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const lista = todas.find(l => norm(l.nombre) === norm(nombreLista));
    if (lista) {
      lista.items.push(item);
    } else {
      // Crear la lista si no existía
      todas.push({ id: Date.now().toString(), nombre: nombreLista, items: [item], creadaEn: Date.now() });
    }
    await AsyncStorage.setItem(CLAVE_LISTAS, JSON.stringify(todas));
  } catch {}
}

export async function borrarLista(nombreLista: string): Promise<void> {
  try {
    const todas = await cargarListas();
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const nueva = todas.filter(l => norm(l.nombre) !== norm(nombreLista));
    await AsyncStorage.setItem(CLAVE_LISTAS, JSON.stringify(nueva));
  } catch {}
}

// ── Música escuchada hoy ─────────────────────────────────────────────────────

const CLAVE_MUSICA_HOY = 'rosa_musica_hoy';

export async function registrarMusicaHoy(): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_MUSICA_HOY);
    const stored = data ? JSON.parse(data) : { fecha: '', count: 0 };
    const hoy = fechaLocal();
    const count = stored.fecha === hoy ? stored.count + 1 : 1;
    await AsyncStorage.setItem(CLAVE_MUSICA_HOY, JSON.stringify({ fecha: hoy, count }));
  } catch {}
}

export async function musicaEscuchadaHoy(): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_MUSICA_HOY);
    if (!data) return false;
    const stored = JSON.parse(data);
    return stored.fecha === fechaLocal() && stored.count > 0;
  } catch {
    return false;
  }
}

// ── Última radio reproducida ─────────────────────────────────────────────────

const CLAVE_ULTIMA_RADIO = 'rosa_ultima_radio';

export async function guardarUltimaRadio(clave: string): Promise<void> {
  try { await AsyncStorage.setItem(CLAVE_ULTIMA_RADIO, clave); } catch {}
}

export async function cargarUltimaRadio(): Promise<string | null> {
  try { return await AsyncStorage.getItem(CLAVE_ULTIMA_RADIO); } catch { return null; }
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

// ── Resumen diario ───────────────────────────────────────────────────────────

const CLAVE_RESUMEN = 'rosa_resumen_enviado';

export async function yaEnvioResumen(): Promise<boolean> {
  try {
    const hoy = fechaLocal();
    const data = await AsyncStorage.getItem(CLAVE_RESUMEN);
    return data === hoy;
  } catch { return false; }
}

export async function marcarResumenEnviado(): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE_RESUMEN, fechaLocal());
  } catch {}
}

export async function borrarRecordatoriosViejos(): Promise<void> {
  try {
    const hoy = fechaLocal();
    const data = await AsyncStorage.getItem(CLAVE_RECORDATORIOS_PERSONAL);
    const lista: Recordatorio[] = data ? JSON.parse(data) : [];
    const nueva = lista.filter(r => r.fechaISO >= hoy);
    await AsyncStorage.setItem(CLAVE_RECORDATORIOS_PERSONAL, JSON.stringify(nueva));
  } catch {}
}