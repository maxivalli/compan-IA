import { Expresion } from '../components/RosaOjos';
import { ExpresionAnimo, Perfil, Recordatorio, TelegramContacto, normalizarTextoPlano } from './memoria';
import { construirContexto } from './memoria';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type TagPrincipal =
  | 'PARAR_MUSICA'
  | 'LINTERNA'
  | 'MUSICA'
  | 'FELIZ' | 'TRISTE' | 'SORPRENDIDA' | 'PENSATIVA' | 'NEUTRAL'
  | 'CUENTO' | 'JUEGO' | 'CHISTE' | 'ENOJADA' | 'AVERGONZADA' | 'CANSADA'
  | 'TERNURA' | 'PREOCUPADA' | 'ENTUSIASMADA';

export type Dispositivo = {
  id: string;
  nombre: string;
  tipo: string;
  online: boolean;
  estado?: boolean;
};

export type RespuestaParsed = {
  tagPrincipal: TagPrincipal;
  generoMusica?: string;           // solo si tagPrincipal === 'MUSICA'
  respuesta: string;               // texto limpio para hablar
  expresion: Expresion;
  animoUsuario: ExpresionAnimo;
  recuerdos: string[];
  timerSegundos?: number;
  recordatorio?: Recordatorio;
  mensajeFamiliar?: { nombreDestino: string; texto: string };
  llamarFamilia?: string;          // motivo
  emergencia?: string;             // síntoma
  alarma?: { timestampEpoch: number; texto: string };
  domotica?: {
    tipo: 'control' | 'estado' | 'todo';
    dispositivoNombre: string;
    codigo: string;
    valor?: boolean | number;
  };
  listaNueva?: { nombre: string; items: string[] };
  listaAgregar?: { nombre: string; item: string };
  listaBorrar?: string;
};

const ANIMOS_VALIDOS: ExpresionAnimo[] = ['feliz', 'triste', 'sorprendida', 'pensativa', 'neutral'];

function expresionSegunTag(tag: TagPrincipal): Expresion {
  switch (tag) {
    case 'CUENTO':
      return 'mimada';
    case 'JUEGO':
      return 'feliz';
    case 'CHISTE':
      return 'chiste';
    case 'ENOJADA':
      return 'enojada';
    case 'AVERGONZADA':
      return 'avergonzada';
    case 'CANSADA':
      return 'cansada';
    case 'FELIZ':
      return 'feliz';
    case 'TERNURA':
      return 'ternura';
    case 'TRISTE':
      return 'triste';
    case 'SORPRENDIDA':
      return 'sorprendida';
    case 'PENSATIVA':
      return 'pensativa';
    case 'PREOCUPADA':
      return 'preocupada';
    case 'ENTUSIASMADA':
      return 'entusiasmada';
    case 'NEUTRAL':
    default:
      return 'neutral';
  }
}

function animoFallbackSegunTag(tag: TagPrincipal): ExpresionAnimo {
  switch (tag) {
    case 'FELIZ':
    case 'CUENTO':
    case 'JUEGO':
    case 'CHISTE':
      return 'feliz';
    case 'TRISTE':
      return 'triste';
    case 'SORPRENDIDA':
      return 'sorprendida';
    case 'PENSATIVA':
    case 'CANSADA':
      return 'pensativa';
    case 'ENOJADA':
    case 'AVERGONZADA':
    case 'NEUTRAL':
    default:
      return 'neutral';
  }
}

// ── Helpers públicos ──────────────────────────────────────────────────────────

export function hashTexto(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h) ^ texto.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function detectarGenero(tag: string): string {
  const t = normalizarTextoPlano(tag);

  // Géneros musicales
  const mapa: [string, string[]][] = [
    // Radios específicas — van antes que los géneros para evitar falsos positivos
    ['convos',      ['convos', 'con vos', 'convo', 'radio con vos', '89.9', '899']],
    ['cadena3',     ['cadena3', 'cadena 3']],
    ['mitre',       ['mitre']],
    ['continental', ['continental']],
    ['rivadavia',   ['rivadavia']],
    ['lared',       ['lared', 'la red']],
    ['metro',       ['metro']],
    ['aspen',       ['aspen']],
    ['la100',       ['la100', 'la 100']],
    ['folklorenac', ['folklorenac', 'nacional folklorica', 'folklorica nacional']],
    ['rockpop',     ['rockpop', 'rock and pop', 'rock & pop']],
    ['urbana',      ['urbana', 'urbana play']],
    ['radio10',     ['radio10', 'radio 10']],
    ['destape',     ['destape', 'el destape']],
    ['mega',        ['mega', 'mega 98']],
    ['vida',        ['vida', 'fm vida']],
    ['lv3',         ['lv3', 'lv 3']],
    ['delplata',    ['delplata', 'del plata', 'radio del plata']],
    ['lt8',         ['lt8', 'lt 8']],
    // Géneros
    ['tango',     ['tango', 'milonga', 'piazzolla', 'gardel']],
    ['bolero',    ['bolero', 'besame', 'trio los panchos']],
    ['folklore',  ['folklore', 'folclore', 'folklo', 'chacarera', 'zamba', 'chamame', 'cueca', 'vidala']],
    ['romantica', ['romantica', 'romantico', 'balada', 'baladas']],
    ['clasica',   ['clasica', 'classical', 'clasico', 'beethoven', 'mozart', 'opera', 'orquesta']],
    ['jazz',      ['jazz', 'swing', 'blues']],
    ['cumbia',    ['cumbia', 'tropical', 'bailanta', 'cuarteto cordobes']],
    ['cuarteto',  ['cuarteto']],
    ['rock',      ['rock nacional', 'rock argentino', 'rock and roll']],
    ['salsa',     ['salsa', 'merengue', 'bachata']],
    ['pop',       ['pop', 'moderna', 'moderno', 'contemporanea', 'contemporaneo']],
  ];
  for (const [genero, palabras] of mapa) {
    if (palabras.some(p => t.includes(p))) return genero;
  }
  return ''; // sin match → la clave vacía se maneja con búsqueda abierta en useBrain
}

export function respuestaOffline(
  texto: string,
  nombreAbuela: string,
  nombreAsistente: string,
  climaTexto: string,
  vozGenero: 'femenina' | 'masculina' = 'femenina',
): string | null {
  const t = normalizarTextoPlano(texto);
  const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const reglasOffline: Array<{ patron: RegExp; respuesta: () => string }> = [
    {
      patron: /\b(hola|buen[oa]s|como estas|como te va|que tal)\b/,
      respuesta: () => `¡Hola ${nombreAbuela}! Ahora mismo no tengo conexión, pero acá estoy con vos.`,
    },
    {
      patron: /\b(que hora|que dia|que fecha|hoy es)\b/,
      respuesta: () => {
        const ahora = new Date();
        return `Hoy es ${dias[ahora.getDay()]} ${ahora.getDate()} de ${meses[ahora.getMonth()]}, y son las ${ahora.getHours()}:${String(ahora.getMinutes()).padStart(2,'0')}.`;
      },
    },
    {
      patron: /\b(clima|tiempo|calor|frio|lluvi|temperatura)\b/,
      respuesta: () => climaTexto
        ? `Según la última consulta: ${climaTexto}`
        : `No tengo información del clima en este momento, ${nombreAbuela}.`,
    },
    {
      patron: /\b(musica|pone|toca|cancion|radio|para|para la musica|silencio|apaga)\b/,
      respuesta: () => `Necesito conexión para eso, ${nombreAbuela}. Probá en un ratito.`,
    },
    {
      patron: /\b(bien|mal|cansad|dolor|siento)\b/,
      respuesta: () => `Gracias por contarme, ${nombreAbuela}. En cuanto tenga conexión podemos charlar mejor.`,
    },
    {
      patron: /\b(chiste|cuento|historia)\b/,
      respuesta: () => `Me encantaría contarte algo, pero necesito conexión para pensar bien. ¡Preguntame cuando vuelva la señal!`,
    },
    {
      patron: /\b(ayuda|auxilio|emergencia|me cai|me duele|no puedo)\b/,
      respuesta: () => `${nombreAbuela}, ahora mismo no tengo señal y no puedo avisar a tu familia. Pedile ayuda a alguien que tengas cerca.`,
    },
    {
      patron: /\b(gracias|graci)\b/,
      respuesta: () => `De nada, ${nombreAbuela}. Acá estoy siempre.`,
    },
    {
      patron: /\b(adios|chau|hasta luego|nos vemos)\b/,
      respuesta: () => `¡Hasta luego, ${nombreAbuela}! Cuando quieras, acá estoy.`,
    },
    {
      patron: /\b(nombre|como te llamas|quien sos)\b/,
      respuesta: () => `Soy ${nombreAsistente}, tu ${vozGenero === 'masculina' ? 'compañero' : 'compañera'}. Ahora mismo no tengo señal, pero no me voy a ningún lado.`,
    },
    {
      patron: /\b(broma|reir|gracioso)\b/,
      respuesta: () => `Ahora no se me ocurre ninguna, ${nombreAbuela}. ¡Cuando vuelva la señal te cuento algo divertido!`,
    },
  ];
  for (const regla of reglasOffline) {
    if (regla.patron.test(t)) return regla.respuesta();
  }
  // Fallback general — siempre responde algo cálido
  const frasesFallback = [
    `Ahora mismo no tengo conexión, ${nombreAbuela}, pero acá estoy con vos. Volvé a hablarme en un ratito.`,
    `No me llega bien la señal, ${nombreAbuela}. Dame unos minutos y vuelvo a estar ${vozGenero === 'masculina' ? 'completo' : 'completa'}.`,
    `Estoy sin internet por ahora, ${nombreAbuela}, pero no te preocupes que en cuanto vuelva la señal seguimos charlando.`,
  ];
  return frasesFallback[Math.floor(Math.random() * frasesFallback.length)];
}

// ── Detección de fechas próximas ──────────────────────────────────────────────

const MESES_MAP: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

export function detectarFechasProximas(fechas: string[], diasAnticipacion = 3): string[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(hoy);
  limite.setDate(hoy.getDate() + diasAnticipacion);

  return fechas.filter(f => {
    const texto = f.toLowerCase();

    const matchISO = texto.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (matchISO) {
      const fecha = new Date(parseInt(matchISO[1]), parseInt(matchISO[2]) - 1, parseInt(matchISO[3]));
      return fecha >= hoy && fecha <= limite;
    }

    const matchDiaMes = texto.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)/);
    if (matchDiaMes) {
      const dia = parseInt(matchDiaMes[1]);
      const mes = MESES_MAP[matchDiaMes[2]];
      if (mes !== undefined) {
        const anio =
          hoy.getMonth() > mes || (hoy.getMonth() === mes && hoy.getDate() > dia)
            ? hoy.getFullYear() + 1
            : hoy.getFullYear();
        const fecha = new Date(anio, mes, dia);
        return fecha >= hoy && fecha <= limite;
      }
    }

    const matchSlash = texto.match(/(\d{1,2})\/(\d{1,2})/);
    if (matchSlash) {
      const dia = parseInt(matchSlash[1]);
      const mes = parseInt(matchSlash[2]) - 1;
      const anio =
        hoy.getMonth() > mes || (hoy.getMonth() === mes && hoy.getDate() > dia)
          ? hoy.getFullYear() + 1
          : hoy.getFullYear();
      const fecha = new Date(anio, mes, dia);
      return fecha >= hoy && fecha <= limite;
    }

    return false;
  });
}

export function velocidadSegunEdad(edad?: number): number {
  if (!edad)    return 0.92; // fallback seguro
  if (edad < 40) return 1.00;
  if (edad < 60) return 0.95;
  if (edad < 75) return 0.90;
  return 0.85;
}

export function tonoSegunEdad(edad?: number): string {
  if (!edad) return `Hablás en español rioplatense, con cariño y sin apuro. Usás frases cortas y claras. Nunca sos condescendiente.`;
  if (edad < 18) return `Hablás en español rioplatense, con energía y entusiasmo. Usás un lenguaje juvenil y natural, dinámico y directo. Podés usar expresiones modernas pero sin exagerar.`;
  if (edad < 41) return `Hablás en español rioplatense, de manera directa y natural, como con un par. Sin simplificaciones ni paternalismos. Podés ser más conciso.`;
  if (edad < 61) return `Hablás en español rioplatense, con calidez y respeto. Tono conversacional adulto, sin apuro ni simplificaciones.`;
  return `Hablás en español rioplatense, con cariño y sin apuro. Usás frases cortas y claras. Nunca sos condescendiente.`;
}

// ── Parser principal ──────────────────────────────────────────────────────────

function esFechaISOValida(fechaISO: string): boolean {
  const match = fechaISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function normalizarTagPrincipalInline(respuestaRaw: string): string {
  const tagInline = respuestaRaw.match(/\[(PARAR_MUSICA|LINTERNA|MUSICA:\s*[^\]]+|FELIZ|TRISTE|SORPRENDIDA|PENSATIVA|NEUTRAL|CUENTO|JUEGO|CHISTE|ENOJADA|AVERGONZADA|CANSADA|TERNURA|PREOCUPADA|ENTUSIASMADA)\]/i);
  if (!tagInline || tagInline.index === undefined || tagInline.index <= 0 || tagInline.index >= 80) return respuestaRaw;
  const prefix = respuestaRaw.slice(0, tagInline.index).trim();
  const suffix = respuestaRaw.slice(tagInline.index + tagInline[0].length).trim();
  return `${tagInline[0]} ${[prefix, suffix].filter(Boolean).join(' ')}`.trim();
}

function limpiarTagsFinales(texto: string): string {
  return texto
    .replace(/\[ANIMO_USUARIO:[^\]]*\]?\s*/gi, '')
    .replace(/\[RECUERDO:[^\]]*\]?\s*/gi, '')
    .replace(/\[LLAMAR_FAMILIA:[^\]]*\]?\s*/gi, '')
    .replace(/\[EMERGENCIA:[^\]]*\]?\s*/gi, '')
    .replace(/\[MENSAJE_FAMILIAR:[^\]]*\]?\s*/gi, '')
    .replace(/\[RECORDATORIO:[^\]]*\]?\s*/gi, '')
    .replace(/\[ALARMA:[^\]]*\]?\s*/gi, '')
    .replace(/\[TIMER:\s*\d+\]?\s*/gi, '')
    .replace(/\[LINTERNA\]\s*/gi, '')
    .replace(/\[DOMOTICA[^\]]*\]?\s*/gi, '')
    .replace(/\[DOMOTICA_ESTADO:[^\]]*\]?\s*/gi, '')
    .replace(/\[LISTA_NUEVA:[^\]]*\]?\s*/gi, '')
    .replace(/\[LISTA_AGREGAR:[^\]]*\]?\s*/gi, '')
    .replace(/\[LISTA_BORRAR:[^\]]*\]?\s*/gi, '')
    .replace(/\[(FELIZ|TRISTE|SORPRENDIDA|PENSATIVA|NEUTRAL|CUENTO|JUEGO|CHISTE|ENOJADA|AVERGONZADA|CANSADA|TERNURA|PREOCUPADA|ENTUSIASMADA)\]/gi, '')
    .trim();
}

function resolverContacto(
  nombreDestino: string,
  contactos: TelegramContacto[],
  familiares: string[],
): TelegramContacto | null {
  function norm(t: string) {
    return normalizarTextoPlano(t);
  }
  function palabras(t: string): string[] {
    return norm(t).split(/[\s,]+/).filter(p => p.length >= 3);
  }
  const palabrasDestino = palabras(nombreDestino);

  function scoreContacto(contacto: TelegramContacto): number {
    const palTelegram = palabras(contacto.nombre);
    // Match exacto (score 4) tiene prioridad sobre substring (score 2)
    // para evitar que "Juan" matchee "Juanita" con el mismo puntaje
    const matchExacto    = palabrasDestino.filter(p => palTelegram.some(t => t === p)).length;
    const matchSubstring = palabrasDestino.filter(p =>
      palTelegram.some(t => t !== p && (t.includes(p) || p.includes(t)))
    ).length;
    if (matchExacto > 0)    return matchExacto * 4 + matchSubstring * 2;
    if (matchSubstring > 0) return matchSubstring * 2;
    for (const familiar of familiares) {
      const palFamiliar = palabras(familiar);
      const destinoEnFamiliar = palabrasDestino.some(p =>
        palFamiliar.some(f => f === p || f.includes(p) || p.includes(f))
      );
      if (!destinoEnFamiliar) continue;
      const familiarEnTelegram = palFamiliar.some(f =>
        palTelegram.some(t => t === f || t.includes(f) || f.includes(t))
      );
      if (familiarEnTelegram) return 1;
    }
    return 0;
  }

  return contactos
    .map(c => ({ contacto: c, score: scoreContacto(c) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.contacto ?? null;
}

export function parsearRespuesta(
  respuestaRaw: string,
  contactos: TelegramContacto[],
  familiares: string[],
): RespuestaParsed {
  const respuestaNormalizada = normalizarTagPrincipalInline(respuestaRaw);
  // Normalizar: algunos modelos agregan texto antes del tag principal
  // Ej: "¡Claro! [MUSICA: tango]..." → "[MUSICA: tango]..."
  // Solo hacer el slice si el bracket abre un TAG PRINCIPAL — evita tirar el texto
  // hablable cuando el primer "[" es un tag secundario como [ANIMO_USUARIO:].
  const PATRON_TAG_PRINCIPAL = /^\[(?:PARAR_MUSICA|LINTERNA|MUSICA:|FELIZ|TRISTE|SORPRENDIDA|PENSATIVA|NEUTRAL|CUENTO|JUEGO|CHISTE|ENOJADA|AVERGONZADA|CANSADA|TERNURA|PREOCUPADA|ENTUSIASMADA)/i;
  const firstBracket = respuestaNormalizada.indexOf('[');
  const raw = firstBracket > 0 && firstBracket < 80 && PATRON_TAG_PRINCIPAL.test(respuestaNormalizada.slice(firstBracket))
    ? respuestaNormalizada.slice(firstBracket)
    : respuestaNormalizada;

  // ── PARAR_MUSICA ──
  if (/^\[PARAR_MUSICA\]/i.test(raw)) {
    const respuesta = limpiarTagsFinales(raw.replace(/^\[PARAR_MUSICA\]\s*/, ''));
    return { tagPrincipal: 'PARAR_MUSICA', respuesta, expresion: 'neutral', animoUsuario: 'neutral', recuerdos: [] };
  }

  // ── LINTERNA ──
  if (/^\[LINTERNA\]/i.test(raw)) {
    const respuesta = limpiarTagsFinales(raw.replace(/^\[LINTERNA\]\s*/, ''));
    return { tagPrincipal: 'LINTERNA', respuesta, expresion: 'neutral', animoUsuario: 'neutral', recuerdos: [] };
  }

  // ── MUSICA ──
  // Busca [MUSICA:] en cualquier posición: Claude a veces antepone un tag de emoción
  // como [FELIZ] antes de [MUSICA: clave] en lugar de usarlo como único tag principal.
  const matchMusica = raw.match(/\[MUSICA:\s*(.+?)\]/i);
  if (matchMusica) {
    const generoMusica = detectarGenero(matchMusica[1].trim().toLowerCase());
    // Quitar el tag de emoción inicial (si lo hay) y el tag MUSICA del texto hablado
    const respuesta = limpiarTagsFinales(
      raw.replace(/^\[[^\]]+\]\s*/, '').replace(/\[MUSICA:[^\]]+\]\s*/gi, '')
    );
    return { tagPrincipal: 'MUSICA', generoMusica, respuesta, expresion: 'feliz', animoUsuario: 'neutral', recuerdos: [] };
  }
  // Fallback: Claude olvidó el tag pero el texto menciona explícitamente la música/radio.
  // Ej: "¡Dale, pongo Radio Vida!" sin [MUSICA: vida] → inferir el género del texto.
  const musicaEnTexto = raw.match(/(?:pongo|pon[eé]|escuch[aá])\s+(?:(?:la\s+|radio\s+|fm\s+)?(.+?))(?:\s+ahora|!|,|\.|\n|$)|va\s+(?:la\s+)?(?:radio|fm|musica)\s+(.+?)(?:\s+ahora|!|,|\.|\n|$)/i);
  if (musicaEnTexto) {
    const candidato = (musicaEnTexto[1] ?? musicaEnTexto[2] ?? '').trim();
    const generoInferido = detectarGenero(candidato);
    if (generoInferido) {
      const respuesta = limpiarTagsFinales(raw.replace(/\[ANIMO_USUARIO:[^\]]*\]?\s*/i, '').replace(/\[RECUERDO:[^\]]*\]?\s*/gi, '').trim());
      return { tagPrincipal: 'MUSICA', generoMusica: generoInferido, respuesta, expresion: 'feliz', animoUsuario: 'feliz', recuerdos: [] };
    }
  }

  // ── MENSAJE_FAMILIAR ──
  const mensajeMatch = raw.match(/\[MENSAJE_FAMILIAR:\s*(.+?)\s*\|\s*(.+?)\]/i);

  // ── TIMER ──
  const timerMatch = raw.match(/\[TIMER:\s*(\d+)\]/i);
  const timerSegundos = timerMatch ? parseInt(timerMatch[1], 10) : undefined;

  // ── DOMOTICA ──
  const domoticaTodoMatch    = /\[DOMOTICA_TODO\]/i.test(raw);
  const domoticaEstadoMatch  = raw.match(/\[DOMOTICA_ESTADO:\s*([^\]]+)\]/i);
  const domoticaControlMatch = raw.match(/\[DOMOTICA:\s*([^:\]]+)\s*:\s*([^:\]]+)\s*:\s*([^\]]+)\]/i);
  let domotica: RespuestaParsed['domotica'];
  if (domoticaTodoMatch) {
    domotica = { tipo: 'todo', dispositivoNombre: '', codigo: '', valor: undefined };
  } else if (domoticaEstadoMatch) {
    domotica = { tipo: 'estado', dispositivoNombre: domoticaEstadoMatch[1].trim(), codigo: '', valor: undefined };
  } else if (domoticaControlMatch) {
    const valorRaw = domoticaControlMatch[3].trim();
    const valor: boolean | number =
      valorRaw === 'true'  ? true  :
      valorRaw === 'false' ? false :
      !isNaN(Number(valorRaw)) ? Number(valorRaw) : true;
    domotica = {
      tipo: 'control',
      dispositivoNombre: domoticaControlMatch[1].trim(),
      codigo: domoticaControlMatch[2].trim(),
      valor,
    };
  }

  // ── LISTAS ──
  const listaNuevaMatch  = raw.match(/\[LISTA_NUEVA:\s*(.+?)\s*\|\s*(.*?)\]/i);
  const listaAgregarMatch = raw.match(/\[LISTA_AGREGAR:\s*(.+?)\s*\|\s*(.+?)\]/i);
  const listaBorrarMatch  = raw.match(/\[LISTA_BORRAR:\s*([^\]]+)\]/i);
  const listaNueva = listaNuevaMatch ? {
    nombre: listaNuevaMatch[1].trim(),
    items: listaNuevaMatch[2].trim()
      ? listaNuevaMatch[2].split(';').map(s => s.trim()).filter(Boolean)
      : [],
  } : undefined;
  const listaAgregar = listaAgregarMatch ? {
    nombre: listaAgregarMatch[1].trim(),
    item: listaAgregarMatch[2].trim(),
  } : undefined;
  const listaBorrar = listaBorrarMatch ? listaBorrarMatch[1].trim() : undefined;

  // ── RECORDATORIO ──
  const recordatorioMatch = raw.match(/\[RECORDATORIO:\s*(.+?)\s*\|\s*(.+?)\]/i);
  const recordatorioFechaRaw = recordatorioMatch?.[1]?.trim() ?? '';
  const d = new Date();
  const fechaHoyLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const recordatorioFechaValida = /^\d{4}-\d{2}-\d{2}$/.test(recordatorioFechaRaw)
    && esFechaISOValida(recordatorioFechaRaw)
    && recordatorioFechaRaw >= fechaHoyLocal;
  const recordatorio: Recordatorio | undefined = (recordatorioMatch && recordatorioFechaValida) ? {
    id: Date.now().toString(),
    texto: recordatorioMatch[2].trim(),
    fechaISO: recordatorioFechaRaw,
    creadoEn: Date.now(),
  } : undefined;

  // ── ALARMA ──
  const alarmaMatch = raw.match(/\[ALARMA:\s*(.+?)\s*\|\s*(.+?)\]/i);
  let alarma: { timestampEpoch: number; texto: string } | undefined;
  if (alarmaMatch) {
    const ts = Date.parse(alarmaMatch[1].trim());
    if (!isNaN(ts) && ts > Date.now()) {
      alarma = { timestampEpoch: ts, texto: alarmaMatch[2].trim() };
    }
  }

  // ── Tag de emoción principal ──
  const matchTag = raw.match(/^\[(FELIZ|TRISTE|SORPRENDIDA|PENSATIVA|NEUTRAL|CUENTO|JUEGO|CHISTE|ENOJADA|AVERGONZADA|CANSADA|TERNURA|PREOCUPADA|ENTUSIASMADA)\]\s*/i);
  const tagRaw = matchTag?.[1]?.toUpperCase() as TagPrincipal ?? 'NEUTRAL';
  const expresion = expresionSegunTag(tagRaw);

  // ── Limpiar texto para hablar ──
  let respuesta = raw.replace(/^\[.*?\]\s*/, '');

  // ── TIMER ──
  respuesta = respuesta.replace(/\[TIMER:\s*\d+\]\s*/gi, '').trim();

  // ── RECUERDOS ──
  const recuerdoMatches = [...respuesta.matchAll(/\[RECUERDO:\s*(.+?)\]/gi)];
  const recuerdos = recuerdoMatches.map(m => m[1].trim());
  respuesta = respuesta.replace(/\[RECUERDO:[^\]]*\]?\s*/gi, '').trim();

  // ── ANIMO_USUARIO ──
  const animoMatch = respuesta.match(/\[ANIMO_USUARIO:\s*([^\]]*)\]?/i);
  const animoRaw = animoMatch?.[1]?.trim().toLowerCase() ?? '';
  const fallbackAnimo = animoFallbackSegunTag(tagRaw);
  let animoUsuario: ExpresionAnimo = ANIMOS_VALIDOS.includes(animoRaw as ExpresionAnimo)
    ? (animoRaw as ExpresionAnimo)
    : fallbackAnimo;
  respuesta = respuesta.replace(/\[ANIMO_USUARIO:[^\]]*\]?\s*/i, '').trim();

  // ── LLAMAR_FAMILIA ──
  const alertaMatch = respuesta.match(/\[LLAMAR_FAMILIA:\s*([^\]]*)\]?/i);
  const llamarFamilia = alertaMatch?.[1]?.trim();
  respuesta = respuesta.replace(/\[LLAMAR_FAMILIA:[^\]]*\]?\s*/i, '').trim();

  // ── EMERGENCIA ──
  const emergenciaMatch = respuesta.match(/\[EMERGENCIA:\s*([^\]]*)\]?/i);
  const emergencia = emergenciaMatch?.[1]?.trim();
  respuesta = respuesta.replace(/\[EMERGENCIA:[^\]]*\]?\s*/i, '').trim();

  // Si hay emergencia o llamada a familia, la persona claramente no está bien → triste
  if (emergencia || llamarFamilia) animoUsuario = 'triste';

  // ── MENSAJE_FAMILIAR (resolver contacto) ──
  let mensajeFamiliar: RespuestaParsed['mensajeFamiliar'];
  if (mensajeMatch) {
    const nombreDestino = mensajeMatch[1].trim();
    const textoMensaje  = mensajeMatch[2].trim();
    const contacto = resolverContacto(nombreDestino, contactos, familiares);
    respuesta = limpiarTagsFinales(raw.replace(/^\[.*?\]\s*/, ''));
    mensajeFamiliar = { nombreDestino: contacto?.nombre ?? nombreDestino, texto: textoMensaje };
  }

  // Limpieza final de cualquier tag residual
  respuesta = limpiarTagsFinales(respuesta);

  return {
    tagPrincipal: tagRaw,
    respuesta,
    expresion,
    animoUsuario,
    recuerdos,
    timerSegundos,
    recordatorio,
    alarma,
    mensajeFamiliar,
    llamarFamilia,
    emergencia,
    domotica,
    listaNueva,
    listaAgregar,
    listaBorrar,
  };
}
