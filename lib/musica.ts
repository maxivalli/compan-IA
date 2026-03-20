const SERVIDORES = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

// Streams HTTPS curados para géneros y radios — fallback si la API falla
const STREAMS_GENERO: Record<string, string[]> = {
  // Radios argentinas (solo HTTPS — Android bloquea HTTP)
  cadena3:     ['https://playerservices.streamtheworld.com/api/livestream-redirect/CADENA3AAC.aac'],
  mitre:       ['https://buecrplb01.cienradios.com.ar/Mitre790.aac'],
  continental: ['https://playerservices.streamtheworld.com/api/livestream-redirect/CONTINENTAL_SC'],
  rivadavia:   ['https://streammax.alsolnet.com/radiorivadavia'],
  nacional:    ['https://sa.mp3.icecast.magma.edge-access.net/sc_rad1'],
  lared:       ['https://strive-sdn-lsdlive-live.akamaized.net/live_passthrough_static/amlared/playlist.m3u8'],
  metro:       ['https://edge-np.cdn.mdstrm.com/5a9ee26311c043ae48e40bcd.mp3'],
  aspen:       ['https://playerservices.streamtheworld.com/api/livestream-redirect/ASPENAAC'],
  la100:       ['https://playerservices.streamtheworld.com/api/livestream-redirect/LA100AAC'],
  rock:        ['https://sa.mp3.icecast.magma.edge-access.net/sc_rad39'],
  clasicanac:  ['https://sa.mp3.icecast.magma.edge-access.net/sc_rad37'],
  folklorenac: ['https://sa.mp3.icecast.magma.edge-access.net/sc_rad38'],
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

/** Devuelve la primera URL de la lista (los servidores de streaming no responden a HEAD) */
function primeraQueAndé(urls: string[]): string | null {
  return urls[0] ?? null;
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
          (s: any) => s.url_resolved?.startsWith('https://'),
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

  const urlAPI = await buscarEnAPI(key);
  if (urlAPI) return urlAPI;

  const fallbacks = STREAMS_GENERO[key];
  if (fallbacks) return primeraQueAndé(fallbacks) ?? fallbacks[0];

  return null;
}
