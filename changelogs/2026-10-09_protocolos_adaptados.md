# CLAUDE.md y protocolos adaptados a Higgs Icons

**Fecha:** 2026-10-09
**Versión:** 0.1.0
**Área:** docs > Protocolos
**Tiempo laborado:** 8 horas
**Autor:** Jose Alexis Correa Valencia <jalexiscv@gmail.com>
**Asistencia:** Agente de IA (Claude)

## Descripción

`CLAUDE.md` y todo `docs/` eran copias idénticas, byte a byte, de los archivos de
Higgs Skriba (procesador de textos en C++/JUCE). Describían otro proyecto: módulos
`core`/`layout`/`io`, `ninja`, `ctest`, `skriba-cli`, `release.ps1`,
`CONTRIBUTING.md` con DCO y una especificación web que no existen aquí. Un agente
que los siguiera habría ejecutado comandos inexistentes y aplicado reglas ajenas.

Se reescribieron para Higgs Icons a partir del código real (`tools/build.mjs`,
`packages/web/index.js`, `catalog/`, `tests/library.test.mjs`, la CI y el
historial de commits): inventario `Apps/`/`Common/`/`Engines/`, registro de IDs
canónicos, overrides, salidas web/escritorio/catálogo, paridad entre la búsqueda
web y la C++, verificación con `node --test`, `node tools/build.mjs` y la
compilación de `dist/desktop`, y la revisión de derechos pendiente.

### Decisión de diseño

- **Versiones:** Skriba sube un parche por cada cambio con un script propio. Aquí
  no existe ese script y `dist/` no se distribuye con paquetes; se eligió
  `npm version patch --no-git-tag-version` sobre `package.json` (fuente única,
  copiada a `libraryVersion` del manifiesto) y que solo suban versión los cambios
  que alteran las salidas. Se descartó crear un script de release nuevo (fuera
  del alcance de la orden) y subir versión por cambios de documentación (no
  cambia nada para las aplicaciones). Por eso este cambio queda en 0.1.0.
- **Commits:** se adoptó la convención real del historial (español,
  `tipo(ámbito): resumen` y `recursos: …`, sin DCO) en lugar de la de Skriba.
- **Sala limpia → procedencia:** la regla de Skriba sobre binarios de Word se
  sustituyó por la de procedencia y derechos de los iconos, que es el riesgo real
  de este repositorio según `RIGHTS-AND-PUBLISHING.md`.

## Tipo de Cambio

- `Cambiado`
- `Agregado`

## Archivos Afectados

### [MODIFICADO] `CLAUDE.md`
- Descripción del proyecto, reglas, comandos de verificación e importaciones
  reales (sin `CONTRIBUTING.md`, que no existe).

### [MODIFICADO] `docs/arquitectura.md`, `docs/estilo-de-codigo.md`
- Reescritos para el inventario, el generador, las salidas y sus contratos, y el
  estilo de JavaScript, C++ generado, datos, pruebas y commits.

### [MODIFICADO] `docs/protocols/Fable/*.md` (6), `docs/protocols/Releases.md`, `Changelogs.md`, `Documentations.md`
- Los nueve protocolos adaptados al proyecto.

### [MODIFICADO] `README.md`
- Sección "Documentación" con el índice de `docs/`.

### [NUEVO] `changelogs/CHANGELOG.md`, `changelogs/2026-10-09_protocolos_adaptados.md`

## Verificación

- `node --test`: `# tests 7`, `# pass 7`, `# fail 0`.
- `node tools/build.mjs`: `Built 2949 icons for Web and JUCE Desktop.`
- Compilación de `dist/desktop` con MSVC y Ninja fuera del árbol:
  `[2/2] Linking CXX static library higgs_icons.lib`, código de salida 0.
- Enlaces relativos de los documentos nuevos comprobados con un script: todos
  apuntan a archivos existentes.
- Los comandos de `CLAUDE.md` se ejecutaron tal como están escritos.

## Impacto

- Sin efecto en las salidas ni en las aplicaciones consumidoras.
- Siguen en `docs/` las copias de Skriba sin equivalente aquí
  (`docs/compilar.md`, `docs/formato-nativo.md`, `docs/especificacion-web/`,
  `docs/comportamiento/`); ya no las importa `CLAUDE.md`, y su retirada queda a
  decisión del autor.
