# Protocolo de Ejecución para Agentes de IA

Este documento define la **disciplina de trabajo** que debe seguir cualquier agente
de IA (sea cual sea el modelo: Fable, Opus, Sonnet u otro) al ejecutar órdenes
sobre **Higgs Icons**, la biblioteca común de iconos de las aplicaciones Higgs. Su
objetivo es que la calidad del resultado sea uniforme sin importar qué modelo
ejecute.

Los demás documentos definen **qué** reglas cumplir:

* el estilo de código, datos, pruebas y commits: [docs/estilo-de-codigo.md](../../estilo-de-codigo.md);
* el inventario, los IDs, las salidas y sus contratos: [docs/arquitectura.md](../../arquitectura.md);
* el uso de la biblioteca: [README.md](../../../README.md);
* la procedencia y la publicación: [RIGHTS-AND-PUBLISHING.md](../../../RIGHTS-AND-PUBLISHING.md);
* el historial y la documentación: [Changelogs.md](../Changelogs.md) y [Documentations.md](../Documentations.md).

Este protocolo define **cómo trabajar** para cumplirlas.

---

## 1. Principio Rector

**Una orden no está terminada hasta que está cumplida por completo, verificada con
evidencia y documentada.** Un cambio sin probar, sin regenerar `dist/` o sin
registrar en el changelog es una orden incumplida, aunque el código sea correcto.

Tres reglas de oro:

1. **Nunca afirmes lo que no has verificado.** "Debería funcionar" está prohibido;
   lo correcto es "funciona: lo verifiqué con X y el resultado fue Y".
2. **Nunca edites lo que no has leído.** Todo archivo se lee antes de modificarse;
   toda función o campo se localiza en su definición real antes de usarse.
3. **Nunca dejes trabajo a medias.** No se procesan 5 de 16 iconos, no se deja un
   `TODO`, no se promete "luego haré…".

---

## 2. Ciclo de Trabajo Obligatorio

| # | Fase        | Pregunta que responde                  | Criterio de salida                                        |
|---|-------------|----------------------------------------|-----------------------------------------------------------|
| 1 | Entender    | ¿Qué se pidió exactamente?             | Lista numerada de requisitos explícitos e implícitos      |
| 2 | Explorar    | ¿Cómo es el terreno?                   | Archivos afectados leídos; precedente hallado             |
| 3 | Planificar  | ¿En qué orden y sobre qué archivos?    | Plan con la lista completa de elementos a tocar           |
| 4 | Ejecutar    | ¿El cambio está hecho?                 | Todos los elementos del plan procesados                   |
| 5 | Verificar   | ¿Funciona y no rompí nada?             | Pruebas, generación, compilación C++ y evidencia          |
| 6 | Documentar  | ¿Quedó registrado?                     | Versión (si aplica) + changelog + índice + documentación  |
| 7 | Reportar    | ¿El usuario entiende qué pasó?         | Reporte que inicia con el resultado y es honesto          |

**Calibración:** el ciclo completo aplica a órdenes de cambio. Una pregunta se
responde de forma directa; un diagnóstico se investiga con las fases 1–2 y se
reporta sin aplicar cambios.

---

## 3. Fase 1 — Entender la Orden

1. **Relee la orden completa** y extrae una **lista numerada de requisitos**. Es
   el contrato: al final cada punto necesita evidencia (§7).
2. **Deriva los requisitos implícitos y cuenta.** "Añade los iconos de PrintUI"
   obliga a listar los directorios `.ico.png` del grupo y a registrar el número;
   ese número es parte del contrato.
3. **Distingue el tipo de orden:** una *pregunta o diagnóstico* entrega un
   análisis sin cambios; una *orden de cambio* entrega el cambio completo,
   verificado y documentado.
4. **Ante ambigüedad**, elige la interpretación más coherente con el código, los
   contratos de [arquitectura.md](../../arquitectura.md) y las decisiones previas
   del usuario, ejecútala y **declárala en el reporte**. Solo se pregunta ante una
   acción destructiva, un cambio de alcance, un cambio rompiente de un contrato o
   un dato que solo el usuario tiene (procedencia de unos iconos, nombres curados).
5. **No re-litigues decisiones ya tomadas** por el usuario.

---

## 4. Fase 2 — Explorar Antes de Tocar

1. **Lee todo archivo antes de editarlo**, al menos la sección afectada y su
   contexto. `tools/build.mjs` es corto: léelo entero si lo vas a tocar.
2. **Busca el precedente:** otro grupo de iconos ya incorporado (`git log
   --stat` de un commit `recursos:`), otra validación de `buildManifest`, otra
   prueba de `tests/library.test.mjs`. Imítalo.
3. **Nunca inventes una API.** Confirma firmas y formas de datos en su
   definición: `buildManifest(root, overrides, idRegistry)`, la forma de cada
   entrada del manifiesto, la API de `IconLibrary` y la de `higgs_icons`.
4. **Antes de cambiar un contrato busca a todos sus usuarios:** un campo del
   manifiesto lo usan `packages/web/index.js`, `catalog/catalog.js`,
   `desktopSource` y las pruebas; un ID lo usan las aplicaciones externas
   (Skriba, Odyssey, Presenter), que no están en este repositorio.
5. **La paridad web/C++ es obligatoria:** toda regla de búsqueda o de elección de
   tamaño que cambie en `packages/web/index.js` cambia igual en `desktopSource`,
   y viceversa.
6. **Explora con las herramientas adecuadas** (glob para archivos, grep para
   contenido) y en paralelo. El inventario tiene casi 9000 PNG: filtra antes de
   listar.

---

## 5. Fase 3 — Planificar

1. **Enumera los archivos afectados** antes de editar el primero.
2. **En tareas de varios pasos, lleva una lista de tareas visible** y márcala.
3. **Lotes:** construye la lista completa (iconos, IDs, overrides), registra el
   conteo, procesa todos y verifica al final que el conteo coincide. Los lotes de
   iconos se parten en commits de unos 20 iconos, como el historial.
4. **Diff mínimo completo:** reutiliza lo que existe; no incluyas nada ajeno a la
   orden.
5. **Detecta el efecto dominó desde el plan:** un icono nuevo exige su entrada en
   `metadata/ids.json`; un campo nuevo del manifiesto afecta al módulo web, al
   C++ generado, al catálogo, a las pruebas, al `README.md` y posiblemente a
   `schemaVersion`; un cambio en `packages/web` o `catalog` se copia a `dist/`.

---

## 6. Fase 4 — Ejecutar

1. **Ataca la causa raíz**, no el síntoma ([Debugging.md](Debugging.md)).
2. **El código nuevo se lee como el que lo rodea**
   ([docs/estilo-de-codigo.md](../../estilo-de-codigo.md)): mismos nombres,
   mismos modismos, comentarios en inglés solo para el porqué.
3. **Sin desviaciones de alcance:** no se refactoriza, renombra ni reordena lo
   que no se pidió.
4. **Completa cada elemento del plan.**
5. **Ante un error, diagnostica antes de reintentar.** Dos fallos por la misma
   causa obligan a cambiar de enfoque.
6. **No te detengas a pedir permiso** para acciones reversibles que se derivan de
   la orden; solo por lo del §3.4.
7. **No edites `dist/` a mano:** se regenera con `node tools/build.mjs`.
8. **No dejes residuos:** ni `console.log` de depuración, ni archivos temporales
   o árboles de compilación dentro del proyecto (van al scratchpad del entorno o
   al directorio temporal del sistema).
9. **Procedencia ([Security.md](Security.md) §5):** no se incorpora un icono sin
   procedencia conocida ni se extraen recursos de binarios propietarios.

---

## 7. Fase 5 — Verificar

**Nada se reporta como hecho sin evidencia objetiva.**

1. **Pruebas:** `node --test`. Se reporta la línea de resumen (`# pass N`,
   `# fail 0`) tal cual. Toda corrección lleva su prueba de regresión.
2. **Generación:** `node tools/build.mjs` termina sin error e informa el número
   de iconos (`Built N icons…`); ese número coincide con el esperado.
3. **Compilación C++** de `dist/desktop` como en la CI (comando en `CLAUDE.md`,
   con el árbol de compilación fuera del proyecto) cuando el cambio toca el
   generador, los metadatos o el inventario.
4. **Verificación funcional** si hay superficie observable: abrir
   `dist/catalog/` en `http://localhost/Higgs%20Icons/dist/catalog/` y buscar los
   iconos afectados, o consultar `dist/web/manifest.json` con un script de Node.
5. **Contraste contra el contrato:** cada requisito de la fase 1 con su evidencia.
6. **Relectura del diff completo** (`git diff`, `git status`), buscando cambios no
   intencionales y archivos tocados por accidente.
7. **Lotes:** comprueba con una búsqueda, no de memoria, que los N elementos
   quedaron como se esperaba.
8. **Si la verificación falla, vuelve a la fase 4.** Un fallo "ajeno" solo se
   declara así tras demostrarlo sobre el estado previo (`git stash`).
9. **Lo que no se pudo verificar se declara** (por ejemplo, la CI de GitHub).

---

## 8. Fase 6 — Documentar

1. **Si el cambio altera lo que se distribuye, sube la versión** según
   [Releases.md](../Releases.md).
2. **Todo cambio se registra en la misma sesión** según
   [Changelogs.md](../Changelogs.md): archivo detallado y fila en
   `changelogs/CHANGELOG.md`.
3. Si el cambio altera cómo *es* el sistema (contratos, flujo de generación, uso
   de la biblioteca), se actualizan `docs/` y `README.md` según
   [Documentations.md](../Documentations.md).
4. La documentación describe el estado final; el changelog, la transición.

---

## 9. Fase 7 — Reportar

1. **La primera frase es el resultado.**
2. **Prosa completa y en español**, sin flechas ni jerga de la sesión.
3. **Contenido mínimo:** qué cambió y dónde (`archivo:línea`), cómo se verificó
   con su resultado real, suposiciones, y riesgos o pendientes sin rodeos.
4. **Honestidad absoluta sobre los fallos**, con la salida relevante tal cual.
5. **Sin promesas de trabajo futuro dentro de la misma orden.**
6. **Sin halagos ni relleno.**

---

## 10. Honestidad y Evidencia

1. **Nunca inventes** salidas, contenidos, firmas ni resultados.
2. **Cita los errores textualmente.**
3. **Antes de un comando que cambia estado** (borrar, sobrescribir `metadata/`,
   `git reset`), confirma que la evidencia respalda *esa* acción; mira antes lo
   que no creaste tú.
4. **Si estás bloqueado, di exactamente qué falta.**

---

## 11. Anti-patrones Prohibidos

| Anti-patrón                                                   | Conducta correcta                                                |
|----------------------------------------------------------------|-------------------------------------------------------------------|
| Declarar "listo" sin pruebas, generación ni compilación        | Verificar y reportar con evidencia (§7)                           |
| Editar un archivo sin haberlo leído                            | Leer archivo y contexto (§4.1)                                    |
| Cambiar o reutilizar un ID canónico publicado                  | Los IDs no cambian; mover la clave, no el valor (arquitectura)    |
| Añadir un icono sin su entrada en `metadata/ids.json`          | Efecto dominó desde el plan (§5.5)                                |
| Cambiar la búsqueda en web y no en C++ (o al revés)            | Paridad web/C++ (§4.5)                                            |
| Editar `dist/` a mano                                          | Regenerar con `tools/build.mjs` (§6.7)                            |
| Procesar 5 de 16 iconos y extrapolar                           | Lista completa, conteo y verificación del conteo (§5.3)           |
| Incorporar iconos de procedencia desconocida                   | Procedencia documentada (§6.9)                                    |
| Publicar el repositorio, `dist/` o Pages sin orden             | Decide el autor                                                    |
| Preguntar "¿continúo?" ante acciones reversibles               | Continuar; detenerse solo por §3.4                                |
| Reintentar el mismo comando fallido sin diagnóstico            | Diagnosticar, corregir, reintentar (§6.5)                         |
| Editar la versión de `package.json` a mano                     | `npm version patch --no-git-tag-version` (Releases)               |
| Arreglar cuando la orden era diagnosticar                      | Entregar el análisis y esperar la decisión (§3.3)                 |

---

## 12. Lista de Verificación Final (obligatoria)

Un solo "no" significa que la orden **no está terminada**.

1. ¿Cada requisito numerado está cumplido **y tiene evidencia**?
2. ¿Leí cada archivo antes de editarlo?
3. ¿Pasa `node --test` y reporté su resumen tal cual? ¿Toda corrección tiene su
   prueba de regresión?
4. ¿`node tools/build.mjs` termina sin error con el número de iconos esperado?
5. ¿Compilé `dist/desktop` si el cambio toca generador, metadatos o inventario?
6. ¿Ejercité el cambio (catálogo, manifiesto) cuando tiene superficie observable?
7. ¿Releí el diff completo y no hay residuos ni cambios no intencionales?
8. ¿En los lotes, el conteo final coincide con el inicial?
9. ¿Subí la versión si el cambio altera lo distribuido, y registré el changelog
   detallado **y** su fila en `changelogs/CHANGELOG.md`?
10. ¿Actualicé `docs/` y `README.md` si el cambio lo amerita?
11. ¿Cumplí [docs/estilo-de-codigo.md](../../estilo-de-codigo.md), los contratos de
    [arquitectura.md](../../arquitectura.md) y la regla de procedencia?
12. ¿Mi reporte inicia con el resultado y declara suposiciones, fallos y pendientes?
13. ¿Mi último párrafo es un hecho consumado y no un plan ni una promesa?

---

## 13. Relación con Otros Protocolos

* Diagnóstico de errores: [Debugging.md](Debugging.md).
* Decisiones entre alternativas: [Decisions.md](Decisions.md).
* Autorrevisión del diff: [Review.md](Review.md).
* Seguridad, procedencia y publicación: [Security.md](Security.md).
* Tareas largas y reanudación: [Continuity.md](Continuity.md).
* Versiones: [Releases.md](../Releases.md).
* Historial: [Changelogs.md](../Changelogs.md).
* Documentación: [Documentations.md](../Documentations.md).
