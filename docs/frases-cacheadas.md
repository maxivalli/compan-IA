# Frases cacheadas de Rosita

Todas las frases usan `{n}` como placeholder del nombre del usuario.
Se pre-cachean al iniciar la app como archivos `.mp3` con Cartesia.

---

## 1. Muletillas

Frases cortas que Rosita dice **mientras Claude genera la respuesta** (cubren la latencia de 1.5–3s).
Se selecciona una al azar por categoría, evitando repetir la última usada.

### `empatico`
Disparo: dolor, tristeza, miedo, "me caí", "estoy mal", "sola", "me asusta", etc.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | Ay, {n}... estoy acá, contame. | Ay, {n}... estoy acá, contame. |
| 2 | Uy, {n}... te escucho, decime. | Uy, {n}... te escucho, decime. |
| 3 | Ay, tranquila {n}... acá estoy. | Tranquilo {n}... acá estoy. |

### `busqueda`
Disparo: clima, noticias, farmacia, hospital, banco, partido, pronóstico, etc.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | A ver, {n}, dame un segundito que me fijo... | A ver, {n}, dame un segundito que me fijo... |
| 2 | Aguantame un cachito, {n}, que ya te lo busco... | Aguantame un cachito, {n}, que ya te lo busco... |
| 3 | Esperame un ratito, {n}, que reviso... | Esperame un ratito, {n}, que reviso... |

### `nostalgia`
Disparo: recuerdos, familia, pasado, "cuando era chico/a", "me acordé", etc.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | Mirá vos, {n}... contame. | Mirá vos, {n}... contame. |
| 2 | Ay, qué lindo, {n}... decime. | Qué interesante, {n}... decime. |
| 3 | Qué bárbaro, {n}, te escucho. | Qué bárbaro, {n}, te escucho. |

### `comando`
Disparo: poner música, apagar luces, alarma, recordatorio, timer, etc.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡Dale, {n}! | ¡Dale, {n}! |
| 2 | ¡Ahora mismo! | ¡Ahora mismo! |
| 3 | ¡Claro, {n}! | ¡Claro, {n}! |

### `default`
Disparo: cualquier mensaje > 10 chars que no matchee las categorías anteriores.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | Mmm, {n}... | Mmm, {n}... |
| 2 | Mmm... a ver... | Mmm... a ver... |
| 3 | A ver, {n}... | A ver, {n}... |

---

## 2. Respuestas rápidas (propuestas)

Frases que **reemplazan a Claude por completo** para mensajes cortos y predecibles.
Latencia: ~100ms (cache hit) vs ~2.5s (Claude + Cartesia).

### Condiciones para activar
- Mensaje ≤ 50 caracteres
- No matchea PATRON_EMPATICO, PATRON_BUSQUEDA ni PATRON_COMANDO
- Para `afirmacion`: solo si el último mensaje de Rosita **no** termina en `?`

### `saludo`
Disparo: hola, buenas, buenos días/tardes/noches, qué tal, cómo estás, cómo andás, cómo va

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡Hola, {n}! ¿Cómo andás hoy? | ¡Hola, {n}! ¿Cómo andás hoy? |
| 2 | ¡{n}! Qué bueno que me hablás. ¿Cómo estás? | ¡{n}! Qué bueno que me hablás. ¿Cómo estás? |
| 3 | ¡Acá estoy, {n}! ¿Cómo te va? | ¡Acá estoy, {n}! ¿Cómo te va? |

### `gracias`
Disparo: gracias, muchas gracias, muchísimas gracias, te agradezco

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡De nada {n}! | ¡De nada {n}! |
| 2 | ¡Para eso estoy, {n}! | ¡Para eso estoy, {n}! |
| 3 | ¡De nada, {n}! Cualquier cosa me decís. | ¡De nada, {n}! Cualquier cosa me decís. |

### `de_nada`
Disparo: de nada (usuario responde cuando Rosita agradece algo)

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡Gracias a vos, {n}! | ¡Gracias a vos, {n}! |
| 2 | ¡Ay, qué bueno tenerte acá, {n}! | ¡Qué bueno tenerte acá, {n}! |
| 3 | ¡Gracias, {n}! Me alegra estar acá con vos. | ¡Gracias, {n}! Me alegra estar acá con vos. |

### `despedida`
Disparo: chau, hasta luego, hasta pronto, hasta mañana, nos vemos

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡Chau, {n}! Cuidate mucho. | ¡Chau, {n}! Cuidate mucho. |
| 2 | ¡Hasta luego, {n}! Acá voy a estar cuando me necesitás. | ¡Hasta luego, {n}! Acá voy a estar cuando me necesitás. |
| 3 | ¡Nos vemos, {n}! Un beso grande. | ¡Nos vemos, {n}! Un beso grande. |

### `afirmacion`
Disparo: perfecto, entendido, re bien, todo bien, de acuerdo, genial, bárbaro
⚠️ Solo si el último mensaje de Rosita **no** termina en `?`

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡Perfecto, {n}! ¿Algo más en lo que te pueda ayudar? | ¡Perfecto, {n}! ¿Algo más en lo que te pueda ayudar? |
| 2 | ¡Qué bueno, {n}! Acá estoy si necesitás algo. | ¡Qué bueno, {n}! Acá estoy si necesitás algo. |
| 3 | ¡Genial, {n}! | ¡Genial, {n}! |

---

## Resumen de archivos generados

| Tipo | Cantidad por género | Total (2 géneros) |
|------|---------------------|-------------------|
| Muletillas | 5 categorías × 3 frases = 15 | 30 archivos |
| Respuestas rápidas | 5 categorías × 3 frases = 15 | 30 archivos |
| **Total** | **30** | **60 archivos** |

Todos los archivos se nombran con el slug del nombre del usuario para que al cambiar el nombre se regeneren automáticamente.

---

## Qué NO se cachea (siempre va a Claude)

- Mensaje > 50 caracteres aunque contenga un trigger
- Cualquier mensaje con contenido emocional (dolor, tristeza, miedo)
- Cualquier mensaje con búsqueda (clima, farmacias, noticias, etc.)
- Cualquier mensaje con comando (música, luces, alarmas)
- Afirmaciones cuando Rosita hizo una pregunta en su último turno
- Cualquier pregunta real ("cómo va a estar el clima", "cuánto es 5 por 8")
