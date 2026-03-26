import * as Location from 'expo-location';

const WEATHERAPI_KEY = process.env.EXPO_PUBLIC_WEATHERAPI_KEY!;

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export type PronosticoDia = {
  fecha: string;       // 'YYYY-MM-DD'
  diaSemana: string;   // 'lunes', 'martes', etc.
  tempMax: number;
  tempMin: number;
  descripcion: string;
  codigo: number;      // condition code de WeatherAPI — para detectar mal tiempo
};

export type DatosClima = {
  temperatura: number;
  descripcion: string;
  codigoActual: number;
  ciudad?: string;
  latitud?: number;
  longitud?: number;
  pronostico: PronosticoDia[];
};

// Códigos WeatherAPI que justifican avisar: lluvia fuerte, chaparrones, tormentas, nieve fuerte
export const CODIGOS_ADVERSOS = new Set([
  1192, 1195,  // lluvia fuerte
  1243, 1246,  // chaparrón fuerte / torrencial
  1273, 1276,  // tormenta con lluvia
  1279, 1282,  // tormenta con nieve
  1222, 1225,  // nevada fuerte
  1117,        // ventisca
]);

export async function obtenerClima(): Promise<DatosClima | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (__DEV__) console.log('[CLIMA] permiso ubicación:', status);
    if (status !== 'granted') return null;

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const { latitude, longitude } = loc.coords;
    if (__DEV__) console.log('[CLIMA] coords:', latitude, longitude);

    // Clima actual + pronóstico 3 días (hoy + 2), descripciones en español
    const keyPreview = WEATHERAPI_KEY ? WEATHERAPI_KEY.slice(0, 6) + '…' : 'FALTA';
    if (__DEV__) console.log('[CLIMA] key:', keyPreview);
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHERAPI_KEY}&q=${latitude},${longitude}&days=3&aqi=no&alerts=no&lang=es`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timeoutId));
    if (__DEV__) console.log('[CLIMA] WeatherAPI status:', res.status);
    if (!res.ok) return null;

    const data = await res.json();

    const temp        = Math.round(data.current.temp_c);
    const codigo      = data.current.condition.code as number;
    const descripcion = (data.current.condition.text as string).toLowerCase();

    // WeatherAPI puede devolver nombre de barrio o zona en vez de ciudad;
    // intentamos en orden: name → region → reverse geocoding nativo
    // Combinamos ciudad + provincia para mejorar las búsquedas locales
    let ciudadNombre: string | undefined = (data.location.name as string) || undefined;
    const regionNombre: string | undefined = (data.location.region as string) || undefined;
    if (__DEV__) console.log('[CLIMA] ciudad WeatherAPI:', data.location.name, '| region:', data.location.region);
    if (!ciudadNombre) {
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        ciudadNombre = geo[0]?.city || geo[0]?.subregion || undefined;
        if (__DEV__) console.log('[CLIMA] ciudad reverse geocoding:', ciudadNombre);
      } catch {}
    }
    // "San Cristóbal, Santa Fe" — más preciso para búsquedas locales
    let ciudad: string | undefined = ciudadNombre;
    if (ciudadNombre && regionNombre && !ciudadNombre.includes(regionNombre)) {
      ciudad = `${ciudadNombre}, ${regionNombre}`;
    } else if (!ciudad) {
      ciudad = regionNombre;
    }

    // Pronóstico — forecastday[0] = hoy, tomamos [1] y [2]
    const pronostico: PronosticoDia[] = [];
    const days: any[] = data.forecast.forecastday;
    for (let i = 1; i < days.length; i++) {
      const d     = days[i];
      const fecha = new Date(d.date + 'T12:00:00');
      pronostico.push({
        fecha:       d.date,
        diaSemana:   DIAS_SEMANA[fecha.getDay()],
        tempMax:     Math.round(d.day.maxtemp_c),
        tempMin:     Math.round(d.day.mintemp_c),
        descripcion: (d.day.condition.text as string).toLowerCase(),
        codigo:      d.day.condition.code as number,
      });
    }

    return { temperatura: temp, descripcion, codigoActual: codigo, ciudad, latitud: latitude, longitud: longitude, pronostico };
  } catch (e: any) {
    if (__DEV__) console.log('[CLIMA] error:', e?.message ?? e);
    return null;
  }
}

export function climaATexto(c: DatosClima): string {
  const ciudad = c.ciudad ? ` en ${c.ciudad}` : '';
  let texto = `Clima actual${ciudad}: ${c.temperatura}°C, ${c.descripcion}.`;

  if (c.pronostico.length > 0) {
    texto += ' Pronóstico para los próximos días:';
    for (const dia of c.pronostico) {
      texto += ` ${dia.diaSemana}: ${dia.tempMin}°-${dia.tempMax}°C, ${dia.descripcion}.`;
    }
  }

  return texto;
}
