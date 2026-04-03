/**
 * tateti.ts — Lógica pura del juego Ta-te-ti (Tic-tac-toe).
 * Sin dependencias de React Native.
 */

export type Celda = 'X' | 'O' | null;
export type Tablero = Celda[]; // 9 celdas, índices 0-8

/**
 * Retorna un tablero vacío de 9 celdas.
 */
export function tableroInicial(): Tablero {
  return Array(9).fill(null) as Tablero;
}

const LINEAS_GANADORAS: [number, number, number][] = [
  [0, 1, 2], // fila superior
  [3, 4, 5], // fila media
  [6, 7, 8], // fila inferior
  [0, 3, 6], // columna izquierda
  [1, 4, 7], // columna media
  [2, 5, 8], // columna derecha
  [0, 4, 8], // diagonal principal
  [2, 4, 6], // diagonal inversa
];

/**
 * Devuelve 'X', 'O', 'empate' o null si el juego no terminó.
 */
export function verificarGanador(t: Tablero): 'X' | 'O' | 'empate' | null {
  for (const [a, b, c] of LINEAS_GANADORAS) {
    if (t[a] && t[a] === t[b] && t[a] === t[c]) {
      return t[a] as 'X' | 'O';
    }
  }
  if (t.every((c) => c !== null)) return 'empate';
  return null;
}

/**
 * Devuelve los índices de la línea ganadora, o null si no hay.
 */
export function lineaGanadora(t: Tablero): number[] | null {
  for (const linea of LINEAS_GANADORAS) {
    const [a, b, c] = linea;
    if (t[a] && t[a] === t[b] && t[a] === t[c]) {
      return [...linea];
    }
  }
  return null;
}

function celdosLibres(t: Tablero): number[] {
  return t.reduce<number[]>((acc, celda, i) => {
    if (celda === null) acc.push(i);
    return acc;
  }, []);
}

function puedeGanar(t: Tablero, jugador: 'X' | 'O'): number | null {
  for (const [a, b, c] of LINEAS_GANADORAS) {
    const celdas = [t[a], t[b], t[c]];
    const propias = celdas.filter((c) => c === jugador).length;
    const vacias  = celdas.filter((c) => c === null).length;
    if (propias === 2 && vacias === 1) {
      const idx = [a, b, c].find((i) => t[i] === null);
      if (idx !== undefined) return idx;
    }
  }
  return null;
}

/**
 * Calcula el mejor movimiento para la IA (juega como 'O').
 *
 * Estrategia:
 * - 35% de las veces elige al azar (para que el usuario pueda ganar)
 * - 65% de las veces: intenta ganar → bloquear → centro → esquinas → bordes
 */
export function calcularMovimientoIA(t: Tablero): number {
  const libres = celdosLibres(t);
  if (libres.length === 0) return -1;

  // 35% de las veces: movimiento aleatorio
  if (Math.random() < 0.35) {
    return libres[Math.floor(Math.random() * libres.length)];
  }

  // 1) ¿Puede ganar la IA?
  const ganar = puedeGanar(t, 'O');
  if (ganar !== null) return ganar;

  // 2) ¿Tiene que bloquear al usuario?
  const bloquear = puedeGanar(t, 'X');
  if (bloquear !== null) return bloquear;

  // 3) Centro
  if (t[4] === null) return 4;

  // 4) Esquinas libres
  const esquinas = [0, 2, 6, 8].filter((i) => t[i] === null);
  if (esquinas.length > 0) {
    return esquinas[Math.floor(Math.random() * esquinas.length)];
  }

  // 5) Bordes libres
  const bordes = [1, 3, 5, 7].filter((i) => t[i] === null);
  if (bordes.length > 0) {
    return bordes[Math.floor(Math.random() * bordes.length)];
  }

  // Fallback (no debería llegar acá)
  return libres[0];
}
