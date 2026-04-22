import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Servidores Radio Browser (fallover automático) ────────────────────────────
const SERVIDORES = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

const HEADERS = { 'Accept': 'application/json', 'User-Agent': 'CompanIA/1.0' };

// ── Caché AsyncStorage ────────────────────────────────────────────────────────
const CACHE_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 días
/** v3: HLS habilitado en API + priorizado sobre raw MP3 para mejor buffering en mobile. */
const CACHE_PREFIX  = 'radio_cache_v3_';

async function leerCache(clave: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + clave);
    if (!raw) return null;
    const { url, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { AsyncStorage.removeItem(CACHE_PREFIX + clave); return null; }
    return url as string;
  } catch { return null; }
}

async function escribirCache(clave: string, url: string): Promise<void> {
  try { await AsyncStorage.setItem(CACHE_PREFIX + clave, JSON.stringify({ url, ts: Date.now() })); } catch {}
}

/** Confirma que una URL funcionó y la guarda en caché. Llamar desde el reproductor tras verificar playback. */
export async function confirmarRadio(termino: string, url: string): Promise<void> {
  await escribirCache(termino.toLowerCase().trim(), url);
}

// ── Fallbacks hardcodeados (último recurso si la API falla) ───────────────────
export const STREAMS_FALLBACK: Record<string, string[]> = {
  cadena3:     ['https://liveradio.mediainbox.net/radio3.mp3', 'https://streams.cadena3.com/cadena3/mp3/128/stream'],
  lv3:         ['https://liveradio.mediainbox.net/radio3.mp3', 'https://streams.cadena3.com/cadena3/mp3/128/stream'],
  delplata:    ['https://streaming01.shockmedia.com.ar:10217/stream'],
  lt8:         ['https://stream.lt8.com.ar:8080/lt8radio.mp3'],
  mitre:       ['https://27363.live.streamtheworld.com/AM790_56AAC_SC'],
  continental: ['https://frontend.radiohdvivo.com/continental/live'],
  rivadavia:   ['https://14003.live.streamtheworld.com/RIVADAVIA.mp3'],
  lared:       ['https://cdn.instream.audio:9288/stream'],
  metro:       ['https://playerservices.streamtheworld.com/api/livestream-redirect/METRO.mp3'],
  aspen:       ['https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN.mp3'],
  la100:       ['https://playerservices.streamtheworld.com/api/livestream-redirect/FM999_56.mp3'],
  folklorenac: ['https://sa.mp3.icecast.magma.edge-access.net/sc_rad38'],
  convos:      ['https://server1.stweb.tv/rcvos/live/playlist.m3u8'],
  urbana:      ['https://cdn.instream.audio:9660/stream'],
  radio10:     ['https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO10AAC.aac'],
  destape:     ['https://ipanel.instream.audio/8004/stream'],
  mega:        ['https://playerservices.streamtheworld.com/api/livestream-redirect/MEGA983AAC.aac'],
  // vida: URL muerta (streaming450tb.locucionar.com caído) — se busca por API/búsqueda abierta
  rockpop:     ['https://playerservices.streamtheworld.com/api/livestream-redirect/ROCKANDPOPAAC.aac'],
  tango:       ['https://ais-edge94-nyc04.cdnstream.com/2202_128.mp3'],
  bolero:      ['https://stream.zeno.fm/b10wvksv7mruv'],
  folklore:    ['https://sa.mp3.icecast.magma.edge-access.net/sc_rad38'],
  romantica:   ['https://stream.zeno.fm/aa5f9m2rtg0uv'],
  jazz:        ['https://stream.srg-ssr.ch/srgssr/rsj/mp3/128'],
  pop:         ['https://playerservices.streamtheworld.com/api/livestream-redirect/FM999_56.mp3'],
  rock:        ['https://playerservices.streamtheworld.com/api/livestream-redirect/ROCKANDPOPAAC.aac'], 
};

// ── Alias de búsqueda → nombre real para la API ───────────────────────────────
export const ALIAS_BUSQUEDA: Record<string, string> = {
  cadena3:     'Cadena 3',
  lv3:         'Cadena 3',
  delplata:    'Radio Del Plata',
  lt8:         'LT8 Radio Rosario',
  mitre:       'Radio Mitre',
  continental: 'Radio Continental',
  rivadavia:   'Radio Rivadavia',
  lared:       'La Red',
  metro:       'Metro 95.1',
  aspen:       'Aspen',
  la100:       'La 100',
  folklorenac: 'Nacional Folklorica',
  rockpop:     'Rock & Pop',
  convos:      'Radio Con Vos',
  urbana:      'Urbana Play',
  radio10:     'Radio 10',
  destape:     'El Destape Radio',
  mega:        'Mega 98.3',
  vida:        'FM Vida',
};

// Tags de Radio Browser para géneros sin nombre de radio
const TAGS_GENERO: Record<string, string> = {
  tango:     'tango',
  bolero:    'bolero',
  folklore:  'folklore',
  romantica: 'romantic',
  clasica:   'classical',
  jazz:      'jazz',
  pop:       'pop',
  cumbia:    'cumbia',
  cuarteto:  'cuarteto',
  rock:      'rock',
  salsa:     'salsa',
  tropical:  'tropical',
};

export function nombreRadioOGenero(clave: string): string {
  const key = clave.toLowerCase().trim();
  return ALIAS_BUSQUEDA[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

// ── Utilidades ────────────────────────────────────────────────────────────────
function fetchConTimeout(url: string, ms: number, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

function esStreamValido(url: string): boolean {
  if (!url?.startsWith('https://')) return false;
  // .m3u y .pls son playlists (no streams directos); .m3u8 (HLS) es válido para fallbacks curados
  if (url.endsWith('.m3u') || url.endsWith('.pls')) return false;
  return true;
}

/** Igual que esStreamValido. HLS (.m3u8) permitido — ExoPlayer lo maneja mejor que raw MP3 en mobile. */
function esStreamDirecto(url: string): boolean {
  return esStreamValido(url);
}

// Tags incompatibles por género: si una estación los tiene, se descarta.
const TAGS_EXCLUIDOS: Record<string, string[]> = {
  romantica: ['dance', 'electronic', 'electronica', 'techno', 'house', 'reggaeton', 'urban', 'trap', 'edm', 'disco'],
  bolero:    ['dance', 'electronic', 'electronica', 'techno', 'house', 'reggaeton', 'urban', 'trap', 'edm'],
  clasica:   ['dance', 'electronic', 'electronica', 'techno', 'house', 'reggaeton', 'rock', 'pop', 'cumbia'],
  tango:     ['dance', 'electronic', 'electronica', 'techno', 'house', 'reggaeton', 'pop'],
  folklore:  ['dance', 'electronic', 'electronica', 'techno', 'house', 'reggaeton', 'pop'],
  jazz:      ['dance', 'electronic', 'electronica', 'techno', 'house', 'reggaeton'],
};

function mejorStream(stations: any[], genero?: string): string | null {
  const tagsExcluidos = genero ? (TAGS_EXCLUIDOS[genero] ?? []) : [];
  const candidatos = stations
    .filter((s: any) => {
      if (!esStreamDirecto(s.url_resolved ?? '')) return false;
      if (tagsExcluidos.length === 0) return true;
      const stationTags = (s.tags ?? '').toLowerCase().split(',').map((t: string) => t.trim());
      return !tagsExcluidos.some(excluido => stationTags.includes(excluido));
    })
    .sort((a: any, b: any) => {
      // HLS primero: más resiliente en mobile (segmentos vs. conexión TCP larga)
      const aHls = (a.url_resolved ?? '').endsWith('.m3u8') ? 1 : 0;
      const bHls = (b.url_resolved ?? '').endsWith('.m3u8') ? 1 : 0;
      if (bHls !== aHls) return bHls - aHls;
      return (b.votes ?? 0) - (a.votes ?? 0);
    });
  return candidatos[0]?.url_resolved ?? null;
}

// ── Notificar click a Radio Browser (buena ciudadanía) ────────────────────────
export async function notificarClick(stationuuid: string): Promise<void> {
  if (!stationuuid) return;
  try {
    await fetchConTimeout(
      `${SERVIDORES[0]}/json/url/${stationuuid}`,
      4000,
      { method: 'GET', headers: HEADERS }
    );
  } catch {}
}

// ── Búsqueda en API ───────────────────────────────────────────────────────────
async function buscarPorNombre(termino: string, countrycode = 'AR'): Promise<{ url: string; uuid: string } | null> {
  const nombre = ALIAS_BUSQUEDA[termino] ?? termino;
  const variantes = [nombre, `radio ${nombre}`, `fm ${nombre}`];

  for (const servidor of SERVIDORES) {
    for (const v of variantes) {
      try {
        const url = `${servidor}/json/stations/search?name=${encodeURIComponent(v)}&countrycode=${countrycode}&hidebroken=true&order=votes&reverse=true&limit=20`;
        const res = await fetchConTimeout(url, 7000, { headers: HEADERS });
        if (!res.ok) continue;
        const stations = await res.json();
        if (!Array.isArray(stations) || stations.length === 0) continue;
        const stream = mejorStream(stations);
        if (stream) return { url: stream, uuid: stations.find((s: any) => s.url_resolved === stream)?.stationuuid ?? '' };
      } catch {}
    }
  }
  return null;
}

async function buscarPorTag(tag: string, genero?: string): Promise<{ url: string; uuid: string } | null> {
  for (const servidor of SERVIDORES) {
    try {
      const url = `${servidor}/json/stations/search?tag=${encodeURIComponent(tag)}&language=spanish&hidebroken=true&order=votes&reverse=true&limit=40`;
      const res = await fetchConTimeout(url, 7000, { headers: HEADERS });
      if (!res.ok) continue;
      const stations = await res.json();
      if (!Array.isArray(stations) || stations.length === 0) continue;
      const stream = mejorStream(stations, genero);
      if (stream) return { url: stream, uuid: stations.find((s: any) => s.url_resolved === stream)?.stationuuid ?? '' };
    } catch {}
  }
  return null;
}

// Búsqueda abierta: texto libre del usuario (ej. "radio del interior", "radio publica")
async function buscarAbierto(texto: string): Promise<{ url: string; uuid: string } | null> {
  for (const servidor of SERVIDORES) {
    try {
      const url = `${servidor}/json/stations/search?name=${encodeURIComponent(texto)}&language=spanish&hidebroken=true&order=votes&reverse=true&limit=20`;
      const res = await fetchConTimeout(url, 7000, { headers: HEADERS });
      if (!res.ok) continue;
      const stations = await res.json();
      if (!Array.isArray(stations) || stations.length === 0) continue;
      const stream = mejorStream(stations);
      if (stream) return { url: stream, uuid: stations.find((s: any) => s.url_resolved === stream)?.stationuuid ?? '' };
    } catch {}
  }
  return null;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Busca una radio/género. Orden de prioridad:
 * 1. Caché local (7 días)
 * 2a. Radios con nombre conocido → API por nombre (AR)
 * 2b. Géneros con tag: **stream curado en STREAMS_FALLBACK primero**; si no aplica, API por tag
 * 3. Búsqueda abierta (texto libre sin alias ni género catalogado)
 * 4. Fallback hardcodeado (último recurso)
 */
export async function buscarRadio(termino: string): Promise<string | null> {
  const key = termino.toLowerCase().trim();

  // 1. Caché
  const cached = await leerCache(key);
  if (cached) return cached;

  // 2a. Radios con nombre conocido → primero URL curada si existe, luego API por nombre en AR.
  // Las URLs curadas son más confiables que RadioBrowser (evitan streams efímeros o con límite de sesión).
  const esRadioNombrada = key in ALIAS_BUSQUEDA;
  if (esRadioNombrada) {
    const curadas = STREAMS_FALLBACK[key];
    const primeraCurada = curadas?.find(u => esStreamValido(u));
    if (primeraCurada) return primeraCurada;

    // Sin URL curada → RadioBrowser
    const resultado = await buscarPorNombre(key, 'AR');
    if (resultado) {
      notificarClick(resultado.uuid);
      return resultado.url;
    }
  }

  const tagAPI = TAGS_GENERO[key];

  // 2b. Género catalogado: priorizar URL curada (tango, folklore, etc.) — la API por tag suele devolver
  // emisoras genéricas o mal etiquetadas en lugar de estos streams.
  if (tagAPI) {
    const curadas = STREAMS_FALLBACK[key];
    const primeraCurada = curadas?.[0];
    if (primeraCurada && esStreamValido(primeraCurada)) {
      return primeraCurada;
    }
    const resultado = await buscarPorTag(tagAPI, key);
    if (resultado) {
      notificarClick(resultado.uuid);
      return resultado.url;
    }
  }

  // 3. Búsqueda abierta (cualquier texto: "radio del interior", "fm hit", etc.)
  if (!esRadioNombrada && !tagAPI) {
    const resultado = await buscarAbierto(key);
    if (resultado) {
      notificarClick(resultado.uuid);
      return resultado.url;
    }
  }

  // 4. Fallback hardcodeado (emisora sin API, o género tras fallo de tag / curada inválida)
  return STREAMS_FALLBACK[key]?.[0] ?? null;
}

/**
 * Devuelve el fallback hardcodeado alternativo para reintentar
 * si la URL actual (obtenida de caché o API) falló durante la reproducción.
 */
export function getFallbackAlt(termino: string, urlActual: string): string | null {
  const key = termino.toLowerCase().trim();
  const lista = STREAMS_FALLBACK[key] ?? [];
  return lista.find(u => u !== urlActual) ?? null;
}

/** @deprecated — usar buscarRadio() directamente */
export function getFallbackUrl(genero: string): string | null {
  return STREAMS_FALLBACK[genero.toLowerCase().trim()]?.[0] ?? null;
}
