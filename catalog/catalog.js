import { loadIconLibrary } from '../web/index.js';

const queryInput = document.querySelector('#query');
const grid = document.querySelector('#grid');
const count = document.querySelector('#count');
const status = document.querySelector('#status');
let library;

function render() {
  const query = queryInput.value.trim();
  const icons = library.search(query, { limit: 5000 });
  const fragment = document.createDocumentFragment();

  for (const icon of icons) {
    const article = document.createElement('article');
    const preview = document.createElement('div');
    const image = document.createElement('img');
    const name = document.createElement('div');
    const id = document.createElement('code');
    const source = document.createElement('small');
    const copy = document.createElement('button');

    preview.className = 'preview';
    image.src = library.url(icon.id, { size: 48 });
    image.alt = '';
    image.loading = 'lazy';
    preview.append(image);
    name.className = 'name';
    name.textContent = icon.name;
    id.textContent = icon.id;
    source.textContent = icon.source;
    copy.type = 'button';
    copy.textContent = 'Copiar ID';
    copy.title = 'Copiar ID canónico';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(icon.id);
      copy.textContent = 'Copiado';
      setTimeout(() => { copy.textContent = 'Copiar ID'; }, 1000);
    });

    article.append(preview, name, id, source, copy);
    fragment.append(article);
  }

  grid.replaceChildren(fragment);
  count.textContent = `${icons.length} iconos`;
  status.hidden = icons.length > 0;
  status.textContent = query && icons.length === 0 ? 'No hay coincidencias.' : '';
}

try {
  library = await loadIconLibrary();
  queryInput.addEventListener('input', render);
  render();
} catch (error) {
  status.textContent = `No se pudo cargar el inventario: ${error.message}`;
}