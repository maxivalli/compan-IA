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

// Términos de búsqueda para Radio Garden y radio-browser.info
const NOMBRES_RADIO_AR: Record<string, string> = {
  cadena3:     'Cadena 3',
  mitre:       'Radio Mitre',
  continental: 'Radio Continental',
  rivadavia:   'Radio Rivadavia',
  nacional:    'Radio Nacional',
  lared:       'La Red',
  metro:       'Radio Metro',
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

/** Busca una estación en Radio Garden y devuelve la URL final del stream (resuelve el redirect) */
async function buscarEnRadioGarden(nombre: string): Promise<string | null> {
  try {
    const res = await fetchConTimeout(
      `https://radio.garden/api/search?q=${encodeURIComponent(nombre)}`,
      6000,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const hits = data?.hits?.hits ?? [];
    const canal = hits.find((h: any) => h._source?.type === 'channel');
    if (!canal) return null;
    const id = canal._source.id?.replace('/api/ara/content/channel/', '').replace('/channel/', '');
    if (!id) return null;
    // Resolver el redirect para obtener la URL directa del stream
    const streamRes = await fetchConTimeout(
      `https://radio.garden/api/ara/content/channel/${id}/stream`,
      6000,
      { redirect: 'follow' },
    );
    if (!streamRes.ok && streamRes.status !== 302) return null;
    // La URL final tras el redirect es la del stream real
    return streamRes.url ?? null;
  } catch {
    return null;
  }
}

export async function buscarRadio(genero: string): Promise<string | null> {
  const key = genero.toLowerCase().trim();

  // ── Radios argentinas ─────────────────────────────────────────────────────
  const nombre = NOMBRES_RADIO_AR[key];
  if (nombre) {
    // 1. Radio Garden — streams proxeados, siempre HTTPS y confiables
    const urlGarden = await buscarEnRadioGarden(nombre);
    if (urlGarden) return urlGarden;

    // 2. radio-browser.info (solo HTTPS)
    const urlAPI = await buscarEnAPI(nombre, 'AR') ?? await buscarEnAPI(nombre);
    if (urlAPI) return urlAPI;

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
