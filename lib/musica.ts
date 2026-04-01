const SERVIDORES = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

// Streams HTTPS curados para géneros y radios — fuente primaria (inmediata)
export const STREAMS_GENERO: Record<string, string[]> = {
  // Radios argentinas — solo fallbacks verificados
  cadena3:    ['https://liveradio.mediainbox.net/radio3.mp3', 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO3_SC'],
  lv3:        ['https://liveradio.mediainbox.net/radio3.mp3', 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO3_SC'],
  delplata:   ['https://streaming01.shockmedia.com.ar:10217/stream'],
  lt8:        ['https://stream.lt8.com.ar:8080/lt8radio.mp3'],
  mitre:      ['https://27363.live.streamtheworld.com/AM790_56AAC_SC'],
  continental: ['https://frontend.radiohdvivo.com/continental/live'], rivadavia: ['https://14003.live.streamtheworld.com/RIVADAVIA.mp3'],
  lared:      ['https://cdn.instream.audio:9288/stream', 'https://playerservices.streamtheworld.com/api/livestream-redirect/LA_RED_AM910AAC.aac'], metro: ['https://playerservices.streamtheworld.com/api/livestream-redirect/METRO.mp3'],
  aspen:      ['https://playerservices.streamtheworld.com/api/livestream-redirect/ASPEN.mp3'],
  la100:      ['https://playerservices.streamtheworld.com/api/livestream-redirect/FM999_56.mp3'],
  folklorenac: ['https://sa.mp3.icecast.magma.edge-access.net/sc_rad38'],
  convos:     ['https://server1.stweb.tv/rcvos/live/playlist.m3u8', 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_CON_VOS.mp3'],
  urbana:     ['https://cdn.instream.audio:9660/stream'],
  radio10:    ['https://radio10.stweb.tv/radio10/live/playlist.m3u8'],
  destape:    ['https://ipanel.instream.audio/8004/stream'],
  mega:       ['https://mega.stweb.tv/mega983/live/playlist.m3u8'],
  vida:       ['https://streaming450tb.locucionar.com/proxy/fmvida979?mp=/stream'],
  rockpop:    ['https://playerservices.streamtheworld.com/api/livestream-redirect/ROCKANDPOPAAC.aac'],
  // Géneros
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

// Quitamos el User-Agent para evitar problemas de CORS en navegadores
const HEADERS = {
  'Accept': 'application/json',
};

function fetchConTimeout(url: string, ms: number, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

// Términos de búsqueda reales para claves abreviadas
export const ALIAS_BUSQUEDA: Record<string, string> = {
  cadena3:    'Cadena 3',
  lv3:        'Cadena 3',
  delplata:   'Radio Del Plata',
  lt8:        'LT8 Radio Rosario',
  mitre:      'Radio Mitre',
  continental:'Radio Continental',
  rivadavia:  'Radio Rivadavia',
  lared:      'La Red',
  metro:      'Metro 95.1',
  aspen:      'Aspen',
  la100:      'La 100',
  folklorenac:'Nacional Folklorica',
  rockpop:    'Rock & Pop',
  convos:     'Radio Con Vos',
  urbana:     'Urbana Play',
  radio10:    'Radio 10',
  destape:    'El Destape Radio',
  mega:       'Mega 98.3',
  vida:       'FM Vida',
};

export function nombreRadioOGenero(clave: string): string {
  const key = clave.toLowerCase().trim();
  return ALIAS_BUSQUEDA[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

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
        if (!Array.isArray(stations) || stations.length === 0) continue;

        // Buscar EXCLUSIVAMENTE streams HTTPS directos (sin listas de reproducción m3u/pls)
        const streamValido = stations.find((s: any) => 
          s.url_resolved?.startsWith('https://') && 
          !s.url_resolved?.endsWith('.m3u') && 
          !s.url_resolved?.endsWith('.pls')
        );

        if (streamValido) {
          if (__DEV__) console.log(`📡 Stream encontrado en API para ${termino}:`, streamValido.url_resolved);
          return streamValido.url_resolved as string;
        }
      } catch (error) {
        if (__DEV__) console.warn(`Fallo al buscar en ${servidor}:`, error);
      }
    }
  }
  return null;
}

/** Devuelve la URL de fallback hardcodeada para un género/radio, sin llamar a la API. */
export function getFallbackUrl(genero: string): string | null {
  const key = genero.toLowerCase().trim();
  return STREAMS_GENERO[key]?.[0] ?? null;
}

export async function buscarRadio(genero: string): Promise<string | null> {
  const key = genero.toLowerCase().trim();
  const fallbacks = STREAMS_GENERO[key];

  // Priorizar URLs hardcodeadas — el player nativo las maneja mejor que fetch
  if (fallbacks?.length) return fallbacks[0];

  // Sin hardcodeados → buscar en API
  if (__DEV__) console.log(`🔍 Sin fallback para "${key}", buscando en API...`);
  const esArgentina = key in ALIAS_BUSQUEDA;
  return buscarEnAPI(key, esArgentina ? 'AR' : undefined);
}

/** Devuelve el segundo fallback hardcodeado para reintentar si el primero falló. */
export function getFallbackAlt(genero: string, urlActual: string): string | null {
  const key = genero.toLowerCase().trim();
  const lista = STREAMS_GENERO[key] ?? [];
  return lista.find(u => u !== urlActual) ?? null;
}
