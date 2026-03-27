import * as Location from 'expo-location';

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Descripciones en español para códigos WMO de Open-Meteo
const WMO_DESC: Record<number, string> = {
  0:  'despejado',
  1:  'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'niebla', 48: 'niebla helada',
  51: 'llovizna leve', 53: 'llovizna moderada', 55: 'llovizna intensa',
  56: 'llovizna helada leve', 57: 'llovizna helada intensa',
  61: 'lluvia leve', 63: 'lluvia moderada', 65: 'lluvia intensa',
  66: 'lluvia helada leve', 67: 'lluvia helada intensa',
  71: 'nevada leve', 73: 'nevada moderada', 75: 'nevada intensa',
  77: 'granizo',
  80: 'chaparrón leve', 81: 'chaparrón moderado', 82: 'chaparrón violento',
  85: 'nevada con chaparrón leve', 86: 'nevada con chaparrón intensa',
  95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta con granizo intenso',
};

export type PronosticoDia = {
  fecha: string;
  diaSemana: string;
  tempMax: number;
  tempMin: number;
  descripcion: string;
  codigo: number;
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

// Códigos WMO adversos: lluvia/nieve intensa, tormentas, granizo
export const CODIGOS_ADVERSOS = new Set([
  65, 67,        // lluvia intensa / helada intensa
  75,            // nevada intensa
  82,            // chaparrón violento
  86,            // nevada con chaparrón intensa
  95, 96, 99,   // tormentas
]);

export async function obtenerClima(latitud?: number, longitud?: number): Promise<DatosClima | null> {
  try {
    let latitude: number;
    let longitude: number;

    if (latitud !== undefined && longitud !== undefined) {
      latitude = latitud;
      longitude = longitud;
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const gpsPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const timeout    = new Promise<null>(r => setTimeout(() => r(null), 10000));
      const loc = await Promise.race([gpsPromise, timeout]);
      if (!loc) return null;
      latitude  = loc.coords.latitude;
      longitude = loc.coords.longitude;
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=4&timezone=auto`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) throw new Error(`HTTP${res.status}`);

    const data = await res.json();

    const temp        = Math.round(data.current.temperature_2m);
    const codigo      = data.current.weather_code as number;
    const descripcion = WMO_DESC[codigo] ?? 'variable';

    // Reverse geocoding para nombre de ciudad
    let ciudad: string | undefined;
    try {
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      const city   = geo[0]?.city || geo[0]?.subregion;
      const region = geo[0]?.region;
      if (city && region && !city.includes(region)) {
        ciudad = `${city}, ${region}`;
      } else {
        ciudad = city || region || undefined;
      }
    } catch {}

    // Pronóstico: días 1-3 (saltear hoy = índice 0)
    const pronostico: PronosticoDia[] = [];
    const fechas: string[] = data.daily.time;
    for (let i = 1; i < Math.min(4, fechas.length); i++) {
      const fecha = fechas[i];
      const cod   = data.daily.weather_code[i] as number;
      pronostico.push({
        fecha,
        diaSemana:   DIAS_SEMANA[new Date(fecha + 'T12:00:00').getDay()],
        tempMax:     Math.round(data.daily.temperature_2m_max[i]),
        tempMin:     Math.round(data.daily.temperature_2m_min[i]),
        descripcion: WMO_DESC[cod] ?? 'variable',
        codigo:      cod,
      });
    }

    return { temperatura: temp, descripcion, codigoActual: codigo, ciudad, latitud: latitude, longitud: longitude, pronostico };
  } catch (e: any) {
    throw e;
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
