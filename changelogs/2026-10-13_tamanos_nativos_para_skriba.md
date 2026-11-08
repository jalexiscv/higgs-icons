# Tamaños nativos de 30, 36, 42 y 60 px para los iconos de Higgs Skriba

**Fecha:** 2026-10-13
**Versión:** 0.1.2
**Área:** recursos; metadatos
**Tiempo laborado:** 6 horas
**Autor:** Jose Alexis Correa Valencia <jalexiscv@utede.edu.co>
**Asistencia:** Agente de IA (Claude)

## Descripción

El autor decidió que en Higgs Skriba el icono mínimo mida 24 px y que cada icono se dibuje a su
tamaño nativo, píxel a píxel, para evitar las distorsiones del remuestreo al dibujar. Con solo 24,
48 y 72 px, las escalas de pantalla de Windows de 125, 150 y 175 % no tienen tamaño nativo: piden
30, 36, 42 y 60 px.

Se añaden esas variantes a los **150 iconos que usa Skriba**:
- **Heredados y alineaciones de celda:** reducción única con Lanczos sobre alfa premultiplicado
  (sin halos oscuros). Las de 30, 36 y 42 salen de la de 48, y la de 60 de la de 72. Se revisaron a
  ojo, a tamaño real y ampliadas.
- **Los 20 `common.higgs` que vienen de un vectorial:** exportados exactos desde su diseño, con la
  proporción y el trazo de la biblioteca.

Se añaden también dos iconos, `common.higgs.font-color` y `common.higgs.highlight`: la «A» y el
rotulador **sin barra de color**, en los siete tamaños. Skriba dibuja encima la barra con el color
que el usuario elige, así que estos dos botones también salen de la biblioteca.

## Tipo de Cambio

- `Agregado`

## Archivos Afectados

### [MODIFICADO] 148 directorios `.ico.png`
- `30.png`, `36.png`, `42.png` y `60.png` nuevos.
### [NUEVO] `Common/Higgs/font-color.ico.png`, `Common/Higgs/highlight.ico.png`
- Siete tamaños cada uno.
### [MODIFICADO] `metadata/ids.json`, `metadata/overrides.json`
- Dos IDs y sus nombres en español.
### [MODIFICADO] `package.json`
- 0.1.1 → 0.1.2.
### [MODIFICADO] `README.md`, `docs/arquitectura.md`, `RIGHTS-AND-PUBLISHING.md`
- Recuento (2977), tamaños por icono y procedencia de las variantes.

## Verificación

- `node --test`: `# tests 7`, `# pass 7`, `# fail 0`.
- `node tools/build.mjs`: `Built 2977 icons for Web and JUCE Desktop.`
- Compilación de `dist/desktop`: `Linking CXX static library higgs_icons.lib`, código 0.
- Revisión visual de una muestra en los siete tamaños: negrita, alinear, insertar fila, copiar,
  ajustes, título, alineación de celda y la «A».

## Impacto

- Cambio aditivo: ningún ID ni variante existente cambia.
- Los iconos heredados no tienen fuente vectorial, así que sus variantes nuevas son reducciones,
  no dibujos nuevos. Las líneas finas paralelas (las de alinear, por ejemplo) quedan algo grisáceas
  a 30 y 42 px.
- No hay variantes mayores de 72 px, y los heredados no se pueden ampliar sin distorsión. A más de
  72 px físicos, el consumidor usa la de 72.
- El resto de la biblioteca (unos 2830 iconos) sigue en 24, 48 y 72 px.
