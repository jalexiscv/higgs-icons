import { access, copyFile, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RESOURCE_BUCKETS = new Set(['rcbin', 'res']);
const SOURCE_ROOTS = ['Apps', 'Common', 'Engines'];

export function normalizeSegment(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function iconId(relativeDirectory) {
  const segments = relativeDirectory.split(path.sep).filter(Boolean);
  const filename = segments.pop();
  const stem = filename.replace(/\.ico\.png$/i, '').replace(/\.png$/i, '');
  const namespace = segments
    .filter((segment) => !RESOURCE_BUCKETS.has(segment.toLowerCase()))
    .map(normalizeSegment);
  return [...namespace, normalizeSegment(stem)].filter(Boolean).join('.');
}

function humanize(value) {
  return value
    .replace(/\.ico\.png$/i, '')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function makeTags(id, name, overrideTags = []) {
  const words = `${id.replaceAll('.', ' ')} ${name}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
  return [...new Set([...words, ...overrideTags.map(String).map((tag) => tag.toLowerCase())])].sort();
}

async function readPngHeader(filename) {
  const handle = await open(filename, 'r');
  try {
    const header = Buffer.alloc(PNG_SIGNATURE.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === PNG_SIGNATURE.length && header.equals(PNG_SIGNATURE);
  } finally {
    await handle.close();
  }
}

async function scanDirectory(directory, root, found) {
  const entries = await readdir(directory, { withFileTypes: true });
  const iconDirectory = path.basename(directory).toLowerCase().endsWith('.ico.png');
  const variants = iconDirectory ? entries.filter((entry) => entry.isFile() && /^\d+\.png$/i.test(entry.name)) : [];

  if (variants.length) {
    const relativeDirectory = path.relative(root, directory);
    const id = iconId(relativeDirectory);
    const sizes = new Map();

    for (const entry of variants) {
      const size = Number(path.basename(entry.name, path.extname(entry.name)));
      if (sizes.has(size)) throw new Error(`Repeated ${size}px variant in ${relativeDirectory}.`);
      const filename = path.join(directory, entry.name);
      if (!(await readPngHeader(filename))) throw new Error(`Invalid PNG file: ${path.relative(root, filename)}`);
      sizes.set(size, filename);
    }

    const source = relativeDirectory.split(path.sep).join('/');
    found.push({ id, name: humanize(path.basename(directory)), legacyName: path.basename(directory), source, sizes });
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) await scanDirectory(path.join(directory, entry.name), root, found);
  }
}

export async function buildManifest(root = ROOT, overrides = { icons: {} }, idRegistry = null) {
  const found = [];
  for (const sourceRoot of SOURCE_ROOTS) {
    const absoluteRoot = path.join(root, sourceRoot);
    await scanDirectory(absoluteRoot, root, found);
  }

  if (idRegistry) {
    const sources = new Set(found.map((icon) => icon.source));
    const unknownSources = Object.keys(idRegistry).filter((source) => !sources.has(source));
    const missingSources = found.filter((icon) => !Object.hasOwn(idRegistry, icon.source)).map((icon) => icon.source);
    if (unknownSources.length) throw new Error(`ID registry references unknown sources: ${unknownSources.join(', ')}`);
    if (missingSources.length) throw new Error(`ID registry is missing sources: ${missingSources.join(', ')}`);
    for (const icon of found) icon.id = idRegistry[icon.source];
  }

  found.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const ids = new Map();
  const overrideMap = overrides.icons ?? {};
  const unknownOverrides = Object.keys(overrideMap).filter((id) => !found.some((icon) => icon.id === id));
  if (unknownOverrides.length) throw new Error(`Overrides reference unknown icon IDs: ${unknownOverrides.join(', ')}`);

  const icons = found.map((icon) => {
    if (ids.has(icon.id)) {
      throw new Error(`Icon ID collision "${icon.id}": ${ids.get(icon.id)} and ${icon.source}`);
    }
    ids.set(icon.id, icon.source);

    const override = overrideMap[icon.id] ?? {};
    for (const key of Object.keys(override)) {
      if (!['name', 'description', 'aliases', 'tags', 'products'].includes(key)) {
        throw new Error(`Unsupported metadata field "${key}" for ${icon.id}.`);
      }
    }
    if (override.aliases && !Array.isArray(override.aliases)) throw new Error(`aliases must be an array for ${icon.id}.`);
    if (override.tags && !Array.isArray(override.tags)) throw new Error(`tags must be an array for ${icon.id}.`);
    if (override.products && !Array.isArray(override.products)) throw new Error(`products must be an array for ${icon.id}.`);

    const assetDirectory = `assets/${icon.id.split('.').join('/')}`;
    return {
      id: icon.id,
      name: override.name ?? icon.name,
      description: override.description ?? '',
      category: icon.id.split('.').slice(0, -1).join('.'),
      source: icon.source,
      legacyName: icon.legacyName,
      aliases: [...new Set((override.aliases ?? []).map(String))],
      tags: makeTags(icon.id, override.name ?? icon.name, override.tags ?? []),
      products: [...new Set((override.products ?? []).map(String))],
      variants: Object.fromEntries(
        [...icon.sizes.entries()]
          .sort(([left], [right]) => left - right)
          .map(([size]) => [String(size), `${assetDirectory}/${size}.png`]),
      ),
      files: [...icon.sizes.entries()].sort(([left], [right]) => left - right),
    };
  });

  return icons;
}

function cppString(value) {
  return JSON.stringify(value).replace(/\u2028|\u2029/g, (character) =>
    character === '\u2028' ? '\\u2028' : '\\u2029');
}

function desktopHeader() {
  return `#pragma once

#include <cstddef>
#include <filesystem>
#include <span>
#include <string_view>
#include <vector>

namespace higgs_icons {

struct Variant {
    unsigned size;
    std::string_view path;
};

struct Icon {
    std::string_view id;
    std::string_view name;
    std::string_view legacy_name;
    std::string_view source;
    std::span<const Variant> variants;
    std::span<const std::string_view> aliases;
    std::span<const std::string_view> tags;
};

std::span<const Icon> all() noexcept;
const Icon* find(std::string_view id) noexcept;
const Icon* find_legacy(std::string_view name);
const Variant* nearest_variant(const Icon& icon, unsigned requested_size) noexcept;
std::filesystem::path resolve_path(std::string_view id, unsigned requested_size,
                                   const std::filesystem::path& library_root);
std::vector<const Icon*> search(std::string_view query, std::size_t limit = 50);

} // namespace higgs_icons
`;
}

export function desktopSource(icons) {
  const rows = icons.map((icon, index) => {
    const variants = Object.entries(icon.variants).map(([size, filename]) =>
      `    {${size}u, ${cppString(filename)}}`).join(',\n');
    const aliases = icon.aliases.map((alias) => `    ${cppString(alias)}`).join(',\n');
    const tags = icon.tags.map((tag) => `    ${cppString(tag)}`).join(',\n');
    const aliasDeclaration = aliases ? `constexpr std::string_view aliases_${index}[] = {\n${aliases}\n};\n` : '';
    const aliasSpan = aliases ? `std::span<const std::string_view>{aliases_${index}}` : 'std::span<const std::string_view>{}';
    return `constexpr Variant variants_${index}[] = {\n${variants}\n};\n` +
      aliasDeclaration +
      `constexpr std::string_view tags_${index}[] = {\n${tags}\n};\n` +
      `constexpr Icon icon_${index} = {${cppString(icon.id)}, ${cppString(icon.name)}, ` +
      `${cppString(icon.legacyName)}, ${cppString(icon.source)}, ` +
      `std::span<const Variant>{variants_${index}}, ${aliasSpan}, ` +
      `std::span<const std::string_view>{tags_${index}}};`;
  });

  return `#include "higgs_icons/icons.hpp"

#include <algorithm>
#include <cctype>
#include <iterator>
#include <string>

namespace higgs_icons {
namespace {

${rows.map((row) => row.split('\n').map((line) => line.startsWith('    {') ? line : line).join('\n')).join('\n\n')}

const Icon icons[] = {
${icons.map((_, index) => `    icon_${index},`).join('\n')}
};

std::string lowercase(std::string_view value) {
    std::string result(value);
    std::transform(result.begin(), result.end(), result.begin(), [](unsigned char character) {
        return static_cast<char>(std::tolower(character));
    });
    return result;
}

bool contains(std::string_view value, std::string_view query) {
    return lowercase(value).find(query) != std::string::npos;
}

} // namespace

std::span<const Icon> all() noexcept {
    return icons;
}

const Icon* find(std::string_view id) noexcept {
    const auto iterator = std::lower_bound(std::begin(icons), std::end(icons), id,
        [](const Icon& icon, std::string_view value) { return icon.id < value; });
    return iterator != std::end(icons) && iterator->id == id ? iterator : nullptr;
}

const Icon* find_legacy(std::string_view name) {
    const auto query = lowercase(name);
    const Icon* match = nullptr;
    for (const auto& icon : icons) {
        bool found_name = lowercase(icon.legacy_name) == query;
        for (const auto alias : icon.aliases) found_name = found_name || lowercase(alias) == query;
        if (!found_name) continue;
        if (match != nullptr) return nullptr;
        match = &icon;
    }
    return match;
}

const Variant* nearest_variant(const Icon& icon, unsigned requested_size) noexcept {
    if (icon.variants.empty()) return nullptr;
    const Variant* best = &icon.variants.front();
    for (const auto& variant : icon.variants.subspan(1)) {
        const auto distance = variant.size > requested_size ? variant.size - requested_size : requested_size - variant.size;
        const auto best_distance = best->size > requested_size ? best->size - requested_size : requested_size - best->size;
        if (distance < best_distance || (distance == best_distance && variant.size > best->size)) best = &variant;
    }
    return best;
}

std::filesystem::path resolve_path(std::string_view id, unsigned requested_size,
                                   const std::filesystem::path& library_root) {
    const auto* icon = find(id);
    if (icon == nullptr) return {};
    const auto* variant = nearest_variant(*icon, requested_size);
    return variant == nullptr ? std::filesystem::path{} : library_root / variant->path;
}

std::vector<const Icon*> search(std::string_view query, std::size_t limit) {
    const auto needle = lowercase(query);
    std::vector<const Icon*> matches;
  if (limit == 0) return matches;
    if (needle.empty()) {
        for (const auto& icon : icons) {
            if (matches.size() == limit) break;
            matches.push_back(&icon);
        }
        return matches;
    }
    for (const auto& icon : icons) {
      const auto matches_term = [&icon](std::string_view term) {
        if (contains(icon.id, term) || contains(icon.name, term) ||
          contains(icon.legacy_name, term) || contains(icon.source, term)) return true;
        for (const auto alias : icon.aliases) if (contains(alias, term)) return true;
        for (const auto tag : icon.tags) if (contains(tag, term)) return true;
        return false;
      };
      bool matched = true;
      std::size_t start = 0;
      while (start < needle.size()) {
        start = needle.find_first_not_of(" \\t\\r\\n", start);
        if (start == std::string::npos) break;
            const auto end = needle.find_first_of(" \\t\\r\\n", start);
        const auto term = std::string_view(needle).substr(start, end - start);
        if (!matches_term(term)) {
          matched = false;
          break;
        }
        if (end == std::string::npos) break;
        start = end + 1;
      }
        if (matched) {
            matches.push_back(&icon);
            if (matches.size() == limit) break;
        }
    }
    return matches;
}

} // namespace higgs_icons
`;
}

export function desktopCmake() {
  return `cmake_minimum_required(VERSION 3.20)
project(higgs_icons LANGUAGES CXX)

add_library(higgs_icons STATIC src/icons.cpp)
add_library(HiggsIcons::HiggsIcons ALIAS higgs_icons)
target_include_directories(higgs_icons PUBLIC include)
target_compile_features(higgs_icons PUBLIC cxx_std_20)
if(MSVC)
  target_compile_options(higgs_icons PRIVATE /utf-8)
endif()

function(higgs_icons_copy_assets target)
    if(NOT TARGET "\${target}")
        message(FATAL_ERROR "higgs_icons_copy_assets: unknown target '\${target}'")
    endif()
    add_custom_command(TARGET "\${target}" POST_BUILD
        COMMAND "\${CMAKE_COMMAND}" -E copy_directory
          "\${CMAKE_CURRENT_FUNCTION_LIST_DIR}/assets"
            "$<TARGET_FILE_DIR:\${target}>/HiggsIcons/assets"
        VERBATIM)
endfunction()
`;
}

async function copyPackageAssets(icons, targetDirectory) {
  for (const icon of icons) {
    const destinationDirectory = path.join(targetDirectory, ...icon.id.split('.'));
    await mkdir(destinationDirectory, { recursive: true });
    for (const [size, source] of icon.files) {
      await copyFile(source, path.join(destinationDirectory, `${size}.png`));
    }
  }
}

export async function build({ root = ROOT, output = path.join(root, 'dist') } = {}) {
  const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const overrides = JSON.parse(await readFile(path.join(root, 'metadata', 'overrides.json'), 'utf8'));
  const idRegistry = JSON.parse(await readFile(path.join(root, 'metadata', 'ids.json'), 'utf8'));
  const icons = await buildManifest(root, overrides, idRegistry);
  const manifestIcons = icons.map(({ files, ...icon }) => icon);
  const manifest = { schemaVersion: 1, libraryVersion: packageInfo.version, icons: manifestIcons };
  const webDirectory = path.join(output, 'web');
  const desktopDirectory = path.join(output, 'desktop');
  const catalogDirectory = path.join(output, 'catalog');

  await rm(webDirectory, { recursive: true, force: true });
  await rm(desktopDirectory, { recursive: true, force: true });
  await rm(catalogDirectory, { recursive: true, force: true });
  await mkdir(path.join(webDirectory, 'assets'), { recursive: true });
  await mkdir(path.join(desktopDirectory, 'include', 'higgs_icons'), { recursive: true });
  await mkdir(path.join(desktopDirectory, 'src'), { recursive: true });
  await mkdir(catalogDirectory, { recursive: true });
  await writeFile(path.join(webDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await copyFile(path.join(root, 'packages', 'web', 'index.js'), path.join(webDirectory, 'index.js'));
  await copyPackageAssets(icons, path.join(webDirectory, 'assets'));
  await writeFile(path.join(desktopDirectory, 'include', 'higgs_icons', 'icons.hpp'), desktopHeader());
  await writeFile(path.join(desktopDirectory, 'src', 'icons.cpp'), desktopSource(icons));
  await writeFile(path.join(desktopDirectory, 'CMakeLists.txt'), desktopCmake());
  await copyPackageAssets(icons, path.join(desktopDirectory, 'assets'));
  await copyFile(path.join(root, 'catalog', 'index.html'), path.join(catalogDirectory, 'index.html'));
  await copyFile(path.join(root, 'catalog', 'catalog.js'), path.join(catalogDirectory, 'catalog.js'));
  return { iconCount: icons.length, webDirectory, desktopDirectory };
}

async function initializeIdRegistry() {
  const registryPath = path.join(ROOT, 'metadata', 'ids.json');
  try {
    await access(registryPath);
    throw new Error('metadata/ids.json already exists; refusing to replace canonical IDs.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const overrides = JSON.parse(await readFile(path.join(ROOT, 'metadata', 'overrides.json'), 'utf8'));
  const icons = await buildManifest(ROOT, overrides);
  const registry = Object.fromEntries(icons.map((icon) => [icon.source, icon.id]));
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`Initialized ${icons.length} canonical icon IDs in metadata/ids.json.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--initialize-ids')) {
      await initializeIdRegistry();
    } else {
      const result = await build();
      console.log(`Built ${result.iconCount} icons for Web and JUCE Desktop.`);
      console.log(`Web: ${path.relative(ROOT, result.webDirectory)}`);
      console.log(`Desktop: ${path.relative(ROOT, result.desktopDirectory)}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}