const SERVIDORES = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

// Streams HTTPS curados para géneros — fallback si la API falla
const STREAMS_GENERO: Record<string, string[]> = {
  tango:     [
    'https://ais-edge94-nyc04.cdnstream.com/2202_128.mp3',
    'https://stream.zeno.fm/b9ynfb4tmg0uv',
  ],
  bolero:    [
    'https://stream.zeno.fm/b10wvksv7mruv',
    'https://stream.zeno.fm/q2p9frfb4g0uv',
  ],
  folklore:  [
    'https://sa.mp3.icecast.magma.edge-access.net/sc_rad38',
    'https://stream.zeno.fm/q3q9frfb4g0uv',
  ],
  romantica: [
    'https://stream.zeno.fm/aa5f9m2rtg0uv',
    'https://stream.zeno.fm/r4r9frfb4g0uv',
  ],
  clasica:   [
    'https://sa.mp3.icecast.magma.edge-access.net/sc_rad37',
    'https://stream.srg-ssr.ch/srgssr/rco/mp3/128',
  ],
  jazz:      [
    'https://stream.srg-ssr.ch/srgssr/rsj/mp3/128',
    'https://stream.zeno.fm/s7w55u8vtg0uv',
  ],
  pop:       [
    'https://playerservices.streamtheworld.com/api/livestream-redirect/FM999_56.mp3',
    'https://stream.zeno.fm/t5t9frfb4g0uv',
  ],
};

// Streams HTTPS curados para radios argentinas conocidas
const STREAMS_RADIO_AR: Record<string, string[]> = {
  cadena3:     [
    'https://streaming.cadena3.com.ar/cadena3',
    'https://edge2.streamguys.com/cadena3',
  ],
  mitre:       [
    'https://cdn.triton.digital/mp3/stream/mitre_baires',
    'https://d14uos6stvmxrn.cloudfront.net/Mitre/smil:mitre.smil/playlist.m3u8',
  ],
  continental: [
    'https://cdn.triton.digital/mp3/stream/continental_baires',
    'https://d14uos6stvmxrn.cloudfront.net/Continental/smil:continental.smil/playlist.m3u8',
  ],
  rivadavia:   [
    'https://cdn.triton.digital/mp3/stream/rivadavia_am630',
    'https://d14uos6stvmxrn.cloudfront.net/Rivadavia/smil:rivadavia.smil/playlist.m3u8',
  ],
  nacional:    [
    'https://icecast.servicios.rna.gob.ar/nacional-am870.mp3',
    'https://stream.rna.gob.ar/nacional',
  ],
  lared:       [
    'https://cdn.triton.digital/mp3/stream/lared_baires',
    'https://d14uos6stvmxrn.cloudfront.net/LaRed/smil:lared.smil/playlist.m3u8',
  ],
  metro:       [
    'https://cdn.triton.digital/mp3/stream/metro_baires',
    'https://d14uos6stvmxrn.cloudfront.net/Metro/smil:metro.smil/playlist.m3u8',
  ],
};

// Nombres para buscar en radio-browser.info (fallback adicional)
const NOMBRES_RADIO_AR: Record<string, string> = {
  cadena3:     'Cadena 3',
  mitre:       'Radio Mitre',
  continental: 'Radio Continental',
  rivadavia:   'Radio Rivadavia',
  nacional:    'Radio Nacional',
  lared:       'La Red',
  metro:       'Radio Metro 95.1',
};

const HEADERS = {
  'User-Agent': 'CompañIA/1.0 (Radio Player)',
  'Accept': 'application/json',
};

function fetchConTimeout(url: string, ms: number, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/** Verifica si un stream responde correctamente (HEAD request, 3s timeout) */
async function verificarStream(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal }).finally(() => clearTimeout(id));
    return res.ok || res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
}

/** Prueba una lista de URLs y devuelve la primera que responda */
async function primeraQueAndé(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    if (await verificarStream(url)) return url;
  }
  return null;
}

async function buscarEnAPI(termino: string, pais?: string): Promise<string | null> {
  const terminos = [termino, `radio ${termino}`];
  const paisParam = pais ? `&countrycode=${pais}` : '&language=spanish';

  for (const servidor of SERVIDORES) {
    for (const t of terminos) {
      try {
        const url = `${servidor}/json/stations/search?name=${encodeURIComponent(t)}${paisParam}&hidebroken=true&order=votes&reverse=true&limit=15`;
        const res = await fetchConTimeout(url, 8000, { headers: HEADERS });
        if (!res.ok) continue;
        const stations = await res.json();
        // Solo HTTPS — Android bloquea HTTP en apps modernas
        const station = stations?.find(
          (s: any) => s.url_resolved?.startsWith('https://') && (s.bitrate ?? 0) >= 64,
        );
        if (station) return station.url_resolved as string;
      } catch {
        // silencioso
      }
    }
  }
  return null;
}

export async function buscarRadio(genero: string): Promise<string | null> {
  const key = genero.toLowerCase().trim();

  // ── Radios argentinas ─────────────────────────────────────────────────────
  if (STREAMS_RADIO_AR[key]) {
    // 1. Probar streams curados hardcodeados
    const urlCurada = await primeraQueAndé(STREAMS_RADIO_AR[key]);
    if (urlCurada) return urlCurada;

    // 2. Buscar en radio-browser.info (solo HTTPS)
    const nombre = NOMBRES_RADIO_AR[key];
    if (nombre) {
      const urlAPI = await buscarEnAPI(nombre, 'AR') ?? await buscarEnAPI(nombre);
      if (urlAPI) return urlAPI;
    }

    return null;
  }

  // ── Géneros musicales ─────────────────────────────────────────────────────

  // 1. Buscar en radio-browser.info (solo HTTPS)
  const urlAPI = await buscarEnAPI(key);
  if (urlAPI) return urlAPI;

  // 2. Fallback a streams curados
  const fallbacks = STREAMS_GENERO[key];
  if (fallbacks) return await primeraQueAndé(fallbacks) ?? fallbacks[0];

  return null;
}
