import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build, buildManifest, desktopCmake, desktopSource, normalizeSegment } from '../tools/build.mjs';
import { IconLibrary } from '../packages/web/index.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'higgs-icons-'));
  const iconDirectory = path.join(root, 'Apps', 'Components', 'BaseTool', 'RCBin', 'SaveFile.ico.png');
  await mkdir(iconDirectory, { recursive: true });
  await writeFile(path.join(iconDirectory, '24.png'), PNG);
  await writeFile(path.join(iconDirectory, '48.png'), PNG);
  await mkdir(path.join(root, 'Common'));
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
  return { root, iconDirectory };
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

  assert.equal(icons.length, 1);
  assert.equal(icons[0].id, 'apps.components.base-tool.save-file');
  assert.deepEqual(icons[0].variants, {
    '24': 'assets/apps/components/base-tool/save-file/24.png',
    '48': 'assets/apps/components/base-tool/save-file/48.png',
  });
  assert.ok(icons[0].tags.includes('document'));
});

test('resolves canonical IDs, unique legacy names, nearest sizes and search terms', () => {
  const manifest = {
    icons: [{
      id: 'apps.file.save', name: 'Save File', legacyName: 'SaveFile.ico.png',
      source: 'Apps/SaveFile.ico.png', aliases: ['save'], tags: ['document'],
      variants: { '24': 'assets/apps/file/save/24.png', '48': 'assets/apps/file/save/48.png' },
    }],
  };
  const library = new IconLibrary(manifest, { assetBase: 'https://example.test/icons/' });

  assert.equal(library.get('apps.file.save').name, 'Save File');
  assert.equal(library.get('save').id, 'apps.file.save');
  assert.equal(library.findLegacyName('savefile.ICO.PNG').id, 'apps.file.save');
  assert.equal(library.url('apps.file.save', { size: 36 }), 'https://example.test/icons/assets/apps/file/save/48.png');
  assert.equal(library.search('document save')[0].id, 'apps.file.save');
  assert.equal(library.url('missing'), null);
});

test('emits a native lookup table with valid empty alias spans', () => {
  const output = desktopSource([{
    id: 'apps.file.save', name: 'Save File', legacyName: 'SaveFile.ico.png',
    source: 'Apps/SaveFile.ico.png', aliases: [], tags: ['file', 'save'],
    variants: { '24': 'assets/apps/file/save/24.png' },
  }]);

  assert.match(output, /constexpr Icon icon_0 =/);
  assert.match(output, /std::span<const std::string_view>\{\}/);
  assert.match(output, /icon_0,/);
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

  assert.equal(result.iconCount, 1);
  assert.equal(manifest.icons[0].id, 'apps.components.base-tool.save-file');
  assert.equal('files' in manifest.icons[0], false);
  assert.equal(JSON.stringify(manifest).includes(fixture.root), false);
  await access(path.join(result.webDirectory, 'assets', 'apps', 'components', 'base-tool', 'save-file', '24.png'));
  await access(path.join(result.desktopDirectory, 'assets', 'apps', 'components', 'base-tool', 'save-file', '48.png'));
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
  });

  assert.equal(icons[0].id, 'actions.document.save');
  await assert.rejects(() => buildManifest(fixture.root, { icons: {} }, {}), /missing sources/);
});