import AsyncStorage from '@react-native-async-storage/async-storage';

interface Feriado {
  date: string;       // YYYY-MM-DD
  localName: string;  // Nombre en español
}

const CACHE_PREFIX = 'compania_feriados_';
const VENTANA_DIAS = 7;

async function obtenerFeriadosAnio(anio: number): Promise<Feriado[]> {
  const key = CACHE_PREFIX + anio;
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) return JSON.parse(cached) as Feriado[];
  } catch {}

  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${anio}/AR`,
      { signal: ctrl.signal },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Feriado[];
    await AsyncStorage.setItem(key, JSON.stringify(data));
    return data;
  } catch {
    return [];
  } finally {
    clearTimeout(id);
  }
}

/**
 * Devuelve una cadena de texto con los feriados nacionales de Argentina
 * que caen hoy, mañana, o en los próximos 7 días.
 * Lista vacía → string vacío.
 */
export async function getFeriadosCercanos(): Promise<string> {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const hoyMidnight = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  // Si estamos en diciembre también cargamos el año siguiente
  const feriados = await obtenerFeriadosAnio(anio);
  const extras = hoy.getMonth() === 11 ? await obtenerFeriadosAnio(anio + 1) : [];
  const todos = [...feriados, ...extras];

  const lineas: string[] = [];
  for (const f of todos) {
    // T12:00:00 evita desfases por zona horaria
    const fecha = new Date(f.date + 'T12:00:00');
    const diff = Math.round(
      (fecha.getTime() - hoyMidnight.getTime()) / 86_400_000,
    );

    if (diff === 0) {
      lineas.push(`Hoy es feriado nacional: ${f.localName}.`);
    } else if (diff === 1) {
      lineas.push(`Mañana es feriado nacional: ${f.localName}.`);
    } else if (diff > 1 && diff <= VENTANA_DIAS) {
      const fechaStr = fecha.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      lineas.push(`El ${fechaStr} es feriado nacional: ${f.localName}.`);
    }
  }

  return lineas.join(' ');
}
