# Formato nativo `.skriba`

El formato propio del escritorio es un paquete `.skriba`: un ZIP que guarda el
mismo JSON que escribe la versión web y las imágenes del documento. Un
documento pasa de la web al escritorio y vuelve sin perder nada. El código está
en `src/io/src/Formats.cpp` (`readPackage`, `writePackage`) y en
`src/model/src/Serialization.cpp` (el JSON).

La referencia del JSON, campo por campo, es
[especificacion-web/01-model-json.md](especificacion-web/01-model-json.md).
Este documento solo describe el paquete y las reglas que el escritorio sigue
para no romper la compatibilidad.

## El paquete

| Entrada | Compresión | Contenido |
| --- | --- | --- |
| `mimetype` | ninguna (*stored*), siempre la primera | `application/x-skriba`, sin salto de línea |
| `document.json` | deflate | El documento en el formato JSON de la web (UTF-8, con sangría de dos espacios) |
| `media/<rid>` | ninguna (las imágenes ya vienen comprimidas) | Los bytes de cada imagen del mapa `media` |

- La entrada `mimetype` va primero y sin comprimir, como en ODF, para que el
  sistema reconozca el tipo por los primeros bytes del archivo. El tipo MIME de
  Linux (`packaging/linux/co.com.eduxfuturo.Skriba.mime.xml`) busca
  `mimetypeapplication/x-skriba` en el desplazamiento 30.
- `<rid>` es la clave del mapa `media` del JSON (en la web, 16 caracteres
  hexadecimales, un punto y la extensión: `a1b2c3d4e5f60718.png`). Solo se
  escriben los nombres que sirven como un único componente de ruta: sin `/`,
  `\`, `:` ni caracteres de control, y distintos de `.` y `..`.
- Una imagen del mapa `media` sin bytes se queda en el JSON, pero no tiene
  entrada `media/<rid>`.

### Lectura

- El formato se reconoce por el contenido, no por la extensión: un ZIP con
  `document.json` es un paquete `.skriba`, y un ZIP con `[Content_Types].xml`
  es un `.docx`.
- Si hay entrada `mimetype` y su contenido (sin espacios alrededor) no es
  `application/x-skriba`, el archivo se rechaza. Si falta, el paquete se acepta.
- Sin `document.json` el paquete está dañado y no se abre.
- Los bytes de cada imagen se buscan en `media/<rid>` y, si no están, en
  `media/` más el nombre de archivo del campo `file`. Si no aparecen, la imagen
  se muestra vacía y se avisa una sola vez.
- Una imagen que está en `media/` pero falta en el mapa se registra en él con
  su tipo y su tamaño, siempre que sea una imagen válida.
- El documento puede ocupar hasta 512 MB, y cada imagen hasta 64 MB.

### Escritura

El archivo se escribe primero en un temporal de la misma carpeta y después se
renombra sobre el destino, así un fallo nunca deja un archivo a medias.

## JSON suelto

También se abre y guarda el JSON de la web sin empaquetar (`.json`). En ese
caso las imágenes van en una carpeta `media` junto al archivo, con el mismo
nombre `<rid>`. Al leer, si una imagen no está en el mapa `media` pero su
archivo existe en la carpeta, se registra (documentos de versiones de la web
que perdieron el mapa).

## Reglas de compatibilidad con la web

Estas reglas valen para `document.json` y para el JSON suelto:

- **Desplazamientos en UTF-16.** Una posición es `{blockId, offset}`, y
  `offset` cuenta unidades UTF-16, como `String.length` en JavaScript. Cada
  elemento que no es texto (tabulación, salto, imagen, campo, ecuación...)
  mide 1. El texto se guarda en memoria como `std::u16string`, así que no hay
  conversiones. Lo mismo vale para `start` y `end` de los comentarios y para
  `offset` de los marcadores.
- **Claves desconocidas.** Toda clave que el modelo no conoce se guarda tal
  cual y se vuelve a escribir después de las conocidas, en su orden original:
  en el documento, los bloques, los textos, `char`, `para`, las celdas, las
  filas, las secciones, los estilos, las listas, los comentarios, los
  marcadores y las imágenes. Así se conservan las claves de versiones más
  nuevas y las que la web pierde al guardar. Las advertencias de importación
  (`_warnings`) son pasajeras y no se guardan.
- **Orden de las claves.** El documento se escribe en el orden de `toJSON()`
  de la web (`version`, `app`, `locale`, `name`...), para que los archivos
  sean comparables.
- **Campos de tipo mapa.** `theme`, `media`, `tracking`, `protection`, `ink`
  y `activeView` son objetos. PHP convierte `{}` en `[]`, así que al leer se
  acepta `[]` (o cualquier valor que no sea un objeto) y se cambia por el
  valor por defecto, como hace `asMap()` en la web. Al escribir, siempre van
  como objetos.
- **Versión.** `version` es obligatorio y debe valer 1. Otro valor no se abre.
- **Valores por defecto de la web.** Una lista `styles` vacía se cambia por los
  estilos por defecto; un `body` vacío, por un párrafo `Normal` vacío; una
  lista `sections` vacía, por `sec1`. Los campos heredados del plan de la web
  (`footnotes`, `trackChanges`) se conservan sin tocarlos.
- **Formatos dispersos.** En `char` y `para` una clave presente sobrescribe el
  estilo y una ausente lo hereda. No se escriben valores resueltos.
- **Cuerpo plano.** Los párrafos de celdas, encabezados, pies y notas son
  párrafos del cuerpo con su marca (`cell`, `hf`, `fn`), como en la web.

Las diferencias deliberadas de comportamiento con la versión web están en
[arquitectura.md](arquitectura.md#diferencias-con-la-versión-web).
