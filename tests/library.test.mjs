import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build, buildManifest, deriveDarkSvg, desktopCmake, desktopSource, normalizeSegment } from '../tools/build.mjs';
import { renderSvgCatalog } from '../tools/catalogo-svg.mjs';
import { IconLibrary } from '../packages/web/index.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none">\n' +
  '  <title>Tabla</title>\n' +
  '  <g stroke="#2E3238" stroke-width="1"><rect x="4.5" y="4.5" width="15" height="15"/><path d="M4.5 12H19.5" stroke="#9499A1"/></g>\n' +
  '</svg>\n';

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'higgs-icons-'));
  const iconDirectory = path.join(root, 'Apps', 'Components', 'BaseTool', 'RCBin', 'SaveFile.ico.png');
  await mkdir(iconDirectory, { recursive: true });
  await writeFile(path.join(iconDirectory, '24.png'), PNG);
  await writeFile(path.join(iconDirectory, '48.png'), PNG);
  const svgDirectory = path.join(root, 'Common', 'Higgs', 'table.ico.png');
  await mkdir(svgDirectory, { recursive: true });
  await writeFile(path.join(svgDirectory, 'light.svg'), SVG);
  await mkdir(path.join(root, 'Engines'));
  await mkdir(path.join(root, 'metadata'));
  await mkdir(path.join(root, 'packages', 'web'), { recursive: true });
  await mkdir(path.join(root, 'catalog'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.1.0' }));
  await writeFile(path.join(root, 'metadata', 'overrides.json'), JSON.stringify({ icons: {} }));
  const seededIcons = await buildManifest(root);
  await writeFile(path.join(root, 'metadata', 'ids.json'), JSON.stringify(
    Object.fromEntries(seededIcons.map((icon) => [icon.source, icon.id])),
  ));
  await writeFile(path.join(root, 'packages', 'web', 'index.js'), 'export {};');
  await writeFile(path.join(root, 'catalog', 'index.html'), '<html></html>');
  await writeFile(path.join(root, 'catalog', 'catalog.js'), '');
  return { root, iconDirectory, svgDirectory };
}

test('normalizes names into deterministic lowercase ID segments', () => {
  assert.equal(normalizeSegment('BaseTool'), 'base-tool');
  assert.equal(normalizeSegment('VectorFX'), 'vector-fx');
  assert.equal(normalizeSegment('parallel_lines_count'), 'parallel-lines-count');
});

test('builds stable IDs and size paths from legacy resource folders', async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const icons = await buildManifest(fixture.root, {
    icons: {
      'apps.components.base-tool.save-file': { aliases: ['save'], tags: ['document'] },
    },
  });

  assert.equal(icons.length, 2);
  assert.equal(icons[0].id, 'apps.components.base-tool.save-file');
  assert.deepEqual(icons[0].variants, {
    '24': 'assets/apps/components/base-tool/save-file/24.png',
    '48': 'assets/apps/components/base-tool/save-file/48.png',
  });
  assert.deepEqual(icons[0].svg, {});
  assert.ok(icons[0].tags.includes('document'));
  assert.equal(icons[1].id, 'common.higgs.table');
  assert.deepEqual(icons[1].variants, {});
  assert.deepEqual(icons[1].svg, {
    light: 'assets/common/higgs/table/light.svg',
    dark: 'assets/common/higgs/table/dark.svg',
  });
});

test('rejects vector drawings that are not plain 24 px SVG documents', async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const light = path.join(fixture.svgDirectory, 'light.svg');

  await writeFile(light, SVG.replace('viewBox="0 0 24 24"', 'viewBox="0 0 16 16"'));
  await assert.rejects(() => buildManifest(fixture.root), /viewBox must be "0 0 24 24"/);
  await writeFile(light, SVG.replace('<title>Tabla</title>', '<script>alert(1)</script>'));
  await assert.rejects(() => buildManifest(fixture.root), /contains <script/);
  await writeFile(light, SVG.replace('<title>Tabla</title>', '<image href="x.png"/>'));
  await assert.rejects(() => buildManifest(fixture.root), /Invalid SVG file: Common[\\/]Higgs[\\/]table\.ico\.png[\\/]light\.svg/);
  await writeFile(light, 'not an svg');
  await assert.rejects(() => buildManifest(fixture.root), /not an <svg> document/);
  await writeFile(light, SVG.replace('<title>Tabla</title>', '<rect fill="url(http://evil.test/x.svg#p)"/>'));
  await assert.rejects(() => buildManifest(fixture.root), /contains url\(/);
  await writeFile(light, SVG.replace('<title>Tabla</title>', '<rect width="24" height="24" onload="alert(1)"/>'));
  await assert.rejects(() => buildManifest(fixture.root), /contains onload=/);
  await writeFile(light, SVG.replace('<title>Tabla</title>',
    '<defs><mask id="tabla-hueco"><rect width="24" height="24" fill="#fff"/></mask></defs><rect mask="url(#tabla-hueco)" x="4" y="4" width="2" height="2" fill="#2E3238"/>'));
  assert.equal((await buildManifest(fixture.root)).length, 2);

  await writeFile(light, SVG);
  await writeFile(path.join(fixture.svgDirectory, 'dark.svg'), SVG);
  await rm(light);
  await assert.rejects(() => buildManifest(fixture.root), /Missing light\.svg/);
});

test('derives the dark drawing by swapping the light palette only', () => {
  const dark = deriveDarkSvg(SVG);
  assert.match(dark, /stroke="#E6E9EF"/);
  assert.match(dark, /stroke="#80868F"/);
  assert.equal(dark.includes('#2E3238'), false);
  assert.equal(deriveDarkSvg('<path stroke="#06A9F4" fill="#2e3238"/>'), '<path stroke="#06A9F4" fill="#E6E9EF"/>');
});

test('resolves canonical IDs, unique legacy names, nearest sizes and search terms', () => {
  const manifest = {
    icons: [{
      id: 'apps.file.save', name: 'Save File', legacyName: 'SaveFile.ico.png',
      source: 'Apps/SaveFile.ico.png', aliases: ['save'], tags: ['document'],
      variants: { '24': 'assets/apps/file/save/24.png', '48': 'assets/apps/file/save/48.png' }, svg: {},
    }, {
      id: 'common.higgs.table', name: 'Tabla', legacyName: 'table.ico.png',
      source: 'Common/Higgs/table.ico.png', aliases: [], tags: ['table'],
      variants: {}, svg: { light: 'assets/common/higgs/table/light.svg', dark: 'assets/common/higgs/table/dark.svg' },
    }],
  };
  const library = new IconLibrary(manifest, { assetBase: 'https://example.test/icons/' });

  assert.equal(library.get('apps.file.save').name, 'Save File');
  assert.equal(library.get('save').id, 'apps.file.save');
  assert.equal(library.findLegacyName('savefile.ICO.PNG').id, 'apps.file.save');
  assert.equal(library.url('apps.file.save', { size: 36 }), 'https://example.test/icons/assets/apps/file/save/48.png');
  assert.equal(library.search('document save')[0].id, 'apps.file.save');
  assert.equal(library.url('missing'), null);
  assert.equal(library.svgUrl('apps.file.save'), null);
  assert.equal(library.url('common.higgs.table', { size: 24 }), null);
  assert.equal(library.svgUrl('common.higgs.table'), 'https://example.test/icons/assets/common/higgs/table/light.svg');
  assert.equal(library.svgUrl('common.higgs.table', { theme: 'dark' }), 'https://example.test/icons/assets/common/higgs/table/dark.svg');
  assert.equal(library.svgUrl('common.higgs.table', { theme: 'sepia' }), 'https://example.test/icons/assets/common/higgs/table/light.svg');
  assert.equal(library.svgUrl('missing'), null);
});

test('emits a native lookup table with valid empty alias spans', () => {
  const output = desktopSource([{
    id: 'apps.file.save', name: 'Save File', legacyName: 'SaveFile.ico.png',
    source: 'Apps/SaveFile.ico.png', aliases: [], tags: ['file', 'save'],
    variants: { '24': 'assets/apps/file/save/24.png' },
  }, {
    id: 'common.higgs.table', name: 'Tabla', legacyName: 'table.ico.png',
    source: 'Common/Higgs/table.ico.png', aliases: [], tags: ['table'],
    variants: {}, svg: { light: 'assets/common/higgs/table/light.svg', dark: 'assets/common/higgs/table/dark.svg' },
  }]);

  assert.match(output, /constexpr Icon icon_0 =/);
  assert.match(output, /std::span<const std::string_view>\{\}/);
  assert.match(output, /icon_0,/);
  assert.match(output, /std::span<const Variant>\{variants_0\}, std::span<const std::string_view>\{\}, std::span<const std::string_view>\{tags_0\}, "", ""\}/);
  assert.equal(output.includes('variants_1['), false);
  assert.match(output, /std::span<const Variant>\{\}, std::span<const std::string_view>\{\}, std::span<const std::string_view>\{tags_1\}, "assets\/common\/higgs\/table\/light\.svg", "assets\/common\/higgs\/table\/dark\.svg"\}/);
  assert.match(output, /std::filesystem::path resolve_svg\(std::string_view id, Theme theme/);
});

test('copies desktop assets relative to the CMake package, not its consumer', () => {
  const cmake = desktopCmake();
  assert.match(cmake, /CMAKE_CURRENT_FUNCTION_LIST_DIR}\/assets/);
  assert.match(cmake, /target_compile_options\(higgs_icons PRIVATE \/utf-8\)/);
});

test('builds both distributions without leaking source-machine paths', async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const output = path.join(fixture.root, 'dist');

  const result = await build({ root: fixture.root, output });
  const manifest = JSON.parse(await readFile(path.join(result.webDirectory, 'manifest.json'), 'utf8'));

  assert.equal(result.iconCount, 2);
  assert.equal(manifest.icons[0].id, 'apps.components.base-tool.save-file');
  assert.equal('files' in manifest.icons[0], false);
  assert.equal('drawings' in manifest.icons[1], false);
  assert.equal(JSON.stringify(manifest).includes(fixture.root), false);
  assert.equal(JSON.stringify(manifest).includes('\\'), false);
  await access(path.join(result.webDirectory, 'assets', 'apps', 'components', 'base-tool', 'save-file', '24.png'));
  await access(path.join(result.desktopDirectory, 'assets', 'apps', 'components', 'base-tool', 'save-file', '48.png'));
  assert.equal(await readFile(path.join(result.webDirectory, 'assets', 'common', 'higgs', 'table', 'light.svg'), 'utf8'), SVG);
  assert.equal(await readFile(path.join(result.desktopDirectory, 'assets', 'common', 'higgs', 'table', 'dark.svg'), 'utf8'), deriveDarkSvg(SVG));
  await access(path.join(result.desktopDirectory, 'include', 'higgs_icons', 'icons.hpp'));
  await access(path.join(result.desktopDirectory, 'src', 'icons.cpp'));
  await access(path.join(result.desktopDirectory, 'CMakeLists.txt'));
  await access(path.join(output, 'catalog', 'index.html'));
});

test('keeps canonical IDs independent from source paths', async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const icons = await buildManifest(fixture.root, { icons: {} }, {
    'Apps/Components/BaseTool/RCBin/SaveFile.ico.png': 'actions.document.save',
    'Common/Higgs/table.ico.png': 'common.higgs.table',
  });

  assert.equal(icons[0].id, 'actions.document.save');
  await assert.rejects(() => buildManifest(fixture.root, { icons: {} }, {}), /missing sources/);
});

test('renders the static SVG catalogue with only the vector icons, in both themes', async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const { html, iconCount } = await renderSvgCatalog({ root: fixture.root });
  assert.equal(iconCount, 1);
  // Without the root's fill="none" every path in the symbol would render filled black.
  assert.match(html, /<symbol id="l-common\.higgs\.table" viewBox="0 0 24 24" fill="none">/);
  assert.match(html, /<symbol id="d-common\.higgs\.table" viewBox="0 0 24 24" fill="none">[\s\S]*?stroke="#E6E9EF"/);
  assert.equal(/<symbol [^>]*(xmlns|width|height)=/.test(html), false);
  assert.match(html, /data-id="common\.higgs\.table"/);
  assert.equal(html.includes('save-file'), false);
  assert.equal(html.includes('<title>Tabla</title>'), false);
  assert.equal(html.includes(fixture.root), false);
});

test('ships a hand-made dark drawing instead of deriving one', async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const dark = SVG.replace('#2E3238', '#FFFFFF');
  await writeFile(path.join(fixture.svgDirectory, 'dark.svg'), dark);

  const result = await build({ root: fixture.root, output: path.join(fixture.root, 'dist') });
  assert.equal(await readFile(path.join(result.webDirectory, 'assets', 'common', 'higgs', 'table', 'dark.svg'), 'utf8'), dark);
});