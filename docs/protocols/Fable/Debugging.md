# Protocolo de Diagnóstico y Depuración

Este documento define el método obligatorio para diagnosticar y corregir errores
en **Higgs Icons**: el generador (`tools/build.mjs`), los metadatos, el módulo web,
la biblioteca C++ generada y los catálogos. Toda corrección ataca la **causa
raíz** con evidencia; un parche de síntoma reaparece en otro icono, en otra
aplicación consumidora o en la CI.

---

## 1. Principio Rector

**No se corrige lo que no se entiende.** Antes de cualquier arreglo debe poder
escribirse la cadena causal completa: *"el síntoma X ocurre porque el componente Y
hace Z cuando se cumple W"*. Por ejemplo: *"la generación falla con `ID registry
is missing sources` porque el lote añadió el directorio `Engines/PrintUI/…/Foo.ico.png`
sin su entrada en `metadata/ids.json`, y `buildManifest` exige que el registro
cubra todo el inventario"*. Sin esa frase respaldada por evidencia, está
prohibido "arreglar".

---

## 2. Ciclo de Diagnóstico

### Etapa 1 — Caracterizar el síntoma

1. Registra el síntoma **exacto**: mensaje textual del generador
   (`Icon ID collision …`, `ID registry is missing sources: …`), la aserción de
   `node:test` con su `expected`/`actual`, el error del compilador C++ con archivo
   y línea, o la consulta del catálogo que falla.
2. **Reprodúcelo** de la forma más barata: una prueba en `tests/` con un inventario
   sintético, `node tools/build.mjs`, o un script de Node que cargue
   `dist/web/manifest.json` con `IconLibrary`.
3. Establece desde cuándo ocurre (`git log` sobre los archivos implicados,
   changelog). Un error que apareció con un lote de iconos suele vivir en ese lote.
4. **Fija el comportamiento esperado:** el que documentan
   [arquitectura.md](../../arquitectura.md) y el `README.md`, y la paridad entre
   la implementación web y la C++.

### Etapa 2 — Leer la evidencia completa

1. Lee el mensaje entero; del compilador, el **primer** error de la cascada.
2. **Mira los datos reales:** la entrada de `metadata/ids.json`, el directorio
   `.ico.png` con sus variantes, la entrada generada en `dist/web/manifest.json`,
   el fragmento de `dist/desktop/src/icons.cpp`.
3. Separa datos de lógica: un `dist/` viejo que no se regeneró explica muchos
   cambios que "no hacen nada".

### Etapa 3 — Formular hipótesis explícitas

Lista las hipótesis de más a menos probable, en cuatro familias:

* **Código:** lógica del generador, plantilla C++ o módulo web incorrectos;
  divergencia entre la búsqueda web y la C++.
* **Normalización y texto:** `normalizeSegment`/`humanize` con mayúsculas, tildes,
  guiones o números; comparaciones sensibles a mayúsculas; caracteres que
  `cppString` no escapa como el compilador espera.
* **Datos de entrada:** directorio `.ico.png` sin variantes, PNG con firma
  inválida, tamaño repetido, registro de IDs desincronizado con el inventario,
  override con clave no admitida.
* **Entorno:** `dist/` obsoleto, versión de Node menor que 20, diferencias de
  sistema de archivos (mayúsculas en Windows frente a Linux), caché del
  navegador en el catálogo.

Para cada hipótesis, la comprobación más barata que la discrimina.

### Etapa 4 — Aislar por bisección

1. Parte el flujo por la mitad: ¿`buildManifest` da la entrada correcta? → el
   problema está en la emisión; ¿el manifiesto es correcto? → el problema está
   en el consumidor (web, C++ o catálogo).
2. **Un solo cambio por experimento.**
3. Construye la **reproducción mínima** con `createFixture` de
   `tests/library.test.mjs`.
4. Si el error apareció con el tiempo, bisecta el historial.

### Etapa 5 — Confirmar la causa

La causa debe explicar **todos** los síntomas, y se confirma provocándola y
desprovocándola.

### Etapa 6 — Corregir y cerrar

1. **Corrige donde se rompe el invariante:** un ID mal formado se corrige en el
   registro o en la normalización, no filtrándolo en el catálogo.
2. Verifica que el síntoma original desapareció con la misma reproducción y que
   la batería completa sigue en verde ([Execution.md](Execution.md) §7).
3. **Toda corrección lleva su prueba de regresión** que falla sin el arreglo y
   pasa con él.
4. **Busca el mismo defecto en el resto del código:** la lógica de búsqueda y de
   tamaños existe dos veces (web y C++); corregir una sola es dejar un bug
   conocido.
5. Registra el cambio con su causa raíz ([Changelogs.md](../Changelogs.md)).

---

## 3. Bug Nuevo o Preexistente

Antes de atribuir un fallo al cambio en curso, compáralo contra el estado previo
(`git stash`). Si ya existía, se reporta como hallazgo separado y no se mezcla su
corrección sin decirlo.

---

## 4. Reglas Transversales

1. **Prohibido el arreglo por lotería.**
2. **La instrumentación temporal se retira** (`console.log`, scripts de volcado).
   Los volcados van al scratchpad, nunca al árbol del proyecto.
3. **Registra lo descartado** en el reporte si el diagnóstico fue largo.
4. **Dos fallos consecutivos del mismo enfoque obligan a cambiar de enfoque.**
5. **Las suposiciones de la propia prueba también se verifican** (qué crea
   exactamente `createFixture`).

---

## 5. Anti-patrones Prohibidos

| Anti-patrón                                                  | Conducta correcta                                       |
|--------------------------------------------------------------|----------------------------------------------------------|
| Arreglar sin poder enunciar la causa en una frase            | Completar el ciclo de diagnóstico (§1)                   |
| Parafrasear el error                                         | Citarlo textualmente (Etapa 1)                           |
| Teorizar sin abrir el manifiesto, el registro o el PNG       | Mirar los datos reales (Etapa 2.2)                       |
| Fiarse de un `dist/` sin regenerar                           | Regenerar antes de concluir (Etapa 2.3)                  |
| Cambiar varias cosas a la vez                                | Un cambio por experimento (Etapa 4.2)                    |
| Filtrar el síntoma en el consumidor                          | Corregir donde se rompe el invariante (Etapa 6.1)        |
| Corregir la búsqueda web y olvidar la C++                    | Buscar el mismo defecto en todo el código (Etapa 6.4)    |
| Corregir sin prueba de regresión                             | Prueba que falla sin el arreglo (Etapa 6.3)              |
