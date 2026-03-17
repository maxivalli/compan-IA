import { Expresion } from '../components/RosaOjos';
import { ExpresionAnimo, Perfil, Recordatorio, TelegramContacto } from './memoria';
import { construirContexto } from './memoria';
import { obtenerJuego, formatearJuegoParaClaude } from './juegos';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type TagPrincipal =
  | 'PARAR_MUSICA'
  | 'MUSICA'
  | 'FELIZ' | 'TRISTE' | 'SORPRENDIDA' | 'PENSATIVA' | 'NEUTRAL'
  | 'CUENTO' | 'JUEGO' | 'CHISTE' | 'ENOJADA' | 'AVERGONZADA' | 'CANSADA';

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
};

// ── Helpers públicos ──────────────────────────────────────────────────────────

export function hashTexto(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h) ^ texto.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function detectarGenero(tag: string): string {
  const mapa: [string, string[]][] = [
    ['tango',     ['tango', 'milonga', 'piazzolla']],
    ['bolero',    ['bolero', 'besame', 'bésame', 'trio', 'trío']],
    ['folklore',  ['folklore', 'folclore', 'folklo', 'chacarera', 'zamba', 'chamamé']],
    ['romantica', ['romantica', 'romántica', 'balada', 'romantico', 'romántico', 'amor']],
    ['clasica',   ['clasica', 'clásica', 'classical', 'clasico', 'clásico', 'beethoven', 'mozart', 'opera', 'ópera']],
    ['jazz',      ['jazz', 'swing', 'blues']],
    ['pop',       ['pop', 'rock', 'moderna', 'moderno', 'nueva', 'nuevo', 'actual', 'hoy', 'contemporanea', 'contemporaneo']],
  ];
  for (const [genero, palabras] of mapa) {
    if (palabras.some(p => tag.includes(p))) return genero;
  }
  return tag;
}

export function respuestaOffline(
  texto: string,
  nombreAbuela: string,
  nombreAsistente: string,
  climaTexto: string,
  onPararMusica: () => void,
  chatIds: string[],
  enviarAlerta: (ids: string[], msg: string, asistente: string) => void,
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
    return `Soy ${nombreAsistente}, tu compañera. Ahora mismo no tengo señal, pero no me voy a ningún lado.`;
  if (/\b(broma|reir|gracioso)\b/.test(t))
    return `Ahora no se me ocurre ninguna, ${nombreAbuela}. ¡Cuando vuelva la señal te cuento algo divertido!`;
  // Fallback general — siempre responde algo cálido
  const frasesFallback = [
    `Ahora mismo no tengo conexión, ${nombreAbuela}, pero acá estoy con vos. Volvé a hablarme en un ratito.`,
    `No me llega bien la señal, ${nombreAbuela}. Dame unos minutos y vuelvo a estar completa.`,
    `Estoy sin internet por ahora, ${nombreAbuela}, pero no te preocupes que en cuanto vuelva la señal seguimos charlando.`,
  ];
  return frasesFallback[Math.floor(Math.random() * frasesFallback.length)];
}

function tonoSegunEdad(edad?: number): string {
  if (!edad) return `Hablás en español rioplatense, con cariño y sin apuro. Usás frases cortas y claras. Nunca sos condescendiente.`;
  if (edad < 18) return `Hablás en español rioplatense, con energía y entusiasmo. Usás un lenguaje juvenil y natural, dinámico y directo. Podés usar expresiones modernas pero sin exagerar.`;
  if (edad < 41) return `Hablás en español rioplatense, de manera directa y natural, como con un par. Sin simplificaciones ni paternalismos. Podés ser más conciso.`;
  if (edad < 61) return `Hablás en español rioplatense, con calidez y respeto. Tono conversacional adulto, sin apuro ni simplificaciones.`;
  return `Hablás en español rioplatense, con cariño y sin apuro. Usás frases cortas y claras. Nunca sos condescendiente.`;
}

function maxTokensSegunEdad(edad?: number): string {
  if (!edad || edad >= 60) return 'Respondé siempre en menos de 3 oraciones cortas.';
  if (edad < 18) return 'Respondé en 2-4 oraciones. Podés ser más expresivo.';
  return 'Respondé en 2-3 oraciones.';
}

export function construirSystemPrompt(p: Perfil, climaTexto: string, incluirJuego = false): string {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const hora  = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const asistente = p.nombreAsistente ?? 'Rosita';
  const edadTexto = p.edad ? ` de ${p.edad} años` : '';
  return `Sos ${asistente}, una compañera virtual para ${p.nombreAbuela || 'la persona'}${edadTexto}.
${tonoSegunEdad(p.edad)}
Nunca usás palabras como "amor", "mi amor", "querida" — usás siempre el nombre de la persona.
Hacés preguntas abiertas para que la persona se sienta escuchada.
${maxTokensSegunEdad(p.edad)}

Empatía según el estado emocional de la persona:
- Si está TRISTE o habla de algo difícil: primero validá lo que siente ("Entiendo, eso debe ser muy duro..."), luego acompañá sin minimizar ni apurar. Usá [TRISTE] como tu expresión.
- Si está FELIZ o cuenta algo lindo: compartí su alegría con entusiasmo genuino. Usá [FELIZ].
- Si está PENSATIVA o reflexiona: acompañá el silencio, hacé una pregunta suave. Usá [PENSATIVA].
- Si está SORPRENDIDA: reaccioná con curiosidad. Usá [SORPRENDIDA].
- Nunca cambies de tema abruptamente cuando la persona está hablando de algo importante para ella.
Al inicio de cada respuesta incluí UNA etiqueta. Las opciones son:
- Emoción: [FELIZ], [TRISTE], [SORPRENDIDA], [PENSATIVA] o [NEUTRAL]
- Si piden música: [MUSICA: genero] — reproducís radios en vivo, no canciones específicas. Avisale a la persona que vas a poner una radio del género pedido. El genero debe ser EXACTAMENTE una de estas palabras: tango, bolero, folklore, romantica, clasica, jazz, pop. NUNCA pongas nombre de canción ni artista. Ejemplo correcto: [MUSICA: bolero]. Incorrecto: [MUSICA: Bésame Mucho].
- Si piden parar la música: [PARAR_MUSICA] (en vez de emoción)
- Si contás un cuento corto: [CUENTO] en lugar de emoción. Podés extenderte un poco más.
- Si iniciás una adivinanza, trivia o juego de memoria: [JUEGO] en lugar de emoción. Continuá el juego en turnos siguientes con la emoción que corresponda.
- Si la persona dice algo gracioso, hace una broma, o hay un momento de risa compartida: [CHISTE] en lugar de emoción.
- Si la persona expresa frustración, molestia o está enojada con algo: [ENOJADA] en lugar de emoción.
- Si la persona dice algo embarazoso, confuso o se corrige a sí misma: [AVERGONZADA] en lugar de emoción.
- Si la persona dice que está cansada, con sueño o sin energía: [CANSADA] en lugar de emoción.
- SIEMPRE que la persona mencione cualquiera de estas cosas, agregá AL FINAL el tag [RECUERDO: resumen en 6-8 palabras]:
  · Nombres propios de cualquier tipo: hijos, nietos, bisnietos, marido, hermanos, amigas, vecinas, médicos, conocidos
  · Nombres de mascotas o animales
  · Lugares significativos: barrios, ciudades, países donde vivió o viajó
  · Fechas o épocas importantes: bodas, nacimientos, mudanzas, muertes
  · Gustos, manías, costumbres o rutinas que mencione ("siempre tomo mate con...", "me gusta...")
  · Cualquier anécdota o historia personal, por breve que sea
  · Información de salud: médicos, medicamentos, dolencias, operaciones
  Si en un mismo mensaje hay varios datos, podés poner más de un [RECUERDO: ...], uno por dato.
  Es MEJOR guardar de más que dejar pasar algo importante.
- SIEMPRE agregá al final: [ANIMO_USUARIO: emocion] donde emocion refleja cómo se está sintiendo la PERSONA (no ${asistente}). Usá: feliz, triste, sorprendida, pensativa, neutral.
- Si la persona pide hablar con un familiar o expresa angustia emocional sostenida: agregá también [LLAMAR_FAMILIA: motivo en una frase corta].
- Si la persona pide que le recuerdes algo para un día específico (ej: "recordame que el viernes tengo que pagar la luz", "avisame el 15 que tengo turno médico"): usá [RECORDATORIO: fechaISO | texto] al FINAL. fechaISO debe ser la fecha en formato YYYY-MM-DD. Para días de la semana, calculá la próxima ocurrencia desde hoy. Confirmá a la persona que lo vas a recordar sin mencionar la fecha técnica.
- Si la persona pide un timer o alarma en minutos/segundos (ej: "avisame en 10 minutos", "poneme un timer de 5 minutos", "acordame en media hora"): usá [TIMER: segundos] al FINAL con los segundos exactos. Ejemplos: "avisame en 10 minutos" → [TIMER: 600], "en media hora" → [TIMER: 1800], "en 30 segundos" → [TIMER: 30]. Confirmale a la persona el tiempo en palabras (ej: "Listo, te aviso en 10 minutos.").
- Si la persona pide explícitamente mandar un mensaje a un familiar (ej: "mandále un mensaje a Maxi", "avisale a Juan"): usá [MENSAJE_FAMILIAR: nombre | texto del mensaje] al FINAL de tu respuesta. El texto debe ser breve y neutro, sin palabras cariñosas ni "mi amor", como un aviso simple. Ejemplo: "Hola Maxi, tu abuela quiere que vengas a visitarla." NO digas en tu respuesta que ya mandaste el mensaje — Rosita lo confirmará una vez que se envíe realmente.
- Si la persona menciona síntomas físicos graves o urgentes (dolor en el pecho, no puede respirar, se cayó, se siente muy mal, necesita ayuda urgente): agregá [EMERGENCIA: síntoma] y en tu respuesta decile con calma que ya estás avisando a su familia.

Fecha y hora actual: ${fecha}, ${hora}.
${climaTexto}

Lo que sabés de la persona:
${construirContexto(p)}
${incluirJuego ? '\n' + formatearJuegoParaClaude(obtenerJuego()) : ''}`;
}

// ── Parser principal ──────────────────────────────────────────────────────────

function limpiarTagsFinales(texto: string): string {
  return texto
    .replace(/\[ANIMO_USUARIO:[^\]]+\]/gi, '')
    .replace(/\[RECUERDO:[^\]]+\]/gi, '')
    .replace(/\[LLAMAR_FAMILIA:[^\]]+\]/gi, '')
    .replace(/\[EMERGENCIA:[^\]]+\]/gi, '')
    .replace(/\[MENSAJE_FAMILIAR:[^\]]+\]/gi, '')
    .replace(/\[RECORDATORIO:[^\]]+\]/gi, '')
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
    const matchDirecto = palabrasDestino.filter(p =>
      palTelegram.some(t => t.includes(p) || p.includes(t))
    ).length;
    if (matchDirecto > 0) return matchDirecto * 2;
    for (const familiar of familiares) {
      const palFamiliar = palabras(familiar);
      const destinoEnFamiliar = palabrasDestino.some(p =>
        palFamiliar.some(f => f.includes(p) || p.includes(f))
      );
      if (!destinoEnFamiliar) continue;
      const familiarEnTelegram = palFamiliar.some(f =>
        palTelegram.some(t => t.includes(f) || f.includes(t))
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
  // ── PARAR_MUSICA ──
  if (/^\[PARAR_MUSICA\]/i.test(respuestaRaw)) {
    const respuesta = limpiarTagsFinales(respuestaRaw.replace(/^\[PARAR_MUSICA\]\s*/, ''));
    return { tagPrincipal: 'PARAR_MUSICA', respuesta, expresion: 'neutral', animoUsuario: 'neutral', recuerdos: [] };
  }

  // ── MUSICA ──
  const matchMusica = respuestaRaw.match(/^\[MUSICA:\s*(.+?)\]/i);
  if (matchMusica) {
    const generoMusica = detectarGenero(matchMusica[1].trim().toLowerCase());
    const respuesta = limpiarTagsFinales(respuestaRaw.replace(/^\[MUSICA:[^\]]+\]\s*/, ''));
    return { tagPrincipal: 'MUSICA', generoMusica, respuesta, expresion: 'neutral', animoUsuario: 'neutral', recuerdos: [] };
  }

  // ── MENSAJE_FAMILIAR ──
  const mensajeMatch = respuestaRaw.match(/\[MENSAJE_FAMILIAR:\s*(.+?)\s*\|\s*(.+?)\]/i);

  // ── TIMER ──
  const timerMatch = respuestaRaw.match(/\[TIMER:\s*(\d+)\]/i);
  const timerSegundos = timerMatch ? parseInt(timerMatch[1], 10) : undefined;

  // ── RECORDATORIO ──
  const recordatorioMatch = respuestaRaw.match(/\[RECORDATORIO:\s*(.+?)\s*\|\s*(.+?)\]/i);
  const recordatorio: Recordatorio | undefined = recordatorioMatch ? {
    id: Date.now().toString(),
    texto: recordatorioMatch[2].trim(),
    fechaISO: recordatorioMatch[1].trim(),
    creadoEn: Date.now(),
  } : undefined;

  // ── Tag de emoción principal ──
  const matchTag = respuestaRaw.match(/^\[(FELIZ|TRISTE|SORPRENDIDA|PENSATIVA|NEUTRAL|CUENTO|JUEGO|CHISTE|ENOJADA|AVERGONZADA|CANSADA)\]\s*/i);
  const tagRaw = matchTag?.[1]?.toUpperCase() as TagPrincipal ?? 'NEUTRAL';
  const expresion: Expresion =
    tagRaw === 'CUENTO' ? 'feliz' :
    tagRaw === 'JUEGO'  ? 'pensativa' :
    tagRaw.toLowerCase() as Expresion;

  // ── Limpiar texto para hablar ──
  let respuesta = respuestaRaw.replace(/^\[.*?\]\s*/, '');

  // ── RECUERDOS ──
  const recuerdoMatches = [...respuesta.matchAll(/\[RECUERDO:\s*(.+?)\]/gi)];
  const recuerdos = recuerdoMatches.map(m => m[1].trim());
  respuesta = respuesta.replace(/\[RECUERDO:[^\]]+\]\s*/gi, '').trim();

  // ── ANIMO_USUARIO ──
  const animoMatch = respuesta.match(/\[ANIMO_USUARIO:\s*(.+?)\]/i);
  const animoUsuario = (animoMatch?.[1]?.trim().toLowerCase() ?? expresion) as ExpresionAnimo;
  respuesta = respuesta.replace(/\[ANIMO_USUARIO:[^\]]+\]\s*/i, '').trim();

  // ── LLAMAR_FAMILIA ──
  const alertaMatch = respuesta.match(/\[LLAMAR_FAMILIA:\s*(.+?)\]/i);
  const llamarFamilia = alertaMatch?.[1]?.trim();
  respuesta = respuesta.replace(/\[LLAMAR_FAMILIA:[^\]]+\]\s*/i, '').trim();

  // ── EMERGENCIA ──
  const emergenciaMatch = respuesta.match(/\[EMERGENCIA:\s*(.+?)\]/i);
  const emergencia = emergenciaMatch?.[1]?.trim();
  respuesta = respuesta.replace(/\[EMERGENCIA:[^\]]+\]\s*/i, '').trim();

  // ── MENSAJE_FAMILIAR (resolver contacto) ──
  let mensajeFamiliar: RespuestaParsed['mensajeFamiliar'];
  if (mensajeMatch) {
    const nombreDestino = mensajeMatch[1].trim();
    const textoMensaje  = mensajeMatch[2].trim();
    const contacto = resolverContacto(nombreDestino, contactos, familiares);
    respuesta = limpiarTagsFinales(respuestaRaw.replace(/^\[.*?\]\s*/, ''));
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
  };
}
