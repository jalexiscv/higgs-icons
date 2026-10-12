# Higgs Icons — instrucciones para Claude

Higgs Icons es la biblioteca común de iconos de las aplicaciones Higgs (Skriba,
Odyssey y Presenter). A partir de un mismo inventario de PNG (`Apps/`,
`Common/`, `Engines/`) y de sus metadatos (`metadata/ids.json`,
`metadata/overrides.json`), el generador `tools/build.mjs` (Node.js 20+, sin
dependencias) produce en `dist/` tres salidas: el módulo web
(`packages/web/index.js` + `manifest.json`), la biblioteca C++20/CMake para las
aplicaciones JUCE y el catálogo navegable. El catálogo estático
`catalogo-iconos.html` se publica con GitHub Pages desde la raíz.

## Obligatorio en toda orden

Los protocolos importados abajo **no son sugerencias**: se aplican en cada orden
de cambio, en este orden.

1. Trabaja con el ciclo de siete fases de `Execution.md` (entender, explorar,
   planificar, ejecutar, verificar, documentar, reportar) y cierra con su lista
   de verificación final (§12). Una pregunta o un diagnóstico se responde sin
   aplicar cambios.
2. Corrige errores con el método de `Debugging.md` (cadena causal demostrada y
   prueba de regresión) y decide entre alternativas con `Decisions.md`.
3. Antes de documentar, revisa tu propio diff con `Review.md` y la checklist de
   `Security.md`.
4. Si el cambio altera lo que se distribuye (iconos, metadatos, generador,
   módulo web, biblioteca C++ o catálogo), termínalo con una versión nueva según
   `Releases.md`: `npm version patch --no-git-tag-version` (0.1.0 → 0.1.1…) y
   luego la verificación completa. Nunca edites la versión a mano ni subas menor
   o mayor sin que el autor lo decida.
5. Registra **todo** cambio en `changelogs/` según `Changelogs.md` (detalle +
   fila del índice, versión, tiempo laborado, autor y asistencia de IA) y
   actualiza `docs/` y `README.md` según `Documentations.md`.
6. En tareas largas o al reanudar, sigue `Continuity.md`: el repositorio manda
   sobre la memoria.

## Reglas que no se negocian

- **Los IDs canónicos no cambian.** Un ID publicado en `metadata/ids.json` es un
  contrato con las aplicaciones: para mover un recurso se cambia la clave (la
  ruta), nunca el valor (el ID). Renombrar o quitar un ID es un cambio rompiente
  que decide el autor.
- **Procedencia y derechos** (`RIGHTS-AND-PUBLISHING.md`): no se incorpora un
  icono sin procedencia conocida, ni se extraen recursos de binarios de
  productos propietarios para añadirlos al inventario. La biblioteca es material
  propio del autor y se puede usar y distribuir; publicar (repositorio, `dist/`,
  Pages, paquetes de un release) es decisión suya.
- **Verificación en verde antes de declarar nada terminado:** `node --test`,
  `node tools/build.mjs` y la compilación de `dist/desktop` sin errores.
- **Commits** solo cuando se pidan, en español, con el formato del historial:
  `tipo(ámbito): resumen` (`feat`, `fix`, `docs`, `test`, `ci`, `chore`) o
  `recursos: añade N iconos de <grupo> (k/n)` para lotes de iconos.
- **Autor de los changelogs:** la persona de `git config user.name` /
  `user.email`, nunca el agente; la asistencia se declara aparte.

## Verificar en esta máquina (Windows)

```powershell
node --test                       # pruebas del generador y del módulo web
node tools/build.mjs              # regenera dist/web, dist/desktop y dist/catalog
# Compilación de la biblioteca C++ como en la CI (fuera del árbol del proyecto):
cmd /c "call ""C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"" >nul && cmake -S dist/desktop -B ""%TEMP%\higgs-icons-build"" -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build ""%TEMP%\higgs-icons-build"" --target higgs_icons"
```

El mensaje `"vswhere.exe" no se reconoce…` que imprime `vcvars64.bat` es
inofensivo; el resultado lo dan la salida de CMake y el código de salida.
`npm run check` ejecuta las pruebas y el generador en un solo paso. El catálogo
generado se abre en `http://localhost/Higgs%20Icons/dist/catalog/` (XAMPP).

## Protocolos

@docs/protocols/Fable/Execution.md
@docs/protocols/Fable/Debugging.md
@docs/protocols/Fable/Decisions.md
@docs/protocols/Fable/Review.md
@docs/protocols/Fable/Security.md
@docs/protocols/Fable/Continuity.md
@docs/protocols/Releases.md
@docs/protocols/Changelogs.md
@docs/protocols/Documentations.md

## Documentación del proyecto

@README.md
@RIGHTS-AND-PUBLISHING.md
@docs/arquitectura.md
@docs/estilo-de-codigo.md
