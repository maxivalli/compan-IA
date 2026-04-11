import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitPerfilLocalGuardado } from './perfilSync';

const CLAVE_PERFIL         = 'rosa_perfil';
const CLAVE_HISTORIAL      = 'rosa_historial';
const CLAVE_HISTORIAL_TS   = 'rosa_historial_ts';
const CLAVE_INSTALL_ID     = 'compania_install_id';
const CLAVE_FAMILIA_ID     = 'compania_familia_id';
const CLAVE_CODIGO_REG     = 'compania_codigo_registro';
const CLAVE_BIENVENIDA     = 'compania_bienvenida_dada';
const CLAVE_DEVICE_TOKEN   = 'compania_device_token';

let secureStoreModulePromise: Promise<null | {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}> | null = null;
let historialWriteQueue:     Promise<void> = Promise.resolve();
let animoWriteQueue:         Promise<void> = Promise.resolve();
let memoriaEpWriteQueue:     Promise<void> = Promise.resolve();
let recordatorioWriteQueue:  Promise<void> = Promise.resolve();
let seguimientosWriteQueue:  Promise<void> = Promise.resolve();

async function getSecureStore() {
  if (!secureStoreModulePromise) {
    secureStoreModulePromise = (async () => {
      try {
        const moduleName = 'expo-secure-store';
        const mod = await import(moduleName);
        return mod;
      } catch {
        secureStoreModulePromise = null;
        return null;
      }
    })();
  }
  return secureStoreModulePromise;
}

export function normalizarTextoPlano(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ── Identidad del dispositivo ─────────────────────────────────────────────────

export async function obtenerDeviceToken(): Promise<string | null> {
  try {
    const secureStore = await getSecureStore();
    if (secureStore) {
      const secureValue = await secureStore.getItemAsync(CLAVE_DEVICE_TOKEN);
      if (secureValue) return secureValue;
    }
    return await AsyncStorage.getItem(CLAVE_DEVICE_TOKEN);
  } catch {
    return null;
  }
}

export async function guardarDeviceToken(token: string): Promise<void> {
  const secureStore = await getSecureStore();
  if (secureStore) {
    await secureStore.setItemAsync(CLAVE_DEVICE_TOKEN, token);
    await AsyncStorage.removeItem(CLAVE_DEVICE_TOKEN).catch(() => {});
    return;
  }
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
  deteccionPresenciaActiva?: boolean; // cámara frontal detecta presencia tras 30 min inactivo
  condicionFisica?: string;           // ej: "usa andador, no puede doblar rodillas" — guía los ejercicios proactivos
  monitoreoActivo?: boolean;          // heartbeat cada 10 min → backend alerta si la app se cierra o pierde señal
  cabezaGato?: boolean;               // mostrar cabeza de gato sobre los ojos (default true)
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
  emitPerfilLocalGuardado();
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
  historialWriteQueue = historialWriteQueue.then(async () => {
    const actual = await cargarHistorial();
    const merged: { role: string; content: string }[] = [];
    // Deduplicar por rol+contenido pero solo DENTRO de cada fuente, no colapsando
    // mensajes idénticos legítimos (ej: "Hola" dicho dos veces). La estrategia:
    // agregar actual completo, luego solo los mensajes del nuevo historial que
    // no estén en actual por posición (usamos el último tramo nuevo).
    const actualSet = new Set(actual.map((m, i) => `${i}:${m.role}\0${m.content}`));
    const soloNuevos = historial.filter(m => !actual.some(a => a.role === m.role && a.content === m.content));
    const combinado = [...actual, ...soloNuevos];
    await AsyncStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(combinado.slice(-40)));
    await AsyncStorage.setItem(CLAVE_HISTORIAL_TS, String(Date.now()));
    void actualSet; void merged; // silence unused var lint
  }).catch(() => {});
  await historialWriteQueue;
}

/**
 * Carga el historial y lo limpia según cuánto tiempo pasó desde la última charla.
 * - < 8 horas: devuelve completo (misma sesión o misma mañana)
 * - 8–48 horas: devuelve solo los últimos 6 mensajes (3 turnos de continuidad)
 * - > 48 horas: devuelve vacío (sesión completamente nueva)
 */
export async function cargarHistorialConLimpieza(): Promise<{ role: string; content: string }[]> {
  const historial = await cargarHistorial();
  if (!historial.length) return historial;
  try {
    const tsStr = await AsyncStorage.getItem(CLAVE_HISTORIAL_TS);
    if (!tsStr) return historial; // historial sin timestamp → no tocar
    const ts = parseInt(tsStr, 10);
    const horasTranscurridas = (Date.now() - ts) / (1000 * 60 * 60);
    if (horasTranscurridas < 8) return historial;
    if (horasTranscurridas < 48) return historial.slice(-6);
    return [];
  } catch {
    return historial;
  }
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
  animoWriteQueue = animoWriteQueue.then(async () => {
    let historial: EntradaAnimo[] = [];
    try {
      const data = await AsyncStorage.getItem(CLAVE_ANIMO);
      historial = data ? JSON.parse(data) : [];
      if (!Array.isArray(historial)) historial = [];
    } catch {
      historial = [];
    }
    historial.push({ expresion, timestamp: Date.now() });
    await AsyncStorage.setItem(CLAVE_ANIMO, JSON.stringify(historial.slice(-500)));
  }).catch(() => {});
  await animoWriteQueue;
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

// ── Memoria episódica ────────────────────────────────────────────────────────

export type MemoriaEpisodica = {
  id: string;
  resumen: string;
  keywords: string[];
  categoria?: CategoriaMemoria;
  createdAt: number;
  updatedAt: number;
  lastAskedAt: number;
  mentions: number;
};

export type CategoriaMemoria = 'familia' | 'salud' | 'gustos' | 'recetas' | 'recuerdos' | 'entretenimiento' | 'otro';

export function inferirCategoria(resumen: string, keywords: string[]): CategoriaMemoria {
  const t = (resumen + ' ' + keywords.join(' ')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(hijo|hija|nieto|nieta|hermano|hermana|mama|papa|madre|padre|esposo|esposa|marido|familiar|familia|nacio|nacimiento|boda|casamiento|divorcio)\b/.test(t)) return 'familia';
  if (/\b(dolor|salud|medico|medicamento|pastilla|remedio|enfermedad|cirugia|operacion|hospital|clinica|artritis|diabetes|colesterol|presion|corazon|espalda|rodilla|andador|ejercicio|rehabilitacion)\b/.test(t)) return 'salud';
  if (/\b(gusta|prefiere|le encanta|favorito|favorita|disfruta|pasion|hobby|bordar|coser|tejer|jardin|musica|bailar|leer|libro|pelicula|serie|novela|tango|folklore)\b/.test(t)) return 'gustos';
  if (/\b(receta|ingrediente|cocinar|cocina|horno|salsa|masa|guiso|torta|pastel|empanada|milanesa|asado|fideos|arroz|sopa|caldo|postre|dulce|mermelada)\b/.test(t)) return 'recetas';
  if (/\b(recuerdo|cuando era|de chica|de joven|infancia|ninez|adolescencia|antes|antiguamente|guerra|peron|epoca|aquel|anecdota|historia|viaje|fui a|estuve en|vivi en)\b/.test(t)) return 'recuerdos';
  if (/\b(programa|canal|tele|television|radio|cancion|artista|actor|actriz|pelicula|serie|novela|chiste|cuento|juego|tateti|ahorcado)\b/.test(t)) return 'entretenimiento';
  return 'otro';
}

const CLAVE_MEMORIA_EPISODICA = 'rosa_memoria_episodica';
const STOPWORDS_MEMORIA = new Set([
  'a', 'al', 'algo', 'ante', 'antes', 'buenas', 'buenos', 'como', 'con', 'cual', 'cuales', 'cuál', 'cuáles',
  'de', 'del', 'desde', 'donde', 'dos', 'el', 'ella', 'ellas', 'ellos', 'en', 'era', 'eres', 'es', 'esa',
  'ese', 'eso', 'esta', 'estaba', 'estado', 'estamos', 'estan', 'estar', 'estas', 'este', 'esto', 'fue',
  'gracias', 'hablar', 'hablamos', 'hola', 'hoy', 'la', 'las', 'le', 'les', 'lo', 'los', 'mas', 'me',
  'mi', 'mis', 'mucho', 'muy', 'no', 'nos', 'nuestra', 'nuestro', 'para', 'pero', 'poco', 'por', 'porque',
  'que', 'qué', 'receta', 'se', 'si', 'sin', 'sobre', 'su', 'sus', 'te', 'tema', 'tenia', 'teníamos',
  'todo', 'tu', 'un', 'una', 'uno', 'vos', 'ya',
]);

function limpiarTextoMemoria(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extraerKeywordsMemoria(texto: string, max = 8): string[] {
  const palabras = limpiarTextoMemoria(texto)
    .split(' ')
    .filter(p => p.length >= 4 && !STOPWORDS_MEMORIA.has(p));
  const pesos = new Map<string, number>();
  for (const palabra of palabras) {
    pesos.set(palabra, (pesos.get(palabra) ?? 0) + 1);
  }
  return [...pesos.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([palabra]) => palabra);
}

function truncarMemoria(texto: string, maxLen = 180): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= maxLen) return limpio;
  return `${limpio.slice(0, maxLen - 1).trimEnd()}…`;
}

function minOverlapRequerido(a: string[], b: string[]): number {
  const minLen = Math.min(a.length, b.length);
  // Con minLen <= 1 un threshold de 2 es inalcanzable → solo merge por texto exacto.
  // Evita que una memoria de 1 keyword colapse con cualquier memoria que la contenga.
  if (minLen <= 1) return 2;
  if (minLen === 2) return 2;
  return Math.min(3, minLen - 1);
}

function esTemaMemorable(textoUsuario: string): boolean {
  const t = limpiarTextoMemoria(textoUsuario);
  if (t.length < 18) return false;
  if (/\b(hola|chau|gracias|de nada|que hora|que dia|que fecha|clima|tiempo|llueve|temperatura)\b/.test(t)) return false;
  if (/\b(receta|ingredientes|cocinar|comida|horno|salsa|masa|guiso|torta|pastel)\b/.test(t)) return true;
  if (/\b(me acuerdo|te acordas|acordate|recorda|recordame|cuando era|mi mama|mi papa|mi hijo|mi hija|mi niet|mi hermano|mi hermana|mi mascota)\b/.test(t)) return true;
  if (/\b(me gusta|prefiero|siempre|nunca|suelo|antes|de chica|de chico|de joven|cumpleanos|cumpleanos|medicamento|dolor|salud)\b/.test(t)) return true;
  return extraerKeywordsMemoria(t).length >= 3;
}

function resumirMemoria(textoUsuario: string, textoAsistente: string): string {
  const usuario = truncarMemoria(textoUsuario, 110);
  const asistente = truncarMemoria(textoAsistente.replace(/\[[^\]]+\]\s*/g, ''), 110);
  const d = new Date();
  const fecha = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (asistente.length < 12) return `[${fecha}] Usuario: ${usuario}`;
  return `[${fecha}] Usuario: ${usuario}. Rosita: ${asistente}`;
}

export async function cargarMemoriasEpisodicas(): Promise<MemoriaEpisodica[]> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_MEMORIA_EPISODICA);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function guardarMemoriasEpisodicas(lista: MemoriaEpisodica[]): Promise<void> {
  try {
    const ordenadas = [...lista]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 80);
    await AsyncStorage.setItem(CLAVE_MEMORIA_EPISODICA, JSON.stringify(ordenadas));
  } catch {}
}

export async function registrarMemoriaEpisodica(textoUsuario: string, textoAsistente: string): Promise<void> {
  if (!esTemaMemorable(textoUsuario)) return;
  const resumen = resumirMemoria(textoUsuario, textoAsistente);
  const keywords = extraerKeywordsMemoria(`${textoUsuario} ${textoAsistente}`);
  if (keywords.length < 2) return;

  // Serializar con write queue para evitar race condition de read-modify-write
  // cuando dos respuestas llegan casi en paralelo.
  memoriaEpWriteQueue = memoriaEpWriteQueue.then(async () => {
    const ahora = Date.now();
    const memorias = await cargarMemoriasEpisodicas();
    const nuevaNorm = limpiarTextoMemoria(resumen);
    const existente = memorias.find(mem => {
      const overlap = mem.keywords.filter(k => keywords.includes(k)).length;
      return overlap >= minOverlapRequerido(mem.keywords, keywords) || limpiarTextoMemoria(mem.resumen) === nuevaNorm;
    });

    if (existente) {
      existente.resumen = resumen;
      existente.keywords = [...new Set([...keywords, ...existente.keywords])].slice(0, 10);
      existente.updatedAt = ahora;
      existente.lastAskedAt = ahora;
      existente.mentions += 1;
    } else {
      memorias.push({
        id: `${ahora}_${Math.random().toString(36).slice(2, 8)}`,
        categoria: inferirCategoria(resumen, keywords),
        resumen,
        keywords,
        createdAt: ahora,
        updatedAt: ahora,
        lastAskedAt: ahora,
        mentions: 1,
      });
    }
    await guardarMemoriasEpisodicas(memorias);
  }).catch(() => {});
  await memoriaEpWriteQueue;
}

export async function buscarMemoriasEpisodicas(query: string, limit = 3): Promise<MemoriaEpisodica[]> {
  const q = limpiarTextoMemoria(query);
  if (!q) return [];
  const qKeywords = extraerKeywordsMemoria(q, 10);
  if (qKeywords.length === 0 && q.length < 12) return [];

  const memorias = await cargarMemoriasEpisodicas();
  const ahora = Date.now();

  return memorias
    .map(mem => {
      const overlap = mem.keywords.filter(k => qKeywords.includes(k)).length;
      const resumenNorm = limpiarTextoMemoria(mem.resumen);
      const substringHit = q.length >= 6 && (resumenNorm.includes(q) || q.includes(resumenNorm.slice(0, 24)));
      const recencyDays = Math.max(1, (ahora - mem.updatedAt) / (24 * 60 * 60 * 1000));
      const recencyBoost = 1 / recencyDays;
      const score = overlap * 4 + (substringHit ? 5 : 0) + Math.min(mem.mentions, 4) + recencyBoost;
      return { mem, score };
    })
    .filter(item => item.score >= 4)
    .sort((a, b) => b.score - a.score || b.mem.updatedAt - a.mem.updatedAt)
    .slice(0, limit)
    .map(item => item.mem);
}

export function construirResumenMemoriasEpisodicas(
  memorias: MemoriaEpisodica[],
  opciones?: { limit?: number; maxChars?: number },
): string {
  const limit = opciones?.limit ?? 12;
  const maxChars = opciones?.maxChars ?? 2400;
  const ordenadas = [...memorias]
    .sort((a, b) => b.updatedAt - a.updatedAt || b.mentions - a.mentions)
    .slice(0, limit);

  if (!ordenadas.length) {
    return 'Memoria episódica: todavía no hay charlas previas resumidas.';
  }

  const CATEGORIA_LABELS: Record<string, string> = {
    familia: '👨‍👩‍👧 Familia',
    salud: '🏥 Salud',
    gustos: '💝 Gustos',
    recetas: '🍲 Recetas',
    recuerdos: '📖 Recuerdos',
    entretenimiento: '🎭 Entretenimiento',
    otro: '💬 Otros temas',
  };

  const lineas: string[] = ['Memoria episódica:'];

  // Group by category
  const porCategoria = new Map<string, MemoriaEpisodica[]>();
  for (const memoria of ordenadas) {
    const cat = memoria.categoria ?? 'otro';
    if (!porCategoria.has(cat)) porCategoria.set(cat, []);
    porCategoria.get(cat)!.push(memoria);
  }

  // Order: familia, salud, recuerdos, gustos, recetas, entretenimiento, otro
  const categoriaOrden = ['familia', 'salud', 'recuerdos', 'gustos', 'recetas', 'entretenimiento', 'otro'];
  for (const cat of categoriaOrden) {
    const mems = porCategoria.get(cat);
    if (!mems?.length) continue;
    const label = CATEGORIA_LABELS[cat] ?? cat;
    for (const memoria of mems) {
      const linea = `- [${label}] ${truncarMemoria(memoria.resumen, 180)}`;
      const tamañoActual = lineas.join('\n').length;
      if (tamañoActual + linea.length + 1 > maxChars) break;
      lineas.push(linea);
    }
  }

  lineas.push('Usala para continuidad si realmente suma.');
  return lineas.join('\n');
}

// ── Contexto ─────────────────────────────────────────────────────────────────

function limpiarDato(s: string): string {
  return s.replace(/[\n\r]/g, ' ').replace(/[[\]]/g, '').trim().slice(0, 200);
}

export function construirContexto(perfil: Perfil, incluirRecuerdos = true): string {
  const san = (arr: string[]) => arr.map(limpiarDato).filter(Boolean);
  const cumple = (() => {
    if (!perfil.fechaNacimiento) return '';
    const [mm, dd] = perfil.fechaNacimiento.split('-');
    return ` Su cumpleaños es el ${dd}/${mm}.`;
  })();
  const lineas = [
    `La persona principal del perfil es ${limpiarDato(perfil.nombreAbuela)}${perfil.edad ? `, tiene ${perfil.edad} años` : ''}.${cumple}`,
  ];
  if (perfil.familiares.length > 0)
    lineas.push(`Familiares cercanos: ${san(perfil.familiares).slice(0, 8).join(', ')}.`);
  if (perfil.gustos.length > 0)
    lineas.push(`Le gusta: ${san(perfil.gustos).slice(0, 8).join(', ')}.`);
  if (perfil.medicamentos.length > 0)
    lineas.push(`Medicamentos: ${san(perfil.medicamentos).slice(0, 6).join(', ')}.`);
  if (perfil.fechasImportantes.length > 0)
    lineas.push(`Fechas importantes: ${san(perfil.fechasImportantes).slice(0, 8).join(', ')}.`);
  if (incluirRecuerdos && perfil.recuerdos.length > 0)
    lineas.push(`Cosas que contó: ${san(perfil.recuerdos).slice(0, 10).join(', ')}.`);
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
  // Serializar con write queue — useBrain puede llamar esto dos veces
  // casi en paralelo (timer + recordatorio en el mismo turno).
  recordatorioWriteQueue = recordatorioWriteQueue.then(async () => {
    try {
      const data = await AsyncStorage.getItem(CLAVE_RECORDATORIOS_PERSONAL);
      const lista: Recordatorio[] = data ? JSON.parse(data) : [];
      const norm = (s: string) => s.toLowerCase().replace(/[^a-záéíóúñ0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const textoNorm = norm(r.texto);
      const yaExiste = lista.some(
        x => x.id === r.id || (x.fechaISO === r.fechaISO && norm(x.texto) === textoNorm),
      );
      if (yaExiste) return;
      lista.push(r);
      await AsyncStorage.setItem(CLAVE_RECORDATORIOS_PERSONAL, JSON.stringify(lista));
    } catch {}
  }).catch(() => {});
  await recordatorioWriteQueue;
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

// ── Seguimientos pendientes ───────────────────────────────────────────────────
// Temas que quedaron abiertos en charlas anteriores y que Rosita debería retomar
// (ej: "alguien que iba a llegar", "evento pendiente", "promesa de contar algo").

export type Seguimiento = {
  id: string;
  descripcion: string;   // primera persona de Rosita: "preguntar cómo le fue con la hermana"
  creadoEn: number;      // unix ms
  expiresAt: number;     // unix ms — creadoEn + 72h
};

const CLAVE_SEGUIMIENTOS = 'rosa_seguimientos';
const SEGUIMIENTOS_MAX   = 5;
const SEGUIMIENTOS_TTL   = 72 * 60 * 60 * 1000; // 72 horas en ms

export async function cargarSeguimientos(): Promise<Seguimiento[]> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_SEGUIMIENTOS);
    if (!data) return [];
    const lista: Seguimiento[] = JSON.parse(data);
    const ahora = Date.now();
    const vigentes = lista.filter(s => s.expiresAt > ahora);
    // Persistir si expiró alguno
    if (vigentes.length !== lista.length) {
      await AsyncStorage.setItem(CLAVE_SEGUIMIENTOS, JSON.stringify(vigentes));
    }
    return vigentes;
  } catch { return []; }
}

export async function guardarSeguimiento(s: Seguimiento): Promise<void> {
  seguimientosWriteQueue = seguimientosWriteQueue.then(async () => {
    try {
      const data = await AsyncStorage.getItem(CLAVE_SEGUIMIENTOS);
      const lista: Seguimiento[] = data ? JSON.parse(data) : [];
      const norm = (t: string) =>
        t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const descNorm = norm(s.descripcion.slice(0, 120));
      // Deduplicar por similitud de descripción
      const yaExiste = lista.some(x => norm(x.descripcion.slice(0, 120)) === descNorm);
      if (yaExiste) return;
      // Aplicar cap: si llegamos al máximo, evictar el más viejo
      const nuevaLista = lista.length >= SEGUIMIENTOS_MAX
        ? [...lista.sort((a, b) => a.creadoEn - b.creadoEn).slice(1), s]
        : [...lista, s];
      await AsyncStorage.setItem(CLAVE_SEGUIMIENTOS, JSON.stringify(nuevaLista));
    } catch {}
  }).catch(() => {});
  await seguimientosWriteQueue;
}

export async function borrarSeguimiento(id: string): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(CLAVE_SEGUIMIENTOS);
    if (!data) return;
    const lista: Seguimiento[] = JSON.parse(data);
    await AsyncStorage.setItem(CLAVE_SEGUIMIENTOS, JSON.stringify(lista.filter(s => s.id !== id)));
  } catch {}
}

export async function borrarTodosSeguimientos(): Promise<void> {
  try { await AsyncStorage.removeItem(CLAVE_SEGUIMIENTOS); } catch {}
}

export function construirTextoSeguimientos(lista: Seguimiento[]): string {
  if (!lista.length) return '';
  const items = lista
    .slice(0, SEGUIMIENTOS_MAX)
    .map(s => `- ${s.descripcion.slice(0, 120).replace(/[\[\]\n]/g, ' ').trim()}`)
    .join('\n');
  return `SEGUIMIENTOS PENDIENTES (cosas que quedaron abiertas en charlas anteriores, retomálas si surge naturalmente):\n${items}`;
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
