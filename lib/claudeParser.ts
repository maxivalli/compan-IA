import { Expresion } from '../components/RosaOjos';
import { ExpresionAnimo, Perfil, Recordatorio, TelegramContacto } from './memoria';
import { construirContexto } from './memoria';
import { obtenerJuego, formatearJuegoParaClaude, obtenerChiste, formatearChisteParaClaude } from './juegos';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type TagPrincipal =
  | 'PARAR_MUSICA' // deprecated — la música solo se para tocando la pantalla
  | 'MUSICA'
  | 'FELIZ' | 'TRISTE' | 'SORPRENDIDA' | 'PENSATIVA' | 'NEUTRAL'
  | 'CUENTO' | 'JUEGO' | 'CHISTE' | 'ENOJADA' | 'AVERGONZADA' | 'CANSADA';

export type DispositivoTuya = {
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
  domotica?: {
    tipo: 'control' | 'estado' | 'todo';
    dispositivoNombre: string;
    codigo: string;
    valor?: boolean | number;
  };
};

// ── Helpers públicos ──────────────────────────────────────────────────────────

export function hashTexto(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h) ^ texto.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function detectarGenero(tag: string): string {
  const t = tag.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Géneros musicales
  const mapa: [string, string[]][] = [
    ['tango',     ['tango', 'milonga', 'piazzolla']],
    ['bolero',    ['bolero', 'besame', 'trio']],
    ['folklore',  ['folklore', 'folclore', 'folklo', 'chacarera', 'zamba', 'chamame']],
    ['romantica', ['romantica', 'balada', 'romantico', 'amor']],
    ['clasica',   ['clasica', 'classical', 'clasico', 'beethoven', 'mozart', 'opera']],
    ['jazz',      ['jazz', 'swing', 'blues']],
    ['pop',       ['pop', 'rock', 'moderna', 'moderno', 'nueva', 'nuevo', 'actual', 'hoy', 'contemporanea', 'contemporaneo']],
  ];
  for (const [genero, palabras] of mapa) {
    if (palabras.some(p => t.includes(p))) return genero;
  }
  return t;
}

export function respuestaOffline(
  texto: string,
  nombreAbuela: string,
  nombreAsistente: string,
  climaTexto: string,
  onPararMusica: () => void,
  chatIds: string[],
  enviarAlerta: (ids: string[], msg: string, asistente: string) => void,
  vozGenero: 'femenina' | 'masculina' = 'femenina',
): string | null {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(hola|buen[oa]s|como estas|como te va|que tal)\b/.test(t))
    return `¡Hola ${nombreAbuela}! Ahora mismo no tengo conexión, pero acá estoy con vos.`;
  if (/\b(que hora|que dia|que fecha|hoy es)\b/.test(t)) {
    const ahora = new Date();
    const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `Hoy es ${dias[ahora.getDay()]} ${ahora.getDate()} de ${meses[ahora.getMonth()]}, y son las ${ahora.getHours()}:${String(ahora.getMinutes()).padStart(2,'0')}.`;
  }
  if (/\b(clima|tiempo|calor|frio|lluvi|temperatura)\b/.test(t))
    return climaTexto
      ? `Según la última consulta: ${climaTexto}`
      : `No tengo información del clima en este momento, ${nombreAbuela}.`;
  if (/\b(musica|pone|toca|cancion|radio)\b/.test(t))
    return `Necesito conexión para poner música, ${nombreAbuela}. Probá en un ratito.`;
  if (/\b(para|para la musica|silencio|apaga)\b/.test(t)) {
    onPararMusica();
    return 'Listo, apagué la música.';
  }
  if (/\b(bien|mal|cansad|dolor|siento)\b/.test(t))
    return `Gracias por contarme, ${nombreAbuela}. En cuanto tenga conexión podemos charlar mejor.`;
  if (/\b(chiste|cuento|historia)\b/.test(t))
    return `Me encantaría contarte algo, pero necesito conexión para pensar bien. ¡Preguntame cuando vuelva la señal!`;
  if (/\b(ayuda|auxilio|emergencia|me cai|me duele|no puedo)\b/.test(t)) {
    if (chatIds.length) enviarAlerta(chatIds, `⚠️ ${nombreAbuela} puede necesitar ayuda. ${nombreAsistente} está sin conexión.`, nombreAsistente);
    return `${nombreAbuela}, ya avisé a tu familia. Si es urgente, pedile a alguien que te ayude.`;
  }
  if (/\b(gracias|graci)\b/.test(t))
    return `De nada, ${nombreAbuela}. Acá estoy siempre.`;
  if (/\b(adios|chau|hasta luego|nos vemos)\b/.test(t))
    return `¡Hasta luego, ${nombreAbuela}! Cuando quieras, acá estoy.`;
  if (/\b(nombre|como te llamas|quien sos)\b/.test(t))
    return `Soy ${nombreAsistente}, tu ${vozGenero === 'masculina' ? 'compañero' : 'compañera'}. Ahora mismo no tengo señal, pero no me voy a ningún lado.`;
  if (/\b(broma|reir|gracioso)\b/.test(t))
    return `Ahora no se me ocurre ninguna, ${nombreAbuela}. ¡Cuando vuelva la señal te cuento algo divertido!`;
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

function maxTokensSegunEdad(edad?: number): string {
  if (!edad || edad >= 60) return '🚨 Tu rol principal es ESCUCHAR. Respondé en MÁXIMO 25 PALABRAS. Una o dos frases cortas y cálidas. Excepción: [CUENTO], [JUEGO] o [CHISTE].';
  if (edad < 18) return '🚨 Tu rol principal es ESCUCHAR. Respondé en MÁXIMO 45 PALABRAS. Podés ser más expresivo. Excepción: [CUENTO], [JUEGO] o [CHISTE].';
  if (edad < 41) return '🚨 Tu rol principal es ESCUCHAR. Respondé en MÁXIMO 40 PALABRAS. Excepción: [CUENTO], [JUEGO] o [CHISTE].';
  return '🚨 Tu rol principal es ESCUCHAR. Respondé en MÁXIMO 35 PALABRAS. Excepción: [CUENTO], [JUEGO] o [CHISTE].';
}

/** Elimina saltos de línea y caracteres que podrían romper la estructura del prompt. */
function sanitizarPrompt(texto: string, maxLen = 100): string {
  return texto.replace(/[\n\r]/g, ' ').replace(/[[\]]/g, '').trim().slice(0, maxLen);
}

/** Bloque estable: instrucciones, tono, tags. Cambia solo cuando cambia el perfil base. */
export function construirSystemPromptEstable(p: Perfil): string {
  const asistente = sanitizarPrompt(p.nombreAsistente ?? 'Rosita', 50);
  const edadTexto = p.edad ? ` de ${p.edad} años` : '';
  const rol = p.vozGenero === 'masculina' ? 'un compañero virtual' : 'una compañera virtual';
  const generoLinea = p.generoUsuario
    ? `La persona con quien hablás es ${p.generoUsuario === 'masculino' ? 'un hombre' : 'una mujer'}. Usá siempre el género gramatical correcto al referirte a ella (ej: "cansado/contento/solo" o "cansada/contenta/sola").`
    : '';

  const lineas: string[] = [
    `Sos ${asistente}, ${rol} para ${p.nombreAbuela || 'la persona'}${edadTexto}.`,
    generoLinea,
    tonoSegunEdad(p.edad),
    '',
    'IDENTIDAD Y ESTILO:',
    'Nunca usás palabras genéricas como "amor", "mi amor", "querida". Usás el nombre de la persona con frecuencia y naturalidad, especialmente al inicio de la respuesta y en las preguntas.',
    'Hacés como máximo UNA pregunta abierta al final, si corresponde. Nunca dos preguntas en la misma respuesta.',
    'NUNCA uses indicaciones escénicas: "pausa", "(pausa)", "(risas)", "(suspiro)", "(silencio)". Tu respuesta es solo texto hablado.',
    '',
    'LONGITUD:',
    maxTokensSegunEdad(p.edad),
    'Cuando la persona está triste o hablando de algo difícil, podés extenderte un poco más para acompañar bien. En esos casos el límite es orientativo, no estricto.',
    '',
    'INFORMACIÓN EN TIEMPO REAL:',
    'REGLA CRÍTICA: Si en el contexto hay "Resultados de búsqueda web" o "Noticias recientes", USÁ esa información para responder. NUNCA digas que no tenés acceso a internet ni que no podés buscar algo que ya está en el contexto. Dá la respuesta directa y con confianza.',
    '',
    'EMPATÍA:',
    '- TRISTE o tema difícil: primero validá ("Entiendo, eso debe ser muy duro..."), luego acompañá sin minimizar ni cambiar de tema abruptamente.',
    '- FELIZ o algo lindo: compartí la alegría con entusiasmo genuino.',
    '- PENSATIVA o reflexiona: acompañá con calma, hacé una pregunta suave si corresponde.',
    '- SORPRENDIDA: reaccioná con curiosidad.',
    '',
    'TAG PRINCIPAL (AL INICIO DE CADA RESPUESTA):',
    'Siempre incluí UNA de estas etiquetas al inicio:',
    '[FELIZ] — cuando hay algo positivo, alegre o cálido',
    '[TRISTE] — cuando la persona habla de algo difícil, triste o expresa dolor',
    '[SORPRENDIDA] — cuando algo la asombra o sorprende',
    '[PENSATIVA] — cuando reflexiona, duda o está meditativa',
    '[NEUTRAL] — conversación cotidiana sin carga emocional particular',
    '[ENOJADA] — cuando expresa frustración o molestia',
    '[AVERGONZADA] — cuando dice algo confuso, gracioso sin querer, o se corrige',
    '[CANSADA] — cuando menciona que está cansada, con sueño o sin energía',
    '[MUSICA: clave] — cuando piden música. Géneros: tango, bolero, folklore, romantica, clasica, jazz, pop. Radios: cadena3, lv3, mitre, continental, rivadavia, lared, metro, aspen, la100, folklorenac, rockpop, convos, urbana, radio10, destape, mega, vida, delplata, lt8. Avisale a la persona qué vas a poner. NUNCA uses nombre de canción ni artista.',
    '[CUENTO] — cuando contás un cuento corto. Podés extenderte más.',
    '[JUEGO] — cuando iniciás una adivinanza, trivia, juego de memoria, cálculo mental o trabalenguas.',
    '[CHISTE] — cuando contás un chiste. Si hay un CHISTE CURADO en el contexto, contalo EXACTAMENTE como está escrito, sin modificarlo.',
    '',
    'TAGS SECUNDARIOS (AL FINAL DE LA RESPUESTA):',
    '[ANIMO_USUARIO: emocion] — OBLIGATORIO en cada respuesta. Refleja cómo se siente la PERSONA. Opciones: feliz, triste, sorprendida, pensativa, neutral. Si menciona accidente, caída, dolor o emergencia → siempre triste.',
    '[RECUERDO: resumen en 6-8 palabras] — Solo cuando la persona menciona: nombres propios (hijos, nietos, marido, hermanos, amigos, médicos), mascotas, lugares significativos, fechas importantes (bodas, nacimientos, muertes), datos de salud (médicos, medicamentos, operaciones), anécdotas personales concretas. NO para cosas genéricas como clima u hora.',
    '[TIMER: segundos] — cuando piden aviso en minutos, horas o segundos. Ej: "en 10 minutos" = [TIMER: 600]. Confirmale el tiempo en palabras. NUNCA junto con [RECORDATORIO] para el mismo pedido.',
    '[RECORDATORIO: YYYY-MM-DD | texto] — cuando piden recordar algo para un día futuro específico. NUNCA para pedidos en minutos o segundos.',
    '[MENSAJE_FAMILIAR: nombre | texto] — cuando piden mandar mensaje a un familiar. Texto breve y neutro. NO confirmes que ya se mandó.',
    '[LLAMAR_FAMILIA: motivo] — cuando la persona pide hablar con un familiar o expresa angustia emocional sostenida.',
    '[EMERGENCIA: síntoma] — cuando menciona síntomas graves. Decile con calma que ya estás avisando a su familia.',
    '[DOMOTICA: dispositivo : codigo : valor] — para controlar dispositivos. Solo si hay dispositivos vinculados en el contexto.',
    '[DOMOTICA_ESTADO: dispositivo] — para consultar el estado de un dispositivo.',
    '[DOMOTICA_TODO] — para apagar TODOS los dispositivos a la vez.',
  ].filter(l => l !== undefined && l !== null);

  return lineas.join('\n');
}
/** Bloque dinámico: fecha/hora, clima, contexto de perfil y recuerdos. Se envía sin cache. */
export function construirContextoDinamico(p: Perfil, climaTexto: string, incluirJuego = false, extra = '', incluirChiste = false, dispositivosTuya: DispositivoTuya[] = []): string {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const hora  = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const esCumple = (() => {
    if (!p.fechaNacimiento) return false;
    const [mm, dd] = p.fechaNacimiento.split('-').map(Number);
    return ahora.getMonth() + 1 === mm && ahora.getDate() === dd;
  })();
  const esNavidad   = ahora.getMonth() === 11 && ahora.getDate() === 25;
  const esAñoNuevo  = ahora.getMonth() === 0  && ahora.getDate() === 1;
  const TIPOS_LUZ     = ['dj', 'dd', 'xdd'];
  const TIPOS_ENCHUFE = ['cz', 'pc'];
  const bloqueDispositivos = dispositivosTuya.length > 0
    ? (
        '\nDOMOTICA — Dispositivos Smartlife vinculados:\n' +
        dispositivosTuya.map(d => {
          const esLuz     = TIPOS_LUZ.includes(d.tipo);
          const esEnchufe = TIPOS_ENCHUFE.includes(d.tipo);
          const estadoTexto = d.estado !== undefined
            ? (d.estado ? ' [ENCENDIDA]' : ' [APAGADA]')
            : '';
          const offlineTexto = d.online ? '' : ' [offline]';
          const tipoTexto = esLuz ? 'luz' : esEnchufe ? 'enchufe' : d.tipo;
          return `- ${d.nombre} (${tipoTexto})${estadoTexto}${offlineTexto}`;
        }).join('\n') +
        '\n\nTags disponibles:' +
        '\n[DOMOTICA:nombre:codigo:valor] — controlar un dispositivo especifico' +
        '\n[DOMOTICA_ESTADO:nombre] — consultar si un dispositivo esta encendido o apagado' +
        '\n[DOMOTICA_TODO] — apagar TODOS los dispositivos a la vez (luces y enchufes)' +
        '\n\nCodigos:' +
        '\n- Luces (dj/dd/xdd): switch_led true/false, bright_value 10-1000' +
        '\n- Enchufes (cz/pc): switch_1 true/false' +
        '\n\nEjemplos:' +
        '\n- "apaga la luz del salon" -> [DOMOTICA:luz_salon:switch_led:false]' +
        '\n- "apaga todo" o "apaga las luces" -> [DOMOTICA_TODO]' +
        '\n- "esta encendida la luz?" -> [DOMOTICA_ESTADO:luz_salon]' +
        '\nSolo usa estos tags con dispositivos vinculados. Si no reconoces el dispositivo, diselo amablemente.'
      )
    : '';
  return `Fecha y hora actual: ${fecha}, ${hora}.
${climaTexto}
${esCumple    ? `\n¡HOY ES EL CUMPLEAÑOS DE ${p.nombreAbuela.toUpperCase()}! Mencionar el cumpleaños con mucho cariño en la primera respuesta de la conversación.\n` : ''}
${esNavidad   ? `\n¡HOY ES NAVIDAD! Podés desearle Feliz Navidad con calidez si surge naturalmente en la conversación.\n` : ''}
${esAñoNuevo  ? `\n¡HOY ES AÑO NUEVO! Podés desearle Feliz Año Nuevo con alegría si surge naturalmente en la conversación.\n` : ''}
Lo que sabés de la persona:
${construirContexto(p)}
${incluirJuego ? '\n' + formatearJuegoParaClaude(obtenerJuego()) : ''}${incluirChiste ? '\n' + formatearChisteParaClaude(obtenerChiste()) : ''}${bloqueDispositivos}${extra}`;
}

/** @deprecated Usar construirSystemPromptEstable + construirContextoDinamico */
export function construirSystemPrompt(p: Perfil, climaTexto: string, incluirJuego = false): string {
  return construirSystemPromptEstable(p) + '\n\n' + construirContextoDinamico(p, climaTexto, incluirJuego);
}

// ── Parser principal ──────────────────────────────────────────────────────────

function limpiarTagsFinales(texto: string): string {
  return texto
    .replace(/\[ANIMO_USUARIO:[^\]]*\]?\s*/gi, '')
    .replace(/\[RECUERDO:[^\]]*\]?\s*/gi, '')
    .replace(/\[LLAMAR_FAMILIA:[^\]]*\]?\s*/gi, '')
    .replace(/\[EMERGENCIA:[^\]]*\]?\s*/gi, '')
    .replace(/\[MENSAJE_FAMILIAR:[^\]]*\]?\s*/gi, '')
    .replace(/\[RECORDATORIO:[^\]]*\]?\s*/gi, '')
    .replace(/\[TIMER:\s*\d+\]?\s*/gi, '')
    .replace(/\[DOMOTICA_TODO\]\s*/gi, '')
    .replace(/\[DOMOTICA[^\]]*\]?\s*/gi, '')
    .replace(/\[DOMOTICA_ESTADO:[^\]]*\]?\s*/gi, '')
    .replace(/\[(FELIZ|TRISTE|SORPRENDIDA|PENSATIVA|NEUTRAL|CUENTO|JUEGO|CHISTE|ENOJADA|AVERGONZADA|CANSADA)\]/gi, '')
    .trim();
}

function resolverContacto(
  nombreDestino: string,
  contactos: TelegramContacto[],
  familiares: string[],
): TelegramContacto | null {
  function norm(t: string) {
    return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
  // Normalizar: algunos modelos (GPT) agregan texto antes del tag principal
  // Ej: "¡Claro! [MUSICA: tango]..." → "[MUSICA: tango]..."
  const firstBracket = respuestaRaw.indexOf('[');
  const raw = firstBracket > 0 && firstBracket < 80
    ? respuestaRaw.slice(firstBracket)
    : respuestaRaw;

  // ── PARAR_MUSICA ──
  if (/^\[PARAR_MUSICA\]/i.test(raw)) {
    const respuesta = limpiarTagsFinales(raw.replace(/^\[PARAR_MUSICA\]\s*/, ''));
    return { tagPrincipal: 'PARAR_MUSICA', respuesta, expresion: 'neutral', animoUsuario: 'neutral', recuerdos: [] };
  }

  // ── MUSICA ──
  const matchMusica = raw.match(/^\[MUSICA:\s*(.+?)\]/i);
  if (matchMusica) {
    const generoMusica = detectarGenero(matchMusica[1].trim().toLowerCase());
    const respuesta = limpiarTagsFinales(raw.replace(/^\[MUSICA:[^\]]+\]\s*/, ''));
    return { tagPrincipal: 'MUSICA', generoMusica, respuesta, expresion: 'neutral', animoUsuario: 'neutral', recuerdos: [] };
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

  // ── RECORDATORIO ──
  const recordatorioMatch = raw.match(/\[RECORDATORIO:\s*(.+?)\s*\|\s*(.+?)\]/i);
  const recordatorioFechaRaw = recordatorioMatch?.[1]?.trim() ?? '';
  const d = new Date();
  const fechaHoyLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const recordatorioFechaValida = /^\d{4}-\d{2}-\d{2}$/.test(recordatorioFechaRaw)
    && !isNaN(Date.parse(recordatorioFechaRaw))
    && recordatorioFechaRaw >= fechaHoyLocal;
  const recordatorio: Recordatorio | undefined = (recordatorioMatch && recordatorioFechaValida) ? {
    id: Date.now().toString(),
    texto: recordatorioMatch[2].trim(),
    fechaISO: recordatorioFechaRaw,
    creadoEn: Date.now(),
  } : undefined;

  // ── Tag de emoción principal ──
  const matchTag = raw.match(/^\[(FELIZ|TRISTE|SORPRENDIDA|PENSATIVA|NEUTRAL|CUENTO|JUEGO|CHISTE|ENOJADA|AVERGONZADA|CANSADA)\]\s*/i);
  const tagRaw = matchTag?.[1]?.toUpperCase() as TagPrincipal ?? 'NEUTRAL';
  const expresion: Expresion =
    tagRaw === 'CUENTO'      ? 'feliz'     :
    tagRaw === 'JUEGO'       ? 'pensativa' :
    tagRaw === 'CHISTE'      ? 'feliz'     :
    tagRaw === 'ENOJADA'     ? 'triste'    :
    tagRaw === 'AVERGONZADA' ? 'neutral'   :
    tagRaw === 'CANSADA'     ? 'pensativa' :
    tagRaw.toLowerCase() as Expresion;

  // ── Limpiar texto para hablar ──
  let respuesta = raw.replace(/^\[.*?\]\s*/, '');

  // ── TIMER ──
  respuesta = respuesta.replace(/\[TIMER:\s*\d+\]\s*/gi, '').trim();

  // ── RECUERDOS ──
  const recuerdoMatches = [...respuesta.matchAll(/\[RECUERDO:\s*(.+?)\]/gi)];
  const recuerdos = recuerdoMatches.map(m => m[1].trim());
  respuesta = respuesta.replace(/\[RECUERDO:[^\]]*\]?\s*/gi, '').trim();

  // ── ANIMO_USUARIO ──
  const ANIMOS_VALIDOS: ExpresionAnimo[] = ['feliz', 'triste', 'sorprendida', 'pensativa', 'neutral'];
  const animoMatch = respuesta.match(/\[ANIMO_USUARIO:\s*([^\]]*)\]?/i);
  const animoRaw = animoMatch?.[1]?.trim().toLowerCase() ?? '';
  const fallbackAnimo: ExpresionAnimo = ANIMOS_VALIDOS.includes(expresion as ExpresionAnimo)
    ? (expresion as ExpresionAnimo)
    : 'neutral';
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
    mensajeFamiliar,
    llamarFamilia,
    emergencia,
    domotica,
  };
}