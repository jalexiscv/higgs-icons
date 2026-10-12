# Derechos y publicación

**Estado: la biblioteca es material propio del autor y se puede usar y distribuir.**

Decisión del autor, 2026-10-12. Sustituye al estado anterior («pendiente de revisión antes de hacer
público el repositorio»), que retiraba el uso de la biblioteca hasta completar una auditoría. La
biblioteca se usa ya: es la fuente de iconos de las aplicaciones de la familia Higgs.

## Qué se puede hacer

- Usarla en las aplicaciones de la familia Higgs (Skriba, Odyssey, Presenter) y en cualquier
  proyecto del autor.
- Copiarla, modificarla y redistribuirla junto con esos proyectos.
- Publicarla: repositorio, `dist/`, GitHub Pages y paquetes adjuntos a un release.

## Licencia — por decidir

Hoy **no hay licencia declarada**, ni para el código y los metadatos ni para las imágenes, y no
existe fichero `LICENSE`. Mientras no la haya, quien copie la biblioteca desde fuera no tiene
términos a los que acogerse. Es decisión del autor y se elige una vez, no por proyecto:

| Qué | Licencia | Estado |
| --- | --- | --- |
| Código y metadatos (`tools/`, `packages/`, la biblioteca C++) | por decidir | pendiente |
| Archivos de imagen (`Apps/`, `Common/`, `Engines/`) | por decidir | pendiente |

Candidatas razonables, para que la decisión sea informada: AGPL-3.0-or-later (coherente con Skriba,
y obliga a quien la use a liberar su código), MIT o Apache-2.0 (permisivas, permiten uso cerrado) y
CC-BY-4.0 o CC0-1.0 para las imágenes, que se licencian aparte del código.

## Procedencia — registro por cerrar

El árbol conserva las rutas heredadas de las aplicaciones de las que proceden los recursos
(`Apps/`, `Common/`, `Engines/`, con carpetas `RcBin`). No es una puerta: es un registro que hay
que escribir para que no dependa de la memoria de nadie. Por cada grupo:

- quién lo creó o de dónde salió;
- los términos con los que se puede distribuir.

## Cómo se incorporan iconos nuevos

- **Procedencia conocida y declarada en el changelog** (de qué aplicación o autor vienen). Sin eso,
  no se añade.
- **No se extraen recursos de binarios de productos propietarios** para añadirlos al inventario, ni
  se usan herramientas de ingeniería inversa para obtenerlos.
- **Los identificadores canónicos no cambian**: un ID publicado en `metadata/ids.json` es un
  contrato con las aplicaciones.

## Publicación

Publicar (hacer público el repositorio, subir `dist/`, activar o ampliar GitHub Pages, adjuntar
paquetes a un release) es decisión del autor. La revisión de derechos ya no es un requisito previo.
