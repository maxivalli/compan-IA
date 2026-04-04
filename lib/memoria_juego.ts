// Lógica pura del juego de memoria (3×3, 4 conjuntos visuales)

export type TileDesign = {
  id:      number;
  emoji:   string;
  bgColor: string;
  label:   string; // Rosita dice "Encontrá [label]"
};

// ── 4 conjuntos de fichas ─────────────────────────────────────────────────────
const SETS: TileDesign[][] = [
  // Set 0 – Formas y colores
  [
    { id: 0, emoji: '⭐', bgColor: '#fbbf24', label: 'la estrella amarilla' },
    { id: 1, emoji: '💙', bgColor: '#93c5fd', label: 'el corazón azul' },
    { id: 2, emoji: '❤️', bgColor: '#fca5a5', label: 'el corazón rojo' },
    { id: 3, emoji: '💚', bgColor: '#86efac', label: 'el corazón verde' },
    { id: 4, emoji: '🔷', bgColor: '#c4b5fd', label: 'el rombo' },
    { id: 5, emoji: '🌙', bgColor: '#a5b4fc', label: 'la luna' },
    { id: 6, emoji: '🔶', bgColor: '#fdba74', label: 'el diamante naranja' },
    { id: 7, emoji: '🌟', bgColor: '#67e8f9', label: 'la estrella brillante' },
    { id: 8, emoji: '💜', bgColor: '#f0abfc', label: 'el corazón violeta' },
  ],
  // Set 1 – Animales
  [
    { id: 0, emoji: '🐱', bgColor: '#fde68a', label: 'el gato' },
    { id: 1, emoji: '🐶', bgColor: '#fed7aa', label: 'el perro' },
    { id: 2, emoji: '🐻', bgColor: '#bbf7d0', label: 'el oso' },
    { id: 3, emoji: '🐰', bgColor: '#fecdd3', label: 'el conejo' },
    { id: 4, emoji: '🦁', bgColor: '#fef3c7', label: 'el león' },
    { id: 5, emoji: '🐸', bgColor: '#a7f3d0', label: 'la rana' },
    { id: 6, emoji: '🦊', bgColor: '#fdba74', label: 'el zorro' },
    { id: 7, emoji: '🐘', bgColor: '#ddd6fe', label: 'el elefante' },
    { id: 8, emoji: '🦋', bgColor: '#f5d0fe', label: 'la mariposa' },
  ],
  // Set 2 – Frutas
  [
    { id: 0, emoji: '🍎', bgColor: '#fecaca', label: 'la manzana' },
    { id: 1, emoji: '🍋', bgColor: '#fef08a', label: 'el limón' },
    { id: 2, emoji: '🍇', bgColor: '#e9d5ff', label: 'las uvas' },
    { id: 3, emoji: '🍊', bgColor: '#fed7aa', label: 'la naranja' },
    { id: 4, emoji: '🍓', bgColor: '#fecdd3', label: 'la frutilla' },
    { id: 5, emoji: '🍉', bgColor: '#bbf7d0', label: 'la sandía' },
    { id: 6, emoji: '🫐', bgColor: '#bfdbfe', label: 'los arándanos' },
    { id: 7, emoji: '🍑', bgColor: '#ffedd5', label: 'el durazno' },
    { id: 8, emoji: '🥝', bgColor: '#d9f99d', label: 'el kiwi' },
  ],
  // Set 3 – Objetos
  [
    { id: 0, emoji: '⚽', bgColor: '#e2e8f0', label: 'la pelota' },
    { id: 1, emoji: '🎈', bgColor: '#fecaca', label: 'el globo' },
    { id: 2, emoji: '🎲', bgColor: '#bfdbfe', label: 'el dado' },
    { id: 3, emoji: '🎯', bgColor: '#fecdd3', label: 'la diana' },
    { id: 4, emoji: '🎸', bgColor: '#fef3c7', label: 'la guitarra' },
    { id: 5, emoji: '🌈', bgColor: '#bae6fd', label: 'el arcoíris' },
    { id: 6, emoji: '🔑', bgColor: '#fde68a', label: 'la llave' },
    { id: 7, emoji: '🎀', bgColor: '#fce7f3', label: 'el moño' },
    { id: 8, emoji: '🪄', bgColor: '#ede9fe', label: 'la varita' },
  ],
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Tipos públicos ────────────────────────────────────────────────────────────
export type PlacedTile = {
  design:  TileDesign;
  gridPos: number; // 0-8
};

export type MemoriaState = {
  tiles:         PlacedTile[];
  askedOrder:    number[]; // índices 0-8 en tiles[], orden aleatorio de pregunta
  currentAskIdx: number;   // puntero dentro de askedOrder
  score:         number;
  setIndex:      number;
};

// ── API pública ───────────────────────────────────────────────────────────────
export function crearJuego(setIndex: number): MemoriaState {
  const set          = SETS[setIndex % SETS.length];
  const gridPositions = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const tiles: PlacedTile[] = set.map((design, i) => ({
    design,
    gridPos: gridPositions[i],
  }));
  return {
    tiles,
    askedOrder:    shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]),
    currentAskIdx: 0,
    score:         0,
    setIndex,
  };
}

export function getCurrentTarget(state: MemoriaState): PlacedTile | null {
  if (state.currentAskIdx >= state.askedOrder.length) return null;
  return state.tiles[state.askedOrder[state.currentAskIdx]];
}

export function getTileAtGridPos(state: MemoriaState, pos: number): PlacedTile | undefined {
  return state.tiles.find(t => t.gridPos === pos);
}

/** Todos los labels posibles de todos los conjuntos (para pre-cachear TTS) */
export function getAllLabels(): string[] {
  return SETS.flatMap(set => set.map(t => t.label));
}

export const NUM_SETS = SETS.length;
