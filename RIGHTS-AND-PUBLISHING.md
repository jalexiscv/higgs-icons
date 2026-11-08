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

| Grupo | Procedencia | Términos |
| --- | --- | --- |
| `Common/Higgs/` (`common.higgs.*`, desde 0.1.1) | Creados por el autor para la familia Higgs en 2026-10-13. Seis alineaciones de celda (`common.higgs.cell-align-*`) derivan de `common.shared-res.vertical-alignment-*` de esta biblioteca (se mueve la línea corta) y heredan la procedencia de ese grupo, aún por registrar; los demás se exportan de los diseños vectoriales propios de Higgs Skriba (AGPL-3.0-or-later) con la proporción y el trazo de la biblioteca (`Skriba.exe --icon-export`). Desde 0.1.3, 24 más (presentaciones: sección, transiciones, animaciones, presentación, gráfico, audio, tamaño de diapositiva, patrón, sombra y espaciado del texto, contorno, ventana, mostrar, duplicar), creados por el autor el 2026-10-24 y exportados de los diseños vectoriales propios de Higgs Presenter (AGPL-3.0-or-later) con la proporción y el trazo de la biblioteca (`Presenter.exe --icon-export`) | Los de la biblioteca, cuando se elija su licencia |
| Variantes de 30, 36, 42 y 60 px de los iconos que usa Higgs Skriba (0.1.2 a 0.1.3) | Reducciones (Lanczos, alfa premultiplicado) de las variantes de 48 y 72 px del mismo icono, hechas en 2026-10-13; las de `common.higgs` exportadas de su vectorial. Retiradas en 0.2.0 junto con el resto de PNG de esos iconos | Las del icono del que derivan |
| Dibujos SVG (`light.svg`) de los 174 iconos que usan Higgs Skriba y Higgs Presenter (desde 0.2.0) | Creados por el autor el 2026-11-08 con el estilo del skill `iconos-svg-ui` (rejilla de 24 px, trazo de 1 px, paleta cerrada). Los 52 de `common.higgs` se convierten de los fragmentos vectoriales propios de Higgs Skriba y Higgs Presenter (AGPL-3.0-or-later; rejilla de 16 llevada a 24 con trazo de 1 px; cinco con texto redibujados a mano). Los otros 122 son dibujos nuevos del autor que representan el mismo concepto que el PNG heredado al que sustituyen, sin calcarlo. El dibujo oscuro se deriva del claro al generar | Los de la biblioteca, cuando se elija su licencia |
| Dibujos SVG (`light.svg`) de los 2827 iconos restantes (desde 0.2.1) | Creados el 2026-11-08 por encargo del autor con agentes de IA siguiendo el skill `iconos-svg-ui` y las reglas del proyecto. Cada uno es un dibujo nuevo que representa el mismo concepto que el PNG heredado al que sustituye, sin calcarlo. El dibujo oscuro se deriva del claro al generar | Los de la biblioteca, cuando se elija su licencia |
| `Apps/`, `Common/Res/`, `Engines/` (los PNG heredados, retirados en 0.2.0 y 0.2.1) | Por registrar | Por registrar |

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
