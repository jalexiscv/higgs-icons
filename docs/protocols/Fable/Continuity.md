# Protocolo de Continuidad: Sesiones Largas y Reanudación

Las sesiones de IA tienen memoria limitada: el contexto se resume, la sesión se
corta o el trabajo lo retoma otro agente. En **Higgs Icons** esto pesa sobre todo
en los lotes de iconos, que se reparten en muchos commits (`(1/8)`, `(2/8)`…).
Este protocolo convierte el **repositorio** en la fuente de verdad del estado.

---

## 1. Principio Rector

**La memoria conversacional es un caché; el repositorio es la base de datos.** El
estado vive en el árbol de archivos, en `git`, en `changelogs/` y en la lista de
tareas. Ante una discrepancia entre lo que se "recuerda" y lo que el repositorio
muestra, gana el repositorio.

---

## 2. Durante una Tarea Larga

1. **Lista de tareas viva,** actualizada en el momento en que un paso cambia.
2. **Completado significa verificado:** `node --test` y `node tools/build.mjs` en
   verde para lo hecho.
3. **El contrato se conserva por escrito:** los requisitos numerados y, en los
   lotes, la lista completa de iconos con su conteo viven en la lista de tareas o
   en el scratchpad.
4. **Puntos de consolidación:** en los lotes, cada tramo de unos 20 iconos queda
   con su entrada en `metadata/ids.json`, la generación en verde y, si la orden
   incluye versionar, su commit `recursos: … (k/n)`.
5. **Los apuntes intermedios van al scratchpad**, nunca al árbol del proyecto.

---

## 3. Al Reanudar

Antes de escribir una sola línea:

1. **Relee la orden original** o su contrato numerado.
2. **`git status`, `git diff` y `git log`**: qué está tocado, en qué rama y qué
   tramos `(k/n)` de un lote ya están confirmados.
3. **`changelogs/CHANGELOG.md`** y los detalles recientes.
4. **Lista de tareas.**
5. **Verificación por muestreo:** ejecuta `node --test` y `node tools/build.mjs`
   (regenerando `dist/`, que puede estar viejo) y comprueba el número de iconos.

Solo entonces se continúa por el primer paso pendiente.

---

## 4. Al Pausar o Quedar Bloqueado

1. **El árbol queda consistente:** el registro de IDs sincronizado con el
   inventario y la generación en verde, o el tramo en curso revertido.
2. **El estado queda escrito** en la lista de tareas.
3. **El reporte de pausa dice** qué se completó (con evidencia), qué falta y cuál
   es el único dato o decisión que se necesita.

---

## 5. Trabajo Nunca Perdido, Trabajo Nunca Duplicado

1. **Antes de añadir un icono "que falta", búscalo:** puede existir con otra ruta
   o con otro ID (`grep` en `metadata/ids.json`).
2. **Antes de descartar cambios locales, léelos** completos.
3. **Los experimentos van en ramas o en el scratchpad.**

---

## 6. Anti-patrones Prohibidos

| Anti-patrón                                                | Conducta correcta                                  |
|------------------------------------------------------------|-----------------------------------------------------|
| Confiar en la memoria sobre el estado del repositorio      | El repositorio manda (§1)                           |
| Reanudar un lote "donde creo que iba"                      | Reconstruir con git y el conteo (§3)                |
| Fiarse de un `dist/` sin regenerar                         | Regenerar antes de muestrear (§3.5)                 |
| Dejar el registro de IDs desincronizado al pausar          | Árbol consistente (§4.1)                            |
| Duplicar un icono que ya existe con otro nombre            | Buscar antes de añadir (§5.1)                       |
| Notas y volcados dentro del árbol del proyecto             | Scratchpad (§2.5)                                   |
