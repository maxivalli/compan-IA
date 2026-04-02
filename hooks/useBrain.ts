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
import * as Brightness from 'expo-brightness';
import * as Location from 'expo-location';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import {
  cargarPerfil, guardarHistorial, guardarEntradaAnimo, agregarRecuerdo,
  guardarRecordatorio, borrarRecordatorio,
  registrarMusicaHoy, guardarUltimaRadio,
  registrarMemoriaEpisodica, cargarMemoriasEpisodicas, construirResumenMemoriasEpisodicas, extraerKeywordsMemoria,
  Lista, cargarListas, guardarLista, agregarItemLista, borrarLista,
  Perfil, TelegramContacto,
} from '../lib/memoria';
import { buscarRadio, getFallbackAlt, nombreRadioOGenero } from '../lib/musica';
import { Expresion } from '../components/RosaOjos';
import {
  parsearRespuesta, respuestaOffline, hashTexto, detectarGenero,
} from '../lib/claudeParser';
import { buildRositaSystemPayload, RositaSystemPayload } from '../lib/systemPayload';
import {
  llamarClaude, llamarClaudeConStreaming,
  buscarWeb, buscarWikipedia, buscarLugares,
  beginTurnTelemetry, getCurrentTurnMetrics, logCliente, sincronizarAnimo,
} from '../lib/ai';
import { Dispositivo } from '../lib/smartthings';
import { DomoticaAction } from './useSmartThings';
import { enviarAlertaTelegram } from '../lib/telegram';

// ── Types ──────────────────────────────────────────────────────────────────────

export type Mensaje = { role: 'user' | 'assistant'; content: string };
export type EstadoRosita = 'esperando' | 'escuchando' | 'pensando' | 'hablando';
export type CategoriaMuletilla = 'empatico' | 'busqueda' | 'nostalgia' | 'comando' | 'default';
export type CategoriaRapida = 'saludo' | 'gracias' | 'de_nada' | 'despedida' | 'afirmacion';

// ── Constantes de muletillas (exportadas para que el pipeline de audio las use) ─

export const MULETILLAS: Record<CategoriaMuletilla, { femenina: string[]; masculina: string[] }> = {
  empatico: {
    femenina:  ['Estoy acá.', 'Te escucho.', 'Contame.'],
    masculina: ['Estoy acá.', 'Te escucho.', 'Contame.'],
  },
  busqueda: {
    femenina:  ['A ver...', 'Ya miro.', 'Un segundito.'],
    masculina: ['A ver...', 'Ya miro.', 'Un segundito.'],
  },
  nostalgia: {
    femenina:  ['Mirá vos.', 'Qué lindo.', 'Te escucho.'],
    masculina: ['Mirá vos.', 'Qué interesante.', 'Te escucho.'],
  },
  comando: {
    femenina:  ['¡Dale!', '¡Ahora mismo!', '¡Claro!'],
    masculina: ['¡Dale!', '¡Ahora mismo!', '¡Claro!'],
  },
  default: {
    femenina:  ['Te sigo...', 'Decime...', 'Sí...'],
    masculina: ['Te sigo...', 'Decime...', 'Sí...'],
  },
};

export const RESPUESTAS_RAPIDAS: Record<CategoriaRapida, { femenina: string[]; masculina: string[]; emotion: string }> = {
  saludo: {
    femenina:  ['¡Hola! ¿Cómo andás hoy?', '¡Qué bueno que me hablás! ¿Cómo estás?', '¡Acá estoy! ¿Cómo te va?'],
    masculina: ['¡Hola! ¿Cómo andás hoy?', '¡Qué bueno que me hablás! ¿Cómo estás?', '¡Acá estoy! ¿Cómo te va?'],
    emotion:   'feliz',
  },
  gracias: {
    femenina:  ['¡De nada!', '¡Para eso estoy!', '¡De nada! Cualquier cosa me decís.'],
    masculina: ['¡De nada!', '¡Para eso estoy!', '¡De nada! Cualquier cosa me decís.'],
    emotion:   'feliz',
  },
  de_nada: {
    femenina:  ['¡Gracias a vos!', '¡Ay, qué bueno tenerte acá!', '¡Gracias! Me alegra estar acá con vos.'],
    masculina: ['¡Gracias a vos!', '¡Qué bueno tenerte acá!', '¡Gracias! Me alegra estar acá con vos.'],
    emotion:   'feliz',
  },
  despedida: {
    femenina:  ['¡Chau! Cuidate mucho.', '¡Hasta luego! Acá voy a estar cuando me necesitás.', '¡Nos vemos! Un beso grande.'],
    masculina: ['¡Chau! Cuidate mucho.', '¡Hasta luego! Acá voy a estar cuando me necesitás.', '¡Nos vemos! Un beso grande.'],
    emotion:   'neutral',
  },
  afirmacion: {
    femenina:  ['¡Perfecto! ¿Algo más en lo que te pueda ayudar?', '¡Qué bueno! Acá estoy si necesitás algo.', '¡Genial!'],
    masculina: ['¡Perfecto! ¿Algo más en lo que te pueda ayudar?', '¡Qué bueno! Acá estoy si necesitás algo.', '¡Genial!'],
    emotion:   'feliz',
  },
};

const EXPRESION_RAPIDA: Record<CategoriaRapida, Expresion> = {
  saludo: 'feliz',
  gracias: 'feliz',
  de_nada: 'feliz',
  despedida: 'neutral',
  afirmacion: 'feliz',
};

const INTERLOCUTOR_TTL_MS = 2 * 60 * 1000;
const PALABRAS_INVALIDAS_INTERLOCUTOR = new Set([
  'yo', 'aca', 'acá', 'hola', 'buenas', 'buenos', 'soy', 'llamo', 'nombre',
  'novia', 'novio', 'marido', 'esposa', 'mama', 'mamá', 'papa', 'papá',
  'amiga', 'amigo', 'hija', 'hijo', 'senora', 'señora', 'senor', 'señor',
]);

// ── Patrones de clasificación (exportados para uso en SR y otros hooks) ─────────

// Sin muletilla: saludos, gracias, despedidas, afirmaciones — Claude responde < 2s
export const PATRON_SKIP = /\b(buen[ao]s?\s*(d[ií]as?|tardes?|noches?)|hola\b|qu[eé] tal|c[oó]mo (est[aá]s|and[aá]s)\b|c[oó]mo (va|viene)\s*[,?]?\s*$|gracias|much[aí]simas?\s+gracias|te agradezco|de nada|chau|hasta\s*(luego|pronto|ma[ñn]ana)|nos vemos|por supuesto|perfecto|entendido|re bien|todo bien)\b/i;
export const PATRON_EMPATICO  = /triste|me duele|dolor|me caí|caída|me siento mal|estoy mal|sola?\b|angustia|llor|médico|ambulancia|hospital|me asusta|tengo miedo|escalera|moverme|me cuesta|no veo|visión|la vista|caminar|no puedo|mas o menos|más o menos|medio ca[ií]d|baj[oó]n|sin ganas|desanimad|deca[ií]d|desganad/i;
export const PATRON_BUSQUEDA  = /clima|llover|llueve|temperatura|noticias?|partido|fútbol|quiniela|qué hora|intendente|municipalidad|pronóstico|qué pasó|qué dice|mucho calor|mucho frío|farmacia|hospital|heladeria|restaurant|restaurante|hotel(?:es)?|hostal|hospedaje|alojamiento|banco|supermercado|pami|correo|estacion|nafta|donde queda|donde hay|cerca|polici[aá]|comisari[aá]/i;
export const PATRON_NOSTALGIA = /\bantes\b|en mi época|de joven|de chic[ao]|mi abuelo|mi abuela|mi madre|mi padre|en la escuela|cuando trabajaba|me recuerdo|me acuerdo|en mis tiempos|cuando era/i;
export const PATRON_COMANDO   = /pon[eé]|apag[aá]|prend[eé]|par[aá]\b|música|la radio|una canción|las luces?|la luz|una alarma|un recordatorio|un timer|despertame|sub[ií](le|la| el| la)?\s+(vol|mús|tele|luce|brillo)|baj[aá](le|la| el| la)?\s+(vol|mús|tele|luce|brillo)/i;

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

export function categorizarMuletilla(texto: string): CategoriaMuletilla | null {
  if (texto.length < 10) return null;
  // Solo skip para mensajes cortos (<= 30 chars) — evita que PATRON_SKIP bloquee
  // frases largas que contienen "todo bien" u otras palabras del patrón como substring.
  if (texto.length <= 30 && PATRON_SKIP.test(texto)) return null;
  if (/\b(hablemos de otra cosa|otra cosa|cambiemos de tema|dejemos eso|dej[aá] eso|despu[eé]s hablamos|despues hablamos|charlamos despu[eé]s|charlamos despues)\b/i.test(texto)) return null;
  if (/\b(comer|hambre|comprar|pizza|sanguch|sanguche|sanguchito|cocinar|almorz|cenar)\b/i.test(texto) && texto.length <= 90) return null;
  if (PATRON_EMPATICO.test(texto))  return 'empatico';
  if (PATRON_BUSQUEDA.test(texto))  return 'busqueda';
  if (PATRON_NOSTALGIA.test(texto)) return 'nostalgia';
  if (PATRON_COMANDO.test(texto))   return 'comando';
  if (texto.length <= 15) return null;
  return 'default';
}

export function categorizarRapida(texto: string): CategoriaRapida | null {
  if (texto.length > 50) return null;
  if (PATRON_EMPATICO.test(texto))  return null;
  if (PATRON_BUSQUEDA.test(texto))  return null;
  if (PATRON_COMANDO.test(texto))   return null;
  // Si hay una pregunta o contenido sustancial después del saludo, dejar que Claude responda
  if (/[¿?]/.test(texto) || /,\s*\w/.test(texto)) return null;
  if (/\b(hola\b|qu[eé] tal|c[oó]mo (est[aá]s|and[aá]s)\b|c[oó]mo (va|viene)\s*[,?]?\s*$|buen[ao]s?\s*(d[ií]as?|tardes?|noches?))/i.test(texto)) return 'saludo';
  if (/\b(gracias|much[aí]simas?\s+gracias|te agradezco)\b/i.test(texto)) return 'gracias';
  if (/\bde nada\b/i.test(texto)) return 'de_nada';
  if (/\b(chau|chao|hasta\s*(luego|pronto|ma[ñn]ana)|nos vemos)\b/i.test(texto)) return 'despedida';
  if (/\b(perfecto|entendido|re bien|todo bien|genial|b[aá]rbaro|de acuerdo)\b/i.test(texto)) return 'afirmacion';
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
    const mmStr = mm === 0 ? 'en punto' : mm < 10 ? `y ${mm}` : `y ${mm}`;
    const periodo = hh < 12 ? 'de la mañana' : hh < 13 ? 'del mediodía' : hh < 20 ? 'de la tarde' : 'de la noche';
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

  let compacta = oraciones.slice(0, maxOraciones).join(' ').trim();
  if (compacta.length <= maxChars) return compacta;

  const corte = compacta.lastIndexOf(' ', maxChars);
  const truncada = (corte > 40 ? compacta.slice(0, corte) : compacta.slice(0, maxChars)).trim();
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
  feriadosRef:        React.MutableRefObject<string>;
  perfilRef:          React.MutableRefObject<Perfil | null>;
  ultimaRadioRef:     React.MutableRefObject<string | null>;
  dispositivosTuyaRef:React.MutableRefObject<Dispositivo[]>;
  speechEndTsRef:     React.MutableRefObject<number>;
  srResultTsRef:      React.MutableRefObject<number>;
  rcStartTsRef:       React.MutableRefObject<number>;
  flashAnim:          Animated.Value;

  // Funciones del pipeline de audio
  hablar:              (texto: string, emotion?: string) => Promise<void>;
  hablarConCola:       (oraciones: string[], emotion?: string) => Promise<void>;
  splitEnOraciones:    (texto: string) => string[];
  extraerPrimeraFrase: (texto: string) => { primera: string; resto: string };
  precachearTexto:     (texto: string, emotion?: string) => Promise<void>;
  reproducirMuletilla: (cat: CategoriaMuletilla, abort?: { current: boolean }, onPlay?: () => void) => Promise<string>;
  reproducirTecleo:    (abort: { current: boolean }) => Promise<void>;
  detenerSilbido:      () => void;
  pararMusica:         () => void;
  playerMusica:        AudioPlayerLike;
  iniciarSpeechRecognition: () => void;
  ejecutarAccionDomotica: (action: DomoticaAction) => Promise<void>;
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
  const ultimaRapidaRef    = useRef<Partial<Record<CategoriaRapida, number>>>({});
  const charlaProactivaRef = useRef(false);
  const interlocutorRef    = useRef<{ nombre: string; expiresAt: number } | null>(null);
  const timerVozSeqRef     = useRef(0);
  const listaOpsRef        = useRef<Promise<void>>(Promise.resolve());

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
      feriados: d.feriadosRef.current,
      memoriaEpisodica: episodicaCacheRef.current?.text ?? '',
    });
  }

  // Refresca el cache Y construye el contexto relevante en UNA sola lectura AsyncStorage.
  async function refrescarYConstruirMemoria(query: string): Promise<{ texto: string; count: number; chars: number }> {
    const memorias = await cargarMemoriasEpisodicas();

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
    const esFeriadoHoy = d.feriadosRef.current?.startsWith('Hoy es feriado') ?? false;
    const tema = esFeriadoHoy
      ? `el feriado nacional de hoy (${d.feriadosRef.current}) — mencionalo con entusiasmo y calidez`
      : temas[Math.floor(Math.random() * temas.length)];

    try {
      const frase = await llamarClaude({
        maxTokens: 120,
        system: getSystemPayload(p, d.climaRef.current, false, `\n\nEs ${momento}. Iniciá UNA sola frase corta y cálida sobre este tema: ${tema}. Usá el contexto del perfil si es relevante. Respondé SOLO con la frase, sin etiquetas.`),
        messages: [{ role: 'user', content: 'iniciá una charla' }],
      });
      if (frase) { await d.hablar(frase); d.ultimaCharlaRef.current = Date.now(); }
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

  async function ejecutarMusica(generoMusica: string, respuesta: string, nuevoHistorial: Mensaje[]): Promise<void> {
    const d = depsRef.current;
    d.setExpresion('neutral');
    const streamPromise = buscarRadio(generoMusica);
    logCliente('rosita_msg', { tag: 'MUSICA', texto: respuesta.slice(0, 300) });
    await d.hablar(`${respuesta} Para pararla, tocá la pantalla.`);
    d.setEstado('pensando');
    d.estadoRef.current = 'pensando';
    ExpoSpeechRecognitionModule.stop();
    const urlStream = await streamPromise;
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
        d.iniciarSpeechRecognition();
        if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
        d.expresionTimerRef.current = setTimeout(() => d.setExpresion('neutral'), 5000);
        setTimeout(async () => {
          if (!d.musicaActivaRef.current) return;
          if (d.playerMusica.currentTime >= 0.5) return;
          const altUrl = getFallbackAlt(generoMusica, urlStream);
          if (altUrl) {
            try {
              d.playerMusica.replace({ uri: altUrl });
              d.playerMusica.play();
              setTimeout(async () => {
                if (!d.musicaActivaRef.current) return;
                if (d.playerMusica.currentTime < 0.5) {
                  d.pararMusica();
                  await d.hablar('No pude conectar con esa radio ahora. ¿Querés que intente con otra?');
                }
              }, 8000);
            } catch {
              d.pararMusica();
              await d.hablar('No pude conectar con esa radio ahora. ¿Querés que intente con otra?');
            }
          } else {
            d.pararMusica();
            await d.hablar('La radio no está respondiendo. ¿Querés que intente con otra?');
          }
        }, 10000);
      } catch {
        d.setMusicaActiva(false);
        await d.hablar('No pude conectar con la radio, perdoname.');
      }
    } else {
      await d.hablar('No pude conectar con esa radio ahora, perdoname. Podés intentar con otra o pedirme un género musical.');
    }
    const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: respuesta }].slice(-30);
    historialRef.current = nuevoHist;
    guardarHistorial(nuevoHist).catch(() => {});
    d.ultimaCharlaRef.current = Date.now();
  }

  // ── Responder con Claude ───────────────────────────────────────────────────────
  async function responderConClaude(textoUsuario: string) {
    const d = depsRef.current;
    const turnId = beginTurnTelemetry();
    if (__DEV__) console.log('[RC] responderConClaude llamado, texto:', textoUsuario.slice(0, 40));
    const p = d.perfilRef.current;
    if (!p) { console.log('[RC] sin perfil, saliendo'); return; }

    // Gate offline: evita esperar el timeout de red si ya sabemos que no hay conexión
    if (d.sinConexionRef.current) {
      const respLocal = respuestaOffline(textoUsuario, p.nombreAbuela, p.nombreAsistente ?? 'Rosita', d.climaRef.current, p.vozGenero ?? 'femenina');
      d.setEstado('esperando');
      d.estadoRef.current = 'esperando';
      await d.hablar(respLocal ?? 'No tengo conexión ahora. Cuando vuelva la señal seguimos.');
      return;
    }

    let pensativaTimer: ReturnType<typeof setTimeout> | null = null;
    let neutralTimerProgramado = false;
    d.detenerSilbido();
    d.setEstado('pensando');
    d.estadoRef.current = 'pensando';
    // Feedback visual inmediato — estilo Alexa/Google
    d.setExpresion('sorprendida');
    pensativaTimer = setTimeout(() => {
      if (d.estadoRef.current === 'pensando') d.setExpresion('pensativa');
    }, 600);

    // ── Computar flags antes de iniciar muletilla/streaming ──────────────────
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
      d.setExpresion('neutral');
      const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: respuesta }].slice(-30);
      historialRef.current = nuevoHist;
      guardarHistorial(nuevoHist).catch(() => {});
      d.ultimaCharlaRef.current = Date.now();
      d.ultimaActividadRef.current = Date.now();
      logCliente('rapida_msg', { cat: 'parar_musica', texto: respuesta });
      await d.hablar(respuesta);
      return;
    }

    const pideMusicaDirecta = /\b(pon[eé]|pone|quiero|mand[aá]|dej[aá])\b.{0,20}\b(musica|música|radio)\b|\b(radio\s+\d+|radio10|radio 10|mitre|cadena 3|cadena3|continental|rivadavia|la red|lared|metro|aspen|la 100|la100|con vos|convos|urbana|destape|mega|vida|del plata|delplata|lt8|lv3|tango|bolero|folklore|folclore|romantica|romántica|clasica|clásica|jazz|pop)\b/.test(textoNorm);
    const generoDirecto = detectarGenero(textoNorm);
    if (pideMusicaDirecta && generoDirecto) {
      const nombreRadio = nombreRadioOGenero(generoDirecto);
      const respuesta = /^radio|^(mitre|cadena3|lv3|continental|rivadavia|lared|metro|aspen|la100|folklorenac|rockpop|convos|urbana|radio10|destape|mega|vida|delplata|lt8)$/.test(generoDirecto)
        ? `¡Claro! Va ${nombreRadio}.`
        : `¡Dale! Pongo ${nombreRadio}.`;
      d.ultimaActividadRef.current = Date.now();
      logCliente('rapida_msg', { cat: 'musica_local', texto: respuesta });
      await ejecutarMusica(generoDirecto, respuesta, nuevoHistorial);
      return;
    }

    // ── Respuestas rápidas: saltear Claude para mensajes cortos y predecibles ──
    const catRapida = categorizarRapida(textoNorm);
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
        await d.hablar(texto, emotion);
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
      await d.hablar(socialBreve.texto, socialBreve.emotion);
      return;
    }

    const pideJuego   = /\b(juego|jugar|adivinan|trivia|preguntas?|quiz|memori|refranes?|adivina|calculo|calcul|trabale|cuenta|cuantos|cuanto es|matematica)\b/.test(textoNorm);
    const pideChiste  = /\b(chiste|chistoso|gracioso|algo gracioso|me hace rei|haceme rei|contame algo diverti|divertido|me rei)\b/.test(textoNorm)
      || (/\b(otro|uno mas|dale|seguí|segui|mas|contame otro|otro mas)\b/.test(textoNorm)
          && nuevoHistorial.slice(-4).some(m => m.role === 'assistant' && /\[CHISTE\]/i.test(m.content)));
    const pideCuento  = /\b(cuento|historia|relato|narrac|contame (algo|lo que|una)|habla(me)? de (algo|lo que)|que sabes de|libre|lo que quieras|lo que se te ocurra|sorprendeme)\b/.test(textoNorm);
    const pideAccion = /\b(recordatorio|recordame|recorda(me)?|alarma|avisa(me)?|timer|temporizador|anota|anotame|anotá|guarda|guardame|papelito|nota\b|nota me|manda(le)?|envia(le)?|llama(le)?|emergencia)\b/.test(textoNorm);
    const esConsultaHorario = /\b(cuando juega|cuand[oa] juega|proximo partido|a que hora juega|a que hora es|proxima carrera|proximo gran premio|f1 horario|calendario deportivo|fixture|cuando es el partido|juega el|juega boca|juega river|juega racing|juega independiente|juega san lorenzo|juega belgrano|juega huracan|juega la seleccion|juega argentina)\b/.test(textoNorm);
    const pideNoticias = !esConsultaHorario && /\b(como salio|salio|resultado|gano|perdio|partido|noticias|novedades|que paso|que hay|que se sabe|que esta pasando|actualidad|hoy en|contame algo|algo nuevo|enterame|boca|river|racing|independiente|san lorenzo|huracan|belgrano|seleccion|mundial|copa|liga|torneo|politica|gobierno|presidente|congreso|senado|diputados|elecciones|ministerio|economia|dolar|inflacion|pobreza|desempleo|formula|formulauno|f1|gran premio|carrera|verstappen|hamilton|leclerc|norris|moto ?gp|tenis|roland garros|wimbledon|us open|nba|nfl|olimpiadas?|clima de manana|pronostico)\b/.test(textoNorm);
    const pideBusqueda = !pideAccion && (esConsultaHorario || /\b(numero|telefono|direccion|donde queda|donde hay|comedor|municipalidad|municipio|farmacia|hospital|guardia|medico|odontologo|dentista|supermercado|colectivo|omnibus|horario|esta abierto|cerca de|cerca mia|cerca mio|cercano|cercana|mas cerca|banco|correo|correoargentino|renaper|anses|pami|cuando juega|proximo partido|a que hora juega|a que hora es|proxima carrera|proximo gran premio|f1 horario|calendario deportivo|heladeria|heladerias|restaurant|restaurante|hotel|hoteles|hostal|hostales|hospedaje|alojamiento|pizzeria|panaderia|carniceria|verduleria|ferreteria|peluqueria|gimnasio|kiosco|confiteria|cafe|bar|veterinaria|optica|zapateria|ropa|tienda|negocio|local|comercio|donde puedo|donde compro|donde venden|estacion.{0,5}servicio|nafta|combustible|surtidor|ypf|shell|axion|hay .{3,30} en|intendente|municipio|googlea|googlear|googleame|googlea(me)?|busca|buscame|busca(me)?|busca en internet|buscar en internet|internet|en google|google)\b/.test(textoNorm));
    const preguntaLugarVivo = /\b(lugar donde vivo|ciudad donde vivo|donde vivo|pueblo donde vivo|barrio donde vivo|contame (del|sobre el|de mi|sobre mi) (lugar|ciudad|pueblo|barrio|zona)|que (me podes|podes|sabes|me sabes) contar (del|de mi|sobre) (lugar|ciudad|pueblo|barrio))\b/.test(textoNorm);
    const esCierreConversacional = /\b(gracias|bueno|buena|listo|dale|despues|después|mas tarde|más tarde|seguimos|volvemos a charlar|te cuento|me voy|nos vemos|chau)\b/.test(textoNorm);
    const pideWikipedia = !esCierreConversacional && !pideNoticias && !pideBusqueda && (preguntaLugarVivo || /\b(que es|qué es|que son|qué son|que fue|qué fue|quien es|quién es|quien fue|quién fue|quien era|quién era|contame (sobre|de)|explicame|explicá(me)?|me explicás|que significa|qué significa|historia de|origen de|como funciona|cómo funciona|para que sirve|para qué sirve|cuando naci[oó]|biografía|biografia|quien invento|quién inventó|wikipedia)\b/.test(textoNorm));

    let queryBusqueda = textoUsuario;
    let tipoLugar: string | null = null;
    if (pideBusqueda) {
      const matchBusquedaExplicita = textoUsuario.match(/(?:busca(?:me)?|buscar(?:me)?|googlea(?:me)?|googlear)\s+(?:en\s+internet|en\s+google)?\s*(.+)$/i);
      if (matchBusquedaExplicita?.[1]) {
        queryBusqueda = matchBusquedaExplicita[1].trim();
      }
      const esTelefono = /telefono|numero de|numero tel/.test(textoNorm);
      const esCerca    = /cerca|cercano|cercana|mas cerca|donde hay|en mi ciudad|en la ciudad/.test(textoNorm);
      const esHorario  = esConsultaHorario || /cuando juega|a que hora|proxim|horario de|calendario/.test(textoNorm);
      const ciudad     = d.ciudadRef.current;
      if (esTelefono && ciudad)   queryBusqueda = `${queryBusqueda} número de teléfono ${ciudad} Argentina`;
      else if (esCerca && ciudad) queryBusqueda = `${queryBusqueda} más cercano a ${ciudad} Argentina`;
      else if (esHorario)         queryBusqueda = `${queryBusqueda} fecha y hora confirmada`;
      else if (ciudad)            queryBusqueda = `${queryBusqueda} ${ciudad} Argentina`;

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

    const catMuletilla = categorizarMuletilla(textoUsuario);
    // Si el regex de búsqueda disparó la categoría 'busqueda' pero ninguna búsqueda
    // real se va a ejecutar, bajar a null para no añadir el delay de "Un segundito"
    // antes de lo que en realidad va a ser una respuesta rápida de Claude.
    const catMuletillaEfectiva = (catMuletilla === 'busqueda' && !pideBusqueda && !pideWikipedia && !pideNoticias)
      ? null
      : catMuletilla;
    d.rcStartTsRef.current = Date.now();
    const lagSrMs = d.srResultTsRef.current ? d.rcStartTsRef.current - d.srResultTsRef.current : -1;
    const lagSpeechEndMs = d.speechEndTsRef.current ? d.rcStartTsRef.current - d.speechEndTsRef.current : -1;
    logCliente('rc_start', {
      chars: textoUsuario.length,
      muletilla: catMuletillaEfectiva ?? 'none',
      busqueda: pideBusqueda ? 'si' : 'no',
      wiki: pideWikipedia ? 'si' : 'no',
      lag_sr_ms: lagSrMs,
      lag_speech_end_ms: lagSpeechEndMs,
    });
    logCliente('turn_start', { turn_id: turnId, user_chars: textoUsuario.length });
    logCliente('user_msg', { texto: textoUsuario.slice(0, 200) });

    // ── Estado de streaming ───────────────────────────────────────────────────
    let primeraFraseReproducida = false;
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

    // Arrancar memoria en paralelo — no esperar antes de lanzar muletilla/búsqueda
    const memoriaPromise = refrescarYConstruirMemoria(textoUsuario);

    const contextoInterlocutor = interlocutorActivo
      ? `\nInterlocutor actual: ${interlocutorActivo}. Respondé a ${interlocutorActivo}.`
      : `\nSi no sabés quién habla, no uses nombres propios.`;
    const maxTokBase  = (pideCuento || pideJuego || pideChiste)
      ? 700
      : (pideNoticias || pideBusqueda || pideWikipedia)
        ? 150
        : pideAccion
          ? 220
          : 80;
    const histSlice   = (pideCuento || pideJuego || pideChiste) ? -9 : (esCharlaSocialBreve(textoNorm) ? -3 : -5);
    const msgSliceBase = nuevoHistorial.slice(histSlice);

    try {
      const esRespuestaUtil = (texto?: string | null): boolean => {
        const limpio = (texto ?? '').replace(/\[[^\]]+\]\s*/g, '').trim();
        return limpio.length >= 12;
      };
      const resolverClaudeConFallback = async (params: { system: string | RositaSystemPayload; messages: Mensaje[]; maxTokens?: number; }) => {
        try {
          const streamText = await llamarClaudeConStreaming({
            system: params.system,
            messages: params.messages,
            maxTokens: params.maxTokens,
            onPrimeraFrase,
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

      const muletillaAbort = { current: false };
      const tecleoAbort    = { current: false };
      // Muletilla arranca INMEDIATAMENTE — no espera memoria ni búsqueda
      const muletillaPromise = catMuletillaEfectiva
        ? d.reproducirMuletilla(catMuletillaEfectiva, muletillaAbort)
        : Promise.resolve(null);

      // Tecleo arranca en canal separado (playerMusica) cuando hay búsqueda externa
      // O cuando la muletilla es de búsqueda (ej. clima desde system prompt)
      const usaTecleo = pideNoticias || pideBusqueda || pideWikipedia || catMuletillaEfectiva === 'busqueda';
      const tecleoPromise = usaTecleo ? d.reproducirTecleo(tecleoAbort) : Promise.resolve();

      if (!pideNoticias && !pideBusqueda && !pideWikipedia) {
        // ── Fast path ─────────────────────────────────────────────────────────
        // Para consultas de entretenimiento o charla social, la memoria episódica
        // no aporta valor y genera ~800ms de espera innecesaria. Usamos string vacío.
        const esConsultaLiviana = pideCuento || pideChiste || pideJuego || esCharlaSocialBreve(textoNorm);
        const contextoMemoria = esConsultaLiviana
          ? { texto: '', count: 0, chars: 0 }
          : (episodicaCacheRef.current?.lastRelevant?.result ?? { texto: '', count: 0, chars: 0 });
        if (!esConsultaLiviana && !episodicaCacheRef.current?.lastRelevant) {
          memoriaPromise.catch(() => {});
        }
        const extraBase = `${d.ultimaRadioRef.current ? `\nÚltima radio: "${d.ultimaRadioRef.current}".` : ''}${contextoMemoria.texto}${contextoInterlocutor}`;
        const systemPreview: RositaSystemPayload = getSystemPayload(p, d.climaRef.current, pideJuego, extraBase, pideChiste);
        logCliente('prompt_ctx', { hist_msgs: msgSliceBase.length, mem_count: contextoMemoria.count, mem_chars: contextoMemoria.chars, extra_chars: extraBase.length });
        claudePromise = resolverClaudeConFallback({
          system: systemPreview,
          messages: msgSliceBase,
          maxTokens: maxTokBase,
        });
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
        claudePromise = resolverClaudeConFallback({
          system: systemFull,
          messages: msgSliceBase,
          maxTokens: maxTokBase,
        });
      }

      const claudeOutcomePromise = claudePromise
        .then(t => ({ ok: true as const, value: t }))
        .catch(error => ({ ok: false as const, error }));

      const winner = await Promise.race([
        primeraFraseDisparada.then(t => ({ kind: 'primera' as const, t })),
        claudeOutcomePromise.then(result => ({ kind: 'claude' as const, result })),
      ]);

      // Si Claude respondió completo antes de detectar primera frase, pre-cachear ya
      if (winner.kind === 'claude' && winner.result.ok && winner.result.value) {
        const ppc = parsearRespuesta(winner.result.value, p.telegramContactos ?? [], p.familiares ?? []);
        d.splitEnOraciones(ppc.respuesta).forEach(s => d.precachearTexto(s, ppc.expresion).catch(() => {}));
      }

      // Claude ya llegó (winner lo confirma) — parar tecleo ahora para que no
      // siga sonando durante la reproducción de la muletilla ni del TTS.
      tecleoAbort.current = true;
      await tecleoPromise;
      // Esperar que la muletilla termine naturalmente antes de reproducir la respuesta
      await muletillaPromise;

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
        logCliente('rosita_msg', { tag: parsedFallback.tagPrincipal ?? 'none', texto: parsedFallback.respuesta.slice(0, 300) });
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
        || parsed.tagPrincipal === 'LINTERNA';

      if (!mantenerLarga) {
        parsed.respuesta = compactarRespuestaParaVoz(
          parsed.respuesta,
          d.splitEnOraciones,
          {
            maxOraciones: (pideNoticias || pideBusqueda || pideWikipedia) ? 4 : 2,
            maxChars: (pideNoticias || pideBusqueda || pideWikipedia) ? 350 : 150,
          },
        );
      }

      if (resultadosBusqueda) {
        const sinPregunta = parsed.respuesta.replace(/¿[^?]+?\?\s*$/, '').trim();
        if (sinPregunta.length > 15) parsed.respuesta = sinPregunta;
      }

      registrarMemoriaEpisodica(textoUsuario, parsed.respuesta).catch(() => {});

      // ── PARAR_MUSICA ──
      if (parsed.tagPrincipal === 'PARAR_MUSICA') {
        d.playerMusica.pause();
        d.setMusicaActiva(false);
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

      // ── LINTERNA ──
      if (parsed.tagPrincipal === 'LINTERNA') {
        d.setLinternaActiva(true);
        Animated.timing(d.flashAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        try { await Brightness.setBrightnessAsync(1); } catch {}
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
      logCliente('rc_hablar', { oraciones: oracionesTotal.length, chars: parsed.respuesta.length, primeraReproducida: primeraFraseReproducida });
      const turnMetrics = getCurrentTurnMetrics();
      logCliente('turn_summary', {
        turn_id: turnId,
        e2e_first_audio_ms: turnMetrics.e2eFirstAudioMs ?? -1,
        e2e_total_ms: turnMetrics.e2eNowMs ?? -1,
        response_chars: parsed.respuesta.length,
        oraciones: oracionesTotal.length,
      });
      logCliente('rosita_msg', { tag: parsed.tagPrincipal ?? 'none', texto: parsed.respuesta.slice(0, 300) });
      if (oracionesTotal.length === 0 && !primeraFraseReproducida) {
        logCliente('rc_parse_vacio', { rawSlice: respuestaRaw.slice(0, 150) });
        await d.hablar('No entendí bien, ¿podés repetir?');
        return;
      }
      if (primeraFraseReproducida) {
        const { resto } = d.extraerPrimeraFrase(parsed.respuesta);
        if (resto) await d.hablarConCola(d.splitEnOraciones(resto), parsed.expresion);
      } else {
        await d.hablarConCola(oracionesTotal, parsed.expresion);
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

      if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
      neutralTimerProgramado = true;
      d.expresionTimerRef.current = setTimeout(() => {
        if (d.estadoRef.current === 'esperando') d.setExpresion('neutral');
      }, 8000);

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
      if (pensativaTimer) clearTimeout(pensativaTimer);
    }
  }

  // ── Interfaz pública ──────────────────────────────────────────────────────────
  return {
    historialRef,
    mensajesSesionRef,
    ultimaRapidaRef,
    getSystemPayload,
    responderConClaude,
    arrancarCharlaProactiva,
    generarResumenSesion,
  };
}
