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
  buscarMemoriasEpisodicas, registrarMemoriaEpisodica,
  Lista, cargarListas, guardarLista, agregarItemLista, borrarLista,
  Perfil, TelegramContacto,
} from '../lib/memoria';
import { buscarRadio, getFallbackAlt } from '../lib/musica';
import { Expresion } from '../components/RosaOjos';
import {
  construirSystemPromptEstable, construirContextoPerfil, construirContextoMemoriaPersistente, construirContextoTemporal,
  parsearRespuesta, respuestaOffline, hashTexto,
} from '../lib/claudeParser';
import {
  llamarClaude, llamarClaudeConStreaming,
  buscarWeb, buscarWikipedia, buscarLugares,
  logCliente, sincronizarAnimo,
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
    femenina:  ['Ay, {n}... estoy acá, contame.', 'Uy, {n}... te escucho, decime.', 'Te escucho, {n}... contame.'],
    masculina: ['Ay, {n}... estoy acá, contame.', 'Uy, {n}... te escucho, decime.', 'Te escucho, {n}... contame.'],
  },
  busqueda: {
    femenina:  ['A ver, {n}, dame un segundito que me fijo...', 'Aguantame un cachito, {n}, que ya te lo busco...', 'Esperame un ratito, {n}, que reviso...'],
    masculina: ['A ver, {n}, dame un segundito que me fijo...', 'Aguantame un cachito, {n}, que ya te lo busco...', 'Esperame un ratito, {n}, que reviso...'],
  },
  nostalgia: {
    femenina:  ['Mirá vos, {n}... contame.', 'Ay, qué lindo, {n}... decime.', 'Qué bárbaro, {n}, te escucho.'],
    masculina: ['Mirá vos, {n}... contame.', 'Qué interesante, {n}... decime.', 'Qué bárbaro, {n}, te escucho.'],
  },
  comando: {
    femenina:  ['¡Dale, {n}!', '¡Ahora mismo!', '¡Claro, {n}!'],
    masculina: ['¡Dale, {n}!', '¡Ahora mismo!', '¡Claro, {n}!'],
  },
  default: {
    femenina:  ['Te sigo, {n}...', 'Decime, {n}...', 'Sí, {n}...'],
    masculina: ['Te sigo, {n}...', 'Decime, {n}...', 'Sí, {n}...'],
  },
};

export const RESPUESTAS_RAPIDAS: Record<CategoriaRapida, { femenina: string[]; masculina: string[]; emotion: string }> = {
  saludo: {
    femenina:  ['¡Hola, {n}! ¿Cómo andás hoy?', '¡{n}! Qué bueno que me hablás. ¿Cómo estás?', '¡Acá estoy, {n}! ¿Cómo te va?'],
    masculina: ['¡Hola, {n}! ¿Cómo andás hoy?', '¡{n}! Qué bueno que me hablás. ¿Cómo estás?', '¡Acá estoy, {n}! ¿Cómo te va?'],
    emotion:   'neutral',
  },
  gracias: {
    femenina:  ['¡De nada {n}!', '¡Para eso estoy, {n}!', '¡De nada, {n}! Cualquier cosa me decís.'],
    masculina: ['¡De nada {n}!', '¡Para eso estoy, {n}!', '¡De nada, {n}! Cualquier cosa me decís.'],
    emotion:   'neutral',
  },
  de_nada: {
    femenina:  ['¡Gracias a vos, {n}!', '¡Ay, qué bueno tenerte acá, {n}!', '¡Gracias, {n}! Me alegra estar acá con vos.'],
    masculina: ['¡Gracias a vos, {n}!', '¡Qué bueno tenerte acá, {n}!', '¡Gracias, {n}! Me alegra estar acá con vos.'],
    emotion:   'neutral',
  },
  despedida: {
    femenina:  ['¡Chau, {n}! Cuidate mucho.', '¡Hasta luego, {n}! Acá voy a estar cuando me necesitás.', '¡Nos vemos, {n}! Un beso grande.'],
    masculina: ['¡Chau, {n}! Cuidate mucho.', '¡Hasta luego, {n}! Acá voy a estar cuando me necesitás.', '¡Nos vemos, {n}! Un beso grande.'],
    emotion:   'neutral',
  },
  afirmacion: {
    femenina:  ['¡Perfecto, {n}! ¿Algo más en lo que te pueda ayudar?', '¡Qué bueno, {n}! Acá estoy si necesitás algo.', '¡Genial, {n}!'],
    masculina: ['¡Perfecto, {n}! ¿Algo más en lo que te pueda ayudar?', '¡Qué bueno, {n}! Acá estoy si necesitás algo.', '¡Genial, {n}!'],
    emotion:   'neutral',
  },
};

// ── Patrones de clasificación (exportados para uso en SR y otros hooks) ─────────

// Sin muletilla: saludos, gracias, despedidas, afirmaciones — Claude responde < 2s
export const PATRON_SKIP = /\b(buen[ao]s?\s*(d[ií]as?|tardes?|noches?)|hola\b|qu[eé] tal|c[oó]mo (est[aá]s|and[aá]s)\b|c[oó]mo (va|viene)\s*[,?]?\s*$|gracias|much[aí]simas?\s+gracias|te agradezco|de nada|chau|hasta\s*(luego|pronto|ma[ñn]ana)|nos vemos|por supuesto|perfecto|entendido|re bien|todo bien)\b/i;
export const PATRON_EMPATICO  = /triste|me duele|dolor|me caí|caída|me siento mal|estoy mal|sola?\b|angustia|llor|médico|ambulancia|hospital|me asusta|tengo miedo|escalera|moverme|me cuesta|no veo|visión|la vista|caminar|no puedo|mas o menos|más o menos|medio ca[ií]d|baj[oó]n|sin ganas|desanimad|deca[ií]d|desganad/i;
export const PATRON_BUSQUEDA  = /clima|llover|llueve|temperatura|noticias?|partido|fútbol|quiniela|qué hora|intendente|municipalidad|pronóstico|qué pasó|qué dice|mucho calor|mucho frío|farmacia|hospital|heladeria|restaurant|hotel|banco|supermercado|pami|correo|estacion|nafta|donde queda|donde hay|cerca|polici[aá]|comisari[aá]/i;
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
  if (texto.length <= 55) return null;
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
  if (/\b(chau|hasta\s*(luego|pronto|ma[ñn]ana)|nos vemos)\b/i.test(texto)) return 'despedida';
  if (/\b(perfecto|entendido|re bien|todo bien|genial|b[aá]rbaro|de acuerdo)\b/i.test(texto)) return 'afirmacion';
  return null;
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
  const systemEstableRef   = useRef<{ key: string; text: string } | null>(null);
  const perfilCacheRef     = useRef<{ key: string; text: string } | null>(null);
  const memoriaCacheRef    = useRef<{ key: string; text: string } | null>(null);
  const ultimaRapidaRef    = useRef<Partial<Record<CategoriaRapida, number>>>({});
  const charlaProactivaRef = useRef(false);

  // ── System prompt en tres bloques ────────────────────────────────────────────
  function getSystemBlocks(
    p: Perfil,
    climaTexto: string,
    incluirJuego: boolean,
    extra = '',
    incluirChiste = false,
  ) {
    const d = depsRef.current;

    // Bloque 1 — estable: personalidad, reglas, tags (caché ephemeral por nombre/edad/voz)
    const perfKey = `${p.nombreAbuela}|${p.nombreAsistente}|${p.edad}|${p.vozGenero}`;
    if (!systemEstableRef.current || systemEstableRef.current.key !== perfKey) {
      systemEstableRef.current = { key: perfKey, text: construirSystemPromptEstable(p) };
    }

    // Bloque 2 — semi-estático: perfil + dispositivos (caché ephemeral, invalida cuando cambia)
    const perfilKey = `${p.recuerdos.join('|')}|${p.gustos.join('|')}|${p.familiares.join('|')}|${p.medicamentos.join('|')}|${d.dispositivosTuyaRef.current.map(dv => dv.id + String(dv.estado)).join('|')}`;
    if (!perfilCacheRef.current || perfilCacheRef.current.key !== perfilKey) {
      perfilCacheRef.current = { key: perfilKey, text: construirContextoPerfil(p, d.dispositivosTuyaRef.current) };
    }

    // Bloque 3 — memoria persistente: recuerdos/fechas importantes (cacheable)
    const memoriaKey = `${p.recuerdos.join('|')}|${p.fechasImportantes.join('|')}`;
    if (!memoriaCacheRef.current || memoriaCacheRef.current.key !== memoriaKey) {
      memoriaCacheRef.current = { key: memoriaKey, text: construirContextoMemoriaPersistente(p) };
    }

    // Bloque 4 — dinámico: fecha/hora, clima, juego, búsqueda, ubicación (nunca cacheado)
    const temporal = construirContextoTemporal(
      p, climaTexto, incluirJuego, extra, incluirChiste,
      d.ciudadRef.current, d.coordRef.current, d.feriadosRef.current,
    );

    return [
      { type: 'text' as const, text: systemEstableRef.current.text, cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: perfilCacheRef.current.text,   cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: memoriaCacheRef.current.text,  cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: temporal },
    ];
  }

  async function construirContextoMemoria(query: string): Promise<{ texto: string; count: number; chars: number }> {
    const memorias = await buscarMemoriasEpisodicas(query, 3);
    if (!memorias.length) return { texto: '', count: 0, chars: 0 };
    const lista = memorias
      .map((mem, idx) => `${idx + 1}. ${mem.resumen}`)
      .join('\n');
    const texto = `\n\nMemorias relevantes de conversaciones anteriores:
${lista}

Usalas solo si ayudan de verdad a responder. Si la memoria no encaja con lo que la persona pregunta ahora, ignorala sin mencionarla.`;
    return { texto, count: memorias.length, chars: texto.length };
  }

  // ── Noticias en tiempo real ───────────────────────────────────────────────────
  async function buscarNoticias(query: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
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
        system: getSystemBlocks(p, d.climaRef.current, false, `\n\nEs ${momento}. Iniciá UNA sola frase corta y cálida sobre este tema: ${tema}. Usá el contexto del perfil si es relevante. Respondé SOLO con la frase, sin etiquetas.`),
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

  // ── Responder con Claude ───────────────────────────────────────────────────────
  async function responderConClaude(textoUsuario: string) {
    const d = depsRef.current;
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

    d.detenerSilbido();
    d.setEstado('pensando');
    d.estadoRef.current = 'pensando';
    // Feedback visual inmediato — estilo Alexa/Google
    d.setExpresion('sorprendida');
    setTimeout(() => { if (d.estadoRef.current === 'pensando') d.setExpresion('pensativa'); }, 600);

    // ── Computar flags antes de iniciar muletilla/streaming ──────────────────
    const nuevoHistorial: Mensaje[] = [...historialRef.current, { role: 'user', content: textoUsuario }];
    const textoNorm = textoUsuario.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
        const texto = lista[idx].replace(/\{n\}/g, p.nombreAbuela ?? '').trim();
        d.setExpresion('feliz');
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: texto }].slice(-30);
        historialRef.current = nuevoHist;
        await guardarHistorial(nuevoHist);
        d.ultimaCharlaRef.current    = Date.now();
        d.ultimaActividadRef.current = Date.now();
        logCliente('rapida_msg', { cat: catRapida, texto });
        await d.hablar(texto, emotion);
        return;
      }
    }

    const pideJuego   = /\b(juego|jugar|adivinan|trivia|preguntas?|quiz|memori|refranes?|adivina|calculo|calcul|trabale|cuenta|cuantos|cuanto es|matematica)\b/.test(textoNorm);
    const pideChiste  = /\b(chiste|chistoso|gracioso|algo gracioso|me hace rei|haceme rei|contame algo diverti|divertido|me rei)\b/.test(textoNorm)
      || (/\b(otro|uno mas|dale|seguí|segui|mas|contame otro|otro mas)\b/.test(textoNorm)
          && nuevoHistorial.slice(-4).some(m => m.role === 'assistant' && /\[CHISTE\]/i.test(m.content)));
    const pideCuento  = /\b(cuento|historia|relato|narrac|contame (algo|lo que|una)|habla(me)? de (algo|lo que)|que sabes de|libre|lo que quieras|lo que se te ocurra|sorprendeme)\b/.test(textoNorm);
    const esConsultaHorario = /\b(cuando juega|cuand[oa] juega|proximo partido|a que hora juega|a que hora es|proxima carrera|proximo gran premio|f1 horario|calendario deportivo|fixture|cuando es el partido|juega el|juega boca|juega river|juega racing|juega independiente|juega san lorenzo|juega belgrano|juega huracan|juega la seleccion|juega argentina)\b/.test(textoNorm);
    const pideNoticias = !esConsultaHorario && /\b(como salio|salio|resultado|gano|perdio|partido|noticias|novedades|que paso|que hay|que se sabe|que esta pasando|actualidad|hoy en|contame algo|algo nuevo|enterame|boca|river|racing|independiente|san lorenzo|huracan|belgrano|seleccion|mundial|copa|liga|torneo|politica|gobierno|presidente|congreso|senado|diputados|elecciones|ministerio|economia|dolar|inflacion|pobreza|desempleo|formula|formulauno|f1|gran premio|carrera|verstappen|hamilton|leclerc|norris|moto ?gp|tenis|roland garros|wimbledon|us open|nba|nfl|olimpiadas?|clima de manana|pronostico)\b/.test(textoNorm);
    const pideBusqueda = esConsultaHorario || /\b(numero|telefono|direccion|donde queda|donde hay|comedor|municipalidad|municipio|farmacia|hospital|guardia|medico|odontologo|dentista|supermercado|colectivo|omnibus|horario|esta abierto|cerca de|cerca mia|cerca mio|cercano|cercana|mas cerca|banco|correo|correoargentino|renaper|anses|pami|cuando juega|proximo partido|a que hora juega|a que hora es|proxima carrera|proximo gran premio|f1 horario|calendario deportivo|heladeria|heladerias|restaurant|restaurante|pizzeria|panaderia|carniceria|verduleria|ferreteria|peluqueria|gimnasio|kiosco|confiteria|cafe|bar|veterinaria|optica|zapateria|ropa|tienda|negocio|local|comercio|donde puedo|donde compro|donde venden|estacion.{0,5}servicio|nafta|combustible|surtidor|ypf|shell|axion|hay .{3,30} en|intendente|municipio|googlea|googlear|googleame|googlea(me)?|busca|buscame|busca(me)?|busca en internet|buscar en internet|internet|en google|google)\b/.test(textoNorm);
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
    d.rcStartTsRef.current = Date.now();
    const lagSrMs = d.srResultTsRef.current ? d.rcStartTsRef.current - d.srResultTsRef.current : -1;
    logCliente('rc_start', { chars: textoUsuario.length, muletilla: catMuletilla ?? 'none', busqueda: pideBusqueda ? 'si' : 'no', wiki: pideWikipedia ? 'si' : 'no', lag_sr_ms: lagSrMs });
    logCliente('user_msg', { texto: textoUsuario.slice(0, 200) });

    // ── Estado de streaming ───────────────────────────────────────────────────
    let primeraFraseReproducida = false;
    let tagDetectadoStreaming = 'neutral';
    let primeraFraseResolver: ((txt: string) => void) | null = null;
    const primeraFraseDisparada = new Promise<string>(resolve => { primeraFraseResolver = resolve; });
    const onPrimeraFrase = (primera: string, tag: string) => {
      tagDetectadoStreaming = tag.toLowerCase();
      logCliente('primera_frase', { chars: primera.length, tag });
      d.precachearTexto(primera, tag.toLowerCase()).catch(() => {});
      primeraFraseResolver?.(primera);
    };
    const contextoMemoria = await construirContextoMemoria(textoUsuario);
    const extraBase  = `${d.ultimaRadioRef.current ? `\nÚltima radio reproducida: "${d.ultimaRadioRef.current}" — cuando el usuario pida "la radio" o "la música" sin especificar, usá esa clave.` : ''}${contextoMemoria.texto}`;
    const pideAccion = /\b(recordatorio|recordame|recorda(me)?|alarma|avisa(me)?|timer|temporizador|anota|guarda|manda(le)?|envia(le)?|llama(le)?|emergencia)\b/.test(textoNorm);
    const maxTokBase  = (pideCuento || pideJuego || pideChiste) ? 700 : pideAccion ? 300 : undefined;
    const histSlice   = (pideCuento || pideJuego || pideChiste) ? -11 : -9;
    const msgSliceBase = nuevoHistorial.slice(histSlice);
    const systemPreview = getSystemBlocks(p, d.climaRef.current, pideJuego, extraBase, pideChiste);
    const cachedSystemChars = systemPreview
      .filter(block => !!block.cache_control)
      .reduce((acc, block) => acc + block.text.length, 0);
    const cachedSystemTokensEst = Math.ceil(cachedSystemChars / 4);
    logCliente('prompt_ctx', {
      hist_msgs: msgSliceBase.length,
      hist_chars: msgSliceBase.reduce((acc, m) => acc + m.content.length, 0),
      mem_count: contextoMemoria.count,
      mem_chars: contextoMemoria.chars,
      extra_chars: extraBase.length,
      sys_stable_hash: hashTexto(systemPreview[0].text),
      sys_profile_hash: hashTexto(systemPreview[1].text),
      sys_memory_hash: hashTexto(systemPreview[2].text),
      sys_dynamic_hash: hashTexto(systemPreview[3].text),
      sys_cached_chars: cachedSystemChars,
      sys_cached_tokens_est: cachedSystemTokensEst,
      cache_floor_hit: cachedSystemTokensEst >= 4096 ? 'si' : 'no',
    });

    try {
      const esRespuestaUtil = (texto?: string | null): boolean => {
        const limpio = (texto ?? '').replace(/\[[^\]]+\]\s*/g, '').trim();
        return limpio.length >= 12;
      };
      const resolverClaudeConFallback = async (params: { system: string | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]; messages: Mensaje[]; maxTokens?: number; }) => {
        try {
          const streamText = await llamarClaudeConStreaming({
            system: params.system,
            messages: params.messages,
            maxTokens: params.maxTokens,
            onPrimeraFrase,
          });
          if (esRespuestaUtil(streamText)) return streamText;
          logCliente('rc_stream_vacio', { chars: (streamText ?? '').length });
        } catch (e: any) {
          if (__DEV__) console.log('[RC] streaming falló, fallback a llamarClaude');
          logCliente('rc_stream_error', { error: String(e?.message ?? e).slice(0, 80) });
        }

        const retryText = await llamarClaude({
          system: params.system,
          messages: params.messages,
          maxTokens: params.maxTokens,
        }).catch(() => '');
        if (esRespuestaUtil(retryText)) {
          logCliente('rc_retry_ok', { chars: retryText.length });
          return retryText;
        }
        logCliente('rc_retry_vacio', { chars: retryText.length });
        return '';
      };

      let resultadosBusqueda: string | null = null;
      let claudePromise: Promise<string>;

      const muletillaAbort = { current: false };
      const muletillaPromise = catMuletilla
        ? d.reproducirMuletilla(catMuletilla, muletillaAbort)
        : Promise.resolve(null);

      if (!pideNoticias && !pideBusqueda && !pideWikipedia) {
        // ── Fast path: streaming inicia en paralelo con la muletilla ──────────
        claudePromise = resolverClaudeConFallback({
          system: systemPreview,
          messages: msgSliceBase,
          maxTokens: maxTokBase,
        });
      } else {
        // ── Slow path: esperar resultados (muletilla corre durante la búsqueda) ─
        const [titulosNoticias, busquedaResult, wikiResult] = await Promise.all([
          pideNoticias ? buscarNoticias(textoUsuario).then(r => r ?? buscarWeb(textoUsuario)) : Promise.resolve(null),
          pideBusqueda
            ? (esLugarLocal
                ? buscarLugares(d.coordRef.current!.lat, d.coordRef.current!.lon, tipoLugar!)
                    .then(r => r !== null ? r : buscarWeb(queryBusqueda))
                : buscarWeb(queryBusqueda))
            : Promise.resolve(null),
          pideWikipedia ? buscarWikipedia(preguntaLugarVivo && d.ciudadRef.current ? d.ciudadRef.current : textoUsuario) : Promise.resolve(null),
        ]);
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
        const systemFull = getSystemBlocks(p, d.climaRef.current, pideJuego, extraBase + contextoNoticias + contextoBusqueda + contextoWiki, pideChiste);
        const msgSlice   = msgSliceBase;
        claudePromise = resolverClaudeConFallback({
          system: systemFull,
          messages: msgSlice,
          maxTokens: maxTokBase,
        });
      }

      const winner = await Promise.race([
        primeraFraseDisparada.then(t => ({ kind: 'primera' as const, t })),
        claudePromise.then(t => ({ kind: 'claude' as const, t })),
      ]);

      // Si Claude respondió completo antes de detectar primera frase, pre-cachear ya
      if (winner.kind === 'claude' && winner.t) {
        const ppc = parsearRespuesta(winner.t, p.telegramContactos ?? [], p.familiares ?? []);
        d.splitEnOraciones(ppc.respuesta).forEach(s => d.precachearTexto(s, ppc.expresion).catch(() => {}));
      }

      // Esperar que la muletilla termine naturalmente antes de reproducir la respuesta
      await muletillaPromise;

      if (winner.kind === 'primera') {
        primeraFraseReproducida = true;
        const hablarPrimeraPromise = d.hablar(winner.t, tagDetectadoStreaming);

        const rawParaPrecache = await claudePromise;

        let precachePromise: Promise<void> | undefined;
        if (rawParaPrecache) {
          const p2 = parsearRespuesta(rawParaPrecache, p.telegramContactos ?? [], p.familiares ?? []);
          const { resto } = d.extraerPrimeraFrase(p2.respuesta);
          if (resto) {
            const restOraciones = d.splitEnOraciones(resto);
            if (restOraciones.length > 0) {
              precachePromise = Promise.all(
                restOraciones.map(s => d.precachearTexto(s, p2.expresion).catch(() => {}))
              ).then(() => {});
            }
          }
        }

        await hablarPrimeraPromise;
        if (precachePromise) await precachePromise;
      }

      const respuestaRaw = await claudePromise;
      if (!esRespuestaUtil(respuestaRaw)) {
        const respLocal = respuestaOffline(
          textoUsuario,
          p.nombreAbuela,
          p.nombreAsistente ?? 'Rosita',
          d.climaRef.current,
          p.vozGenero ?? 'femenina',
        );
        const fallbackHumano = respLocal ?? '[NEUTRAL] Se me mezcló un poco lo que me dijiste. Probá decírmelo de nuevo, Maxi.';
        logCliente('rc_fallback_humano', { chars: fallbackHumano.length });
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
        await guardarHistorial(nuevoHist);
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
        await guardarHistorial(nuevoHist);
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
        d.setExpresion('neutral');
        const streamPromise = buscarRadio(parsed.generoMusica);
        logCliente('rosita_msg', { tag: parsed.tagPrincipal ?? 'none', texto: parsed.respuesta.slice(0, 300) });
        await d.hablar(parsed.respuesta + ` Para pararla, tocá la pantalla.`);
        d.setEstado('pensando');
        d.estadoRef.current = 'pensando';
        ExpoSpeechRecognitionModule.stop();
        const urlStream = await streamPromise;
        if (urlStream) {
          try {
            d.playerMusica.replace({ uri: urlStream });
            d.playerMusica.volume = 0.70;
            d.playerMusica.play();
            d.musicaActivaRef.current = true;
            d.detenerSilbido();
            d.setMusicaActiva(true);
            registrarMusicaHoy().catch(() => {});
            d.ultimaRadioRef.current = parsed.generoMusica!;
            guardarUltimaRadio(parsed.generoMusica!).catch(() => {});
            d.setEstado('esperando');
            d.estadoRef.current = 'esperando';
            d.iniciarSpeechRecognition();
            if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
            d.expresionTimerRef.current = setTimeout(() => d.setExpresion('neutral'), 5000);
            // Health check: si a los 10s el stream no arrancó, intentar URL alternativa
            setTimeout(async () => {
              if (!d.musicaActivaRef.current) return;
              if (d.playerMusica.currentTime >= 0.5) return;
              const altUrl = getFallbackAlt(parsed.generoMusica!, urlStream);
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
        const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsed.respuesta }].slice(-30);
        historialRef.current = nuevoHist;
        await guardarHistorial(nuevoHist);
        d.ultimaCharlaRef.current = Date.now();
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
          if (d.timerVozRef.current) clearTimeout(d.timerVozRef.current);
          d.timerVozRef.current = setTimeout(async () => {
            borrarRecordatorio(timerId).catch(() => {});
            if (d.estadoRef.current === 'hablando' || d.estadoRef.current === 'pensando') {
              await new Promise<void>(resolve => {
                const check = setInterval(() => { if (d.estadoRef.current === 'esperando') { clearInterval(check); resolve(); } }, 500);
              });
            }
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
      if (parsed.domotica) {
        await d.ejecutarAccionDomotica(parsed.domotica);
      }

      // ── LISTAS ──
      if (parsed.listaNueva) {
        const nueva: Lista = { id: Date.now().toString(), nombre: parsed.listaNueva.nombre, items: parsed.listaNueva.items, creadaEn: Date.now() };
        guardarLista(nueva).then(() => cargarListas().then(d.setListas)).catch(() => {});
      } else if (parsed.listaAgregar) {
        agregarItemLista(parsed.listaAgregar.nombre, parsed.listaAgregar.item).then(() => cargarListas().then(d.setListas)).catch(() => {});
      } else if (parsed.listaBorrar) {
        borrarLista(parsed.listaBorrar).then(() => cargarListas().then(d.setListas)).catch(() => {});
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
        await guardarHistorial(nuevoHist);
        return;
      }

      // ── Respuesta normal ──
      d.setExpresion(parsed.expresion);
      guardarEntradaAnimo(parsed.animoUsuario);
      sincronizarAnimo(parsed.animoUsuario, Date.now());
      const nuevoHist = [...nuevoHistorial, { role: 'assistant' as const, content: parsed.respuesta }].slice(-30);
      historialRef.current = nuevoHist;
      await guardarHistorial(nuevoHist);
      mensajesSesionRef.current += 2;
      d.ultimaCharlaRef.current    = Date.now();
      d.ultimaActividadRef.current = Date.now();
      const oracionesTotal = d.splitEnOraciones(parsed.respuesta);
      logCliente('rc_hablar', { oraciones: oracionesTotal.length, chars: parsed.respuesta.length, primeraReproducida: primeraFraseReproducida });
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
          await AsyncStorage.removeItem('medPendiente');
          if (Date.now() - ts < 4 * 60 * 60 * 1000) await d.hablar(`Por cierto, ${texto}`);
        }
      } catch {}

      if (d.expresionTimerRef.current) clearTimeout(d.expresionTimerRef.current);
      d.expresionTimerRef.current = setTimeout(() => {
        if (d.estadoRef.current === 'esperando') d.setExpresion('neutral');
      }, 8000);

    } catch (e: any) {
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
    }
  }

  // ── Interfaz pública ──────────────────────────────────────────────────────────
  return {
    historialRef,
    mensajesSesionRef,
    ultimaRapidaRef,
    getSystemBlocks,
    responderConClaude,
    arrancarCharlaProactiva,
    generarResumenSesion,
  };
}
