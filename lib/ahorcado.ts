/**
 * ahorcado.ts — Lógica pura del juego Ahorcado.
 * Palabras en español argentino, sin acentos, aptas para reconocimiento de voz.
 */

// ── Lista de palabras ───────────────────────────────────────────────────────────

interface PalabraEntry {
  palabra: string;
  pista: string;
}

const PALABRAS: PalabraEntry[] = [
  // Animales
  { palabra: 'GATO',      pista: 'un animal doméstico que maúlla' },
  { palabra: 'PERRO',     pista: 'el mejor amigo del hombre' },
  { palabra: 'CABALLO',   pista: 'un animal que se monta' },
  { palabra: 'VACA',      pista: 'animal que da leche' },
  { palabra: 'GALLINA',   pista: 'ave que pone huevos' },
  { palabra: 'PALOMA',    pista: 'ave que simboliza la paz' },
  { palabra: 'TORTUGA',   pista: 'animal muy lento con caparazón' },
  { palabra: 'CONEJO',    pista: 'animal de orejas largas' },
  { palabra: 'PINGUINO',  pista: 'ave que no vuela y vive en el frío' },
  { palabra: 'ELEFANTE',  pista: 'el animal terrestre más grande' },
  { palabra: 'JIRAFA',    pista: 'animal con cuello muy largo' },
  { palabra: 'DELFIN',    pista: 'mamífero marino muy inteligente' },
  { palabra: 'TIGRE',     pista: 'felino grande con rayas' },
  { palabra: 'LEON',      pista: 'el rey de la selva' },
  { palabra: 'HORMIGA',   pista: 'insecto muy trabajador y pequeño' },
  // Comida
  { palabra: 'ASADO',     pista: 'comida típica argentina a la parrilla' },
  { palabra: 'EMPANADA',  pista: 'masa rellena típica argentina' },
  { palabra: 'MILANESA',  pista: 'carne rebozada y frita' },
  { palabra: 'CHORIPAN',  pista: 'chorizo en pan, muy popular' },
  { palabra: 'ALFAJOR',   pista: 'dulce con dulce de leche' },
  { palabra: 'MEDIALUNAS', pista: 'facturas en forma de media luna' },
  { palabra: 'FACTURAS',  pista: 'masas dulces de la panadería' },
  { palabra: 'DULCE',     pista: 'algo con mucho azúcar' },
  { palabra: 'TORTA',     pista: 'postre de cumpleaños' },
  { palabra: 'PIZZA',     pista: 'masa con tomate y queso' },
  { palabra: 'FIDEOS',    pista: 'pasta larga italiana' },
  { palabra: 'HELADO',    pista: 'postre frío y dulce' },
  { palabra: 'NARANJA',   pista: 'fruta cítrica de color naranja' },
  { palabra: 'BANANA',    pista: 'fruta amarilla y larga' },
  { palabra: 'MANZANA',   pista: 'fruta roja o verde muy común' },
  // Colores
  { palabra: 'ROJO',      pista: 'el color de la sangre' },
  { palabra: 'AZUL',      pista: 'el color del cielo despejado' },
  { palabra: 'VERDE',     pista: 'el color del pasto' },
  { palabra: 'AMARILLO',  pista: 'el color del sol' },
  { palabra: 'VIOLETA',   pista: 'mezcla de azul y rojo' },
  { palabra: 'CELESTE',   pista: 'el color de la bandera argentina' },
  { palabra: 'BLANCO',    pista: 'el color de la nieve' },
  { palabra: 'NEGRO',     pista: 'el color más oscuro' },
  // Partes del cuerpo
  { palabra: 'CABEZA',    pista: 'la parte más alta del cuerpo' },
  { palabra: 'MANO',      pista: 'tiene cinco dedos' },
  { palabra: 'NARIZ',     pista: 'sirve para oler' },
  { palabra: 'BOCA',      pista: 'sirve para comer y hablar' },
  { palabra: 'OREJA',     pista: 'sirve para escuchar' },
  { palabra: 'RODILLA',   pista: 'articulación de la pierna' },
  { palabra: 'CODO',      pista: 'articulación del brazo' },
  { palabra: 'ESPALDA',   pista: 'la parte de atrás del torso' },
  { palabra: 'DEDO',      pista: 'hay cinco en cada mano' },
  // Naturaleza
  { palabra: 'ARBOL',     pista: 'planta grande con tronco y ramas' },
  { palabra: 'FLOR',      pista: 'parte colorida de las plantas' },
  { palabra: 'RIO',       pista: 'corriente de agua dulce' },
  { palabra: 'MONTAÑA',   pista: 'elevación grande del terreno' },
  { palabra: 'PLAYA',     pista: 'arena junto al mar' },
  { palabra: 'LLUVIA',    pista: 'agua que cae del cielo' },
  { palabra: 'NIEVE',     pista: 'agua congelada que cae en invierno' },
  { palabra: 'VIENTO',    pista: 'movimiento del aire' },
  { palabra: 'SOL',       pista: 'la estrella que nos da luz y calor' },
  { palabra: 'LUNA',      pista: 'el satélite de la Tierra' },
  // Casa y objetos del hogar
  { palabra: 'COCINA',    pista: 'habitación donde se cocina' },
  { palabra: 'CAMA',      pista: 'mueble para dormir' },
  { palabra: 'MESA',      pista: 'mueble con patas donde se come' },
  { palabra: 'SILLA',     pista: 'mueble para sentarse' },
  { palabra: 'PUERTA',    pista: 'sirve para entrar y salir' },
  { palabra: 'VENTANA',   pista: 'abertura en la pared con vidrio' },
  { palabra: 'ESPEJO',    pista: 'refleja la imagen' },
  { palabra: 'HELADERA',  pista: 'guarda la comida fría' },
  { palabra: 'LAMPARA',   pista: 'da luz en la casa' },
  { palabra: 'TELEFONO',  pista: 'sirve para llamar a alguien' },
];

// ── Tipos de estado ─────────────────────────────────────────────────────────────

export type EstadoAhorcado = {
  palabra: string;
  letrasAdivinadas: Set<string>;
  letrasErradas: Set<string>;
  pista: string;
};

// ── Funciones exportadas ────────────────────────────────────────────────────────

/**
 * Elige una palabra aleatoria de la lista.
 */
export function palabraAleatoria(): { palabra: string; pista: string } {
  const entry = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
  return { palabra: entry.palabra, pista: entry.pista };
}

/**
 * Crea el estado inicial del juego con una palabra aleatoria.
 */
export function estadoInicial(): EstadoAhorcado {
  const { palabra, pista } = palabraAleatoria();
  return {
    palabra,
    pista,
    letrasAdivinadas: new Set<string>(),
    letrasErradas: new Set<string>(),
  };
}

/**
 * Procesa una letra ingresada. Devuelve un nuevo estado (inmutable).
 */
export function procesarLetra(estado: EstadoAhorcado, letra: string): EstadoAhorcado {
  const letraNorm = letra.toUpperCase();
  // Si ya fue ingresada, no hacer nada
  if (estado.letrasAdivinadas.has(letraNorm) || estado.letrasErradas.has(letraNorm)) {
    return estado;
  }
  if (estado.palabra.includes(letraNorm)) {
    return {
      ...estado,
      letrasAdivinadas: new Set([...estado.letrasAdivinadas, letraNorm]),
    };
  } else {
    return {
      ...estado,
      letrasErradas: new Set([...estado.letrasErradas, letraNorm]),
    };
  }
}

/**
 * Devuelve true si todas las letras de la palabra fueron adivinadas.
 */
export function estaGanado(estado: EstadoAhorcado): boolean {
  const palabraLimpia = estado.palabra.replace(/\s+/g, '').trim();
  return [...palabraLimpia].every((l) => estado.letrasAdivinadas.has(l));
}

/**
 * Devuelve true si se cometieron 6 o más errores (juego perdido).
 */
export function estaPerdido(estado: EstadoAhorcado): boolean {
  return estado.letrasErradas.size >= 6;
}

/**
 * Devuelve la palabra con máscaras para las letras no adivinadas.
 * Ejemplo: "_ A _ _ _"
 */
export function palabraConMascaras(estado: EstadoAhorcado): string {
  return [...estado.palabra]
    .map((l) => (estado.letrasAdivinadas.has(l) ? l : '_'))
    .join(' ');
}

// ── Mapa fonético de nombres de letras en español ────────────────────────────

const NOMBRES_FONETIKOS: Record<string, string> = {
  'a':          'A',
  'be':         'B',
  'beh':        'B',
  've grande':  'B',
  've larga':   'B',
  'be larga':   'B',
  'ce':         'C',
  'se':         'C',
  'ceh':        'C',
  'de':         'D',
  'deh':        'D',
  'e':          'E',
  'efe':        'F',
  'ef':         'F',
  'ge':         'G',
  'geh':        'G',
  'je':         'G',
  'hache':      'H',
  'ache':       'H',
  'i':          'I',
  'jota':       'J',
  'ka':         'K',
  'ele':        'L',
  'el':         'L',
  'eme':        'M',
  'em':         'M',
  'ene':        'N',
  'en':         'N',
  'eñe':        'Ñ',
  'o':          'O',
  'pe':         'P',
  'peh':        'P',
  'cu':         'Q',
  'qu':         'Q',
  'erre':       'R',
  'ere':        'R',
  'er':         'R',
  'ese':        'S',
  'es':         'S',
  'te':         'T',
  'teh':        'T',
  'u':          'U',
  'uve':        'V',
  've':         'V',
  'veh':        'V',
  've corta':   'V',
  've baja':    'V',
  'be corta':   'V',
  'doble uve':  'W',
  'doble ve':   'W',
  'equis':      'X',
  'ex':         'X',
  'ye':         'Y',
  'i griega':   'Y',
  'zeta':       'Z',
  'ceta':       'Z',
};

/**
 * Intenta parsear el texto reconocido por voz como una letra.
 *
 * Acepta:
 * - "la letra A" / "letra A"
 * - "A" (letra sola)
 * - "eme" (=M), "ese" (=S), "pe" (=P), etc.
 *
 * Devuelve la letra en mayúscula, o null si no se pudo parsear.
 */
export function parsearLetraDesdeVoz(texto: string): string | null {
  if (!texto) return null;

  // 1. Limpieza total de acentos y puntuación
  let norm = texto.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  norm = norm.replace(/[.,:;¿?¡!"']/g, '');

  // 2. Reemplazos de dobles palabras fonéticas para evitar que el split las rompa
  norm = norm.replace(/be alta/g, 'b').replace(/be larga/g, 'b');
  norm = norm.replace(/ve corta/g, 'v').replace(/ve baja/g, 'v');
  norm = norm.replace(/doble ve/g, 'w').replace(/doble uve/g, 'w');
  norm = norm.replace(/i griega/g, 'y');

  // 3. Normalizar terminaciones 'h' inofensivas ("ah" -> "a", "eh" -> "e")
  norm = norm.replace(/\b([aeiou])h\b/g, '$1');

  // 4. Estrategia a prueba de balas: buscar marcha atrás
  // Dividimos la frase en palabras y buscamos desde la ÚLTIMA hasta la primera.
  // Es decir, si el usuario dice "Abu, pone por favor la letra P",
  // el bucle encontrará "p" (largo 1) o su nombre fonético.
  const palabras = norm.split(/\s+/);
  
  for (let i = palabras.length - 1; i >= 0; i--) {
    const p = palabras[i];
    if (!p) continue;

    // Caso A: Es exactamente 1 caracter (ej: "a", "p", "z")
    if (p.length === 1 && /[a-zñ]/.test(p)) {
      return p.toUpperCase();
    }

    // Caso B: Es un nombre fonético en el diccionario (ej: "jota", "eme", "ese")
    if (NOMBRES_FONETIKOS[p]) {
      return NOMBRES_FONETIKOS[p];
    }
  }

  return null;
}
