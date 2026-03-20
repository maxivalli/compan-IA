// ── Juegos curados para adultos mayores ───────────────────────────────────────
// Claude usa este contenido cuando el usuario pide jugar, en vez de improvisar.

export type Juego = {
  tipo: 'adivinanza' | 'trivia' | 'refranes' | 'memoria' | 'calculo' | 'trabalenguas';
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
  { tipo: 'memoria', pregunta: 'Guardá estas tres palabras: TREN, NARANJA, ZAPATO. Ahora, ¿me contás qué hiciste ayer?', respuesta: 'TREN, NARANJA, ZAPATO', pista: 'Un medio de transporte, una fruta y algo que se usa en el pie' },
  { tipo: 'memoria', pregunta: 'Prestá atención: DOMINGO, PUENTE, GATO, GUITARRA. Mientras las recordás, ¿quién fue la última persona que te llamó por teléfono?', respuesta: 'DOMINGO, PUENTE, GATO, GUITARRA', pista: 'Un día, una construcción, un animal y un instrumento' },
  { tipo: 'memoria', pregunta: 'Voy a decirte una dirección inventada: Calle Las Flores 247, piso 3. Ahora contame, ¿tenés algún plan para esta semana?', respuesta: 'Calle Las Flores 247, piso 3', pista: 'Una calle con flores, número 247, tercer piso' },
];

const CALCULOS: Juego[] = [
  { tipo: 'calculo', pregunta: '¿Cuánto es 25 más 37?', respuesta: '62', pista: '25 + 37 = 60 + 2' },
  { tipo: 'calculo', pregunta: '¿Cuánto es 100 menos 43?', respuesta: '57', pista: 'De 100 quitás 43: primero quitás 40, después 3' },
  { tipo: 'calculo', pregunta: '¿Cuánto es 8 por 7?', respuesta: '56', pista: '8 × 7 es lo mismo que 8 × 5 más 8 × 2' },
  { tipo: 'calculo', pregunta: 'Si un kilo de tomates cuesta 500 pesos y comprás kilo y medio, ¿cuánto pagás?', respuesta: '750 pesos', pista: '500 por 1 kilo más 250 por el medio kilo' },
  { tipo: 'calculo', pregunta: 'Tenés 200 pesos. Comprás pan por 80 pesos y leche por 65 pesos. ¿Cuánto te queda?', respuesta: '55 pesos', pista: '80 + 65 = 145; 200 − 145 = 55' },
  { tipo: 'calculo', pregunta: 'Hoy es lunes. ¿Qué día será dentro de 10 días?', respuesta: 'Jueves', pista: 'Contá de lunes: martes, miércoles... siete días es el próximo lunes, más tres días más' },
  { tipo: 'calculo', pregunta: '¿Cuánto es 15 por 4?', respuesta: '60', pista: '15 × 4: primero 10 × 4 = 40, después 5 × 4 = 20; total 60' },
  { tipo: 'calculo', pregunta: 'Si una receta dice que tarda 45 minutos y la metiste al horno a las 3 de la tarde, ¿a qué hora estará lista?', respuesta: 'A las 3 y 45, o sea a las 3:45', pista: '3:00 más 45 minutos' },
];

const TRABALENGUAS: Juego[] = [
  { tipo: 'trabalenguas', pregunta: 'A ver si podés repetir esto tres veces seguidas, rápido: "Tres tristes tigres tragaban trigo en un trigal."', respuesta: 'Tres tristes tigres tragaban trigo en un trigal.', pista: 'Arrancá despacio y luego acelerá' },
  { tipo: 'trabalenguas', pregunta: '¿Podés decir esto sin trabarte? "El cielo está enladrillado, ¿quién lo desenladrillará? El desenladrillador que lo desenladrille, buen desenladrillador será."', respuesta: 'El cielo está enladrillado...', pista: 'Hacé una pausa antes de "desenladrillador"' },
  { tipo: 'trabalenguas', pregunta: 'Repetí esto dos veces sin parar: "Poquito a poquito Paquito empaca poquitas copitas en pocos paquetes."', respuesta: 'Poquito a poquito Paquito empaca poquitas copitas en pocos paquetes.', pista: 'Cuidado con las "p" y las "qu"' },
  { tipo: 'trabalenguas', pregunta: 'Este es cortito pero engañoso, decilo tres veces rápido: "Pepe Pecas pica papas con un pico. Con un pico pica papas Pepe Pecas."', respuesta: 'Pepe Pecas pica papas con un pico...', pista: 'Las "p" se te pueden cruzar con las "c"' },
  { tipo: 'trabalenguas', pregunta: '¿Te animás a decir esto? "Compadre, cómprame coco. Compadre, coco no compro, porque el que poco coco come, poco coco compra."', respuesta: 'Compadre, cómprame coco...', pista: 'Separá bien el "co" de cada palabra' },
];

// ── Selección aleatoria ────────────────────────────────────────────────────────

const TODOS = [...ADIVINANZAS, ...TRIVIA, ...REFRANES, ...MEMORIA, ...CALCULOS, ...TRABALENGUAS];

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

// ── Chistes curados ───────────────────────────────────────────────────────────
// Humor rioplatense limpio, con punchline claro. Apropiado para adultos mayores.

type Chiste = { setup: string; remate: string };

const CHISTES: Chiste[] = [
  {
    setup: 'Un argentino le cuenta a su amigo sobre su viaje al Vaticano: "¡Che, fíjate cómo será de grande mi fama, que salí al balcón y la gente abajo preguntaba:"',
    remate: '"¿Quién es el señor de blanco que está al lado de nuestro compatriota?"',
  },
  {
    setup: '— ¿Cómo empieza un argentino una carta de amor?',
    remate: '"Ya sé que soy maravilloso, brillante y hermoso, pero vos tampoco estás tan mal..."',
  },
  {
    setup: '— ¿Cómo reconocer a un argentino en un velorio?',
    remate: '— Es el que se quiere meter en el cajón para ser el centro de atención.',
  },
  {
    setup: '— ¿En qué se diferencia un argentino de un rayo?',
    remate: '— En que el rayo cae, y el argentino te explica cómo tendría que haber caído.',
  },
  {
    setup: '— ¿Por qué los argentinos no usan paracaídas?',
    remate: '— Porque de todas maneras, siempre caen re bien.',
  },
  {
    setup: 'Un niño le dice a su papá: "Papá, cuando sea grande quiero ser exactamente como vos." El padre, emocionado: "¡Qué orgullo, hijo! ¿Por qué?"',
    remate: '"¡Para poder tener un hijo como yo!"',
  },
  {
    setup: 'Un abuelo le dice a su nieto: "En mis tiempos, con 10 pesos volvía del almacén con pan, leche, huevos, queso y chocolate." El nieto, asombrado: "¡Guau, abuelo! ¿Y ahora se puede?"',
    remate: '"Ahora es imposible... ¡hay demasiadas cámaras de seguridad!"',
  },
  {
    setup: 'Van dos abuelos caminando y uno le dice: "¡Che, cómo sopla el viento!" El otro: "¡Qué va! ¡Es jueves!"',
    remate: '"¡Ah, yo también tengo sed! ¡Vamos a tomar un café!"',
  },
  {
    setup: 'Una abuela le pregunta a su nieto: "Hijito, ¿cómo se llama el alemán ese que me esconde las llaves y los anteojos?"',
    remate: '"Alzheimer, abuela, Alzheimer."',
  },
  {
    setup: '— Abuelo, ¿sabés qué es un iPad?',
    remate: '"No sé, hijo... yo soy de la época en que \'¡Ay, pad!\' era lo que decíamos cuando nos pisaban el pie."',
  },
  {
    setup: 'Un abuelito entra a la farmacia: "Señor, ¿tienen pastillas para la memoria?" "Sí, claro." "¡Perfecto! Deme una caja y un kilo de pan." "Pero señor, esto es una farmacia, no una panadería."',
    remate: '"¡Ah, tenés razón! Entonces dame solo las pastillas, que el pan ya lo compré en la ferretería."',
  },
  {
    setup: '— ¿Por qué los gallegos ponen una escalera a la orilla del mar?',
    remate: '— Para que suba la marea.',
  },
  {
    setup: '— ¿Cómo te das cuenta de que un gallego estuvo usando la computadora?',
    remate: '— Porque la pantalla está llena de corrector líquido.',
  },
  {
    setup: 'Le dice un gallego a otro: "Oye Manolo, ¿tú sabes por qué los buzos se tiran hacia atrás para entrar al mar?"',
    remate: '"¡Hombre, Venancio, es de lógica! ¡Porque si se tiran hacia adelante caen adentro del bote!"',
  },
  {
    setup: '— ¿Qué hace un gallego corriendo a toda velocidad alrededor de la facultad?',
    remate: '— Una carrera universitaria.',
  },
];

const chistesContados = new Set<string>();

export function obtenerChiste(): Chiste {
  const disponibles = CHISTES.filter(c => !chistesContados.has(c.setup));
  const pool = disponibles.length > 0 ? disponibles : CHISTES;
  const chiste = pool[Math.floor(Math.random() * pool.length)];
  chistesContados.add(chiste.setup);
  if (chistesContados.size > 10) {
    const primero = chistesContados.values().next().value;
    if (primero) chistesContados.delete(primero);
  }
  return chiste;
}

export function formatearChisteParaClaude(chiste: Chiste): string {
  return `[CHISTE CURADO — contá exactamente este chiste, con tu estilo cálido y natural]
Setup: ${chiste.setup}
Remate: ${chiste.remate}
Hacé una pausa natural entre el setup y el remate. Podés agregar una reacción breve después.`;
}
