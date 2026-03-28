import * as Location from 'expo-location';

const OWM_KEY  = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY!;
const OWM_BASE = 'https://api.openweathermap.org/data/2.5';

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Mapeo de códigos OWM a descripciones en español compatibles con los regex
// de ExpresionOverlay (lluvia|tormenta|nieve|nevad|granizo|nublado|despejado|ráfaga…)
function owmDesc(id: number): string {
  if (id >= 200 && id < 300) return 'tormenta';
  if (id >= 300 && id < 400) return 'llovizna';
  if (id === 500)             return 'lluvia leve';
  if (id === 501)             return 'lluvia moderada';
  if (id >= 502 && id < 520) return 'lluvia intensa';
  if (id >= 520 && id < 600) return 'chaparrón';
  if (id === 600)             return 'nevada leve';
  if (id === 601)             return 'nevada moderada';
  if (id >= 602 && id < 610) return 'nevada intensa';
  if (id >= 610 && id < 620) return 'granizo';
  if (id >= 620 && id < 700) return 'nevada con lluvia';
  if (id === 701 || id === 741) return 'niebla';
  if (id === 721)             return 'neblina';
  if (id === 771)             return 'ráfagas de viento';
  if (id === 781)             return 'tormenta severa';
  if (id >= 700 && id < 800) return 'neblina';
  if (id === 800)             return 'despejado';
  if (id === 801)             return 'mayormente despejado';
  if (id === 802)             return 'parcialmente nublado';
  if (id === 803 || id === 804) return 'nublado';
  return 'variable';
}

export type PronosticoDia = {
  fecha:       string;
  diaSemana:   string;
  tempMax:     number;
  tempMin:     number;
  descripcion: string;
  codigo:      number;
};

export type DatosClima = {
  temperatura:   number;
  descripcion:   string;
  codigoActual:  number;
  ciudad?:       string;
  latitud?:      number;
  longitud?:     number;
  pronostico:    PronosticoDia[];
};

// Condiciones OWM que activan alertas en useNotificaciones
export const CODIGOS_ADVERSOS = new Set([
  // Tormentas
  200, 201, 202, 210, 211, 212, 221, 230, 231, 232,
  // Lluvia intensa / granizo
  502, 503, 504, 511, 520, 521, 522, 531,
  // Nieve / granizo
  602, 611, 612, 613, 615, 616, 620, 621, 622,
  // Viento extremo
  771, 781,
]);

export async function obtenerClima(latitud?: number, longitud?: number): Promise<DatosClima | null> {
  try {
    let lat: number;
    let lon: number;

    if (latitud !== undefined && longitud !== undefined) {
      lat = latitud;
      lon = longitud;
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const gpsPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const timeout    = new Promise<null>(r => setTimeout(() => r(null), 10000));
      const loc = await Promise.race([gpsPromise, timeout]);
      if (!loc) return null;
      lat = loc.coords.latitude;
      lon = loc.coords.longitude;
    }

    const abort   = new AbortController();
    const timerId = setTimeout(() => abort.abort(), 8000);

    // Clima actual y pronóstico en paralelo
    const [resCurrent, resForecast] = await Promise.all([
      fetch(`${OWM_BASE}/weather?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric&lang=es`, { signal: abort.signal }),
      fetch(`${OWM_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric&lang=es&cnt=32`, { signal: abort.signal }),
    ]).finally(() => clearTimeout(timerId));

    if (!resCurrent.ok || !resForecast.ok) throw new Error('OWM error');

    const [current, forecast] = await Promise.all([resCurrent.json(), resForecast.json()]);

    const temperatura  = Math.round(current.main.temp as number);
    const codigoActual = current.weather[0].id as number;
    const descripcion  = owmDesc(codigoActual);
    const ciudad       = current.name as string || undefined;

    // Pronóstico: agrupar intervalos de 3h por día, saltar hoy
    const today = new Date().toISOString().slice(0, 10);
    const byDate = new Map<string, { temps: number[]; ids: number[] }>();

    for (const item of forecast.list as any[]) {
      const fecha = (item.dt_txt as string).slice(0, 10);
      if (fecha === today) continue;
      if (!byDate.has(fecha)) byDate.set(fecha, { temps: [], ids: [] });
      byDate.get(fecha)!.temps.push(item.main.temp as number);
      byDate.get(fecha)!.ids.push(item.weather[0].id as number);
    }

    const pronostico: PronosticoDia[] = [];
    for (const [fecha, { temps, ids }] of byDate) {
      if (pronostico.length >= 3) break;
      // Condición representativa: el código de peor severidad del día
      const codigo = ids.reduce((worst, id) => {
        // Thunderstorm > Rain > Snow > Clouds > Clear
        const severity = (c: number) =>
          c < 300 ? 5 : c < 400 ? 3 : c < 600 ? 4 : c < 700 ? 3 : c === 800 ? 0 : 1;
        return severity(id) >= severity(worst) ? id : worst;
      }, ids[0]);
      pronostico.push({
        fecha,
        diaSemana:   DIAS_SEMANA[new Date(fecha + 'T12:00:00').getDay()],
        tempMax:     Math.round(Math.max(...temps)),
        tempMin:     Math.round(Math.min(...temps)),
        descripcion: owmDesc(codigo),
        codigo,
      });
    }

    return { temperatura, descripcion, codigoActual, ciudad, latitud: lat, longitud: lon, pronostico };
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
