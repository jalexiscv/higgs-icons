// Static catalogue of the vector icons for GitHub Pages: catalogo-iconos-svg.html at the
// repository root. Unlike dist/catalog it needs no manifest or server; the drawings are
// embedded as <symbol>s in both themes, so the page works from the published tree alone.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, deriveDarkSvg } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [24, 48, 72];

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The drawing as a <symbol>: the root's presentation attributes (fill="none" above all,
// or every path would be filled black) travel with it; the <title> and the size do not.
const ROOT_ONLY = new Set(['xmlns', 'xmlns:xlink', 'viewBox', 'width', 'height']);
function symbol(id, svg) {
  const match = svg.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/);
  if (!match) throw new Error('Not an <svg> document.');
  const attributes = [...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)]
    .filter(([, name]) => !ROOT_ONLY.has(name))
    .map(([, name, value]) => ` ${name}="${value}"`)
    .join('');
  const body = match[2].replace(/<title>[\s\S]*?<\/title>/, '').trim();
  return `<symbol id="${id}" viewBox="0 0 24 24"${attributes}>${body}</symbol>`;
}

export async function renderSvgCatalog({ root = ROOT } = {}) {
  const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const overrides = JSON.parse(await readFile(path.join(root, 'metadata', 'overrides.json'), 'utf8'));
  const idRegistry = JSON.parse(await readFile(path.join(root, 'metadata', 'ids.json'), 'utf8'));
  const icons = (await buildManifest(root, overrides, idRegistry)).filter((icon) => icon.drawings.light);

  const symbols = [];
  const cards = [];
  const groups = new Map();
  for (const icon of icons) {
    const light = await readFile(icon.drawings.light, 'utf8');
    const dark = icon.drawings.dark ? await readFile(icon.drawings.dark, 'utf8') : deriveDarkSvg(light);
    symbols.push(symbol(`l-${escapeHtml(icon.id)}`, light));
    symbols.push(symbol(`d-${escapeHtml(icon.id)}`, dark));
    const strip = (theme) => SIZES.map((size) =>
      `<svg class="${theme}" width="${size}" height="${size}" role="img" aria-label="${escapeHtml(icon.name)} ${size} px"><use href="#${theme}-${escapeHtml(icon.id)}"/></svg>`).join('');
    const search = [icon.id, icon.name, icon.legacyName, icon.source, ...icon.aliases, ...icon.tags].join(' ').toLowerCase();
    const card = `<figure class="card" data-id="${escapeHtml(icon.id)}" data-search="${escapeHtml(search)}">\n` +
      `<div class="strip">${strip('l')}${strip('d')}</div>\n` +
      `<figcaption><div class="cname">${escapeHtml(icon.name)}</div><code>${escapeHtml(icon.id)}</code>` +
      `<small>${escapeHtml(icon.source)}</small><button type="button" class="copy">Copiar ID</button></figcaption>\n</figure>`;
    if (!groups.has(icon.category)) groups.set(icon.category, []);
    groups.get(icon.category).push(card);
  }
  for (const category of [...groups.keys()].sort()) {
    const groupCards = groups.get(category);
    const label = groupCards.length === 1 ? '1 icono' : `${groupCards.length} iconos`;
    cards.push(`<section data-group="${escapeHtml(category)}"><h2><span>${escapeHtml(category)}</span> <span class="tag">${label}</span></h2>\n<div class="grid">\n${groupCards.join('\n')}\n</div></section>`);
  }

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Higgs Icons · catálogo SVG</title>
<style>
:root{--bg:#f2f5f9;--panel:#fff;--line:#d4dce7;--txt:#18212b;--mut:#526071;--acc:#1266d8;--check1:#eef2f6;--check2:#fff;color-scheme:light}
:root[data-theme=dark]{--bg:#0f1115;--panel:#171b22;--line:#262e3a;--txt:#e6e9ef;--mut:#8b95a7;--acc:#4da3ff;--check1:#1e242e;--check2:#171b22;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;font:14px/1.45 "Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--txt)}
header{position:sticky;top:0;z-index:1;display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px 20px;background:var(--panel);border-bottom:1px solid var(--line)}
h1{margin:0;font-size:18px}
h1 small{font-weight:400;color:var(--mut);font-size:13px;margin-left:8px}
header a{color:var(--acc)}
input[type=search]{flex:1 1 300px;min-width:180px;padding:10px 12px;border:1px solid var(--line);border-radius:5px;font:inherit;background:var(--panel);color:var(--txt)}
label{display:flex;align-items:center;gap:6px;color:var(--mut);white-space:nowrap}
#count{color:var(--mut);white-space:nowrap}
main{max-width:1600px;margin:auto;padding:18px 20px 48px}
h2{font-size:15px;margin:22px 0 10px;display:flex;gap:10px;align-items:baseline}
.tag{font-size:12px;color:var(--mut);font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:10px}
.card{margin:0;min-width:0;padding:10px;background:var(--panel);border:1px solid var(--line);border-radius:5px}
.card.hidden,section.hidden{display:none}
.strip{display:flex;align-items:flex-end;justify-content:center;gap:12px;height:88px;margin-bottom:8px;padding:6px;background:repeating-conic-gradient(var(--check1) 0 25%,var(--check2) 0 50%) 0 / 16px 16px}
.strip svg{flex:0 0 auto}
.strip .d,:root[data-theme=dark] .strip .l{display:none}
:root[data-theme=dark] .strip .d{display:block}
.cname{font-weight:600;overflow-wrap:anywhere}
code,small{display:block;margin-top:4px;color:var(--mut);overflow-wrap:anywhere;font-size:12px}
button{margin-top:8px;padding:5px 8px;border:1px solid var(--line);border-radius:4px;background:var(--panel);color:var(--txt);cursor:pointer}
button:hover{border-color:var(--acc)}
#status{padding:30px 0;color:var(--mut);display:none}
@media(max-width:560px){header,main{padding-left:12px;padding-right:12px}.grid{grid-template-columns:repeat(auto-fill,minmax(145px,1fr))}}
</style>
<script>try{if(localStorage.getItem('ct2-theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}</script>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">
${symbols.join('\n')}
</svg>
<header>
  <h1>Higgs Icons <small>catálogo SVG · ${escapeHtml(packageInfo.version)}</small></h1>
  <input id="query" type="search" placeholder="Buscar por ID, nombre, ruta o etiqueta" autocomplete="off">
  <label><input id="theme" type="checkbox"> Tema oscuro</label>
  <span id="count" aria-live="polite"></span>
  <a href="./catalogo-iconos.html">Catálogo completo (PNG)</a>
</header>
<main>
  <p id="status" role="status">No hay coincidencias.</p>
${cards.join('\n')}
</main>
<script>
const query = document.querySelector('#query');
const theme = document.querySelector('#theme');
const count = document.querySelector('#count');
const status = document.querySelector('#status');
const cards = [...document.querySelectorAll('.card')];
const sections = [...document.querySelectorAll('main section')];
function setTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem('ct2-theme', dark ? 'dark' : 'light'); } catch (error) { /* private mode */ }
}
function refresh() {
  const terms = query.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);
  let shown = 0;
  for (const card of cards) {
    const match = terms.every((term) => card.dataset.search.includes(term));
    card.classList.toggle('hidden', !match);
    if (match) shown += 1;
  }
  for (const section of sections) {
    section.classList.toggle('hidden', !section.querySelector('.card:not(.hidden)'));
  }
  count.textContent = shown + ' de ' + cards.length + ' iconos';
  status.style.display = shown ? 'none' : 'block';
}
theme.checked = document.documentElement.getAttribute('data-theme') === 'dark';
theme.addEventListener('change', () => setTheme(theme.checked));
query.addEventListener('input', refresh);
for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', async () => {
    const id = button.closest('.card').dataset.id;
    try { await navigator.clipboard.writeText(id); button.textContent = 'Copiado'; } catch (error) { button.textContent = id; }
    setTimeout(() => { button.textContent = 'Copiar ID'; }, 1200);
  });
}
refresh();
</script>
</body>
</html>
`;
  return { html, iconCount: icons.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await renderSvgCatalog();
    const target = path.join(ROOT, 'catalogo-iconos-svg.html');
    await writeFile(target, result.html);
    console.log(`Wrote ${path.relative(ROOT, target)} with ${result.iconCount} vector icons.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
