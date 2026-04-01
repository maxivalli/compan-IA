# Frases cacheadas de Rosita

Documento alineado con el código actual de `useBrain.ts` y `useAudioPipeline.ts`.

Las frases usan `{n}` como placeholder del nombre de la persona. Se cachean como audio en disco al iniciar o cuando hace falta.

---

## Qué se cachea hoy

Hay dos grupos:

- **Muletillas**: frases puente mientras Claude piensa.
- **Respuestas rápidas**: respuestas completas que evitan llamar a Claude.

No se cachean por archivo con Cartesia "a mano" desde este documento: la fuente real es el código.

---

## 1. Muletillas

Se pre-cachean con archivos:

```text
muletilla_v12_{categoria}_{idx}_{slugNombre}.mp3
```

Categorías activas:

- `empatico`
- `busqueda`
- `nostalgia`
- `comando`
- `default`

### `empatico`

Disparo: dolor, caída, tristeza, miedo, angustia, hospital, médico, etc.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | Ay, {n}... estoy acá, contame. | Ay, {n}... estoy acá, contame. |
| 2 | Uy, {n}... te escucho, decime. | Uy, {n}... te escucho, decime. |
| 3 | Te escucho, {n}... contame. | Te escucho, {n}... contame. |

Emoción TTS usada: `triste`

### `busqueda`

Disparo: clima, noticias, pronóstico, lugares, horarios, datos, búsquedas web, etc.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | A ver, {n}, dame un segundito que me fijo... | A ver, {n}, dame un segundito que me fijo... |
| 2 | Aguantame un cachito, {n}, que ya te lo busco... | Aguantame un cachito, {n}, que ya te lo busco... |
| 3 | Esperame un ratito, {n}, que reviso... | Esperame un ratito, {n}, que reviso... |

Emoción TTS usada: `neutral`

### `nostalgia`

Disparo: recuerdos, familia, pasado, infancia, "cuando era...", etc.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | Mirá vos, {n}... contame. | Mirá vos, {n}... contame. |
| 2 | Ay, qué lindo, {n}... decime. | Qué interesante, {n}... decime. |
| 3 | Qué bárbaro, {n}, te escucho. | Qué bárbaro, {n}, te escucho. |

Emoción TTS usada: `triste`

### `comando`

Disparo: música, luces, alarmas, recordatorios, timers, acciones.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡Dale, {n}! | ¡Dale, {n}! |
| 2 | ¡Ahora mismo! | ¡Ahora mismo! |
| 3 | ¡Claro, {n}! | ¡Claro, {n}! |

Emoción TTS usada: `feliz`

### `default`

Disparo: mensajes largos que no caen en otras categorías y no conviene saltear.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | Te sigo, {n}... | Te sigo, {n}... |
| 2 | Decime, {n}... | Decime, {n}... |
| 3 | Sí, {n}... | Sí, {n}... |

Emoción TTS usada: `neutral`

### Reglas de uso de muletillas

- Si el texto mide menos de 10 caracteres, no hay muletilla.
- Si el texto es corto y matchea `PATRON_SKIP`, tampoco.
- Si el texto suena a cierre conversacional o ciertas frases simples de comida, también se evita.
- `default` solo entra cuando el mensaje es relativamente largo.
- Se evita repetir la última muletilla de la misma categoría.

---

## 2. Respuestas rápidas

Se pre-cachean usando el cache general de TTS:

```text
tts_v5_{hash}.mp3
```

Se usan cuando el mensaje:

- tiene 50 caracteres o menos
- no cae en patrones empáticos
- no cae en búsqueda
- no cae en comando
- no parece una pregunta real

### `saludo`

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡Hola, {n}! ¿Cómo andás hoy? | ¡Hola, {n}! ¿Cómo andás hoy? |
| 2 | ¡{n}! Qué bueno que me hablás. ¿Cómo estás? | ¡{n}! Qué bueno que me hablás. ¿Cómo estás? |
| 3 | ¡Acá estoy, {n}! ¿Cómo te va? | ¡Acá estoy, {n}! ¿Cómo te va? |

Emoción TTS usada: `neutral`

### `gracias`

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡De nada {n}! | ¡De nada {n}! |
| 2 | ¡Para eso estoy, {n}! | ¡Para eso estoy, {n}! |
| 3 | ¡De nada, {n}! Cualquier cosa me decís. | ¡De nada, {n}! Cualquier cosa me decís. |

Emoción TTS usada: `neutral`

### `de_nada`

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡Gracias a vos, {n}! | ¡Gracias a vos, {n}! |
| 2 | ¡Ay, qué bueno tenerte acá, {n}! | ¡Qué bueno tenerte acá, {n}! |
| 3 | ¡Gracias, {n}! Me alegra estar acá con vos. | ¡Gracias, {n}! Me alegra estar acá con vos. |

Emoción TTS usada: `neutral`

### `despedida`

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡Chau, {n}! Cuidate mucho. | ¡Chau, {n}! Cuidate mucho. |
| 2 | ¡Hasta luego, {n}! Acá voy a estar cuando me necesitás. | ¡Hasta luego, {n}! Acá voy a estar cuando me necesitás. |
| 3 | ¡Nos vemos, {n}! Un beso grande. | ¡Nos vemos, {n}! Un beso grande. |

Emoción TTS usada: `neutral`

### `afirmacion`

Solo si el último mensaje de Rosita no dejó una pregunta pendiente.

| # | Femenina | Masculina |
|---|----------|-----------|
| 1 | ¡Perfecto, {n}! ¿Algo más en lo que te pueda ayudar? | ¡Perfecto, {n}! ¿Algo más en lo que te pueda ayudar? |
| 2 | ¡Qué bueno, {n}! Acá estoy si necesitás algo. | ¡Qué bueno, {n}! Acá estoy si necesitás algo. |
| 3 | ¡Genial, {n}! | ¡Genial, {n}! |

Emoción TTS usada: `neutral`

---

## Totales actuales

| Tipo | Categorías | Frases por categoría | Total por género |
|------|------------|----------------------|------------------|
| Muletillas | 5 | 3 | 15 |
| Respuestas rápidas | 5 | 3 | 15 |

Total teórico por género: **30 frases**

Si se consideran voz femenina y masculina: **60 variantes de texto**

---

## Qué no entra en cache rápido

- mensajes empáticos o de salud delicada
- búsquedas web, noticias, clima, lugares, horarios
- comandos complejos
- preguntas reales
- mensajes largos
- afirmaciones que podrían ser respuesta a una pregunta previa de Rosita

En esos casos entra el flujo normal: muletilla opcional, contexto, Claude y TTS principal.
