import * as Location from 'expo-location';

const CODIGOS_CLIMA: Record<number, string> = {
  0:  'cielo despejado',
  1:  'mayormente despejado',
  2:  'parcialmente nublado',
  3:  'nublado',
  45: 'niebla',
  48: 'niebla con escarcha',
  51: 'llovizna leve',
  53: 'llovizna moderada',
  55: 'llovizna intensa',
  61: 'lluvia leve',
  63: 'lluvia moderada',
  65: 'lluvia intensa',
  71: 'nevada leve',
  73: 'nevada moderada',
  75: 'nevada intensa',
  80: 'chaparrones leves',
  81: 'chaparrones moderados',
  82: 'chaparrones fuertes',
  95: 'tormenta eléctrica',
  96: 'tormenta con granizo',
  99: 'tormenta con granizo fuerte',
};

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export type PronosticoDia = {
  fecha: string;       // 'YYYY-MM-DD'
  diaSemana: string;   // 'lunes', 'martes', etc.
  tempMax: number;
  tempMin: number;
  descripcion: string;
};

export type DatosClima = {
  temperatura: number;
  descripcion: string;
  ciudad?: string;
  pronostico: PronosticoDia[];  // próximos 6 días
};

export async function obtenerClima(): Promise<DatosClima | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const { latitude, longitude } = loc.coords;

    // Pedimos clima actual + pronóstico de 7 días en una sola llamada
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) return null;

    const data = await res.json();

    // Clima actual
    const temp = Math.round(data.current.temperature_2m);
    const codigo = data.current.weathercode as number;
    const descripcion = CODIGOS_CLIMA[codigo] ?? 'clima variable';

    // Pronóstico — saltamos el día de hoy (índice 0), tomamos los próximos 6
    const pronostico: PronosticoDia[] = [];
    const fechas: string[]  = data.daily.time;
    const maximas: number[] = data.daily.temperature_2m_max;
    const minimas: number[] = data.daily.temperature_2m_min;
    const codigos: number[] = data.daily.weathercode;

    for (let i = 1; i < fechas.length; i++) {
      const fecha = new Date(fechas[i] + 'T12:00:00');
      pronostico.push({
        fecha: fechas[i],
        diaSemana: DIAS_SEMANA[fecha.getDay()],
        tempMax: Math.round(maximas[i]),
        tempMin: Math.round(minimas[i]),
        descripcion: CODIGOS_CLIMA[codigos[i]] ?? 'clima variable',
      });
    }

    // Nombre de ciudad aproximado
    const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
    const ciudad = geo?.[0]?.city ?? geo?.[0]?.region ?? undefined;

    return { temperatura: temp, descripcion, ciudad, pronostico };
  } catch {
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