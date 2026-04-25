/**
 * useBrain — lógica de conversación con Claude.
 *
 * Responsabilidades:
 *   - Armado de system prompts (estable + semi-estático + dinámico)
 *   - Gestión del historial de mensajes
 *   - Llamados a Claude (streaming + fallback)
 *   - Respuestas rápidas sin Claude
 *   - Búsquedas web/wiki/noticias/lugares
 *   - Parseo de respuesta y despacho de acciones (domótica, listas, Telegram, timers, etc.)
 *   - Charla proactiva y resumen de sesión
 *
 * NO gestiona: audio, SR, sensores, estado visual, música, brillo.
 * Recibe callbacks para todo eso a través de BrainDeps.
 */

import { useRef } from 'react';
import { Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  cargarPerfil, guardarHistorial, guardarEntradaAnimo, agregarRecuerdo,
  guardarRecordatorio, borrarRecordatorio,
  registrarMusicaHoy, guardarUltimaRadio,
  registrarMemoriaEpisodica, cargarMemoriasEpisodicas, guardarMemoriasEpisodicas, construirResumenMemoriasEpisodicas, extraerKeywordsMemoria,
  Seguimiento, cargarSeguimientos, guardarSeguimiento, borrarTodosSeguimientos, construirTextoSeguimientos,
  Lista, cargarListas, guardarLista, agregarItemLista, borrarLista,
  Perfil, TelegramContacto,
} from '../lib/memoria';
import { buscarRadio, getFallbackAlt, nombreRadioOGenero, confirmarRadio } from '../lib/musica';
import { obtenerJuego, formatearJuegoParaClaude, obtenerChiste, formatearChisteParaClaude } from '../lib/juegos';
import { Expresion } from '../components/RosaOjos';
import {
  parsearRespuesta, respuestaOffline, hashTexto, detectarGenero,
} from '../lib/claudeParser';
import { buildRositaSystemPayload, RositaSystemPayload } from '../lib/systemPayload';
import {
  llamarClaude, llamarClaudeConStreaming,
  buscarWeb, buscarWikipedia, buscarLugares,
  beginTurnTelemetry, getCurrentTurnMetrics, logCliente, sincronizarAnimo,
  fetchNoticiasDiarias, NoticiasDia,
  crearAsyncJob,
  sincronizarMemoriasEpisodicas, fetchMemoriasEpisodicasRemoto, buscarMemoriasSemanticoRemoto,
} from '../lib/ai';
import { Dispositivo } from '../lib/smartthings';
import { DomoticaAction } from './useSmartThings';
import { enviarAlertaTelegram } from '../lib/telegram';
// ── Types ──────────────────────────────────────────────────────────────────────

export type Mensaje = { role: 'user' | 'assistant'; content: string };
export type EstadoRosita = 'esperando' | 'escuchando' | 'pensando' | 'hablando';
export type CategoriaRapida = 'saludo' | 'gracias' | 'de_nada' | 'despedida' | 'afirmacion' | 'no_escuche' | 'musica';

const RAPIDAS_HABILITADAS = true;

export const RESPUESTAS_RAPIDAS: Record<CategoriaRapida, { femenina: string[]; masculina: string[]; emotion: string }> = {
  saludo: {
    femenina:  ['¡Hola! ¿Cómo andás hoy?', '¡Qué bueno que me hablás! ¿Cómo estás?', '¡Acá estoy! ¿Cómo te va?', '¡Hola! Me alegra que me hables, ¿cómo venís hoy?'],
    masculina: ['¡Hola! ¿Cómo andás hoy?', '¡Qué bueno que me hablás! ¿Cómo estás?', '¡Acá estoy! ¿Cómo te va?', '¡Hola! Me alegra que me hables, ¿cómo venís hoy?'],
    emotion:   'feliz',
  },
  gracias: {
    femenina:  ['¡De nada!', '¡Para eso estoy!', '¡De nada! Cualquier cosa me decís.', 'Gracias a vos por confiar en mí.'],
    masculina: ['¡De nada!', '¡Para eso estoy!', '¡De nada! Cualquier cosa me decís.', 'Gracias a vos por confiar en mí.'],
    emotion:   'feliz',
  },
  de_nada: {
    femenina:  ['¡Gracias a vos!', '¡Ay, qué bueno tenerte acá!', '¡Gracias! Me alegra estar acá con vos.'],
    masculina: ['¡Gracias a vos!', '¡Qué bueno tenerte acá!', '¡Gracias! Me alegra estar acá con vos.'],
    emotion:   'feliz',
  },
  despedida: {
    femenina:  ['¡Chau! Cuidate mucho.', '¡Hasta luego! Acá voy a estar cuando me necesitás.', '¡Nos vemos! Un beso grande.', 'Te mando un abrazo grande, nos hablamos cuando quieras.'],
    masculina: ['¡Chau! Cuidate mucho.', '¡Hasta luego! Acá voy a estar cuando me necesitás.', '¡Nos vemos! Un beso grande.', 'Te mando un abrazo grande, nos hablamos cuando quieras.'],
    emotion:   'neutral',
  },
  afirmacion: {
    femenina:  ['¡Perfecto! ¿Algo más en lo que te pueda ayudar?', '¡Qué bueno! Acá estoy si necesitás algo.', '¡Genial!', 'Me alegra que te sirva, ¿querés que sigamos con otra cosa?'],
    masculina: ['¡Perfecto! ¿Algo más en lo que te pueda ayudar?', '¡Qué bueno! Acá estoy si necesitás algo.', '¡Genial!', 'Me alegra que te sirva, ¿querés que sigamos con otra cosa?'],
    emotion:   'feliz',
  },
  no_escuche: {
    femenina:  ['No te escuché bien, ¿me repetís?', 'Perdoname, no llegué a escucharte. ¿Me decís de nuevo?', 'No te escuché bien, ¿me contás otra vez?', '¿Podés repetirme eso?'],
    masculina: ['No te escuché bien, ¿me repetís?', 'Perdoname, no llegué a escucharte. ¿Me decís de nuevo?', 'No te escuché bien, ¿me contás otra vez?', '¿Podés repetirme eso?'],
    emotion:   'neutral',
  },
  musica: {
    femenina:  ['¡Dale!', '¡Enseguida!', '¡Claro que sí!', '¡Ahí va!'],
    masculina: ['¡Dale!', '¡Enseguida!', '¡Claro que sí!', '¡Ahí va!'],
    emotion:   'feliz',
  },
};

const EXPRESION_RAPIDA: Record<CategoriaRapida, Expresion> = {
  saludo: 'feliz',
  gracias: 'feliz',
  de_nada: 'feliz',
  despedida: 'neutral',
  afirmacion: 'feliz',
  no_escuche: 'neutral',
  musica: 'feliz',
};

// ── Frases del sistema (sin variante de género) ──────────────────────────────

export type CategoriaSistema = 'modo_no_molestar_on' | 'modo_no_molestar_off' | 'error_conexion';

export const FRASES_SISTEMA: Record<CategoriaSistema, { frases: string[]; emotion: string }> = {
  modo_no_molestar_on: {
    frases:  ['Activé el modo no molestar. Avisame cuando querés que vuelva.', 'Modo no molestar activado. Acá voy a estar cuando me necesitás.', 'Listo, me callo por un rato. Cualquier cosa me hablás.'],
    emotion: 'neutral',
  },
  modo_no_molestar_off: {
    frases:  ['¡Acá estoy de vuelta! ¿Cómo puedo ayudarte?', 'Desactivé el modo no molestar. ¿Cómo estás?', '¡Ya estoy! ¿En qué te ayudo?'],
    emotion: 'feliz',
  },
  error_conexion: {
    frases:  ['Perdoname, la conexión anda un poco lenta. ¿Me repetís?', 'Tuve un problemita con la conexión. Intentamos de nuevo, ¿sí?', 'No llegó bien la respuesta. ¿Me volvés a contar?'],
    emotion: 'neutral',
  },
};

const INTERLOCUTOR_TTL_MS   = 2 * 60 * 1000;

const PALABRAS_INVALIDAS_INTERLOCUTOR = new Set([
  'yo', 'aca', 'acá', 'hola', 'buenas', 'buenos', 'soy', 'llamo', 'nombre',
  'novia', 'novio', 'marido', 'esposa', 'mama', 'mamá', 'papa', 'papá',
  'amiga', 'amigo', 'hija', 'hijo', 'senora', 'señora', 'senor', 'señor',
]);

// ── Patrones de clasificación (exportados para uso en SR y otros hooks) ─────────

export const PATRON_SKIP = /\b(buen[ao]s?\s*(d[ií]as?|tardes?|noches?)|hola\b|qu[eé] tal|c[oó]mo (est[aá]s|and[aá]s)\b|c[oó]mo (va|viene)\s*[,?]?\s*$|gracias|much[aí]simas?\s+gracias|te agradezco|de nada|chau|hasta\s*(luego|pronto|ma[ñn]ana)|nos vemos|por supuesto|perfecto|entendido|re bien|todo bien|b[aá]rbaro)\b/i;

/**
 * Tiempo máximo desde la última respuesta de Rosita para considerar que la
 * conversación sigue activa (ventana deslizante — se extiende con cada respuesta).
 */
const VENTANA_CONVERSACION_MS = 180_000;
export const PATRON_EMPATICO     = /triste|me duele|dolor|me caí|caída|me siento mal|estoy mal|\b(me siento|estoy|me quedé|vivo)\s+sol[ao]\b|angustia|llor|ambulancia|me asusta|tengo miedo|escalera|moverme|me cuesta|no veo|visión|la vista|\bno puedo (moverme|caminar|levantarme|respirar|dormir)\b|malas? noticias?|baj[oó]n|sin ganas|desanimad|deca[ií]d|desganad|medio ca[ií]d|\b(estoy|me siento|ando)\s+más?\s*o\s*menos\b/i;
export const PATRON_ALEGRIA      = /cumpleaños|cumple\b|embarazada|\bnació\s+(mi|el bebé|la bebé|sano|bien|nuestro|nuestra)\b|me (casé|jubilé|recibí|aprobé|gradué)|lo (logré|conseguí|terminé)|viene(n)? a verme|qué (buena noticia|alegría|lindo que)|me (salió|resultó|funcionó)|estoy (contento|contenta|feliz|emocionado|emocionada)/i;
export const PATRON_SALUD        = /\b(turno (con|para|al|de)|pastilla|medicamento|remedio|receta\b|obra social|vacuna|análisis\b|glucosa|diabetes|colesterol|tensión arterial|cardiólogo|traumatólogo|oftalmólogo|kinesió|nebulizar|fiebre|gripe\b|catarro|resfriado|mareo|náuseas?|médico)\b/i;
export const PATRON_CLIMA        = /\b(clima|llover|llueve|temperatura|pronóstico|pronostico|mucho calor|mucho frío|mucho frio|qué tiempo|que tiempo|el tiempo|va a llover|va a hacer)\b/i;
export const PATRON_BUSQUEDA     = /\bnoticias?\s+(de|del|sobre|deportivas?|locales?|nacionales?|internacionales?)\b|\b(dame|pasame|contame|qué hay de|hay)\s+(las\s+)?noticias?\b|\bpartido\s+de\s+(fútbol|futbol|básquet|basquet|hockey|tenis|voley|rugby|polo)\b|fútbol|quiniela|qué hora|intendente|municipalidad|qué pasó|qué dice|farmacia|hospital|heladeria|restaurant|restaurante|hotel(?:es)?|hostal|hospedaje|alojamiento|banco|supermercado|pami|correo|estacion|nafta|donde queda|donde hay|cerca|polici[aá]|comisari[aá]/i;
export const PATRON_MUSICA       = /\b(música|canción|canciones|folklore|tango|cumbia|cuarteto|zamba|chacarera|bolero|vals|bailar|cantame|cantá una)\b|la radio\b/i;
export const PATRON_RECORDATORIO = /\b(acordame|recordame|anotá(me)?|no te olvid|que no se me olvide|recordatorio|agend[aá](me)?|que quede (anotado|guardado)|una alarma|un timer|despertame)\b/i;
export const PATRON_NOSTALGIA    = /\b(de antes|como antes|tiempos de antes)\b|en mi época|de joven|de chic[ao]|mi abuelo|mi abuela|en la escuela|cuando trabajaba|me recuerdo|\bme acuerdo\s+(de|que antes|de aquellos|bien de|del tiempo)\b|en mis tiempos|\bcuando era (chic[ao]|joven|pendej[ao]|solter[ao]|trabaj)\b/i;
export const PATRON_COMANDO      = /\bpon[eé](me|le|la|lo)?\s+(la\s+|el\s+|un\s+|una\s+)?(música|tele|televisión|radio|aire|ventilador|calefactor|calefacción|algo|eso)\b|apag[aá]|prend[eé]|\bpar[aá]\s+(la\s+|el\s+|eso|esto|música|tele|aire|ventilador)\b|\bparar\b|las luces?|\bla luz\b|sub[ií](le|la| el| la)?\s+(vol|mús|tele|luce|brillo)|baj[aá](le|la| el| la)?\s+(vol|mús|tele|luce|brillo)/i;
export const PATRON_LISTA        = /\b(lista\s+de|una lista|nueva lista|agrega(me|le)?\s+(a\s+la\s+lista|esto|eso)|pone\s+en\s+la\s+lista|anota\s+(esto|eso)|post.?it|papelito|nota\s+de\s+compra|compras:|la lista\s+de|guard[aá](me)?\s+(esto|eso|una nota)|anot[aá](me)?\s+(en|esto|eso))\b/i;
export const PATRON_TELEGRAM     = /\b(mand[aá](me)?.*mensaj|mensaj.*famil|avis[aá](me)?.*famil|telegram|decile.*famil|contale.*famil)\b/i;
export const PATRON_FOTO         = /\b(foto|fotograf|c[aá]mara|sac[aá](me)? una foto|tom[aá](me)? una foto|mir[aá] la foto|le[eé] la foto)\b/i;
export const PATRON_ADIVINANZA   = /\b(adivinanza|acertijo|charada|adivina[^r]|adivináme)\b/i;
export const PATRON_JUEGO        = /\b(juego|jugar|trivia|quiz|memori|refranes?|adivina|calcul[aá](me)?|trabale|trabalengua|matematica|rompecabeza)\b/i;
export const PATRON_CHISTE       = /\b(cont[aá](me)?(\s+un|\s+otro|\s+algún)?\s+chiste|dec[ií](me)?(\s+un|\s+otro|\s+algún)?\s+chiste|and[aá]\s+cont[aá](me)?\s+(un\s+)?chiste|chistecito|chistoso|gracioso|algo gracioso|me hace rei|haceme rei|contame algo diverti|cuento corto|historia graciosa|reírme|me rei)\b/i;
export const PATRON_ABURRIMIENTO = /\b(aburrid[ao]|me aburro|no tengo nada (que|para) hacer|sin hacer nada|muriéndome de aburrimiento|muero de aburrimiento|no sé (qué|en qué) (hacer|entretener)|qué aburrido|re aburrido|estoy aburrid)\b/i;

// Mapeo de texto del usuario → tipo OSM (para Overpass API)
export const LUGAR_TIPOS: Array<{ patron: RegExp; tipo: string }> = [
  { patron: /farmacia/,                                              tipo: 'farmacia' },
  { patron: /hospital|guardia/,                                     tipo: 'hospital' },
  { patron: /cl[ií]nica/,                                           tipo: 'clinica' },
  { patron: /m[eé]dic[ao]|odontologo|dentista|consultorio/,         tipo: 'medico' },
  { patron: /banco/,                                                tipo: 'banco' },
  { patron: /correo|correoargentino/,                               tipo: 'correo' },
  { patron: /supermercado/,                                         tipo: 'supermercado' },
  { patron: /nafta|combustible|ypf|shell|axion|surtidor|estaci[oó]n.{0,5}servicio/, tipo: 'nafta' },
  { patron: /heladeria|helado/,                                     tipo: 'heladeria' },
  { patron: /panaderia/,                                            tipo: 'panaderia' },
  { patron: /veterinaria/,                                          tipo: 'veterinaria' },
  { patron: /restaurant|restaurante|pizzeria/,                      tipo: 'restaurant' },
  { patron: /polici[aá]|comisari[aá]/,                              tipo: 'policia' },
  { patron: /municipalidad|municipio|intendencia/,                   tipo: 'municipalidad' },
  { patron: /hotel|hostal|hospedaje/,                               tipo: 'hotel' },
];

// ── Funciones puras de clasificación (exportadas) ─────────────────────────────


export function categorizarRapida(texto: string): CategoriaRapida | null {
  if (texto.length > 70) return null;
  if (PATRON_EMPATICO.test(texto))     return null;
  if (PATRON_ALEGRIA.test(texto))      return null;
  if (PATRON_SALUD.test(texto))        return null;
  if (PATRON_BUSQUEDA.test(texto))     return null;
  if (PATRON_MUSICA.test(texto))       return null;
  if (PATRON_RECORDATORIO.test(texto)) return null;
  if (PATRON_COMANDO.test(texto))      return null;
  if (/[¿?]/.test(texto)) return null;
  // Gracias: intercept even with extra appreciative content ("Gracias, Rosita, qué buena que sos")
  if (/\b(gracias|much[aí]simas?\s+gracias|te agradezco)\b/i.test(texto)) return 'gracias';
  // Para el resto: si hay contenido sustancial tras una coma, dejar que Claude responda.
  if (/,\s*\w+\s+\w/.test(texto)) return null;
  if (/\b(hola\b|qu[eé] tal|c[oó]mo (est[aá]s|and[aá]s)\b|c[oó]mo (va|viene)\s*[,?]?\s*$|buen[ao]s?\s*(d[ií]as?|tardes?|noches?))/i.test(texto)) return 'saludo';
  if (/\bde nada\b/i.test(texto)) return 'de_nada';
  if (/\b(chau|chao|hasta\s*(luego|pronto|ma[ñn]ana)|nos vemos)\b/i.test(texto)) return 'despedida';
  if (/\b(perfecto|entendido|re bien|todo bien|muy bien|genial|de acuerdo|b[aá]rbaro)\b/i.test(texto)) return 'afirmacion';
  return null;
}

// ── Respuestas instantáneas (hora, fecha, cálculos) ───────────────────────────
// No requieren Claude ni red. Se generan en el momento, cero latencia.
const DIAS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

export function respuestaInstantanea(textoNorm: string): { texto: string; emotion: string } | null {
  // Hora
  if (/\b(qu[eé]\s+hora\s+(es|son)|qu[eé]\s+horas\s+(son|es)|la\s+hora|dec[ií]me\s+la\s+hora|qu[eé]\s+hora\s+tengo)\b/.test(textoNorm)) {
    const now = new Date();
    const hh = now.getHours();
    const mm = now.getMinutes();
    const mmStr = mm === 0 ? 'en punto' : `y ${mm}`;
    const periodo = hh < 5 ? 'de la madrugada' : hh < 12 ? 'de la mañana' : hh < 13 ? 'del mediodía' : hh < 20 ? 'de la tarde' : 'de la noche';
    const horaDisplay = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh;
    return { texto: `Son las ${horaDisplay} ${mmStr} ${periodo}.`, emotion: 'neutral' };
  }
  // Fecha / día
  if (/\b(qu[eé]\s+(d[ií]a|fecha)\s+(es|estamos)|qu[eé]\s+d[ií]a\s+es\s+hoy|hoy\s+qu[eé]\s+d[ií]a|en\s+qu[eé]\s+fecha\s+estamos)\b/.test(textoNorm)) {
    const now = new Date();
    const dia = DIAS[now.getDay()];
    const num = now.getDate();
    const mes = MESES[now.getMonth()];
    const año = now.getFullYear();
    return { texto: `Hoy es ${dia} ${num} de ${mes} de ${año}.`, emotion: 'neutral' };
  }
  // Cálculo simple: "cuánto es X por/más/menos/dividido Y"
  const matchCalc = textoNorm.match(/cu[aá]nto\s+es\s+(\d+(?:[.,]\d+)?)\s*(por|multiplicado\s+por|por\s+x|m[aá]s|menos|dividido|sobre|partido)\s*(\d+(?:[.,]\d+)?)/);
  if (matchCalc) {
    const a = parseFloat(matchCalc[1].replace(',', '.'));
    const op = matchCalc[2];
    const b = parseFloat(matchCalc[3].replace(',', '.'));
    let resultado: number | null = null;
    if (/por|multiplicado|x/.test(op))    resultado = a * b;
    else if (/m[aá]s/.test(op))           resultado = a + b;
    else if (/menos/.test(op))            resultado = a - b;
    else if (/dividido|sobre|partido/.test(op)) resultado = b !== 0 ? a / b : null;
    if (resultado !== null) {
      const res = Number.isInteger(resultado) ? resultado : parseFloat(resultado.toFixed(2));
      return { texto: `${res}.`, emotion: 'neutral' };
    }
  }
  return null;
}

function esCharlaSocialBreve(texto: string): boolean {
  if (texto.length > 40) return false;
  if (/[¿?]/.test(texto)) return false;
  if (PATRON_EMPATICO.test(texto) || PATRON_BUSQUEDA.test(texto) || PATRON_COMANDO.test(texto)) return false;
  // "acá ando" solo si la frase termina ahí o con "bien/tranqui" — no si sigue con estado negativo
  if (/\b(aca ando|ac[aá] ando)\b/i.test(texto) && !/\b(bien|tranqui|re bien)\b/i.test(texto)) return false;
  // "todo bien por/para/voy/de/con X" indica actividad próxima → Claude
  if (/\btodo bien\b.*\b(para|por|voy|a hacer|de|con|pero)\b/i.test(texto)) return false;
  return /\b(todo bien|bien bien|ando bien|aca ando|ac[aá] ando|tranqui|cansad[oa]|con sue[ñn]o|por dormir|tengo fr[ií]o|hace fr[ií]o)\b/i.test(texto);
}

function generarRespuestaSocialBreve(textoNorm: string, vozGenero: string): { texto: string; emotion: string; expresion: Expresion } | null {
  const masculino = vozGenero === 'masculina';
  if (/\b(tengo fr[ií]o|hace fr[ií]o)\b/i.test(textoNorm)) {
    return {
      texto: masculino
        ? 'Uy, tapate bien entonces. Si querés, te acompaño un rato.'
        : 'Uy, tapate bien entonces. Si querés, te acompaño un rato.',
      emotion: 'cansada',
      expresion: 'cansada',
    };
  }
  if (/\b(cansad[oa]|con sue[ñn]o|por dormir)\b/i.test(textoNorm)) {
    return {
      texto: masculino
        ? 'Dale, a descansar un poco entonces. Acá estoy después.'
        : 'Dale, a descansar un poco entonces. Acá estoy después.',
      emotion: 'cansada',
      expresion: 'cansada',
    };
  }
  if (/\b(todo bien|bien bien|ando bien|aca ando|ac[aá] ando|tranqui)\b/i.test(textoNorm)) {
    return {
      texto: 'Qué bueno. Yo acá, acompañándote.',
      emotion: 'feliz',
      expresion: 'feliz',
    };
  }
  return null;
}

function compactarRespuestaParaVoz(
  respuesta: string,
  splitEnOraciones: (texto: string) => string[],
  opciones?: { maxOraciones?: number; maxChars?: number },
): string {
  const maxOraciones = opciones?.maxOraciones ?? 2;
  const maxChars = opciones?.maxChars ?? 170;
  const oraciones = splitEnOraciones(respuesta);
  if (oraciones.length === 0) return respuesta.trim();

  // Reducir número de oraciones hasta que quepan en maxChars (nunca cortar mid-oración)
  for (let n = maxOraciones; n >= 1; n--) {
    const compacta = oraciones.slice(0, n).join(' ').trim();
    if (compacta.length <= maxChars) return compacta;
  }

  // Ni una sola oración cabe: cortar la primera a límite de palabra
  const primera = oraciones[0].trim();
  const corte = primera.lastIndexOf(' ', maxChars);
  const truncada = (corte > 40 ? primera.slice(0, corte) : primera.slice(0, maxChars)).trim();
  return /[.!?]$/.test(truncada) ? truncada : `${truncada}.`;
}

function normalizarTextoPlano(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function capitalizarNombre(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .map(parte => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase())
    .join(' ');
}

function extraerPrimerNombre(texto: string): string | null {
  const limpio = normalizarTextoPlano(texto).replace(/[^a-zñ\s]/g, ' ').trim();
  const nombre = limpio.split(/\s+/).find(Boolean) ?? '';
  if (nombre.length < 3 || nombre.length > 20) return null;
  if (PALABRAS_INVALIDAS_INTERLOCUTOR.has(nombre)) return null;
  return capitalizarNombre(nombre);
}

function inferirInterlocutorTemporal(texto: string, perfil: Perfil): string | null {
  const principal = normalizarTextoPlano(perfil.nombreAbuela ?? '');
  const conocidos = new Set(
    (perfil.familiares ?? [])
      .map(extraerPrimerNombre)
      .filter((nombre): nombre is string => !!nombre)
      .map(nombre => normalizarTextoPlano(nombre)),
  );
  const match = texto.match(/\b(?:soy|yo soy|me llamo|mi nombre es|habla|te habla)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,20})\b/i);
  const nombre = match?.[1] ? extraerPrimerNombre(match[1]) : null;
  if (!nombre) return null;
  const normalizado = normalizarTextoPlano(nombre);
  if (normalizado === principal) return null;
  if (conocidos.size === 0 || conocidos.has(normalizado)) return nombre;
  return nombre;
}

function detectarRetornoAlPrincipal(textoNorm: string, perfil: Perfil): boolean {
  const principal = extraerPrimerNombre(perfil.nombreAbuela ?? '');
  if (!principal) return false;
  const principalNorm = normalizarTextoPlano(principal);
  const mencionaPrincipal = textoNorm.includes(principalNorm);
  if (!mencionaPrincipal) return false;
  return /\b(ahora soy|soy|estoy yo|te hablo yo|ahora estoy yo|volvi yo|volví yo)\b/.test(textoNorm);
}

function detectarHandoffDirigido(textoNorm: string, perfil: Perfil): string | null {
  const principalNorm = normalizarTextoPlano(perfil.nombreAbuela ?? '');
  const candidatos = (perfil.familiares ?? [])
    .map(extraerPrimerNombre)
    .filter((nombre): nombre is string => !!nombre);

  for (const candidato of candidatos) {
    const nombreNorm = normalizarTextoPlano(candidato);
    if (!nombreNorm || nombreNorm === principalNorm) continue;
    const mencionaNombre = textoNorm.includes(nombreNorm);
    const patronHandoff = /\b(saludala|saludalo|te paso a|habla con|hablá con|estoy con|aca con|acá con|vino|llego|llegó)\b/;
    if (mencionaNombre && patronHandoff.test(textoNorm)) return candidato;
  }
  return null;
}

function respuestaFallbackIA(nombreAbuela: string, vozGenero: string): string {
  const completo = vozGenero === 'masculina' ? 'completo' : 'completa';
  const opciones = [
    `Se me trabó un poco la respuesta, ${nombreAbuela}. Decímelo de nuevo.`,
    `${nombreAbuela}, se me mezcló lo que te iba a decir. Probemos otra vez.`,
    `Perdón, ${nombreAbuela}, justo se me pinchó la respuesta. Decímelo de nuevo y seguimos.`,
    `Me quedé medio colgada con eso, ${nombreAbuela}. Repetímelo y te respondo mejor.`,
    `No me salió bien la respuesta recién, ${nombreAbuela}. Decímelo otra vez y sigo ${completo}.`,
  ];
  return `[NEUTRAL] ${opciones[Math.floor(Math.random() * opciones.length)]}`;
}

// ── Query builder para Wikipedia ─────────────────────────────────────────────
// Resuelve referencias deícticas ("este departamento", "este lugar", "acá") usando
// la ciudad del perfil y/o el último tema mencionado por Rosita en el historial.
function construirQueryWikipedia(
  textoUsuario: string,
  textoNorm: string,
  ciudad: string | null | undefined,
  historial: { role: string; content: string }[],
): string {
  // Si ya hay una pregunta directa y explícita, usarla sin modificar
  const esDeictica = /\b(este|esta|ese|esa|eso|esto|el mismo|la misma|de aca|de acá|de aqui|de aquí|ese lugar|esta ciudad|este pueblo|este departamento|este pais|este municipio)\b/.test(textoNorm);

  if (!esDeictica) return textoUsuario;

  // Intentar extraer el último sustantivo/tema mencionado por Rosita
  const ultimaRosita = [...historial].reverse().find(m => m.role === 'assistant')?.content ?? '';
  // Buscar entidades propias (palabras en mayúscula, lugares)
  const entidades = ultimaRosita
    .replace(/\[[^\]]+\]/g, '')          // quitar tags
    .match(/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)\b/g) ?? [];
  const temaConversacion = entidades.find(e => e.length > 4 && e !== 'Rosita' && e !== 'Maxi');

  if (temaConversacion) return temaConversacion;
  if (ciudad) return ciudad;
  return textoUsuario;
}

// ── Interfaz de dependencias ───────────────────────────────────────────────────

/** Tipo mínimo que useBrain necesita del audio player de música */
interface AudioPlayerLike {
  pause(): void;
  replace(source: object): void;
  play(): void;
  volume: number;
  readonly currentTime: number;
  readonly playing: boolean;
}

export interface BrainDeps {
  // Setters de estado visual
  setEstado: (s: EstadoRosita) => void;
  setExpresion: (e: Expresion) => void;
  setMusicaActiva: (active: boolean) => void;
  setLinternaActiva: (active: boolean) => void;
  setListas: (listas: Lista[]) => void;

  // Refs mutables de useRosita
  estadoRef:          React.MutableRefObject<EstadoRosita>;
  sinConexionRef:     React.MutableRefObject<boolean>;
  musicaActivaRef:    React.MutableRefObject<boolean>;
  ultimaCharlaRef:    React.MutableRefObject<number>;
  ultimaActividadRef: React.MutableRefObject<number>;
  proximaAlarmaRef:   React.MutableRefObject<number>;
  ultimaAlertaRef:    React.MutableRefObject<number>;
  timerVozRef:        React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  expresionTimerRef:  React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  climaRef:           React.MutableRefObject<string>;
  ciudadRef:          React.MutableRefObject<string>;
  coordRef:           React.MutableRefObject<{ lat: number; lon: number } | null>;
  perfilRef:          React.MutableRefObject<Perfil | null>;
  ultimaRadioRef:     React.MutableRefObject<string | null>;
  dispositivosTuyaRef:React.MutableRefObject<Dispositivo[]>;
  speechEndTsRef:     React.MutableRefObject<number>;
  srResultTsRef:      React.MutableRefObject<number>;
  rcStartTsRef:       React.MutableRefObject<number>;
  flashAnim:          Animated.Value;

  // Funciones del pipeline de audio
  hablar:              (texto: string, emotion?: string, skipCacheCheck?: boolean) => Promise<void>;
  hablarConCola:       (oraciones: string[], emotion?: string) => Promise<void>;
  splitEnOraciones:    (texto: string) => string[];
  extraerPrimeraFrase: (texto: string) => { primera: string; resto: string };
  precachearTexto:          (texto: string, emotion?: string) => Promise<void>;
  reproducirTecleo:    (abort: { current: boolean }) => Promise<void>;
  reproducirMuletilla: (tipo: import('./useAudioPipeline').TipoMuletilla) => Promise<void>;
  arranqueFrioRef:     React.MutableRefObject<boolean>;
  detenerSilbido:      () => void;
  silbidoHabilitadoRef: React.MutableRefObject<boolean>;
  pararMusica:               () => void;
  cerrarDGParaMusica:        () => void;
  playerMusica:              AudioPlayerLike;
  bloquearReanudarMusicaRef?: React.MutableRefObject<boolean>;
  iniciarSpeechRecognition: () => void;
  pararSRIntencional: () => void;
  setNoMolestar: (v: boolean) => void;
  suspenderSR?: () => void;
  reanudarSR?:  () => void;
  ejecutarAccionDomotica: (action: DomoticaAction) => Promise<void>;
  lanzarJuego?: (tipo: 'tateti' | 'ahorcado' | 'memoria') => void;
  /** Función que retorna true si el beacon BLE está conectado en este momento. */
  isBleConectado?: () => boolean;
}

// Fracción de palabras del texto A que están presentes en B.
// Usado para decidir si una respuesta especulativa de Claude sigue siendo válida.
function similitudTextos(a: string, b: string): number {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const wa = norm(a);
  const wb = norm(b);
  if (!wa.length || !wb.length) return 0;
  const setB = new Set(wb);
  return wa.filter(w => setB.has(w)).length / wa.length;
}

// ── useBrain ───────────────────────────────────────────────────────────────────

export function useBrain(deps: BrainDeps) {
  // Actualizar el ref sincrónicamente en cada render: garantiza que las
  // funciones async siempre ven los valores más recientes sin stale closures.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // ── Refs internos ────────────────────────────────────────────────────────────
  const historialRef       = useRef<Mensaje[]>([]);
  const mensajesSesionRef  = useRef(0);
  const episodicaCacheRef  = useRef<{
    key: string;
    text: string;
    lastRelevant?: {
      query: string;
      result: { texto: string; count: number; chars: number };
    };
  } | null>(null);
  const seguimientosRef    = useRef<Seguimiento[]>([]);
  const ultimaRapidaRef    = useRef<Partial<Record<CategoriaRapida, number>>>({});
  const charlaProactivaRef = useRef(false);
  const interlocutorRef    = useRef<{ nombre: string; expiresAt: number } | null>(null);
  const noticiasDiariaRef  = useRef<NoticiasDia[]>([]);
  const timerVozSeqRef      = useRef(0);
  const listaOpsRef         = useRef<Promise<void>>(Promise.resolve());
  // Ref cancelable para el timer de fallback de radio (10s) — evita que un stream
  // anterior siga corriendo cuando el usuario pide otra música antes de que pasen los 10s.
  const musicaFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Watchdog periódico: detecta y reconecta el stream si se cae mientras música activa.
  const musicaWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Session ID: se incrementa en cada ejecutarMusica y en limpiarTimersMusica.
  // Los callbacks async comparan su session capturada con el valor actual
  // para auto-invalidarse si la música fue parada o cambiada.
  const musicaSessionRef = useRef(0);

  // ── Ejecución especulativa de Claude (Deepgram partials) ────────────────────
  // Ejecución especulativa de Claude: arranca con el partial ≥8 palabras.
  const lastUsedSystemRef     = useRef<import('../lib/systemPayload').RositaSystemPayload | null>(null);
  const especulativoClaudeRef = useRef<{
    texto:   string;
    promise: Promise<string>;
    cancel:  () => void;
  } | null>(null);

  function cancelarEspeculativo() {
    if (especulativoClaudeRef.current) {
      especulativoClaudeRef.current.cancel();
      especulativoClaudeRef.current = null;
      logCliente('spec_claude_cancel', {});
    }
  }

  function onPartialReconocido(textoParcial: string) {
    const d = depsRef.current;
    // Permitir 'escuchando' además de 'esperando': el pipeline cambia el estado a
    // 'escuchando' en el primer onPartial, antes de llamar a este callback.
    if (d.estadoRef.current !== 'esperando' && d.estadoRef.current !== 'escuchando') return;

    const palabras = textoParcial.split(/\s+/).filter(Boolean);
    if (textoParcial.length < 20 || palabras.length < 5) return;

    const norm = textoParcial.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (PATRON_SKIP.test(norm)) return;

    // ── Especulativa Claude ────────────────────────────────────────────────────
    // Requiere ≥8 palabras y que haya un sistema previo (no arranca en la primera frase de sesión).
    if (palabras.length >= 8 && lastUsedSystemRef.current && !especulativoClaudeRef.current) {
      const cancelRef = { current: null as (() => void) | null };
      const specMessages: Mensaje[] = [
        ...historialRef.current.slice(-20),
        { role: 'user', content: textoParcial },
      ];
      const specPromise = llamarClaudeConStreaming({
        system:    lastUsedSystemRef.current,
        messages:  specMessages,
        maxTokens: 150,
        cancelRef,
        isSpec:    true,
      }).catch(() => '');
      especulativoClaudeRef.current = {
        texto:   textoParcial,
        promise: specPromise,
        cancel:  () => { cancelRef.current?.(); },
      };
      logCliente('spec_claude_start', { chars: textoParcial.length, words: palabras.length });
    }
  }

  async function cargarNoticiasDiarias(): Promise<void> {
    if (new Date().getHours() < 8) return;
    const hoy = new Date().toISOString().slice(0, 10);
    const key = `noticias_diarias_${hoy}`;
    try {
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        noticiasDiariaRef.current = JSON.parse(stored);
        return;
      }
      const noticias = await fetchNoticiasDiarias();
      if (noticias.length > 0) {
        noticiasDiariaRef.current = noticias;
        await AsyncStorage.setItem(key, JSON.stringify(noticias));
        // Limpiar claves de días anteriores
        const keys = await AsyncStorage.getAllKeys();
        const viejas = keys.filter(k => k.startsWith('noticias_diarias_') && k !== key);
        if (viejas.length) await AsyncStorage.multiRemove(viejas);
      }
    } catch (e: any) {
      if (__DEV__) console.log('[Noticias] error carga:', e?.message);
    }
  }

  function encolarOperacionListas(op: () => Promise<void>): Promise<void> {
    const next = listaOpsRef.current
      .catch(() => {})
      .then(op);
    listaOpsRef.current = next.catch(() => {});
    return next;
  }

  function esperarEstadoEsperando(timeoutMs = 15000): Promise<void> {
    const d = depsRef.current;
    if (d.estadoRef.current === 'esperando') return Promise.resolve();
    return new Promise(resolve => {
      const startedAt = Date.now();
      const check = setInterval(() => {
        if (d.estadoRef.current === 'esperando' || Date.now() - startedAt >= timeoutMs) {
          clearInterval(check);
          resolve();
        }
      }, 500);
    });
  }

  // ── Payload de prompt — el backend arma el system real ──────────────────────
  function getSystemPayload(
    p: Perfil,
    climaTexto: string,
    incluirJuego: boolean,
    extra = '',
    incluirChiste = false,
  ) {
    const d = depsRef.current;
    return buildRositaSystemPayload({
      perfil: p,
      dispositivos: d.dispositivosTuyaRef.current,
      climaTexto,
      extraTemporal: extra,
      ciudad: d.ciudadRef.current,
      coords: d.coordRef.current,
      memoriaEpisodica: episodicaCacheRef.current?.text ?? '',
      seguimientos: construirTextoSeguimientos(seguimientosRef.current),
    });
  }

  // Refresca el cache Y construye el contexto relevante en UNA sola lectura AsyncStorage.
  async function refrescarYConstruirMemoria(query: string): Promise<{ texto: string; count: number; chars: number }> {
    const memorias = await cargarMemoriasEpisodicas();

    // Si hay una query suficientemente larga, enriquecer con búsqueda semántica remota (fire-and-forget)
    // Los resultados se merguean en el cache local para el próximo turno, sin bloquear el actual.
    if (query.trim().length >= 12) {
      buscarMemoriasSemanticoRemoto(query)
        .then(remotas => {
          if (!remotas.length) return;
          return guardarMemoriasEpisodicas(
            [...memorias, ...remotas.filter(r => !memorias.some(m => m.id === r.id))],
          );
        })
        .catch(() => {});
    }

    // Refrescar cache de resumen completo
    const key = memorias
      .slice(0, 24)
      .map(mem => `${mem.id}:${mem.updatedAt}:${mem.mentions}`)
      .join('|');
    if (!episodicaCacheRef.current || episodicaCacheRef.current.key !== key) {
      episodicaCacheRef.current = {
        key,
        text: construirResumenMemoriasEpisodicas(memorias, { limit: 8, maxChars: 1200 }),
      };
    }

    // Construir contexto relevante para este turno (mismo código que buscarMemoriasEpisodicas
    // pero sin la segunda lectura AsyncStorage)
    if (!memorias.length) return { texto: '', count: 0, chars: 0 };
    const q = normalizarTextoPlano(query.toLowerCase());
    const qKeywords = extraerKeywordsMemoria(q, 10);
    if (qKeywords.length === 0 && q.length < 12) return { texto: '', count: 0, chars: 0 };
    const ahora = Date.now();
    const relevantes = memorias
      .map(mem => {
        const overlap = mem.keywords.filter(k => qKeywords.includes(k)).length;
        const resumenNorm = normalizarTextoPlano(mem.resumen.toLowerCase());
        const substringHit = q.length >= 6 && (resumenNorm.includes(q) || q.includes(resumenNorm.slice(0, 24)));
        const recencyDays = Math.max(1, (ahora - mem.updatedAt) / (24 * 60 * 60 * 1000));
        const score = (overlap * 3 + (substringHit ? 4 : 0) + Math.log(mem.mentions + 1)) / Math.sqrt(recencyDays);
        return { mem, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(({ mem }) => mem);

    if (!relevantes.length) {
      if (episodicaCacheRef.current) {
        episodicaCacheRef.current.lastRelevant = {
          query,
          result: { texto: '', count: 0, chars: 0 },
        };
      }
      return { texto: '', count: 0, chars: 0 };
    }
    const lista = relevantes.map((mem, idx) => `${idx + 1}. ${mem.resumen}`).join('\n');
    const texto = `\nMemorias relevantes:\n${lista}\nUsalas solo si suman.`;
    const result = { texto, count: relevantes.length, chars: texto.length };
    if (episodicaCacheRef.current) {
      episodicaCacheRef.current.lastRelevant = { query, result };
    }
    return result;
  }

  // ── Noticias en tiempo real ───────────────────────────────────────────────────
  async function buscarNoticias(query: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 7000);
      const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' after:' + hace5dias)}&hl=es-419&gl=AR&ceid=AR:es-419`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) return null;
      const xml = await res.text();
      const cdataMatches = [...xml.matchAll(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/gi)];
      const plainMatches = cdataMatches.length ? [] : [...xml.matchAll(/<title>([^<]+)<\/title>/gi)];
      const allMatches = cdataMatches.length ? cdataMatches : plainMatches;
      const titulos = allMatches.slice(1, 6).map(m => m[1].trim()).filter(Boolean);
      if (!titulos.length) return null;
      return titulos.join('\n');
    } catch {
      return null;
    }
  }

  // ── Charla proactiva ──────────────────────────────────────────────────────────
  async function arrancarCharlaProactiva() {
    const d = depsRef.current;
    if (charlaProactivaRef.current) { d.iniciarSpeechRecognition(); return; }
    if (d.estadoRef.current !== 'esperando') { d.iniciarSpeechRecognition(); return; }
    const p = d.perfilRef.current;
    if (!p) return;
    charlaProactivaRef.current = true;

    // Cargar y evictar seguimientos pendientes
    seguimientosRef.current = await cargarSeguimientos();

    // Mejora A: primer arranque — sincronizar memorias con backend en background
    (async () => {
      try {
        const locales = await cargarMemoriasEpisodicas();
        if (locales.length > 0) {
          sincronizarMemoriasEpisodicas(locales).catch(() => {});
        } else {
          const remotas = await fetchMemoriasEpisodicasRemoto();
          if (remotas.length > 0) {
            await guardarMemoriasEpisodicas(remotas);
          }
        }
      } catch {}
    })();

    // Refrescar cache de memorias episódicas para que getSystemPayload las incluya
    // y para saber si hay algo reciente que Rosita debería retomar
    await refrescarYConstruirMemoria('');
    const memoriasRecientes = episodicaCacheRef.current?.text?.trim() ?? '';

    const hora = new Date().getHours();
    const momento = hora < 12 ? 'la mañana' : hora < 14 ? 'la hora del almuerzo' : hora < 18 ? 'la tarde' : 'la noche';

    const temasPorMomento: Record<string, string[]> = {
      'la mañana': [
        'cómo amaneció, si durmió bien o cómo se siente',
        'qué tiene pensado hacer hoy o si tiene algún plan',
        'algo relacionado con el clima de hoy y cómo afecta el día',
        'una comida o desayuno, si ya tomó algo rico',
        'un recuerdo o anécdota relacionada con las mañanas',
        'si soñó algo anoche — preguntalo con curiosidad y calidez, como quien comparte un momento íntimo de la mañana',
        'contale un sueño inventado y gracioso o tierno que "tuviste" anoche (inventalo vos, sé creativa), y después preguntale si ella también suele soñar o si recuerda los sueños',
      ],
      'la hora del almuerzo': [
        'qué va a comer o ya comió, o sugerirle algo rico y saludable',
        'cómo va el día hasta ahora',
        'si descansó un rato o tiene planes para la tarde',
        'algo liviano sobre algún gustos o actividad que le gusta',
      ],
      'la tarde': [
        'cómo está pasando la tarde, si descansó o hizo algo',
        'algún tema de conversación basado en sus gustos o intereses',
        'si se movió un poco hoy o si le apetece hacer algún ejercicio liviano',
        'algo relacionado con algún familiar mencionado en su perfil',
        'una curiosidad, dato interesante o pregunta lúdica para pasar el rato',
        'un recuerdo o anécdota personal que surge naturalmente',
      ],
      'la noche': [
        'cómo le fue en el día, qué fue lo mejor',
        'si cenó algo rico o qué tiene ganas de cenar',
        'si está cansada o cómo se siente físicamente',
        'un tema tranquilo y cálido para cerrar el día con buena energía',
        'si tiene ganas de escuchar música o que le cuenten algo',
      ],
    };

    const temas = temasPorMomento[momento];
    // El feriado de hoy ya está en el system prompt (backend lo calcula).
    // La charla proactiva puede mencionar el feriado si Claude lo considera relevante.
    const esFeriadoHoy = false; // no se expone al frontend; Claude lo sabe desde el backend

    // 25% de las veces proponer entretenimiento curado (juego o chiste)
    const proponerEntretenimiento = !esFeriadoHoy && Math.random() < 0.25;
    // 12% de las veces (solo mañana/tarde) proponer ejercicios livianos guiados
    const esHoraEjercicio = hora >= 9 && hora < 20;
    const proponerEjercicio = esHoraEjercicio && !esFeriadoHoy && !proponerEntretenimiento && Math.random() < 0.12;
    let extraProactivo = '';
    let temaProactivo = '';

    if (proponerEjercicio) {
      const condFisica = p.condicionFisica?.trim();
      const restricciones = condFisica
        ? `IMPORTANTE — limitaciones físicas de la persona: "${condFisica}". Propone SOLO ejercicios compatibles con esas limitaciones (ej: si usa andador no propongas pararse sola; si tiene rodilla mal no propongas sentadillas).`
        : 'No hay limitaciones físicas anotadas en el perfil, podés proponer ejercicios livianos variados.';
      temaProactivo = `proponer hacer juntas unos ejercicios físicos muy livianos y guiados (ej: mover los brazos, rotación de cuello, respiración profunda, estiramientos sentada). ${restricciones} Que suene espontáneo y entusiasta, no como una orden. Una sola frase corta invitando a hacerlos ahora. Si acepta, guiala paso a paso en los turnos siguientes.`;
    } else if (proponerEntretenimiento) {
      const nots = noticiasDiariaRef.current;
      const rand = Math.random();
      if (nots.length > 0 && rand < 0.20) {
        const noticia = nots[Math.floor(Math.random() * nots.length)];
        extraProactivo = `\n\nNOTICIA DEL DÍA: Título: "${noticia.titulo}". Resumen: ${noticia.resumen}`;
        temaProactivo = 'comentar esta noticia de forma espontánea y cálida, como si la acabaras de leer y quisieras compartirla';
      } else if (rand < (nots.length > 0 ? 0.64 : 0.55)) {
        const juego = obtenerJuego();
        extraProactivo = `\n\n${formatearJuegoParaClaude(juego)}`;
        temaProactivo = 'proponer este juego o adivinanza de forma espontánea y cálida, como si se te ocurrió hacerlo en este momento';
      } else {
        const chiste = obtenerChiste();
        extraProactivo = `\n\n${formatearChisteParaClaude(chiste)}`;
        temaProactivo = 'arrancar contando este chiste de forma espontánea, como si se te ocurrió';
      }
    } else {
      temaProactivo = temas[Math.floor(Math.random() * temas.length)];
    }

    // Si hay memorias recientes y no estamos proponiendo entretenimiento/ejercicio,
    // darle preferencia a retomar algo pendiente (alguien que llegaba, un evento, etc.)
    const instruccionProactiva = (memoriasRecientes && !proponerEntretenimiento && !proponerEjercicio)
      ? `\n\nEs ${momento}. Revisá las memorias episódicas que tenés disponibles. Si hay algo reciente que quedó pendiente o sin resolver (por ejemplo: alguien que iba a llegar, un evento que iban a hacer, una situación que mencionaron y quedó abierta), preguntá cómo resultó, de forma natural y cálida, en UNA sola frase corta. Si no hay nada claro para retomar, iniciá UNA sola frase sobre este tema: ${temaProactivo}.`
      : `\n\nEs ${momento}. Iniciá UNA sola frase corta y cálida sobre este tema: ${temaProactivo}.`;

    try {
      const frase = await llamarClaude({
        maxTokens: proponerEntretenimiento ? 180 : proponerEjercicio ? 100 : 120,
        system: getSystemPayload(p, d.climaRef.current, false, `${instruccionProactiva} Usá el contexto del perfil si es relevante. Respondé SOLO con la frase, sin etiquetas.${extraProactivo}`),
        messages: [{ role: 'user', content: 'iniciá una charla' }],
      });
      if (frase) {
        await d.hablar(frase);
        d.ultimaCharlaRef.current = Date.now();
        historialRef.current = [
          { role: 'user', content: 'iniciá una charla' },
          { role: 'assistant', content: frase },
        ];
        // Limpiar seguimientos que ya fueron presentados a Claude en este turno proactivo
        if (seguimientosRef.current.length > 0) {
          borrarTodosSeguimientos().catch(() => {});
          seguimientosRef.current = [];
        }
      }
    } catch {
      d.ultimaCharlaRef.current = Date.now();
    } finally {
      charlaProactivaRef.current = false;
    }
  }

  // ── Resumen de sesión (llamar desde useEffect([modoNoche]) en useRosita) ───────
  async function generarResumenSesion(): Promise<void> {
    if (mensajesSesionRef.current < 6) return;
    mensajesSesionRef.current = 0; // reset para no resumir de nuevo esta noche
    const p = depsRef.current.perfilRef.current;
    const historial = historialRef.current;
    if (!p || historial.length < 4) return;
    try {
      const resumen = await llamarClaude({
        system: 'Sos un asistente que genera resúmenes ultra cortos. Respondé SOLO con una frase de máximo 12 palabras en español que capture el tema principal de la charla. Sin saludos ni explicaciones.',
        messages: [
          ...historial.slice(-12),
          { role: 'user', content: 'Resumí en máximo 12 palabras de qué hablamos hoy.' },
        ],
        maxTokens: 40,
      });
      if (!resumen || resumen.length < 5) return;
      const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      agregarRecuerdo(`[${fecha}] ${resumen.trim()}`).catch(() => {});
    } catch {}
  }

  async function ejecutarMusica(generoMusica: string, respuesta: string, nuevoHistorial: Mensaje[], ackYaDicho = false): Promise<void> {
    const d = depsRef.current;
    d.setExpresion('neutral');
    // Invalidar cualquier callback async de una sesión anterior
    limpiarTimersMusica();
    // El usuario pidió música explícitamente → limpiar bloqueo de reinicio manual
    if (d.bloquearReanudarMusicaRef) d.bloquearReanudarMusicaRef.current = false;
    // Nueva sesión: cualquier callback con session anterior se auto-invalida
    const session = ++musicaSessionRef.current;
    // Marcar música activa ANTES de hablar: así el cleanup de hablar() no reinicia SR
    // cuando la respuesta TTS termina (o falla con no-start). musicaActivaRef es la guardia
    // que usan el watchdog y el cleanup de hablar() para decidir si arrancar SR.
    d.musicaActivaRef.current = true;
    // Cerrar WS de Deepgram completamente: la pausa será larga (modo música)
    // y no queremos que Deepgram transcriba el audio del altavoz.
    d.cerrarDGParaMusica();
    const streamPromise = buscarRadio(generoMusica);
    logCliente('rosita_msg', { tag: 'MUSICA', texto: respuesta.slice(0, 500) });
    if (!ackYaDicho) {
      const comoDetener = d.isBleConectado?.() ? 'tocá el botón.' : 'tocá la pantalla.';
      await d.hablar(`${respuesta} Para detenerla, ${comoDetener}`);
    }
    // Si la sesión cambió mientras hablábamos (ej: el usuario pidió otra radio), abortar
    if (session !== musicaSessionRef.current) return;
    d.setEstado('pensando');
    d.estadoRef.current = 'pensando';
    const urlStream = await streamPromise;
    if (session !== musicaSessionRef.current) return;
    if (urlStream) {
      try {
        d.playerMusica.replace({ uri: urlStream });
        d.playerMusica.volume = 0.45;
        d.playerMusica.play();
        d.musicaActivaRef.current = true;
        d.detenerSilbido();
        d.setMusicaActiva(true);
        registrarMusicaHoy().catch(() => {});
        d.ultimaRadioRef.current = generoMusica;
        guardarUltimaRadio(generoMusica).catch(() => {});
        d.setEstado('esperando');
        d.estadoRef.current = 'esperando';
        // SR queda parado mientras suena música — se reactiva en pararMusica()
        if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
        d.expresionTimerRef.current = setTimeout(() => d.setExpresion('neutral'), 5000);
        // Verificación a los 30s: comprobar que el stream siga vivo.
        // Si playing=false, dar hasta 4 reintentos de 3s antes de ir al fallback.
        if (musicaFallbackTimerRef.current) clearTimeout(musicaFallbackTimerRef.current);
        musicaFallbackTimerRef.current = setTimeout(async () => {
          musicaFallbackTimerRef.current = null;
          if (session !== musicaSessionRef.current) return;
          if (!d.musicaActivaRef.current) return;
          // Dar hasta 4 intentos de 3s (12s extra) para confirmar que el stream anda.
          // Esto evita falsos negativos por microbuffering momentáneo.
          let estaAndando = d.playerMusica.playing;
          if (!estaAndando) {
            for (let intento = 0; intento < 4; intento++) {
              await new Promise(r => setTimeout(r, 3000));
              if (session !== musicaSessionRef.current || !d.musicaActivaRef.current) return;
              if (d.playerMusica.playing) { estaAndando = true; break; }
            }
          }
          if (estaAndando) {
            // Stream confirmado como funcionando → guardar en caché y arrancar watchdog
            confirmarRadio(generoMusica, urlStream).catch(() => {});
            if (musicaWatchdogRef.current) clearInterval(musicaWatchdogRef.current);
            // Usar currentTime + playing para detectar stream muerto.
            // currentTime solo NO es suficiente para streams en vivo: expo-audio reporta
            // currentTime=0 constantemente aunque el audio esté saliendo, lo que provocaba
            // reconexiones falsas cada ~40s (el "latido"). Solo reconectamos si currentTime
            // está estancado Y playing también es false.
            let wdLastCt = -1; let wdStuck = 0; let wdReconnects = 0;
            const wdUrl = urlStream;
            musicaWatchdogRef.current = setInterval(() => {
              if (session !== musicaSessionRef.current || !d.musicaActivaRef.current) {
                clearInterval(musicaWatchdogRef.current!);
                musicaWatchdogRef.current = null;
                return;
              }
              const ct = d.playerMusica.currentTime;
              const playing = d.playerMusica.playing;
              if ((ct > 0 && ct !== wdLastCt) || playing) {
                // currentTime avanzando O player activo → stream sano
                wdStuck = 0;
                wdReconnects = 0;
              } else if (wdLastCt >= 0) {
                // currentTime estancado Y playing=false → posiblemente muerto.
                // Solo contar si ya tuvimos al menos una lectura previa (evita falsos en carga inicial).
                wdStuck++;
                if (wdStuck >= 5) { // 5×8s=40s sin progreso → reconectar
                  if (wdReconnects >= 3) {
                    clearInterval(musicaWatchdogRef.current!);
                    musicaWatchdogRef.current = null;
                    return;
                  }
                  wdReconnects++;
                  wdStuck = -3; // 3 ticks de gracia (24s) antes del próximo intento
                  if (session !== musicaSessionRef.current || !d.musicaActivaRef.current) { wdLastCt = ct; return; }
                  try { d.playerMusica.replace({ uri: wdUrl }); d.playerMusica.play(); } catch {}
                }
              }
              wdLastCt = ct;
            }, 8000);
            return;
          }
          // Stream no arrancó → invalidar caché para que la próxima vez busque URL fresca
          if (session !== musicaSessionRef.current) return;
          AsyncStorage.removeItem(`radio_cache_v4_${generoMusica.toLowerCase().trim()}`).catch(() => {});
          const altUrl = getFallbackAlt(generoMusica, urlStream);

          async function hablarError(texto: string) {
            if (session !== musicaSessionRef.current) return;
            d.pararMusica();
            d.pararSRIntencional();
            await new Promise(r => setTimeout(r, 300));
            if (d.estadoRef.current === 'pensando' || d.estadoRef.current === 'hablando') return;
            await d.hablar(texto);
          }

          if (altUrl) {
            try {
              if (session !== musicaSessionRef.current || !d.musicaActivaRef.current) return;
              d.playerMusica.replace({ uri: altUrl });
              d.playerMusica.play();
              setTimeout(async () => {
                if (session !== musicaSessionRef.current || !d.musicaActivaRef.current) return;
                if (d.playerMusica.playing) {
                  confirmarRadio(generoMusica, altUrl).catch(() => {});
                  if (musicaWatchdogRef.current) clearInterval(musicaWatchdogRef.current);
                  let wdLastCt2 = -1; let wdStuck2 = 0; let wdReconnects2 = 0;
                  const wdUrl2 = altUrl;
                  musicaWatchdogRef.current = setInterval(() => {
                    if (session !== musicaSessionRef.current || !d.musicaActivaRef.current) {
                      clearInterval(musicaWatchdogRef.current!);
                      musicaWatchdogRef.current = null;
                      return;
                    }
                    const ct = d.playerMusica.currentTime;
                    const playing2 = d.playerMusica.playing;
                    if ((ct > 0 && ct !== wdLastCt2) || playing2) {
                      // currentTime avanzando O player activo → stream sano
                      wdStuck2 = 0;
                      wdReconnects2 = 0;
                    } else if (wdLastCt2 >= 0) {
                      wdStuck2++;
                      if (wdStuck2 >= 5) {
                        if (wdReconnects2 >= 3) {
                          clearInterval(musicaWatchdogRef.current!);
                          musicaWatchdogRef.current = null;
                          return;
                        }
                        wdReconnects2++;
                        wdStuck2 = -3;
                        if (session !== musicaSessionRef.current || !d.musicaActivaRef.current) { wdLastCt2 = ct; return; }
                        try { d.playerMusica.replace({ uri: wdUrl2 }); d.playerMusica.play(); } catch {}
                      }
                    }
                    wdLastCt2 = ct;
                  }, 8000);
                  return;
                }
                await hablarError('No pude conectar con esa radio ahora. ¿Querés que intente con otra?');
              }, 8000);
            } catch {
              await hablarError('No pude conectar con esa radio ahora. ¿Querés que intente con otra?');
            }
          } else {
            await hablarError('La radio no está respondiendo. ¿Querés que intente con otra?');
          }
        }, 30000);
      } catch {
        d.musicaActivaRef.current = false;
        d.setMusicaActiva(false);
        d.setEstado('esperando');
        d.estadoRef.current = 'esperando';
        await new Promise(r => setTimeout(r, 300));
        await d.hablar('No pude conectar con la radio, perdoname.');
      }
    } else {
      // Radio no encontrada — resetear estado de música para que SR pueda volver
      d.musicaActivaRef.current = false;
      d.setEstado('esperando');
      d.estadoRef.current = 'esperando';
      await d.hablar('No pude conectar con esa radio ahora, perdoname. Podés intentar con otra o pedirme un género musical.');
    }
    const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: respuesta }].slice(-30);
    historialRef.current = nuevoHist;
    guardarHistorial(nuevoHist).catch(() => {});
    d.ultimaCharlaRef.current = Date.now();
  }

  // ── Responder con Claude ───────────────────────────────────────────────────────
  async function responderConClaude(textoUsuario: string, prebuiltTurnId?: string) {
    const d = depsRef.current;
    const turnId = prebuiltTurnId ?? beginTurnTelemetry();
    if (__DEV__) console.log('[RC] responderConClaude llamado, texto:', textoUsuario.slice(0, 40));
    const p = d.perfilRef.current;
    if (!p) { if (__DEV__) console.log('[RC] sin perfil, saliendo'); return; }

    // ── Wake word + ventana de conversación ────────────────────────────────────
    // Rosita responde si: (1) la nombran, (2) está en ventana activa (<60s desde
    // última respuesta), o (3) el mensaje es urgente (emocional/salud).
    // Los patrones proactivos (clima, recordatorios, cumpleaños) no pasan por acá.
    {
      const textoNormGate  = normalizarTextoPlano(textoUsuario);
      const nombreAsist    = normalizarTextoPlano(p.nombreAsistente ?? 'Rosita');
      const nombreMencionado = textoNormGate.includes(nombreAsist);
      const ventanaActiva    = (Date.now() - d.ultimaCharlaRef.current) < VENTANA_CONVERSACION_MS;
      const esUrgente        = PATRON_EMPATICO.test(textoUsuario)
                             || PATRON_ALEGRIA.test(textoUsuario)
                             || PATRON_SALUD.test(textoUsuario);

      if (!nombreMencionado && !ventanaActiva && !esUrgente) {
        if (__DEV__) console.log('[RC] ignorado — sin nombre, ventana cerrada, sin urgencia');
        return;
      }
    }
    // ───────────────────────────────────────────────────────────────────────────

    // Lazy init: cargar seguimientos si la charla proactiva no corrió primero
    if (seguimientosRef.current.length === 0) {
      seguimientosRef.current = await cargarSeguimientos();
    }

    // Gate offline: evita esperar el timeout de red si ya sabemos que no hay conexión
    if (d.sinConexionRef.current) {
      const textoNormOffline = normalizarTextoPlano(textoUsuario);
      // Hora, fecha y cálculos se resuelven localmente aunque no haya red
      const instantaneaOffline = respuestaInstantanea(textoNormOffline);
      if (instantaneaOffline) {
        d.setEstado('esperando');
        d.estadoRef.current = 'esperando';
        await d.hablar(instantaneaOffline.texto, instantaneaOffline.emotion);
        return;
      }
      // Chistes: usar pool local en lugar de decir "necesito conexión"
      if (/\b(cont[aá](me)?(\s+un|\s+otro)?\s+chiste|dec[ií](me)?(\s+un|\s+otro)?\s+chiste|chistecito|cuentame algo gracioso)\b/i.test(textoNormOffline)) {
        const ch = obtenerChiste();
        const textoChiste = `${ch.setup} ... ${ch.remate}`;
        d.setEstado('esperando');
        d.estadoRef.current = 'esperando';
        await d.hablar(textoChiste);
        return;
      }
      const respLocal = respuestaOffline(textoUsuario, p.nombreAbuela, p.nombreAsistente ?? 'Rosita', d.climaRef.current, p.vozGenero ?? 'femenina');
      d.setEstado('esperando');
      d.estadoRef.current = 'esperando';
      await d.hablar(respLocal ?? 'No tengo conexión ahora. Cuando vuelva la señal seguimos.');
      return;
    }

    let neutralTimerProgramado = false;
    d.detenerSilbido();
    // Cancelar cualquier timer de expresión pendiente del turno anterior antes de
    // aplicar la nueva (ej. el 20s de PARAR_MUSICA pisaba expresiones del siguiente turno).
    if (d.expresionTimerRef.current) { clearTimeout(d.expresionTimerRef.current); d.expresionTimerRef.current = null; }
    d.setEstado('pensando');
    d.estadoRef.current = 'pensando';
    d.setExpresion('pensativa');

    const nuevoHistorial: Mensaje[] = [...historialRef.current, { role: 'user', content: textoUsuario }];
    const textoNorm = normalizarTextoPlano(textoUsuario);
    const vuelvePrincipal = detectarRetornoAlPrincipal(textoNorm, p);
    if (vuelvePrincipal) {
      interlocutorRef.current = null;
      logCliente('interlocutor_reset', { destino: 'principal' });
    }
    const interlocutorDetectado = inferirInterlocutorTemporal(textoUsuario, p) ?? detectarHandoffDirigido(textoNorm, p);
    if (interlocutorDetectado) {
      interlocutorRef.current = { nombre: interlocutorDetectado, expiresAt: Date.now() + INTERLOCUTOR_TTL_MS };
      logCliente('interlocutor_detectado', { nombre: interlocutorDetectado, modo: 'temporal' });
    }
    const interlocutorActivo = interlocutorRef.current && interlocutorRef.current.expiresAt > Date.now()
      ? interlocutorRef.current.nombre
      : null;
    if (interlocutorRef.current && interlocutorRef.current.expiresAt <= Date.now()) {
      interlocutorRef.current = null;
    }

    const esPararMusicaDirecto = /\b(par[áa]|apaga|corta|saca)\b.{0,20}\b(musica|música|radio)\b|\b(parar_musica)\b/.test(textoNorm);
    if (esPararMusicaDirecto && d.musicaActivaRef.current) {
      const respuesta = 'Listo, apago la música.';
      d.pararMusica();
      // Detener SR antes de hablar: el effect [musicaActiva] reinicia el SR con 400ms
      // delay que podría capturar el audio del TTS como input del usuario.
      d.pararSRIntencional();
      d.setExpresion('neutral');
      const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: respuesta }].slice(-30);
      historialRef.current = nuevoHist;
      guardarHistorial(nuevoHist).catch(() => {});
      d.ultimaCharlaRef.current    = Date.now();
      d.ultimaActividadRef.current = Date.now();
      logCliente('rapida_msg', { cat: 'parar_musica', texto: respuesta });
      cancelarEspeculativo();
      await d.hablar(respuesta);
      return;
    }

    // ── Toggle silbido por voz ─────────────────────────────────────────────────
    const PATRON_DESACTIVAR_SILBIDO =
      /\b(no\s+silb[eé]s?(\s+m[aá]s)?|dej[aá]\s+de\s+silbar|par[aá]\s+de\s+silbar|basta\s+de\s+silbar|ya\s+no\s+silb[eé]s?|no\s+quiero\s+(m[aá]s\s+)?(silbidos?|chiflidos?)|me\s+molesta\s+(el\s+)?(silbido|chiflido)|(desactiv[ao]|apag[ao]|quit[ao]|sacar?|deshabilit[ao]).{0,30}(silbido|chiflido|silbato))\b/i;
    const PATRON_ACTIVAR_SILBIDO =
      /\b(volvé?\s+a\s+silbar|pod[eé]s\s+silbar|silb[aá]\s+cuando|me\s+gusta\s+(cuando\s+)?silb|activ[ao].{0,20}silbido|habilit[ao].{0,20}silbido|pon[eé]?.{0,20}silbido|quiero\s+(que\s+silb|el\s+silbido))\b/i;

    const debeDesactivarSilbido = PATRON_DESACTIVAR_SILBIDO.test(textoNorm);
    const debeActivarSilbido    = !debeDesactivarSilbido && PATRON_ACTIVAR_SILBIDO.test(textoNorm);

    if (debeDesactivarSilbido || debeActivarSilbido) {
      d.silbidoHabilitadoRef.current = debeActivarSilbido;
      const p = d.perfilRef.current;
      const nombre = p?.nombreAbuela ? `, ${p.nombreAbuela.split(' ')[0]}` : '';
      const frasesDesactivar = [
        `Dale${nombre}, no silbo más.`,
        `Bueno${nombre}, me quedo calladita.`,
        `¡Entendido${nombre}! Silencio de silbidos.`,
        `Anotado${nombre}, nada de silbidos.`,
      ];
      const frasesActivar = [
        `¡Genial${nombre}, vuelvo a silbarte cuando te extrañe!`,
        `¡Buenísimo${nombre}! Te aviso con un silbidito.`,
        `Dale${nombre}, silbo cuando te necesite.`,
      ];
      const opciones = debeActivarSilbido ? frasesActivar : frasesDesactivar;
      const conf = opciones[Math.floor(Math.random() * opciones.length)];
      d.setEstado('esperando');
      d.estadoRef.current = 'esperando';
      d.setExpresion('neutral');
      d.ultimaCharlaRef.current    = Date.now();
      d.ultimaActividadRef.current = Date.now();
      cancelarEspeculativo();
      logCliente('rapida_msg', { cat: 'toggle_silbido', activar: debeActivarSilbido, texto: conf });
      await d.hablar(conf);
      return;
    }

    // ── No Molestar por voz ─────────────────────────────────────────────────────
    // Activar: "hacé silencio", "callate", "no me molestes", "modo silencio"
    // No requiere pasar por Claude — respuesta instantánea desde cache.
    const pideNoMolestar =
      /\b(hac[eé]|pon[eé](te)?|activ[aá]|entr[aá]\s+en|modo)\s+(silencio|no\s+molestar)\b/i.test(textoNorm) ||
      /\bno\s+me\s+molest[eé]s?\b/i.test(textoNorm) ||
      /\bcall[aá](te)?\b/i.test(textoNorm);
    if (pideNoMolestar) {
      const { frases, emotion } = FRASES_SISTEMA.modo_no_molestar_on;
      const frase = frases[Math.floor(Math.random() * frases.length)];
      cancelarEspeculativo();
      logCliente('rapida_msg', { cat: 'no_molestar_on', texto: frase });
      d.ultimaActividadRef.current = Date.now();
      await d.hablar(frase, emotion);
      d.setNoMolestar(true);
      d.pararSRIntencional();
      return;
    }

    // Radios nombradas: inequívocas, pueden matchear sin verbo de música
    const RADIOS_INEQUIVOCAS = /\b(radio\s+\d+|radio10|radio 10|mitre|cadena 3|cadena3|continental|rivadavia|la red|lared|metro|aspen|la 100|la100|con vos|convos|urbana|destape|mega|fm\s+vida|radio\s+vida|del plata|delplata|lt8|lv3)\b/;
    // Géneros ambiguos (salsa/rock/pop son también comida o contexto no-musical):
    // solo se activan si hay un verbo explícito de música antes o después
    const GENEROS_AMBIGUOS   = /\b(tango|bolero|folklore|folclore|romantica|romántica|clasica|clásica|jazz|pop|cumbia|cuarteto|rock|salsa|tropical|zamba|chacarera|vals|chamame|cueca)\b/;
    const VERBO_MUSICA       = /\b(pon[eé]|poneme|poné|pone|quiero escuchar|quiero oír|mand[aá]|dej[aá]|cant[aá](me)?)\b/;
    const pideMusicaDirecta =
      // "poneme música", "pone música", "quiero música", "poné música", etc.
      // Incluye poneme/poné explícitamente porque \bpone\b no matchea "poneme" como palabra completa.
      /\b(pon[eé]me?|poneme|poné|pone|quiero|mand[aá]|dej[aá])\b.{0,20}\b(musica|música|radio)\b/.test(textoNorm) ||
      RADIOS_INEQUIVOCAS.test(textoNorm) ||
      (VERBO_MUSICA.test(textoNorm) && GENEROS_AMBIGUOS.test(textoNorm));
    const generoDirecto = detectarGenero(textoNorm);
    if (pideMusicaDirecta) {
      // Si detectarGenero matcheó una clave conocida, usarla — si no, pasar el texto limpio
      // directamente a buscarRadio como búsqueda abierta en Radio Browser.
      const claveMusica = generoDirecto || textoNorm
        .replace(/\b(pon[eé]|pone|quiero|mand[aá]|dej[aá]|pone|poné|quiero escuchar|pon[eé]me|poneme|cant[aá]me?)\b/gi, '')
        .replace(/\b(musica|música|radio|fm|la radio|una radio)\b/gi, '')
        .replace(/[^a-záéíóúüñ0-9\s]/gi, '') // eliminar puntuación residual (ej: ".")
        .trim();
      // "Rosita pone música" → al eliminar verbo y "música" queda "rosita" → no es una radio,
      // es el nombre de la asistente. Tratar como petición genérica (preguntar qué quieren).
      const nombreAsist = (p?.nombreAsistente ?? 'rosita').toLowerCase().trim();
      const claveReal   = claveMusica && claveMusica !== nombreAsist ? claveMusica : '';
      if (claveReal) {
        const { femenina, masculina, emotion } = RESPUESTAS_RAPIDAS.musica;
        const vozGenero = (p.vozGenero ?? 'femenina') === 'masculina' ? 'masculina' : 'femenina';
        const lista = vozGenero === 'masculina' ? masculina : femenina;
        const ultimo = ultimaRapidaRef.current.musica ?? -1;
        let idx: number;
        do { idx = Math.floor(Math.random() * lista.length); } while (idx === ultimo && lista.length > 1);
        ultimaRapidaRef.current.musica = idx;
        const frase = lista[idx];
        d.setExpresion(EXPRESION_RAPIDA.musica);
        d.ultimaActividadRef.current = Date.now();
        d.ultimaCharlaRef.current = Date.now();
        logCliente('rapida_msg', { cat: 'musica_local', texto: frase });
        cancelarEspeculativo();
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: frase }].slice(-30);
        historialRef.current = nuevoHist;
        guardarHistorial(nuevoHist).catch(() => {});
        await d.hablar(frase, emotion);
        await ejecutarMusica(claveReal, frase, nuevoHistorial, true);
        return;
      } else {
        // "poneme música" sin género: preguntar qué quieren escuchar.
        // No auto-reproducir la última radio — mejor preguntar para que el usuario elija.
        const opcionesMusica = d.ultimaRadioRef.current
          ? `¿Querés seguir con ${nombreRadioOGenero(d.ultimaRadioRef.current)}, o preferís otra cosa? Puedo poner folklore, tango, cumbia, pop, una radio clásica...`
          : '¿Qué querés escuchar? Puedo poner folklore, tango, cumbia, pop, una radio, lo que quieras.';
        d.ultimaActividadRef.current = Date.now();
        logCliente('rapida_msg', { cat: 'musica_pregunta', texto: opcionesMusica });
        cancelarEspeculativo();
        d.setExpresion('feliz');
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: opcionesMusica }].slice(-30);
        historialRef.current = nuevoHist;
        guardarHistorial(nuevoHist).catch(() => {});
        d.ultimaCharlaRef.current    = Date.now();
        await d.hablar(opcionesMusica);
        return;
      }
    }

    // ── Respuestas rápidas: saltear Claude para mensajes cortos y predecibles ──
    const catRapida = RAPIDAS_HABILITADAS ? categorizarRapida(textoNorm) : null;
    if (catRapida) {
      // Afirmaciones solo si Rosita no hizo una pregunta pendiente (podría ser respuesta a ella)
      const hayPreguntaPendiente = catRapida === 'afirmacion' && (() => {
        const last = historialRef.current.filter(m => m.role === 'assistant').pop()?.content ?? '';
        return /\?/.test(last.replace(/\[[^\]]+\]/g, '').slice(-100));
      })();
      if (!hayPreguntaPendiente) {
        const { femenina, masculina, emotion } = RESPUESTAS_RAPIDAS[catRapida];
        const genero = (p.vozGenero ?? 'femenina') === 'masculina' ? 'masculina' : 'femenina';
        const lista  = genero === 'masculina' ? masculina : femenina;
        const ultimo = ultimaRapidaRef.current[catRapida] ?? -1;
        let idx: number;
        do { idx = Math.floor(Math.random() * lista.length); } while (idx === ultimo && lista.length > 1);
        ultimaRapidaRef.current[catRapida] = idx;
        const texto = lista[idx].replace(/\{n\}/g, interlocutorActivo ?? '').trim();
        d.setExpresion(EXPRESION_RAPIDA[catRapida]);
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: texto }].slice(-30);
        historialRef.current = nuevoHist;
        guardarHistorial(nuevoHist).catch(() => {});
        d.ultimaCharlaRef.current    = Date.now();
        d.ultimaActividadRef.current = Date.now();
        logCliente('rapida_msg', { cat: catRapida, texto });
        cancelarEspeculativo();
        await d.hablar(texto, emotion);
        // Timer de vuelta a neutral — sin esto la expresión ('feliz', etc.) quedaba
        // pegada indefinidamente porque este path retorna sin pasar por el timer normal.
        if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
        d.expresionTimerRef.current = setTimeout(() => {
          if (d.estadoRef.current === 'esperando') d.setExpresion('neutral');
        }, 6000);
        return;
      }
    }

    // ── Respuestas instantáneas: hora, fecha, cálculos (cero red) ────────────
    const instantanea = respuestaInstantanea(textoNorm);
    if (instantanea) {
      d.setExpresion('neutral');
      const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: instantanea.texto }].slice(-24);
      historialRef.current = nuevoHist;
      guardarHistorial(nuevoHist).catch(() => {});
      d.ultimaCharlaRef.current    = Date.now();
      d.ultimaActividadRef.current = Date.now();
      logCliente('rapida_msg', { cat: 'instantanea', texto: instantanea.texto });
      cancelarEspeculativo();
      await d.hablar(instantanea.texto, instantanea.emotion);
      return;
    }

    const socialBreve = generarRespuestaSocialBreve(textoNorm, p.vozGenero ?? 'femenina');
    if (socialBreve && esCharlaSocialBreve(textoNorm)) {
      d.setExpresion(socialBreve.expresion);
      const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: socialBreve.texto }].slice(-24);
      historialRef.current = nuevoHist;
      guardarHistorial(nuevoHist).catch(() => {});
      d.ultimaCharlaRef.current = Date.now();
      d.ultimaActividadRef.current = Date.now();
      logCliente('rapida_msg', { cat: 'social_breve', texto: socialBreve.texto });
      cancelarEspeculativo();
      await d.hablar(socialBreve.texto, socialBreve.emotion);
      // Timer de vuelta a neutral — sin esto 'cansada' o 'feliz' quedaba pegada.
      if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
      d.expresionTimerRef.current = setTimeout(() => {
        if (d.estadoRef.current === 'esperando') d.setExpresion('neutral');
      }, 6000);
      return;
    }

    const expresaAburrimiento = /\b(aburrid[ao]|me aburro|no tengo nada (que|para) hacer|sin hacer nada|muriéndome de aburrimiento|muero de aburrimiento|no sé (qué|en qué) (hacer|entretener)|qué aburrido|re aburrido|estoy aburrid)\b/.test(textoNorm);
    const pideTateti   = /\b(tateti|ta.?te.?ti|tres en raya|tres en linea|tic.?tac.?toe)\b/.test(textoNorm);
    const pideAhorcado = /\b(ahorcado|juego del ahorcado|adivinar la palabra)\b/.test(textoNorm);
    const pideMemoria  = /\b(memoria|juego de memoria|juego de fichas|encontrar las fichas|encontra las fichas)\b/.test(textoNorm);
    const pideJuegoBase = pideTateti || pideAhorcado || pideMemoria || /\b(juego|jugar|adivinan|trivia|quiz|memori|refranes?|adivina|calculo|calcul|trabale|cuenta|cuantos|cuanto es|matematica)\b/.test(textoNorm);
    const pideChisteBase = /\b(cont[aá](me)?(\s+un|\s+otro|\s+algún)?\s+chiste|dec[ií](me)?(\s+un|\s+otro|\s+algún)?\s+chiste|and[aá]\s+cont[aá](me)?\s+(un\s+)?chiste|chistecito|chistoso|gracioso|algo gracioso|me hace rei|haceme rei|contame algo diverti|me rei)\b/.test(textoNorm)
      || (/\b(otro|uno mas|dale|seguí|segui|mas|contame otro|otro mas)\b/.test(textoNorm)
          && nuevoHistorial.slice(-4).some(m => m.role === 'assistant' && /\[CHISTE\]/i.test(m.content)));
    // Si expresa aburrimiento y no pidió algo específico, Rosita propone un menú de opciones
    const ofrecerMenuAburrimiento = expresaAburrimiento && !pideJuegoBase && !pideChisteBase;
    const pideJuego  = pideJuegoBase;
    const pideChiste = pideChisteBase;
    const pideCuento  = /\b(cuento|historia|relato|narrac|contame (algo|lo que|una)|habla(me)? de (algo|lo que)|que sabes de|libre|lo que quieras|lo que se te ocurra|sorprendeme)\b/.test(textoNorm);
    const pideAccion = /\b(recordatorio|recordame|recorda(me)?|alarma|avisa(me)?|timer|temporizador|anota|anotame|anotá|guarda|guardame|papelito|nota\b|nota me|manda(le)?|envia(le)?|llama(le)?|emergencia)\b/.test(textoNorm);
    const esConsultaHorario = /\b(cuando juega|cuand[oa] juega|proximo partido|a que hora juega|a que hora es|proxima carrera|proximo gran premio|f1 horario|calendario deportivo|fixture|cuando es el partido|juega el|juega boca|juega river|juega racing|juega independiente|juega san lorenzo|juega belgrano|juega huracan|juega la seleccion|juega argentina)\b/.test(textoNorm);
    const pideNoticias = !esConsultaHorario && /\b(como salio|resultado|gano|perdio|partido|noticias|novedades|que paso|que hay|que se sabe|que esta pasando|actualidad|hoy en|contame algo|algo nuevo|enterame|boca|river|racing|independiente|san lorenzo|huracan|belgrano|seleccion|mundial|copa|liga|torneo|politica|gobierno|presidente|congreso|senado|diputados|elecciones|ministerio|economia|dolar|inflacion|pobreza|desempleo|formula|formulauno|f1|gran premio|carrera|verstappen|hamilton|leclerc|norris|moto ?gp|tenis|roland garros|wimbledon|us open|nba|nfl|olimpiadas?|clima de manana|pronostico)\b/.test(textoNorm);
    const pideBusqueda = !pideAccion && (esConsultaHorario || /\b(numero|telefono|direccion|donde queda|donde hay|comedor|municipalidad|municipio|farmacia|hospital|guardia|medico|odontologo|dentista|supermercado|colectivo|omnibus|horario|esta abierto|cerca de|cerca mia|cerca mio|cercano|cercana|mas cerca|banco|correo|correoargentino|renaper|anses|pami|cuando juega|proximo partido|a que hora juega|a que hora es|proxima carrera|proximo gran premio|f1 horario|calendario deportivo|heladeria|heladerias|restaurant|restaurante|hotel|hoteles|hostal|hostales|hospedaje|alojamiento|pizzeria|panaderia|carniceria|verduleria|ferreteria|peluqueria|gimnasio|kiosco|confiteria|cafe|bar|veterinaria|optica|zapateria|ropa|tienda|negocio|local|comercio|donde puedo|donde compro|donde venden|estacion.{0,5}servicio|nafta|combustible|surtidor|ypf|shell|axion|hay .{3,30} en|intendente|municipio|googlea|googlear|googleame|googlea(me)?|busca|buscame|busca(me)?|busca en internet|buscar en internet|internet|en google|google)\b/.test(textoNorm));
    const preguntaLugarVivo = /\b(lugar donde vivo|ciudad donde vivo|donde vivo|pueblo donde vivo|barrio donde vivo|contame (del|sobre el|de mi|sobre mi) (lugar|ciudad|pueblo|barrio|zona)|que (me podes|podes|sabes|me sabes) contar (del|de mi|sobre) (lugar|ciudad|pueblo|barrio))\b/.test(textoNorm);
    const esCierreConversacional = /\b(gracias|bueno|buena|listo|dale|despues|después|mas tarde|más tarde|seguimos|volvemos a charlar|te cuento|me voy|nos vemos|chau)\b/.test(textoNorm);
    const pideWikipedia = !esCierreConversacional && !pideNoticias && !pideBusqueda && (preguntaLugarVivo || /\b(que es|qué es|que son|qué son|que fue|qué fue|quien es|quién es|quien fue|quién fue|quien era|quién era|contame (sobre|de)|explicame|explicá(me)?|me explicás|que significa|qué significa|historia de|origen de|como funciona|cómo funciona|para que sirve|para qué sirve|cuando naci[oó]|biografía|biografia|quien invento|quién inventó|wikipedia|conoc[eé]s (la |el |a |una? )|sab[eé]s (algo (de|sobre)|de (la|el )|sobre (la|el ))|la serie|la pelicula|la película|el show|el documental|el libro|la novela|el actor|la actriz|el director|el musico|el músico|el artista|la banda|la obra)\b/.test(textoNorm));

    // ── Intercepción Inmediata de Juegos ──
    if (!pideBusqueda && (pideTateti || pideAhorcado || pideMemoria)) {
      d.setExpresion('entusiasmada');
      const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: '¡Qué lindo, dale! Juguemos un rato...' }].slice(-24);
      historialRef.current = nuevoHist;
      guardarHistorial(nuevoHist).catch(() => {});
      d.ultimaCharlaRef.current = Date.now();
      d.ultimaActividadRef.current = Date.now();
      cancelarEspeculativo();
      await d.hablar('¡Qué lindo, dale! Juguemos un rato...', 'entusiasmada');
      d.lanzarJuego?.(pideTateti ? 'tateti' : pideAhorcado ? 'ahorcado' : 'memoria');
      // Timer de vuelta a neutral — la pantalla del juego carga sobre Rosita;
      // si el usuario vuelve, la cara no debe quedar en 'entusiasmada'.
      if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
      d.expresionTimerRef.current = setTimeout(() => {
        if (d.estadoRef.current === 'esperando') d.setExpresion('neutral');
      }, 8000);
      return;
    }

    let queryBusqueda = textoUsuario;
    let tipoLugar: string | null = null;
    if (pideBusqueda) {
      const matchBusquedaExplicita = textoUsuario.match(/(?:busca(?:me)?|buscar(?:me)?|googlea(?:me)?|googlear)\s+(?:en\s+internet|en\s+google)?\s*(.+)$/i);
      if (matchBusquedaExplicita?.[1]) {
        queryBusqueda = matchBusquedaExplicita[1].trim();
      }

      // Si el mensaje es corto y vago (confirmación + verbo), recuperar el contexto del historial
      const esConfirmacionVaga = queryBusqueda.length < 35 &&
        /^\s*(si|sí|dale|ok|oka|bueno|siga|vamos|busca|buscá|andá|encontra|encontrá|probá|proba)\b/i.test(queryBusqueda.trim());
      if (esConfirmacionVaga) {
        // Buscar el último mensaje del asistente que tenga contenido sustancial
        const ultimaRespuesta = [...historialRef.current]
          .reverse()
          .find(m => m.role === 'assistant')?.content ?? '';
        // Extraer el tema principal quitando tags y frases meta
        const temaCandidato = String(ultimaRespuesta)
          .replace(/\[[^\]]+\]/g, '')
          .replace(/\b(buscar|encontré|encontrar|tengo|puedo|ahora|vamos a|busco|intento|resultados?|recetas?|paso a paso|completa|detallada|lamentablemente|disponibles?|ahora|no me traen|que me llegan)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80);
        if (temaCandidato.length > 10) {
          queryBusqueda = temaCandidato;
        }
      }

      const esTelefono  = /telefono|numero de|numero tel/.test(textoNorm);
      const esCerca     = /cerca|cercano|cercana|mas cerca|donde hay|en mi ciudad|en la ciudad/.test(textoNorm);
      const esHorario   = esConsultaHorario || /cuando juega|a que hora|proxim|horario de|calendario/.test(textoNorm);
      const ciudad      = d.ciudadRef.current;

      // Solo agregar la ciudad a búsquedas genuinamente locales (servicios, instituciones,
      // negocios, dónde/cómo llegar). No a recetas, clima, definiciones, etc.
      const esBusquedaLocal = esTelefono || esCerca ||
        /\b(farmacia|hospital|guardia|banco|correo|municipalidad|anses|pami|renaper|comisaria|kiosco|supermercado|carniceria|verduleria|panaderia|heladeria|restaurant|pizzeria|hotel|hospedaje|colectivo|omnibus|taxi|remis|combustible|ypf|shell|axion|surtidor|peluqueria|optica|zapateria|ferreteria|veterinaria|intendente|municipio)\b/.test(textoNorm);

      if (esTelefono && ciudad)        queryBusqueda = `${queryBusqueda} número de teléfono ${ciudad} Argentina`;
      else if (esCerca && ciudad)      queryBusqueda = `${queryBusqueda} más cercano a ${ciudad} Argentina`;
      else if (esHorario)              queryBusqueda = `${queryBusqueda} fecha y hora confirmada`;
      else if (esBusquedaLocal && ciudad) queryBusqueda = `${queryBusqueda} ${ciudad} Argentina`;
      // Para todo lo demás (recetas, definiciones, noticias generales, etc.): Serper ya usa gl:ar


      // Detectar tipo de lugar físico para usar Overpass en vez de Serper
      for (const { patron, tipo } of LUGAR_TIPOS) {
        if (patron.test(textoNorm)) { tipoLugar = tipo; break; }
      }
    }
    // Si hay tipo de lugar pero no tenemos coords todavía, intentar con el caché del OS
    if (tipoLugar && !d.coordRef.current) {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getLastKnownPositionAsync();
          if (pos) d.coordRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        }
      } catch {}
    }
    const esLugarLocal = !!tipoLugar && !!d.coordRef.current;

    d.rcStartTsRef.current = Date.now();
    const lagSrMs = d.srResultTsRef.current ? d.rcStartTsRef.current - d.srResultTsRef.current : -1;
    const lagSpeechEndMs = d.speechEndTsRef.current ? d.rcStartTsRef.current - d.speechEndTsRef.current : -1;
    logCliente('rc_start', {
      chars: textoUsuario.length,
      busqueda: pideBusqueda ? 'si' : 'no',
      wiki: pideWikipedia ? 'si' : 'no',
      noticias: pideNoticias ? 'si' : 'no',
      lag_sr_ms: lagSrMs,
      lag_speech_end_ms: lagSpeechEndMs,
    });
    logCliente('turn_start', { turn_id: turnId, user_chars: textoUsuario.length });

    // ── Estado de streaming ───────────────────────────────────────────────────
    let primeraFraseReproducida = false;
    let hablarPrimeraPromise: Promise<void> = Promise.resolve();
    let tagDetectadoStreaming = 'neutral';
    let primeraFraseResolver: ((txt: string | null) => void) | null = null;
    let primeraFraseSettled = false;
    const resolverPrimeraFrase = (txt: string | null) => {
      if (primeraFraseSettled) return;
      primeraFraseSettled = true;
      primeraFraseResolver?.(txt);
      primeraFraseResolver = null;
    };
    const primeraFraseDisparada = new Promise<string | null>(resolve => { primeraFraseResolver = resolve; });
    const onPrimeraFrase = (primera: string, tag: string) => {
      tagDetectadoStreaming = tag.toLowerCase();
      logCliente('primera_frase', { chars: primera.length, tag });
      d.precachearTexto(primera, tag.toLowerCase()).catch(() => {});
      resolverPrimeraFrase(primera);
    };

    const memoriaPromise = refrescarYConstruirMemoria(textoUsuario);

    const contextoInterlocutor = interlocutorActivo
      ? `\nInterlocutor actual: ${interlocutorActivo}. Respondé a ${interlocutorActivo}.`
      : `\nSi no sabés quién habla, no uses nombres propios.`;
    const maxTokBase  = pideCuento
      ? 1100
      : (pideJuego || pideChiste)
      ? 700
      : ofrecerMenuAburrimiento
        ? 150
        : (pideNoticias || pideBusqueda || pideWikipedia)
          ? 220
          : pideAccion
            ? 120
            : 150;
    const histSlice   = esCharlaSocialBreve(textoNorm) ? -6 : -20;
    const msgSliceBase = nuevoHistorial.slice(histSlice);

    try {
      const esRespuestaUtil = (texto?: string | null): boolean => {
        const limpio = (texto ?? '').replace(/\[[^\]]+\]\s*/g, '').trim();
        return limpio.length >= 12;
      };
      const resolverClaudeConFallback = async (params: { system: string | RositaSystemPayload; messages: Mensaje[]; maxTokens?: number; _t0?: number; }) => {
        try {
          const streamText = await llamarClaudeConStreaming({
            system: params.system,
            messages: params.messages,
            maxTokens: params.maxTokens,
            onPrimeraFrase,
            speechFinalTs: d.speechEndTsRef.current || undefined,
            _t0: params._t0,
          });
          if (esRespuestaUtil(streamText)) {
            resolverPrimeraFrase(null);
            return streamText;
          }
          logCliente('rc_stream_vacio', { chars: (streamText ?? '').length });
        } catch (e: any) {
          if (__DEV__) console.log('[RC] streaming falló, fallback a llamarClaude');
          logCliente('rc_stream_error', { error: String(e?.message ?? e).slice(0, 80) });
          resolverPrimeraFrase(null);
        }

        const retryText = await llamarClaude({
          system: params.system,
          messages: params.messages,
          maxTokens: params.maxTokens,
        }).catch((e: any) => {
          logCliente('rc_retry_error', { error: String(e?.message ?? e).slice(0, 80) });
          return '';
        });
        if (esRespuestaUtil(retryText)) {
          logCliente('rc_retry_ok', { chars: retryText.length });
          resolverPrimeraFrase(null);
          return retryText;
        }
        logCliente('rc_retry_vacio', { chars: retryText.length });
        resolverPrimeraFrase(null);
        return '';
      };

      let resultadosBusqueda: string | null = null;
      let claudePromise: Promise<string>;

      const tecleoAbort = { current: false };

      cancelarEspeculativo();

      const usaTecleo = pideNoticias || pideBusqueda || pideWikipedia;
      const tecleoPromise = usaTecleo ? d.reproducirTecleo(tecleoAbort) : Promise.resolve();

      if (!pideNoticias && !pideBusqueda && !pideWikipedia) {
        // ── Fast path ─────────────────────────────────────────────────────────
        // Para consultas de entretenimiento o charla social, la memoria episódica
        // no aporta valor y genera ~800ms de espera innecesaria. Usamos string vacío.
        const esConsultaLiviana = pideCuento || pideChiste || pideJuego || ofrecerMenuAburrimiento || esCharlaSocialBreve(textoNorm);
        const contextoMemoria = esConsultaLiviana
          ? { texto: '', count: 0, chars: 0 }
          : (episodicaCacheRef.current?.lastRelevant?.result ?? { texto: '', count: 0, chars: 0 });
        if (!esConsultaLiviana && !episodicaCacheRef.current?.lastRelevant) {
          memoriaPromise.catch(() => {});
        }
        const contenidoCurado = pideTateti
          ? `\n\nDIRECTIVA: El usuario quiere jugar al ta-te-ti. Respondé con entusiasmo confirmando que van a jugar y terminá con el tag [JUGAR_TATETI].`
          : pideAhorcado
          ? `\n\nDIRECTIVA: El usuario quiere jugar al ahorcado. Respondé con entusiasmo confirmando que van a jugar y terminá con el tag [JUGAR_AHORCADO].`
          : pideMemoria
          ? `\n\nDIRECTIVA: El usuario quiere jugar al juego de memoria. Respondé con entusiasmo confirmando que van a jugar y terminá con el tag [JUGAR_MEMORIA].`
          : pideJuego
          ? `\n\nDIRECTIVA JUEGO: El usuario quiere jugar. Podés proponer: a) Ta-te-ti (mencionalo y usá [JUGAR_TATETI]), b) Ahorcado (mencionalo y usá [JUGAR_AHORCADO]), c) Memoria (mencionalo y usá [JUGAR_MEMORIA]), o d) una trivia/adivinanza/refrán/trabalengua inline. Si el usuario pide alguno de esos juegos, confirmá con entusiasmo y usá el tag correspondiente al final.\n\n${formatearJuegoParaClaude(obtenerJuego())}`
          : pideChiste
          ? `\n\n${formatearChisteParaClaude(obtenerChiste())}`
          : ofrecerMenuAburrimiento
          ? (() => {
              const nots = noticiasDiariaRef.current;
              const noticiasBloque = nots.length > 0
                ? `\nNOTICIAS DEL DÍA DISPONIBLES:\n${nots.map((n, i) => `${i + 1}. "${n.titulo}" — ${n.resumen}`).join('\n')}`
                : '';
              const opcionNoticias = nots.length > 0 ? ', contarle algo interesante que pasó hoy (tenés noticias del día para compartir)' : '';
              return `\n\nDIRECTIVA ABURRIMIENTO: El usuario está aburrido. OBLIGATORIO: tu respuesta DEBE mencionar por nombre las opciones disponibles. NO respondas solo con "¿qué querés hacer?" ni preguntas abiertas genéricas — eso no sirve. PROPONÉ vos las opciones nombrándolas: 1) jugar al ta-te-ti [JUGAR_TATETI], al ahorcado [JUGAR_AHORCADO] o al juego de memoria [JUGAR_MEMORIA], 2) una trivia/adivinanza${opcionNoticias}, 3) música o radio, 4) charlar de lo que quiera. Sé cálida y breve, pero nombrá al menos 2 opciones concretas.${noticiasBloque}`;
            })()
          : '';
        const extraBase = `${d.ultimaRadioRef.current ? `\nÚltima radio: "${d.ultimaRadioRef.current}".` : ''}${contextoMemoria.texto}${contextoInterlocutor}${contenidoCurado}`;
        const systemPreview: RositaSystemPayload = getSystemPayload(p, d.climaRef.current, pideJuego, extraBase, pideChiste);
        lastUsedSystemRef.current = systemPreview;
        const tPreClaude = Date.now();
        logCliente('prompt_ctx', { hist_msgs: msgSliceBase.length, mem_count: contextoMemoria.count, mem_chars: contextoMemoria.chars, extra_chars: extraBase.length, pre_claude_ms: tPreClaude - d.rcStartTsRef.current });

        // Muletilla solo en arranque frío (primera respuesta tras reconexión desde idle).
        // En conversación fluida no se usa para no interrumpir el ritmo natural.
        if (d.arranqueFrioRef.current) {
          d.arranqueFrioRef.current = false; // consume: solo el primer turno
          type TM = import('./useAudioPipeline').TipoMuletilla;
          const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
          const tipoMuletilla: TM =
            pideChiste || pideCuento || pideJuego || pideTateti || pideAhorcado || pideMemoria || ofrecerMenuAburrimiento
              ? pick<TM>(['bueno', 'mm'])
              : esConsultaLiviana
              ? pick<TM>(['mm', 'aver'])
              : pick<TM>(['ver', 'aver', 'espera']);
          d.reproducirMuletilla(tipoMuletilla);
        }

        // ── Especulativa Claude hit/miss ─────────────────────────────────────
        const specClaude = especulativoClaudeRef.current;
        especulativoClaudeRef.current = null;
        const simScore = specClaude ? similitudTextos(specClaude.texto, textoUsuario) : 0;
        if (specClaude && simScore >= 0.75) {
          logCliente('spec_claude_hit', { sim: Math.round(simScore * 100) });
          claudePromise = specClaude.promise.then(text => {
            if (text) {
              const tagMatch = text.match(/^\[([A-Z_]+)\]/);
              const tag = tagMatch?.[1] ?? 'NEUTRAL';
              const sinTag = text.replace(/^\[[^\]]+\]\s*/, '');
              const firstSentenceMatch = sinTag.match(/^.{5,}?[.!?](?:["']*)(?:\s|$)/);
              const primera = (firstSentenceMatch?.[0] ?? sinTag.slice(0, 100)).trimEnd();
              if (primera) onPrimeraFrase(primera, tag);
            }
            return text;
          });
        } else {
          if (specClaude) {
            specClaude.cancel();
            logCliente('spec_claude_miss', { sim: Math.round(simScore * 100) });
          }
          claudePromise = resolverClaudeConFallback({
            system: systemPreview,
            messages: msgSliceBase,
            maxTokens: maxTokBase,
            _t0: tPreClaude,
          });
        }
      } else {
        // ── Slow path: búsqueda + memoria + tecleo corren todos en paralelo ──

        const [[titulosNoticias, busquedaResult, wikiResult], contextoMemoria] = await Promise.all([
          Promise.all([
            pideNoticias ? buscarNoticias(textoUsuario).then(r => r ?? buscarWeb(textoUsuario)) : Promise.resolve(null),
            pideBusqueda
              ? (esLugarLocal
                  ? buscarLugares(d.coordRef.current!.lat, d.coordRef.current!.lon, tipoLugar!)
                      .then(r => r !== null ? r : buscarWeb(queryBusqueda))
                  : buscarWeb(queryBusqueda))
              : Promise.resolve(null),
            pideWikipedia ? buscarWikipedia(construirQueryWikipedia(
              textoUsuario.replace(new RegExp(`\\b${p.nombreAsistente ?? 'Rosita'}\\b`, 'gi'), '').trim(),
              textoNorm,
              d.ciudadRef.current,
              nuevoHistorial,
            )) : Promise.resolve(null),
          ]),
          memoriaPromise,
        ]);

        // Resultados listos → parar tecleo y esperar que se detenga limpiamente
        tecleoAbort.current = true;
        await tecleoPromise;

        const extraBase = `${d.ultimaRadioRef.current ? `\nÚltima radio: "${d.ultimaRadioRef.current}".` : ''}${contextoMemoria.texto}${contextoInterlocutor}`;
        logCliente('prompt_ctx', { hist_msgs: msgSliceBase.length, mem_count: contextoMemoria.count, mem_chars: contextoMemoria.chars, extra_chars: extraBase.length });

        resultadosBusqueda = busquedaResult;
        const noticiasFinales = resultadosBusqueda ? null : titulosNoticias;
        let contextoNoticias = '';
        if (noticiasFinales) {
          contextoNoticias = `\n\n🚨 EXCEPCIÓN DE LONGITUD: Para esta respuesta podés usar hasta 60 palabras para resumir los titulares con claridad.\nNoticias recientes relacionadas con la consulta (fuente: Google News, ${new Date().toLocaleDateString('es-AR')}):\n${noticiasFinales}\nResumí los titulares más relevantes en lenguaje simple y cálido.`;
        }
        let contextoBusqueda = '';
        if (resultadosBusqueda) {
          contextoBusqueda = `\n\n🚨 EXCEPCIÓN DE LONGITUD: Podés usar hasta 80 palabras.
Resultados de búsqueda web (Google, ${new Date().toLocaleDateString('es-AR')}):
${resultadosBusqueda}

REGLAS CRÍTICAS PARA RESPONDER:
1. Usá SOLO los datos que aparecen en los resultados. NUNCA inventes nombres de lugares, direcciones, teléfonos ni personas. Si el dato no está en los resultados, decí claramente "No tengo ese dato ahora mismo" o "No lo encontré".
2. PRONUNCIACIÓN OBLIGATORIA: Cualquier número que sea altura de dirección o teléfono, escribilo separando CADA dígito con coma y espacio. Ejemplos: "Yrigoyen 7, 6, 2" — "Colón 1, 2, 5, 0" — "3, 4, 0, 8, 6, 7, 7". Sin excepción. No hagas esto con años (1990, 2024).
3. CERO PREGUNTAS: NUNCA hagas preguntas de seguimiento al final de tu respuesta. Entregá la información y terminá en punto final.`;
        }
        let contextoWiki = '';
        if (wikiResult) {
          contextoWiki = `\n\n🚨 EXCEPCIÓN DE LONGITUD: Podés usar hasta 60 palabras.\nInformación de Wikipedia para enriquecer tu respuesta:\n${wikiResult}\nUsá esta información de forma natural y cálida, sin citar textualmente Wikipedia.`;
        }
        const systemFull = getSystemPayload(p, d.climaRef.current, pideJuego, extraBase + contextoNoticias + contextoBusqueda + contextoWiki, pideChiste);
        const tPreClaudeSlow = Date.now();
        claudePromise = resolverClaudeConFallback({
          system: systemFull,
          messages: msgSliceBase,
          maxTokens: maxTokBase,
          _t0: tPreClaudeSlow,
        });
      }

      const claudeOutcomePromise = claudePromise
        .then(t => ({ ok: true as const, value: t }))
        .catch(error => ({ ok: false as const, error }));

      // Flag para saber si Claude ya resolvió cuando llegue el winner
      let claudeResuelto = false;
      claudeOutcomePromise.then(() => { claudeResuelto = true; });

      const winner = await Promise.race([
        primeraFraseDisparada.then(t => ({ kind: 'primera' as const, t })),
        claudeOutcomePromise.then(result => ({ kind: 'claude' as const, result })),
      ]);

      // Si Claude respondió completo antes de detectar primera frase, pre-cachear ya
      if (winner.kind === 'claude' && winner.result.ok && winner.result.value) {
        const ppc = parsearRespuesta(winner.result.value, p.telegramContactos ?? [], p.familiares ?? []);
        d.splitEnOraciones(ppc.respuesta).forEach(s => d.precachearTexto(s, ppc.expresion).catch(() => {}));
      }

      // Parar tecleo JUSTO antes de que Rosita empiece a hablar
      tecleoAbort.current = true;
      await tecleoPromise;

      // Si ya tenemos la primera frase, reproducirla en paralelo mientras llega el resto de Claude
      if (winner.kind === 'primera' && winner.t) {
        // skipCacheCheck=true: la primera frase del streaming es texto recén generado,
        // cache miss garantizado — evitar FileSystem.getInfoAsync para reducir latencia.
        hablarPrimeraPromise = d.hablar(winner.t, tagDetectadoStreaming, true);
        primeraFraseReproducida = true;
      }

      const respuestaRaw = winner.kind === 'claude'
        ? (winner.result.ok ? winner.result.value : await claudePromise)
        : await claudePromise;
      if (!esRespuestaUtil(respuestaRaw)) {
        const fallbackHumano = respuestaFallbackIA(
          p.nombreAbuela,
          p.vozGenero ?? 'femenina',
        );
        logCliente('rc_fallback_ia', { chars: fallbackHumano.length, motivo: 'llm_empty_or_error' });
        const parsedFallback = parsearRespuesta(
          fallbackHumano,
          p.telegramContactos ?? [],
          p.familiares ?? [],
        );
        d.setExpresion(parsedFallback.expresion);
        guardarEntradaAnimo(parsedFallback.animoUsuario);
        sincronizarAnimo(parsedFallback.animoUsuario, Date.now());
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsedFallback.respuesta }].slice(-30);
        historialRef.current = nuevoHist;
        guardarHistorial(nuevoHist).catch(() => {});
        mensajesSesionRef.current += 2;
        d.ultimaCharlaRef.current    = Date.now();
        d.ultimaActividadRef.current = Date.now();
        logCliente('rosita_msg', { tag: parsedFallback.tagPrincipal ?? 'none', texto: parsedFallback.respuesta.slice(0, 500) });
        await d.hablar(parsedFallback.respuesta, parsedFallback.expresion);
        return;
      }

      const parsed = parsearRespuesta(
        respuestaRaw,
        p.telegramContactos ?? [],
        p.familiares ?? [],
      );

      const mantenerLarga =
        parsed.tagPrincipal === 'CUENTO'
        || parsed.tagPrincipal === 'JUEGO'
        || parsed.tagPrincipal === 'CHISTE'
        || parsed.tagPrincipal === 'MUSICA'
        || parsed.tagPrincipal === 'PARAR_MUSICA'
        || parsed.tagPrincipal === 'LINTERNA'
        || ofrecerMenuAburrimiento;

      if (!mantenerLarga) {
        parsed.respuesta = compactarRespuestaParaVoz(
          parsed.respuesta,
          d.splitEnOraciones,
          {
            maxOraciones: (pideNoticias || pideBusqueda || pideWikipedia) ? 4 : ofrecerMenuAburrimiento ? 5 : 2,
            maxChars: (pideNoticias || pideBusqueda || pideWikipedia) ? 350 : ofrecerMenuAburrimiento ? 400 : 150,
          },
        );
      }

      if (resultadosBusqueda) {
        const sinPregunta = parsed.respuesta.replace(/¿[^?]+?\?\s*$/, '').trim();
        if (sinPregunta.length > 15) parsed.respuesta = sinPregunta;
      }

      registrarMemoriaEpisodica(textoUsuario, parsed.respuesta)
        .then(() => cargarMemoriasEpisodicas())
        .then(mems => sincronizarMemoriasEpisodicas(mems))
        .catch(() => {});

      // ── ASYNC_JOB: disparo fire-and-forget ANTES de cualquier early return ──
      // Debe estar aquí para que los handlers de JUEGOS, MÚSICA, etc. no lo bloqueen.
      if (parsed.asyncJob) {
        logCliente('async_job_dispatch', { tipo: parsed.asyncJob.tipo, query: parsed.asyncJob.query.slice(0, 60) });
        crearAsyncJob(parsed.asyncJob.tipo, parsed.asyncJob.query).catch(() => {});
      }

      // ── FOLLOW_UP: guardar para retomar en la próxima sesión ──
      if (parsed.followUp) {
        const ahora = Date.now();
        const nuevo: Seguimiento = {
          id: `fu_${ahora}_${Math.random().toString(36).slice(2, 6)}`,
          descripcion: parsed.followUp,
          creadoEn: ahora,
          expiresAt: ahora + 72 * 60 * 60 * 1000,
        };
        guardarSeguimiento(nuevo).catch(() => {});
        seguimientosRef.current = [...seguimientosRef.current, nuevo];
      }

      // ── PARAR_MUSICA ──
      if (parsed.tagPrincipal === 'PARAR_MUSICA') {
        d.pararMusica(); // incluye musicaActivaRef.current = false (playerMusica.pause solo no lo setea)
        if (d.bloquearReanudarMusicaRef) d.bloquearReanudarMusicaRef.current = true;
        // Detener SR antes de hablar: el effect [musicaActiva] reinicia el SR con 400ms
        // delay que podría capturar el audio del TTS como input del usuario.
        d.pararSRIntencional();
        d.setExpresion('neutral');
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsed.respuesta }].slice(-30);
        historialRef.current = nuevoHist;
        guardarHistorial(nuevoHist).catch(() => {});
        d.ultimaCharlaRef.current   = Date.now();
        d.ultimaActividadRef.current = Date.now();
        await d.hablar(parsed.respuesta);
        if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
        d.expresionTimerRef.current = setTimeout(() => d.setExpresion('neutral'), 20000);
        return;
      }

      // ── JUEGOS ──
      if (parsed.jugarTateti || parsed.jugarAhorcado || parsed.jugarMemoria) {
        await d.hablar(parsed.respuesta);
        if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
        d.setExpresion('neutral');
        d.lanzarJuego?.(parsed.jugarTateti ? 'tateti' : parsed.jugarAhorcado ? 'ahorcado' : 'memoria');
        return;
      }

      // ── LINTERNA ──
      if (parsed.tagPrincipal === 'LINTERNA') {
        d.setLinternaActiva(true);
        Animated.timing(d.flashAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        // No llamar Brightness directamente: setLinternaActiva dispara el effect
        // en useRosita que centraliza todo el brillo via aplicarBrilloDeseado.
        await d.hablar(parsed.respuesta);
        return;
      }

      // ── MUSICA ──
      if (parsed.tagPrincipal === 'MUSICA' && parsed.generoMusica) {
        await ejecutarMusica(parsed.generoMusica, parsed.respuesta, nuevoHistorial);
        return;
      }

      // ── TIMER ──
      if (parsed.timerSegundos) {
        const segundos = parsed.timerSegundos;
        const nombre = d.perfilRef.current?.nombreAbuela ?? '';
        const formatearTiempo = (s: number) => {
          if (s < 60) return `${s} segundo${s !== 1 ? 's' : ''}`;
          const m = Math.round(s / 60);
          if (m < 60) return `${m} minuto${m !== 1 ? 's' : ''}`;
          const h = Math.floor(m / 60); const mm = m % 60;
          const hStr = `${h} hora${h !== 1 ? 's' : ''}`;
          return mm === 0 ? hStr : `${hStr} y ${mm} minuto${mm !== 1 ? 's' : ''}`;
        };
        const mensaje = `${nombre}, ya pasaron los ${formatearTiempo(segundos)}.`.trimStart();

        const timerId = `timer_${Date.now()}`;
        const targetMs = Date.now() + segundos * 1000;
        const targetDate = new Date(targetMs).toISOString().slice(0, 10);
        guardarRecordatorio({
          id: timerId,
          texto: mensaje,
          fechaISO: targetDate,
          timestampEpoch: targetMs,
          esTimer: true,
          esAlarma: true,
          creadoEn: Date.now(),
        }).catch(() => {});

        if (segundos <= 3600) {
          timerVozSeqRef.current += 1;
          const seq = timerVozSeqRef.current;
          if (d.timerVozRef.current) clearTimeout(d.timerVozRef.current);
          d.timerVozRef.current = null;
          d.timerVozRef.current = setTimeout(async () => {
            if (seq !== timerVozSeqRef.current) return;
            borrarRecordatorio(timerId).catch(() => {});
            if (d.estadoRef.current === 'hablando' || d.estadoRef.current === 'pensando') {
              await esperarEstadoEsperando();
            }
            if (seq !== timerVozSeqRef.current) return;
            await d.hablar(mensaje);
          }, segundos * 1000);
        }
      }

      // ── RECORDATORIO ──
      if (parsed.recordatorio && !parsed.alarma) {
        await guardarRecordatorio(parsed.recordatorio);
      }

      // ── ALARMA ──
      if (parsed.alarma) {
        const fechaISO = new Date(parsed.alarma.timestampEpoch).toISOString().slice(0, 10);
        await guardarRecordatorio({
          id: `alarma_${parsed.alarma.timestampEpoch}`,
          texto: parsed.alarma.texto,
          fechaISO,
          timestampEpoch: parsed.alarma.timestampEpoch,
          esTimer: true,
          esAlarma: true,
          creadoEn: Date.now(),
        }).catch(() => {});
        d.proximaAlarmaRef.current = parsed.alarma.timestampEpoch;
      }

      // ── RECUERDOS ──
      if (parsed.recuerdos.length > 0) {
        await Promise.all(parsed.recuerdos.map((r: string) => agregarRecuerdo(r)));
        depsRef.current.perfilRef.current = await cargarPerfil();
      }

      // ── DOMÓTICA ── delegado a useSmartThings
      // Pre-cachear TTS en paralelo con el control SmartThings para eliminar la
      // espera secuencial (POST controlar + GET estado ~2s) antes del audio.
      if (parsed.domotica) {
        await Promise.all([
          d.ejecutarAccionDomotica(parsed.domotica),
          parsed.respuesta ? d.precachearTexto(parsed.respuesta, parsed.expresion).catch(() => {}) : Promise.resolve(),
        ]);
      }

      // ── LISTAS ──
      if (parsed.listaNueva) {
        const listaNueva = parsed.listaNueva;
        const nueva: Lista = { id: Date.now().toString(), nombre: listaNueva.nombre, items: listaNueva.items, creadaEn: Date.now() };
        await encolarOperacionListas(async () => {
          await guardarLista(nueva);
          d.setListas(await cargarListas());
        });
      } else if (parsed.listaAgregar) {
        const listaAgregar = parsed.listaAgregar;
        await encolarOperacionListas(async () => {
          await agregarItemLista(listaAgregar.nombre, listaAgregar.item);
          d.setListas(await cargarListas());
        });
      } else if (parsed.listaBorrar) {
        const listaBorrar = parsed.listaBorrar;
        await encolarOperacionListas(async () => {
          await borrarLista(listaBorrar);
          d.setListas(await cargarListas());
        });
      }

      // ── Alertas Telegram: EMERGENCIA > LLAMAR_FAMILIA > MENSAJE_FAMILIAR ──
      if (parsed.emergencia) {
        const chatIds     = (p.telegramContactos ?? []).map(c => c.id);
        const nombreAsist = p.nombreAsistente ?? 'Rosita';
        d.ultimaAlertaRef.current = Date.now();
        guardarEntradaAnimo('triste');
        sincronizarAnimo('emergencia', Date.now());
        enviarAlertaTelegram(chatIds, `⚠️ *URGENTE* — ${p.nombreAbuela}\n\n${parsed.emergencia}\n\nAbrí ${nombreAsist} o llamala de inmediato.`, nombreAsist);
      } else if (parsed.llamarFamilia) {
        const chatIds = (p.telegramContactos ?? []).map(c => c.id);
        const ahora   = Date.now();
        if (ahora - d.ultimaAlertaRef.current > 30 * 60 * 1000) {
          d.ultimaAlertaRef.current = ahora;
          enviarAlertaTelegram(chatIds, `${p.nombreAbuela} necesita hablar con vos.\n\n_${parsed.llamarFamilia}_`, p.nombreAsistente);
        }
      } else if (parsed.mensajeFamiliar) {
        const { nombreDestino, texto: textoMensaje } = parsed.mensajeFamiliar;
        const contactos: TelegramContacto[] = p.telegramContactos ?? [];
        const contacto = contactos.find(c => c.nombre === nombreDestino)
          ?? contactos.find(c => c.nombre.toLowerCase().includes(nombreDestino.toLowerCase()));
        if (contacto) {
          try {
            await enviarAlertaTelegram([contacto.id], textoMensaje, p.nombreAsistente);
            await d.hablar(`Listo, le mandé el mensaje a ${contacto.nombre}.`);
          } catch {
            await d.hablar(`Ay, no pude mandarle el mensaje a ${contacto.nombre}. Intentá de nuevo en un ratito.`);
          }
        } else {
          await d.hablar(`No encontré a ${nombreDestino} en los contactos. ¿Está configurado en la app?`);
        }
        d.ultimaCharlaRef.current    = Date.now();
        d.ultimaActividadRef.current = Date.now();
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsed.respuesta }].slice(-30);
        historialRef.current = nuevoHist;
        guardarHistorial(nuevoHist).catch(() => {});
        return;
      }

      // ── Respuesta normal ──
      d.setExpresion(parsed.expresion);
      guardarEntradaAnimo(parsed.animoUsuario);
      sincronizarAnimo(parsed.animoUsuario, Date.now());
      const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsed.respuesta }].slice(-30);
      historialRef.current = nuevoHist;
      guardarHistorial(nuevoHist).catch(() => {});
      mensajesSesionRef.current += 2;
      d.ultimaCharlaRef.current    = Date.now();
      d.ultimaActividadRef.current = Date.now();
      const oracionesTotal = d.splitEnOraciones(parsed.respuesta);
      // Pre-cachear oraciones[1+] para evitar gaps — saltar [0] que se streameará directo
      oracionesTotal.slice(1).forEach(s => d.precachearTexto(s, parsed.expresion).catch(() => {}));
      logCliente('rc_hablar', { oraciones: oracionesTotal.length, chars: parsed.respuesta.length, primeraReproducida: primeraFraseReproducida });
      const turnMetrics = getCurrentTurnMetrics();
      logCliente('turn_summary', {
        turn_id: turnId,
        e2e_total_ms: turnMetrics.e2eNowMs ?? -1,
        response_chars: parsed.respuesta.length,
        oraciones: oracionesTotal.length,
      });
      logCliente('rosita_msg', { tag: parsed.tagPrincipal ?? 'none', texto: parsed.respuesta.slice(0, 500) });
      if (oracionesTotal.length === 0 && !primeraFraseReproducida) {
        logCliente('rc_parse_vacio', { rawSlice: respuestaRaw.slice(0, 150) });
        await d.hablar('No entendí bien, ¿podés repetir?');
        return;
      }
      if (primeraFraseReproducida) {
        const { resto } = d.extraerPrimeraFrase(parsed.respuesta);
        await hablarPrimeraPromise;
        if (resto) await d.hablarConCola(d.splitEnOraciones(resto), parsed.expresion);
      } else {
        await d.hablarConCola(oracionesTotal, parsed.expresion);
      }

      // ── Aviso inmediato de nota en preparación ──
      // Si Claude despachó un async job, anunciarlo con voz AHORA (justo después del resumen)
      // para que el usuario sepa que va a aparecer una nota completa. El segundo aviso
      // ("Te dejé una nota con...") llega cuando el backend termina (polling ~45s).
      if (parsed.asyncJob) {
        const avisoNota = parsed.asyncJob.tipo === 'receta'
          ? 'Ahora te preparo una nota con la receta completa para que la puedas ver cuando quieras.'
          : 'Voy a buscar más información y la voy a guardar en una nota para que la tengas a mano.';
        await d.hablar(avisoNota);
      }

      // ── Recordatorio de medicamento pendiente ──
      try {
        const medRaw = await AsyncStorage.getItem('medPendiente');
        if (medRaw) {
          const { texto, ts } = JSON.parse(medRaw);
          const sigueVigente = Date.now() - ts < 4 * 60 * 60 * 1000;
          const esTurnoAccion =
            !!parsed.domotica
            || !!parsed.listaNueva
            || !!parsed.listaAgregar
            || !!parsed.listaBorrar
            || !!parsed.timerSegundos;

          if (!sigueVigente) {
            await AsyncStorage.removeItem('medPendiente');
          } else if (esTurnoAccion) {
            logCliente('med_pendiente_postergado', { chars: texto.length, turn_id: turnId });
          } else {
            await AsyncStorage.removeItem('medPendiente');
            logCliente('med_pendiente_hablar', { chars: texto.length, turn_id: turnId });
            await d.hablar(`Por cierto, ${texto}`);
          }
        }
      } catch {
        await AsyncStorage.removeItem('medPendiente').catch(() => {});
      }

      // El timer de vuelta a neutral se programa DESPUÉS de que hablarConCola termina,
      // es decir, cuando el audio ya finalizó. Así la expresión no cambia mientras Rosita
      // todavía está hablando (el timer anterior de 8s podía pisar el audio si era largo).
      if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
      neutralTimerProgramado = true;
      d.expresionTimerRef.current = setTimeout(() => {
        if (d.estadoRef.current === 'esperando') d.setExpresion('neutral');
      }, 6000); // 6s desde que TERMINÓ el audio

    } catch (e: any) {
      resolverPrimeraFrase(null);
      if (d.expresionTimerRef.current && neutralTimerProgramado) {
        clearTimeout(d.expresionTimerRef.current);
        d.expresionTimerRef.current = null;
      }
      if (__DEV__) console.log('[RC] CATCH error:', e?.message ?? e);
      logCliente('rc_error', { error: String(e?.message ?? e).slice(0, 80) });
      const respLocal = respuestaOffline(
        textoUsuario,
        p.nombreAbuela,
        p.nombreAsistente ?? 'Rosita',
        d.climaRef.current,
        p.vozGenero ?? 'femenina',
      );
      await d.hablar(respLocal ?? 'No pude conectarme ahora. ¿Podés intentar de nuevo en un momento?');
    } finally {
    }
  }

  // ── Limpieza de timers de música (llamada desde useRosita al parar) ──────────
  function limpiarTimersMusica() {
    // Incrementar sesión: invalida cualquier callback async en vuelo
    // (setTimeout callbacks que ya empezaron a ejecutar y tienen awaits pendientes)
    musicaSessionRef.current++;
    if (musicaWatchdogRef.current) {
      clearInterval(musicaWatchdogRef.current);
      musicaWatchdogRef.current = null;
    }
    if (musicaFallbackTimerRef.current) {
      clearTimeout(musicaFallbackTimerRef.current);
      musicaFallbackTimerRef.current = null;
    }
  }

  // ── Interfaz pública ──────────────────────────────────────────────────────────
  return {
    historialRef,
    mensajesSesionRef,
    ultimaRapidaRef,
    getSystemPayload,
    responderConClaude,
    onPartialReconocido,
    arrancarCharlaProactiva,
    generarResumenSesion,
    cargarNoticiasDiarias,
    limpiarTimersMusica,
  };
}
