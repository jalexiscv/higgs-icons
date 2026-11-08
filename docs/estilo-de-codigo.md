# Estilo de código

No hay formateador ni linter configurado; el estilo lo marca el código
existente. Lo que sigue lo resume.

## JavaScript (generador, módulo web, catálogo, pruebas)

- Módulos ES (`"type": "module"`), Node.js 20 o superior, **sin dependencias
  externas**: solo módulos `node:` en el generador y APIs estándar del
  navegador en `packages/web` y `catalog`.
- Dos espacios de sangría, comillas simples, punto y coma, comas finales en
  literales de varias líneas.
- Funciones y variables en camelCase; constantes de módulo en
  `MAYÚSCULAS_CON_GUIONES` (`PNG_SIGNATURE`, `SOURCE_ROOTS`); clases en
  PascalCase (`IconLibrary`).
- Los nombres, comentarios y mensajes de error del código van en **inglés**
  (`Invalid PNG file: …`). Los textos visibles para el usuario del catálogo van
  en español (`Copiar ID`, `No hay coincidencias.`).
- Los errores de datos (firma PNG inválida, ID duplicado, override desconocido)
  se lanzan con `throw new Error(...)` y detienen la generación; nunca se
  ignoran en silencio.
- Las rutas se construyen con `node:path`; las rutas que se escriben en el
  manifiesto usan siempre `/` y son relativas.
- Las salidas deben ser deterministas: se ordena por ID antes de emitir.
- El módulo web no usa bundler: lo que se copia a `dist/web/index.js` debe
  funcionar tal cual en el navegador.

## C++ generado (`dist/desktop`)

- Se escribe desde las plantillas de `tools/build.mjs`; nunca se edita
  `dist/` a mano.
- C++20, espacio de nombres `higgs_icons`, nombres en `snake_case`, sangría de
  4 espacios, sin depender de ningún framework (tampoco de Higgs Mythos).
- Toda cadena que viene de datos (IDs, nombres, alias, tags, rutas) pasa por
  `cppString` antes de entrar al código fuente.
- Debe compilar sin errores con MSVC (`/utf-8`) como en la CI.

## Datos

- `metadata/*.json` con dos espacios de sangría y salto de línea final.
- IDs en minúsculas, segmentos separados por `.` y palabras por `-`.

## Pruebas

- Viven en `tests/` y usan `node:test` y `node:assert/strict`.
- Una prueba por comportamiento, con nombre descriptivo en inglés.
- Los inventarios de prueba son sintéticos y se crean con `mkdtemp` en
  `os.tmpdir()`; se borran en `context.after`.

## Commits

En español, siguiendo el historial:

- `tipo(ámbito): resumen` con `feat`, `fix`, `docs`, `test`, `ci` o `chore`
  (p. ej. `feat(metadata): registra los IDs canónicos del inventario`).
- Lotes de iconos: `recursos: añade N iconos de <grupo> (k/n)`, con un máximo
  de unos 20 iconos por commit.
