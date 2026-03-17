// ── Juegos curados para adultos mayores ───────────────────────────────────────
// Claude usa este contenido cuando el usuario pide jugar, en vez de improvisar.

export type Juego = {
  tipo: 'adivinanza' | 'trivia' | 'refranes' | 'memoria';
  pregunta: string;
  respuesta: string;
  pista?: string;
};

const ADIVINANZAS: Juego[] = [
  { tipo: 'adivinanza', pregunta: 'Tengo ciudades, pero no casas. Tengo montañas, pero no árboles. Tengo agua, pero no peces. ¿Qué soy?', respuesta: 'Un mapa', pista: 'La encontrás en los libros de geografía' },
  { tipo: 'adivinanza', pregunta: 'Cuanto más grande, menos ves. ¿Qué es?', respuesta: 'La oscuridad', pista: 'Tiene que ver con la luz' },
  { tipo: 'adivinanza', pregunta: 'Soy redondo como la luna, blanco como la nieve, dulce como la miel y amargo a la vez. ¿Qué soy?', respuesta: 'El coco', pista: 'Es una fruta tropical' },
  { tipo: 'adivinanza', pregunta: 'Tengo manos pero no puedo aplaudir. ¿Qué soy?', respuesta: 'Un reloj', pista: 'Mirás hacia mí para saber qué hora es' },
  { tipo: 'adivinanza', pregunta: 'Soy liviana como una pluma pero ni el hombre más fuerte del mundo puede sostenerme más de unos minutos. ¿Qué soy?', respuesta: 'La respiración', pista: 'La necesitás para vivir' },
  { tipo: 'adivinanza', pregunta: 'Entro por una puerta y salgo por muchas. ¿Qué soy?', respuesta: 'El agua de la ducha', pista: 'Tiene que ver con bañarse' },
  { tipo: 'adivinanza', pregunta: 'Tiene dientes pero no muerde. ¿Qué es?', respuesta: 'Un peine', pista: 'Lo usás todos los días' },
  { tipo: 'adivinanza', pregunta: 'Una señora muy aseñorada, siempre va en coche y siempre está mojada. ¿Quién es?', respuesta: 'La lengua', pista: 'La tenés adentro de la boca' },
  { tipo: 'adivinanza', pregunta: 'Cuanto más me secas, más húmedo me pongo. ¿Qué soy?', respuesta: 'Una toalla', pista: 'La usás después de bañarte' },
  { tipo: 'adivinanza', pregunta: 'Soy alta cuando soy joven y baja cuando soy vieja. ¿Qué soy?', respuesta: 'Una vela', pista: 'Doy luz cuando no hay electricidad' },
  { tipo: 'adivinanza', pregunta: 'Tengo ojos y no veo, tengo agua y no me siento. ¿Qué soy?', respuesta: 'La papa', pista: 'Se come y se usa mucho en la cocina' },
  { tipo: 'adivinanza', pregunta: 'Blanca por dentro, verde por fuera. Si quieres que te lo diga, espera. ¿Qué es?', respuesta: 'La pera', pista: 'Es una fruta' },
];

const TRIVIA: Juego[] = [
  { tipo: 'trivia', pregunta: '¿En qué año llegó el hombre a la luna?', respuesta: '1969', pista: 'Fue en los años 60' },
  { tipo: 'trivia', pregunta: '¿Cuál es el río más largo de Argentina?', respuesta: 'El río Paraná', pista: 'Pasa por el litoral argentino' },
  { tipo: 'trivia', pregunta: '¿Cómo se llama la ópera más famosa de Carlos Gardel?', respuesta: 'Gardel era cantor de tango, no de ópera. Su canción más famosa es "El día que me quieras"', pista: 'Gardel cantaba tango' },
  { tipo: 'trivia', pregunta: '¿De qué país es originario el tango?', respuesta: 'Argentina y Uruguay lo comparten como origen', pista: 'Nació en el Río de la Plata' },
  { tipo: 'trivia', pregunta: '¿Cuántos planetas tiene nuestro sistema solar?', respuesta: 'Ocho planetas', pista: 'Plutón ya no cuenta como planeta desde 2006' },
  { tipo: 'trivia', pregunta: '¿Cuál es el animal terrestre más rápido del mundo?', respuesta: 'El guepardo', pista: 'Es un felino africano' },
  { tipo: 'trivia', pregunta: '¿En qué año se declaró la independencia de Argentina?', respuesta: '1816, el 9 de julio', pista: 'Es feriado nacional' },
  { tipo: 'trivia', pregunta: '¿Cuántos colores tiene el arcoíris?', respuesta: 'Siete: rojo, naranja, amarillo, verde, azul, añil y violeta', pista: 'Podés contarlos la próxima vez que llueva' },
  { tipo: 'trivia', pregunta: '¿Cuál es la capital de Francia?', respuesta: 'París', pista: 'Tiene una torre muy famosa' },
  { tipo: 'trivia', pregunta: '¿Qué escritora argentina ganó el Premio Nobel de Literatura?', respuesta: 'Ninguna mujer argentina ganó el Nobel de Literatura. El único argentino fue Jorge Luis Borges... aunque en realidad nunca lo ganó. El Nobel aún no fue para Argentina.', pista: 'Es una pregunta trampa' },
  { tipo: 'trivia', pregunta: '¿Cuántos lados tiene un hexágono?', respuesta: 'Seis lados', pista: 'Como un panal de abejas' },
  { tipo: 'trivia', pregunta: '¿Cuál es el océano más grande del mundo?', respuesta: 'El océano Pacífico', pista: 'Está entre América y Asia' },
  { tipo: 'trivia', pregunta: '¿En qué idioma se escribe el Antiguo Testamento de la Biblia?', respuesta: 'En hebreo principalmente', pista: 'Es un idioma muy antiguo del Medio Oriente' },
  { tipo: 'trivia', pregunta: '¿Cuál es la flor nacional de Argentina?', respuesta: 'El ceibo', pista: 'Tiene flores rojas' },
];

const REFRANES: Juego[] = [
  { tipo: 'refranes', pregunta: '¿Cómo termina este refrán? "A caballo regalado..."', respuesta: '"...no se le miran los dientes"', pista: 'Tiene que ver con no quejarse de lo que te dan' },
  { tipo: 'refranes', pregunta: '¿Cómo termina este refrán? "Más vale tarde..."', respuesta: '"...que nunca"', pista: 'Habla de que siempre hay tiempo' },
  { tipo: 'refranes', pregunta: '¿Cómo termina este refrán? "En boca cerrada..."', respuesta: '"...no entran moscas"', pista: 'Aconseja hablar menos' },
  { tipo: 'refranes', pregunta: '¿Cómo termina este refrán? "No hay mal..."', respuesta: '"...que por bien no venga"', pista: 'Habla de los problemas que traen cosas buenas' },
  { tipo: 'refranes', pregunta: '¿Cómo termina este refrán? "Dime con quién andás..."', respuesta: '"...y te diré quién sos"', pista: 'Habla de las amistades' },
  { tipo: 'refranes', pregunta: '¿Cómo termina este refrán? "Al que madruga..."', respuesta: '"...Dios lo ayuda"', pista: 'Habla de levantarse temprano' },
  { tipo: 'refranes', pregunta: '¿Cómo termina este refrán? "Camarón que se duerme..."', respuesta: '"...se lo lleva la corriente"', pista: 'Habla de estar atento' },
  { tipo: 'refranes', pregunta: '¿Cómo termina este refrán? "Ojos que no ven..."', respuesta: '"...corazón que no siente"', pista: 'Habla de lo que no se ve no duele' },
];

const MEMORIA: Juego[] = [
  { tipo: 'memoria', pregunta: 'Te voy a decir tres palabras y después te las voy a preguntar. ¿Lista? Las palabras son: MANZANA, SILLA, LUNA. Ahora contame, ¿qué desayunaste hoy?', respuesta: 'MANZANA, SILLA, LUNA', pista: 'Una fruta, un mueble y algo del cielo' },
  { tipo: 'memoria', pregunta: 'Memorizá estas cuatro palabras: PERRO, CASA, LIBRO, VERDE. Ahora contame un poco, ¿cómo está el tiempo hoy?', respuesta: 'PERRO, CASA, LIBRO, VERDE', pista: 'Un animal, un lugar, un objeto y un color' },
  { tipo: 'memoria', pregunta: 'Escuchá bien: ROSA, CINCO, VENTANA, ALEGRÍA. Ahora, ¿cuál es tu canción favorita?', respuesta: 'ROSA, CINCO, VENTANA, ALEGRÍA', pista: 'Una flor, un número, parte de la casa y un sentimiento' },
];

// ── Selección aleatoria ────────────────────────────────────────────────────────

const TODOS = [...ADIVINANZAS, ...TRIVIA, ...REFRANES, ...MEMORIA];

const jugadosRecientes = new Set<string>();

export function obtenerJuego(tipo?: 'adivinanza' | 'trivia' | 'refranes' | 'memoria'): Juego {
  const lista = tipo ? TODOS.filter(j => j.tipo === tipo) : TODOS;
  const disponibles = lista.filter(j => !jugadosRecientes.has(j.pregunta));
  const pool = disponibles.length > 0 ? disponibles : lista;
  const juego = pool[Math.floor(Math.random() * pool.length)];

  jugadosRecientes.add(juego.pregunta);
  if (jugadosRecientes.size > 20) {
    const primera = jugadosRecientes.values().next().value;
    if (primera) jugadosRecientes.delete(primera);
  }

  return juego;
}

export function formatearJuegoParaClaude(juego: Juego): string {
  return `[JUEGO CURADO — usá exactamente este contenido]
Tipo: ${juego.tipo}
Pregunta: ${juego.pregunta}
Respuesta correcta (no la digas todavía): ${juego.respuesta}
${juego.pista ? `Pista disponible si la pide: ${juego.pista}` : ''}
Presentá la pregunta de forma cálida, esperá la respuesta y luego confirmá si es correcta.`;
}
