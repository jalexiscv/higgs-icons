# Documentación de uso para consumir la biblioteca desde GitHub

**Fecha:** 2026-10-09
**Versión:** 0.1.0
**Área:** docs > Guías de uso
**Tiempo laborado:** 12 horas
**Autor:** Jose Alexis Correa Valencia <jalexiscv@gmail.com>
**Asistencia:** Agente de IA (Claude)

## Descripción

El repositorio está publicado en `github.com/jalexiscv/higgs-icons` para surtir
de iconos a Skriba, Odyssey y Presenter, pero el `README.md` solo explicaba cómo
usar un `dist/` ya generado en la misma máquina. Faltaba explicar cómo un
proyecto obtiene una versión desde GitHub (el repositorio no contiene `dist/`),
la referencia completa de las API web y C++, el formato del manifiesto y el
mantenimiento.

Se escribió la documentación completa a partir del código real
(`packages/web/index.js`, las plantillas C++/CMake de `tools/build.mjs`) y se
probó cada flujo de integración contra el repositorio de GitHub.

Al probar `FetchContent` apareció un problema real: Git en Windows no crea rutas
de más de 260 caracteres, y la ruta más larga del repositorio mide 100
(`Apps/Components/CommentsTool/Docker/RCBin/CommentsCoeditingTool_Indicator_Transperent.ico.png/72.png`).
Con una carpeta de compilación de más de unos 130 caracteres el clonado falla con
`Filename too long`. Se documentaron la causa y las dos soluciones probadas.

### Decisión de diseño

- **Cómo se surte a los proyectos:** como `dist/` no se versiona, cada consumidor
  genera la biblioteca con Node.js a partir de una etiqueta. Se documentaron
  `FetchContent` (recomendado para escritorio), submódulo, script de copia para
  web y ZIP. Se descartaron sin cambiar código otras opciones que necesitarían una
  decisión del autor: publicar `dist/` como archivos de los releases de GitHub
  desde la CI, o versionar `dist/` en una rama. Ambas evitarían exigir Node.js a
  los consumidores.
- **Ejemplo JUCE:** se construye la ruta con `juce::File` en lugar de convertir
  `std::filesystem::path` a texto, para no depender de la página de códigos de
  Windows en carpetas con tildes.

## Tipo de Cambio

- `Agregado`
- `Cambiado`

## Archivos Afectados

### [NUEVO] `docs/obtener-desde-github.md`
- Versiones y compatibilidad, `FetchContent`, submódulo, scripts de copia en
  PowerShell y Bash, ZIP, cómo encontrar el ID, rutas largas en Windows, CI y
  problemas frecuentes.

### [NUEVO] `docs/uso-web.md`
- Referencia de `loadIconLibrary` e `IconLibrary` y recetas (alta densidad, CSS,
  PHP, filtro por producto).

### [NUEVO] `docs/uso-escritorio.md`
- Referencia de `higgs_icons`, diferencias con la web, ejemplo con JUCE, uso sin
  JUCE y cómo distribuir la carpeta `HiggsIcons/assets`.

### [NUEVO] `docs/manifiesto.md`, `docs/mantenimiento.md`
- Formato y garantías del manifiesto; cómo añadir iconos, registrar IDs, curar
  metadatos y publicar una versión.

### [MODIFICADO] `README.md`
- Reescrito como portada del repositorio: arranque rápido web y escritorio,
  catálogo en línea, versiones e índice completo.

### [MODIFICADO] `docs/arquitectura.md`, `docs/protocols/Documentations.md`
- Enlaces a las guías y regla de que los fragmentos de las guías funcionen tal
  cual.

## Verificación

- `npm run check`: `# pass 7`, `# fail 0`, `Built 2949 icons for Web and JUCE Desktop.`
- **Escritorio desde GitHub:** proyecto CMake de prueba con el bloque
  `FetchContent` de la guía (con `GIT_TAG main`, porque aún no hay etiquetas):
  descarga, generación y compilación con MSVC y Ninja en verde (36 s la primera
  vez). El ejecutable resolvió `apps.components.base-tool.parallel-lines-count` a
  `…/HiggsIcons/assets/…/24.png` (el archivo existe), encontró 8 iconos con
  `"parallel lines"` y 2949 en total. Se probaron las dos variantes de
  `execute_process` que muestran el `README.md` y la guía.
- **Rutas largas:** en una carpeta más profunda, el clonado falló con
  `Filename too long`; con `core.longpaths=true` el mismo proyecto se configuró,
  compiló y ejecutó correctamente.
- **Web:** el script de PowerShell de la guía clonó, generó y copió `dist/web` en
  una aplicación de prueba. Servida por HTTP bajo `/assets/higgs-icons/`,
  `loadIconLibrary` cargó la versión 0.1.0 con 2949 iconos, `url(..., { size: 32 })`
  devolvió el PNG de 24 px con respuesta 200, y `search` y `findLegacyName`
  dieron los resultados documentados.
- El ejemplo del manifiesto es la entrada real del icono citado.
- 83 enlaces y anclas de la documentación comprobados con un script.
- **No verificado:** el ejemplo con JUCE (no hay JUCE en esta máquina), el script
  de Bash y la compilación en Linux y macOS.

## Impacto

- Sin cambios en el código ni en las salidas.
- Los ejemplos usan la etiqueta `v0.1.0`, que todavía no existe en GitHub:
  hasta crearla, los consumidores deben fijar el hash de un commit.
