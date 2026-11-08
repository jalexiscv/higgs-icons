# La documentación nombra Higgs Mythos, no JUCE, como framework de las aplicaciones de escritorio

**Fecha:** 2026-11-08
**Versión:** 0.2.0
**Área:** docs > uso-escritorio; build
**Tiempo laborado:** 2 horas
**Autor:** Jose Alexis Correa Valencia <jalexiscv@gmail.com>
**Asistencia:** Agente de IA (Claude)

## Descripción

El autor aclaró que las aplicaciones de escritorio de la familia Higgs (Skriba, Odyssey y
Presenter) están hechas con **Higgs Mythos**, el framework propio de la familia, y no con JUCE. La
documentación de la biblioteca decía «aplicaciones JUCE» y sus ejemplos de escritorio usaban
`juce::`.

Se sustituye JUCE por Higgs Mythos en toda la documentación propia de la biblioteca. Los ejemplos
de [docs/uso-escritorio.md](../docs/uso-escritorio.md) pasan a `higgs::File`, `higgs::String`,
`higgs::ImageCache`, `higgs::Drawable` y `<higgs_gui_basics/higgs_gui_basics.h>`, con firmas
comprobadas en el código de Higgs Mythos (`modules/higgs_core/files/higgs_File.h`,
`higgs_graphics/images/higgs_ImageCache.h`, `higgs_graphics/drawables/higgs_Drawable.h`,
`higgs_gui_basics/buttons/higgs_ImageButton.h`); el target de CMake se declara con
`higgs_add_gui_app`, como en Skriba. La biblioteca C++ generada no cambia: nunca dependió de
ningún framework. `CLAUDE.md` deja escrito que el framework es Higgs Mythos y nunca JUCE.

## Tipo de Cambio

- `Corregido`

## Archivos Afectados

### [MODIFICADO] `docs/uso-escritorio.md`
- Título, introducción, ejemplos y sección «Sin Higgs Mythos».
### [MODIFICADO] `README.md`, `CLAUDE.md`, `docs/arquitectura.md`, `docs/estilo-de-codigo.md`, `docs/protocols/Documentations.md`
- Menciones a JUCE sustituidas.
### [MODIFICADO] `tools/build.mjs`
- El mensaje final del generador pasa de `Built N icons for Web and JUCE Desktop.` a
  `Built N icons for Web and Desktop.`

## Verificación

- `node --test`: `# tests 11`, `# pass 11`, `# fail 0`.
- Búsqueda de `juce` sin distinguir mayúsculas en la documentación, el código, las pruebas y la
  CI de la biblioteca: solo queda la frase de `CLAUDE.md` que prohíbe usarlo.
- No verificado: los ejemplos de C++ no se compilaron contra Higgs Mythos.

## Impacto

- Ninguno para las aplicaciones: no cambia ningún contrato ni salida distribuida.
- Los changelogs anteriores conservan sus menciones a JUCE porque registran lo que se dijo
  entonces.
- `docs/compilar.md`, `docs/comportamiento/`, `docs/formato-nativo.md` y
  `docs/especificacion-web/` son documentos de Higgs Skriba que están en este repositorio, no
  enlazados desde el README, y hablan de JUCE. No se tocan aquí: su destino lo decide el autor.
