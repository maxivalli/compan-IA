const SERVIDORES = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

// Streams HTTPS verificados como fallback si la API falla
const STREAMS_FALLBACK: Record<string, string> = {
  tango:     'https://ais-edge94-nyc04.cdnstream.com/2202_128.mp3',
  bolero:    'https://stream.zeno.fm/b10wvksv7mruv',
  folklore:  'https://sa.mp3.icecast.magma.edge-access.net/sc_rad38',
  romantica: 'https://stream.zeno.fm/aa5f9m2rtg0uv',
  clasica:   'https://sa.mp3.icecast.magma.edge-access.net/sc_rad37',
  jazz:      'https://stream.srg-ssr.ch/srgssr/rsj/mp3/128',
  pop:       'https://playerservices.streamtheworld.com/api/livestream-redirect/FM999_56.mp3',
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

async function buscarEnAPI(genero: string): Promise<string | null> {
  const terminos = [genero, `${genero} radio`, `radio ${genero}`];

  for (const servidor of SERVIDORES) {
    for (const termino of terminos) {
      try {
        const url = `${servidor}/json/stations/search?name=${encodeURIComponent(termino)}&language=spanish&hidebroken=true&order=votes&reverse=true&limit=10`;
        const res = await fetchConTimeout(url, 8000, { headers: HEADERS });
        if (!res.ok) continue;
        const stations = await res.json();
        const station = stations?.find(
          (s: any) => s.url_resolved?.startsWith('http') && (s.bitrate ?? 0) >= 64
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
  const key = genero.toLowerCase();

  const urlAPI = await buscarEnAPI(key);
  if (urlAPI) return urlAPI;

  const fallback = STREAMS_FALLBACK[key];
  if (fallback) return fallback;

  return null;
}
