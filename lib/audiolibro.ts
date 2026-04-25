import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Capitulo {
  idx:      number;
  titulo:   string;
  url:      string;
  publicId: string;
}

export interface ProgresoAudiolibro {
  tituloId:         string;
  capituloIdx:      number;
  posicionSegundos: number;
  actualizadoEn:    number;
}

const STORAGE_KEY_PREFIX = 'audiolibro_progreso_';

export async function getProgreso(tituloId: string): Promise<ProgresoAudiolibro | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PREFIX + tituloId);
    if (!raw) return null;
    return JSON.parse(raw) as ProgresoAudiolibro;
  } catch {
    return null;
  }
}

export async function saveProgreso(
  tituloId: string,
  capituloIdx: number,
  posicionSegundos: number,
): Promise<void> {
  const progreso: ProgresoAudiolibro = {
    tituloId,
    capituloIdx,
    posicionSegundos,
    actualizadoEn: Date.now(),
  };
  await AsyncStorage.setItem(STORAGE_KEY_PREFIX + tituloId, JSON.stringify(progreso));
}

export async function clearProgreso(tituloId: string): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY_PREFIX + tituloId);
}

export const NOMBRE_LIBRO: Record<string, string> = {
  el_principito: 'El Principito',
};

export function progresoParaPrompt(tituloId: string, progreso: ProgresoAudiolibro | null, capitulos: Capitulo[]): string {
  if (!progreso) return '';
  const cap = capitulos.find(c => c.idx === progreso.capituloIdx);
  if (!cap) return '';
  const mins = Math.floor(progreso.posicionSegundos / 60);
  const segs = Math.floor(progreso.posicionSegundos % 60);
  const desc = `Capítulo ${progreso.capituloIdx}: ${cap.titulo} (${mins}:${String(segs).padStart(2, '0')})`;
  return `Progreso audiolibro: ${NOMBRE_LIBRO[tituloId] ?? tituloId} — último capítulo escuchado: ${desc}.`;
}
