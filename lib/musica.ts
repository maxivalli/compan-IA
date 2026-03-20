const SERVIDORES = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

// Streams HTTPS curados para géneros y radios — fallback si la API falla
const STREAMS_GENERO: Record<string, string[]> = {
  // Radios argentinas — fallbacks HTTPS verificados desde radio-browser.info
  cadena3:    ['https://liveradio.mediainbox.net/radio3.mp3', 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO3_SC'],
  mitre:      [],
  continental:[],
  rivadavia:  [],
  nacional:   [],
  lared:      [],
  metro:      [],
  aspen:      [],
  la100:      [],
  rock:       [],
  clasicanac: [],
  folklorenac:[],
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

const HEADERS = {
  'User-Agent': 'CompañIA/1.0 (Radio Player)',
  'Accept': 'application/json',
};

function fetchConTimeout(url: string, ms: number, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

// Términos de búsqueda reales para claves abreviadas
const ALIAS_BUSQUEDA: Record<string, string> = {
  cadena3:    'Cadena 3',
  mitre:      'Radio Mitre',
  continental:'Radio Continental',
  rivadavia:  'Radio Rivadavia',
  nacional:   'Radio Nacional',
  lared:      'La Red',
  metro:      'Metro 95.1',
  aspen:      'Aspen',
  la100:      'La 100',
  rock:       'Nacional Rock',
  clasicanac: 'Nacional Clasica',
  folklorenac:'Nacional Folklorica',
};

async function buscarEnAPI(termino: string, pais?: string): Promise<string | null> {
  const nombre = ALIAS_BUSQUEDA[termino] ?? termino;
  const terminos = [nombre, `radio ${nombre}`];
  const paisParam = pais ? `&countrycode=${pais}` : '&language=spanish';

  for (const servidor of SERVIDORES) {
    for (const t of terminos) {
      try {
        const url = `${servidor}/json/stations/search?name=${encodeURIComponent(t)}${paisParam}&hidebroken=true&order=votes&reverse=true&limit=15`;
        const res = await fetchConTimeout(url, 8000, { headers: HEADERS });
        if (!res.ok) continue;
        const stations = await res.json();
        if (!Array.isArray(stations)) continue;
        // Preferir HTTPS; si solo hay HTTP intentar reemplazar protocolo (muchos CDNs lo soportan)
        const https = stations.find((s: any) => s.url_resolved?.startsWith('https://'));
        if (https) return https.url_resolved as string;
        const http = stations.find((s: any) => s.url_resolved?.startsWith('http://'));
        if (http) return (http.url_resolved as string).replace('http://', 'https://');
      } catch {
        // silencioso
      }
    }
  }
  return null;
}


export async function buscarRadio(genero: string): Promise<string | null> {
  const key = genero.toLowerCase().trim();

  const esArgentina = key in ALIAS_BUSQUEDA;
  const urlAPI = await buscarEnAPI(key, esArgentina ? 'AR' : undefined);
  if (urlAPI) return urlAPI;

  const fallbacks = STREAMS_GENERO[key];
  if (fallbacks?.length) return fallbacks[0];

  return null;
}
