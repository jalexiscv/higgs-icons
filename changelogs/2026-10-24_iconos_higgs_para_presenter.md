# 24 iconos nuevos del grupo `common.higgs` para Higgs Presenter

**Fecha:** 2026-10-24
**Versión:** 0.1.3
**Área:** recursos > Common/Higgs; metadatos
**Tiempo laborado:** 10 horas
**Autor:** Jose Alexis Correa Valencia <jalexiscv@utede.edu.co>
**Asistencia:** Agente de IA (Claude)

## Descripción

Higgs Presenter adopta esta biblioteca como Skriba (su mapa `src/ui/resources/icon-map.txt`).
Buscando por significado, viendo cada imagen, 82 de sus 114 nombres encontraron icono. De los 32
restantes, ocho siguen siendo vectores propios de Presenter por razón técnica (la marca, la flecha
de volver, los dos triángulos de 8 px, la marca de verificación, cerrar, «más» y el marcador de
posición). Los otros 24, que la biblioteca no tenía porque vienen de un programa de dibujo y no de
uno de presentaciones, se crean aquí, en `Common/Higgs/`, con ID `common.higgs.<nombre>`, para que
sirvan a toda la familia:

`section`, `text-shadow`, `character-spacing`, `shape-outline`, `chart`, `audio`, `slide-size`,
`transition-none`, `transition-fade`, `transition-push`, `play-preview`, `effect-options`,
`animation-none`, `animation-appear`, `animation-pane`, `animation-add`,
`slideshow-from-beginning`, `slideshow-from-current`, `presenter-view`, `slideshow-setup`,
`slide-master`, `window`, `eye` y `duplicate`.

**Estilo.** Se exportan de los diseños vectoriales propios de Higgs Presenter con
`Presenter.exe --icon-export`, con lo medido sobre la biblioteca: el dibujo ocupa unos dos tercios
del lienzo (16 de 24 px, 30 a 34 de 48), el trazo mide lienzo/24 (1, 2 y 3 px) y la tinta es
`#2E3138` sobre fondo transparente. Tres llevan los acentos planos de la biblioteca: el «+» verde
`#18B070` de «agregar» (`animation-add`) y la raya roja `#E83020` de «ninguna»
(`transition-none`, `animation-none`). Cada uno tiene los siete tamaños, de 24 a 72 px.

**Metadatos.** Cada icono lleva en `metadata/overrides.json` su nombre y su descripción en español,
sus etiquetas y el producto `presenter-desktop`.

**Procedencia.** Queda escrita en `RIGHTS-AND-PUBLISHING.md`, en la fila del grupo `Common/Higgs/`.

## Tipo de Cambio

- `Agregado`

## Archivos Afectados

### [NUEVO] `Common/Higgs/<nombre>.ico.png/{24,30,36,42,48,60,72}.png` (24 iconos, 168 PNG)
### [MODIFICADO] `metadata/ids.json`
- 24 IDs nuevos al final, sin tocar ni reordenar los existentes (2977 → 3001).
### [MODIFICADO] `metadata/overrides.json`
- Nombre, descripción, etiquetas y producto de los 24 iconos.
### [MODIFICADO] `package.json`
- 0.1.2 → 0.1.3 con `npm version patch --no-git-tag-version`.
### [MODIFICADO] `README.md`, `docs/arquitectura.md`
- Recuento de iconos: 3001.
### [MODIFICADO] `RIGHTS-AND-PUBLISHING.md`
- Procedencia de los 24 iconos nuevos.

## Verificación

- `node --test`: `# tests 7`, `# pass 7`, `# fail 0`.
- `node tools/build.mjs`: `Built 3001 icons for Web and JUCE Desktop.`
- Compilación de `dist/desktop` como en la CI (Ninja, Release): `Linking CXX static library
  higgs_icons.lib`, código 0.
- Revisión visual con una hoja de contacto frente a iconos de la biblioteca (guardar, tabla,
  buscar, encabezado y pie, puntero, clasificador), a 48 y 24 px, y medición automática del tamaño
  del contenido y de los acentos.
- En Higgs Presenter, los 24 IDs nuevos se dibujan desde la biblioteca (ver su changelog).

## Impacto

- Cambio aditivo: ningún ID existente cambia.
- No regenerado: `catalogo-iconos.html` (el catálogo estático de GitHub Pages); el catálogo
  generado `dist/catalog/` sí los incluye.
- Sin publicar: no se etiqueta `v0.1.3` ni se sube nada; publicar es decisión del autor.
