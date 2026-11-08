# 26 iconos nuevos del grupo `common.higgs` para Higgs Skriba

**Fecha:** 2026-10-13
**Versión:** 0.1.1
**Área:** recursos > Common/Higgs; metadatos
**Tiempo laborado:** 12 horas
**Autor:** Jose Alexis Correa Valencia <jalexiscv@utede.edu.co>
**Asistencia:** Agente de IA (Claude)

## Descripción

La orden 11 de Higgs Skriba decide que Skriba dibuja sus iconos desde esta biblioteca. Se buscó por
significado, viendo cada imagen, un icono para cada uno de los 164 nombres de Skriba: 123 ya
existían. De los 41 restantes, 15 siguen siendo vectores propios de Skriba por razón técnica
(controles de ventana de 9–14 px, el logotipo y las dos barras de color dinámicas). Los otros 26 se
crean aquí, en un grupo nuevo, `Common/Higgs/`, con ID `common.higgs.<nombre>`, para que sirvan a
toda la familia.

**Estilo.** Se midió sobre una muestra de la biblioteca:
- El dibujo ocupa unos dos tercios del lienzo: 16 de 24 px, 32 de 48 y 48 de 72.
- El trazo mide lienzo/24 px: 1, 2 y 3 px.
- La tinta es `#2E3138`, sobre fondo transparente.

Los iconos nuevos lo cumplen (contenido 16, 30 y 44 px; trazo 1, 2 y 3 px):
- **Seis alineaciones de celda** (arriba, centro y abajo, cada una al centro y a la derecha). Salen
  de `common.shared-res.vertical-alignment-top/center/bottom`, píxel a píxel: solo se mueve la línea
  corta. Así la rejilla de 3×3 con los tres originales es una sola familia.
- **Otros veinte.** Se exportan de los diseños vectoriales propios de Higgs Skriba con
  `Skriba.exe --icon-export`, que encaja la rejilla en ese tamaño y escala el trazo: clear-format,
  margins, orientation, header-footer, cross-reference, footnote, caption, index, date-time,
  quick-parts, watermark, navigation, table-properties, table-delete-cells, table-select-cell,
  table-select-row, table-split, text-direction, cell-margins y table-repeat-header.

**Metadatos.** Cada icono nuevo lleva en `metadata/overrides.json` su nombre y su descripción en
español, sus etiquetas y el producto `skriba-desktop`, para que el catálogo los encuentre.

**Procedencia.** Queda escrita para este grupo en `RIGHTS-AND-PUBLISHING.md`, y es el primero del
registro. Las seis alineaciones heredan la procedencia de su grupo de origen, que sigue por
registrar.

## Tipo de Cambio

- `Agregado`

## Archivos Afectados

### [NUEVO] `Common/Higgs/<nombre>.ico.png/{24,48,72}.png` (26 iconos, 78 PNG)
### [MODIFICADO] `metadata/ids.json`
- 26 IDs nuevos al final, sin tocar ni reordenar los existentes.
### [MODIFICADO] `metadata/overrides.json`
- Nombre, descripción, etiquetas y producto de los 26 iconos.
### [MODIFICADO] `package.json`
- 0.1.0 → 0.1.1 con `npm version patch --no-git-tag-version`.
### [MODIFICADO] `README.md`, `docs/arquitectura.md`
- Recuento de iconos: 2975.
### [MODIFICADO] `RIGHTS-AND-PUBLISHING.md`
- Tabla del registro de procedencia, con el grupo `Common/Higgs/`.

## Verificación

- `node --test`: `# tests 7`, `# pass 7`, `# fail 0`.
- `node tools/build.mjs`: `Built 2975 icons for Web and JUCE Desktop.` El manifiesto web tiene
  2975 entradas con los nombres en español.
- Compilación de `dist/desktop` como en la CI (Ninja, Release): `Linking CXX static library
  higgs_icons.lib`, código 0.
- Revisión visual con hojas de contacto frente a iconos de la biblioteca, a 48 y 24 px, y medición
  automática del tamaño del contenido y del trazo.
- En Higgs Skriba, los 26 IDs nuevos se dibujan desde la biblioteca (ver su changelog de la
  orden 11).

## Impacto

- Cambio aditivo: ningún ID existente cambia.
- No regenerado: `catalogo-iconos.html` (el catálogo estático de GitHub Pages) no incluye los iconos
  nuevos, porque `tools/build.mjs` no lo regenera. El catálogo generado `dist/catalog/` sí los
  incluye.
- Sin publicar: no se etiqueta `v0.1.1` ni se sube nada; publicar es decisión del autor.
