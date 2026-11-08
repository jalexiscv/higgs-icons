# Uso en aplicaciones web

`dist/web/` es un módulo ES sin dependencias que funciona en cualquier navegador
moderno sin bundler, en aplicaciones de JavaScript vanilla, PHP o cualquier otra
tecnología de servidor. Cómo obtener la carpeta está en
[obtener-desde-github.md](obtener-desde-github.md).

## Contenido de `dist/web/`

```
dist/web/
├── index.js        ← el módulo (IconLibrary, loadIconLibrary)
├── manifest.json   ← inventario: IDs, nombres, tags y rutas de cada archivo
└── assets/         ← PNG: assets/<ID con "/">/<tamaño>.png
                       SVG: assets/<ID con "/">/light.svg y dark.svg
```

Cada icono trae PNG por tamaño (`variants`), dibujo vectorial en tema claro y
oscuro (`svg`) o ambos ([manifiesto.md](manifiesto.md)). Desde 0.2.1 los 3048
iconos son solo vectoriales: `url` devuelve `null` y se usa `svgUrl` (o
`createImage`, que ya elige el SVG).

La carpeta se copia **completa y sin reorganizar** a una ruta pública de la
aplicación, por ejemplo `public/assets/higgs-icons/`. El módulo calcula las rutas
del manifiesto y de las imágenes relativas a su propia URL, así que funciona bajo
cualquier prefijo (`/assets/higgs-icons/`, `/skriba/static/icons/`…). El formato
del manifiesto está en [manifiesto.md](manifiesto.md).

## Inicio rápido

```html
<div id="toolbar"></div>
<script type="module">
  import { loadIconLibrary } from '/assets/higgs-icons/index.js';

  const icons = await loadIconLibrary();
  const image = icons.createImage('apps.components.base-tool.parallel-lines-count', {
    size: 24,
    alt: 'Contar líneas paralelas',
  });
  document.querySelector('#toolbar').append(image);
</script>
```

Cargar la biblioteca una sola vez por página y reutilizar el objeto: el manifiesto
pesa unos 2 MB sin comprimir (conviene que el servidor lo sirva con gzip o
Brotli).

```js
// icons.js de la aplicación
import { loadIconLibrary } from '/assets/higgs-icons/index.js';
export const icons = await loadIconLibrary();
```

## Referencia de la API

### `loadIconLibrary(opciones?)` → `Promise<IconLibrary>`

Descarga `manifest.json` y devuelve la biblioteca.

| Opción | Por defecto | Uso |
| --- | --- | --- |
| `manifestUrl` | `manifest.json` junto a `index.js` | URL del manifiesto |
| `assetBase` | carpeta de `index.js` | Base contra la que se resuelven las rutas de los PNG y los SVG |
| `fetchImpl` | `fetch` global | Función compatible con `fetch` (pruebas, entornos sin `fetch`) |

Rechaza con `Error('Unable to load icon manifest (<estado HTTP>).')` si el
manifiesto no responde con éxito.

### `new IconLibrary(manifest, { assetBase }?)`

Crea la biblioteca a partir de un manifiesto ya cargado (por ejemplo, incrustado
por el servidor). Lanza `TypeError` si el manifiesto no tiene un arreglo `icons`.
`library.manifest` da acceso al manifiesto completo, incluido `libraryVersion`.

### `get(idOAlias)` → icono o `null`

Devuelve la entrada del manifiesto por **ID canónico**; si no existe, por alias
(sin distinguir mayúsculas) siempre que el alias sea de un solo icono.

### `findLegacyName(nombre)` → icono o `null`

Busca por nombre heredado (`parallel_lines_count.ico.png`) o alias, sin distinguir
mayúsculas. Solo devuelve resultado si hay **exactamente una** coincidencia. Sirve
para migrar código que usaba los archivos antiguos.

### `url(id, { size = 24 }?)` → `string` o `null`

URL absoluta del PNG del tamaño disponible **más cercano** a `size`; en empate,
el mayor. Con los tamaños habituales (24, 48 y 72): `size: 32` da 24, `size: 36`
da 48 y `size: 96` da 72. Devuelve `null` si el ID no existe **o si el icono no
tiene PNG** (solo dibujo vectorial): en ese caso se usa `svgUrl`.

### `svgUrl(id, { theme = 'light' }?)` → `string` o `null`

URL absoluta del SVG del icono en el tema pedido, `'light'` u `'dark'`
(cualquier otro valor da el claro). El SVG tiene `viewBox="0 0 24 24"` y se
muestra nítido a 24, 30, 36, 42, 48, 60, 72 o 128 px con `width` y `height`.
Devuelve `null` si el ID no existe o si el icono solo tiene PNG.

### `createImage(id, { size = 24, alt, className = '', theme = 'light' }?)` → `HTMLImageElement` o `null`

Crea un `<img>` con `src` = `url(id, { size })` o, si el icono no tiene PNG,
`svgUrl(id, { theme })`; `width` y `height` = `size`, `decoding="async"`, la
clase indicada y `alt` = el `alt` recibido o, si no se pasa, el nombre del icono.
Para un icono decorativo junto a un texto, pasar `alt: ''`. Devuelve `null` si
el ID no existe.

### `search(consulta, { limit = 50 }?)` → arreglo de iconos

Divide la consulta en palabras; un icono coincide si **todas** aparecen (como
subcadena, sin distinguir mayúsculas) en su ID, nombre, nombre heredado, ruta de
origen, alias o tags. Ordena primero el ID exacto, luego los IDs que empiezan por
la primera palabra, luego los que la contienen y al final el resto, y dentro de
cada grupo por ID. Una consulta vacía devuelve los primeros `limit` iconos;
`limit: 0` devuelve un arreglo vacío.

### Entrada de un icono

Lo que devuelven `get`, `findLegacyName` y `search` es la entrada del manifiesto:
`id`, `name`, `description`, `category`, `source`, `legacyName`, `aliases`,
`tags`, `products`, `variants` y `svg` ([manifiesto.md](manifiesto.md)).

## Recetas

### Botón con icono y texto

```js
const button = document.createElement('button');
button.append(icons.createImage('apps.components.base-tool.parallel-lines-count', { size: 24, alt: '' }) ?? '');
button.append(' Contar líneas');
```

### Tema oscuro

Los iconos vectoriales traen un dibujo por tema. Elegirlo según el tema de la
página (o según `prefers-color-scheme`) y volver a crear las imágenes al cambiar:

```js
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const image = icons.createImage('common.higgs.eye', { size: 24, theme: dark ? 'dark' : 'light' });
```

Un SVG se ve nítido a cualquier tamaño, así que no hace falta pedir el tamaño
físico de la pantalla como con los PNG.

### Pantallas de alta densidad

`createImage` elige el PNG por el tamaño en píxeles CSS. Para que se vea nítido en
pantallas con `devicePixelRatio` 2 o 3, pedir la URL al tamaño físico y fijar el
tamaño CSS aparte:

```js
function crispIcon(id, cssSize, alt = '') {
  const src = icons.url(id, { size: cssSize * window.devicePixelRatio });
  if (!src) return null;
  const image = new Image(cssSize, cssSize);
  image.src = src;
  image.alt = alt;
  return image;
}
```

### Uso en CSS

```js
element.style.backgroundImage = `url("${icons.url(id, { size: 48 })}")`;
```

### Aplicaciones PHP

No hace falta nada en el servidor: se copia `dist/web/` bajo la carpeta pública y
se carga el módulo desde la plantilla con `<script type="module">`. Si la
aplicación vive bajo un subdirectorio, usar la ruta completa en el `import`
(`/skriba/assets/higgs-icons/index.js`) o una relativa a la página.

### Filtrar por producto

`products` indica en qué productos se usa un icono cuando está curado (hoy ningún
icono lo tiene):

```js
const skribaIcons = icons.manifest.icons.filter((icon) => icon.products.includes('skriba-web'));
```

## Requisitos y límites

- Navegadores con módulos ES y `import` de nivel superior (`await` fuera de
  funciones): Chrome, Edge, Firefox y Safari actuales.
- La página debe servirse por HTTP(S): abrirla como `file://` bloquea la carga del
  manifiesto.
- La biblioteca no hace caché propia: confía en la del navegador. Al actualizar de
  versión cambian los archivos con el mismo nombre, así que conviene servir la
  carpeta con un prefijo que incluya la versión o invalidar la caché al desplegar.
