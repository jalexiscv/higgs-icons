# La biblioteca deja de estar en revisión: es material propio y se puede usar

**Fecha:** 2026-10-12
**Versión:** 0.1.0
**Área:** docs > Derechos y publicación
**Tiempo laborado:** 1 hora
**Autor:** Jose Alexis Correa Valencia <jalexiscv@gmail.com>
**Asistencia:** Agente de IA (Hermes Agent)

No sube versión: el cambio no toca lo que se distribuye (ni iconos, ni metadatos, ni el generador,
ni el módulo web, ni la biblioteca C++, ni el catálogo), según `Releases.md` §3.

## Descripción

`RIGHTS-AND-PUBLISHING.md` decía «Estado: pendiente de revisión antes de hacer público el
repositorio o distribuir `dist/`» y cerraba con «Hasta completar la revisión, no inicializar ni
publicar un repositorio público». El documento y el proyecto se contradecían: el repositorio está
publicado en `github.com/jalexiscv/higgs-icons`, el catálogo se sirve por GitHub Pages y la
biblioteca está pensada para surtir a Skriba, Odyssey y Presenter. Un documento que prohíbe lo que
el proyecto ya hace no protege a nadie: confunde.

El autor decide que **la biblioteca es material propio y se puede usar y distribuir ya**. Se
sustituye el estado y se retiran las frases que quitaban el uso, en los diez sitios que citaban el
documento (README, `CLAUDE.md`, `docs/arquitectura.md`, `docs/mantenimiento.md`, los cuatro
protocolos y la propia guía).

Lo que **no** se retira, porque no era la traba:

- la regla de **procedencia conocida** para incorporar iconos nuevos, con su prohibición de extraer
  recursos de binarios de productos propietarios: es la misma disciplina que la sala limpia de
  Higgs Skriba y no tiene nada que ver con lo que ya está inventariado;
- el **registro de procedencia por grupo**, que pasa de puerta a tarea: se escribe y se informa;
- la **licencia**, que sigue sin declararse y es lo único que impide de verdad que un tercero tenga
  términos a los que acogerse.

### Decisión de diseño

- **Sustituir el estado en vez de borrar el fichero.** Borrarlo habría eliminado también el
  recordatorio de que falta licencia y la lista de procedencia pendiente. El fichero se queda y
  sigue siendo el sitio único de la verdad sobre derechos; lo que cambia es lo que dice.
- **Decisión del autor, registrada como suya.** El documento no afirma que se hayan verificado
  procedencias: afirma que el uso está aprobado, que es lo que el autor ha decidido.
- **La licencia queda abierta, con candidatas propuestas** para que la decisión sea informada:
  AGPL-3.0-or-later (coherente con Skriba, obliga a liberar el código de quien la use), MIT o
  Apache-2.0 (permisivas) para el código, y CC-BY-4.0 o CC0-1.0 para las imágenes.

## Tipo de Cambio

- `Cambiado`

## Archivos Afectados

### [MODIFICADO] `RIGHTS-AND-PUBLISHING.md`
- Estado nuevo, qué se puede hacer, licencia por decidir con candidatas, procedencia como registro,
  reglas para incorporar iconos nuevos y publicación como decisión del autor.

### [MODIFICADO] `README.md`
- La sección «Derechos» dice que la biblioteca es material propio y se puede usar; lo que falta es
  declarar la licencia y escribir la procedencia.

### [MODIFICADO] `CLAUDE.md`
- La regla de procedencia y derechos ya no condiciona la publicación a la revisión: la biblioteca se
  puede usar y publicar, y publicar es decisión del autor.

### [MODIFICADO] `docs/arquitectura.md`
- En «Límites conocidos», la revisión pendiente pasa a ser «no declara licencia todavía, y la
  procedencia de cada grupo está por escribir».

### [MODIFICADO] `docs/protocols/Fable/Security.md`
- §5.1: el estado pasa de revisión pendiente a material propio usable.

### [MODIFICADO] `docs/protocols/Releases.md`
- §4: se retira «la revisión de derechos está pendiente»; se mantiene que publicar es decisión del
  autor.

### [MODIFICADO] `docs/protocols/Fable/Execution.md`
- La tabla de anti-patrones ya no justifica «publicar sin orden» con la revisión pendiente.

## Verificación

- Búsqueda de las afirmaciones retiradas sobre el árbol de documentación: cero coincidencias de
  «revisión de derechos pendiente», «no inicializar ni publicar» y «no se publica nada» fuera de los
  changelogs anteriores, que son el registro histórico.
- Los diez ficheros que citaban `RIGHTS-AND-PUBLISHING.md` siguen apuntando a un fichero existente:
  se ha sustituido el contenido, no el nombre.
- Sin cambio en el inventario, los metadatos, el generador ni las salidas: `node --test` y
  `node tools/build.mjs` no se ven afectados. No se ha ejecutado ningún release.
- No se ha publicado nada: este cambio queda en el árbol de trabajo.

## Impacto

- La biblioteca se puede usar sin puerta previa: desbloquea la orden 11 de Higgs Skriba, que pasa de
  bloqueada a ejecutable.
- Queda pendiente y señalada la licencia: sin ella la biblioteca es usable por el autor y sus
  proyectos, pero no formalmente citable por terceros.
- Los grupos de recursos siguen conservando rutas heredadas de las aplicaciones de las que
  proceden; escribir esa procedencia queda como registro, no como requisito.
