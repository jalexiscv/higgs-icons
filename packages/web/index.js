function normalizeBaseUrl(baseUrl) {
  return new URL(baseUrl, import.meta.url);
}

function nearestVariant(icon, requestedSize) {
  const variants = Object.entries(icon.variants)
    .map(([size, path]) => ({ size: Number(size), path }))
    .filter((variant) => Number.isFinite(variant.size));

  variants.sort((left, right) => {
    const distance = Math.abs(left.size - requestedSize) - Math.abs(right.size - requestedSize);
    return distance || right.size - left.size;
  });

  return variants[0] ?? null;
}

export class IconLibrary {
  constructor(manifest, { assetBase = new URL('./', import.meta.url) } = {}) {
    if (!manifest || !Array.isArray(manifest.icons)) {
      throw new TypeError('The icon manifest must contain an icons array.');
    }

    this.manifest = manifest;
    this.assetBase = normalizeBaseUrl(assetBase);
    this.byId = new Map(manifest.icons.map((icon) => [icon.id, icon]));
  }

  get(id) {
    const canonical = this.byId.get(id);
    if (canonical) return canonical;

    const query = String(id).toLowerCase();
    const matches = this.manifest.icons.filter((icon) =>
      icon.aliases.some((alias) => alias.toLowerCase() === query));
    return matches.length === 1 ? matches[0] : null;
  }

  findLegacyName(name) {
    const query = String(name).toLowerCase();
    const matches = this.manifest.icons.filter((icon) =>
      icon.legacyName.toLowerCase() === query ||
      icon.aliases.some((alias) => alias.toLowerCase() === query));

    return matches.length === 1 ? matches[0] : null;
  }

  url(id, { size = 24 } = {}) {
    const icon = this.get(id);
    if (!icon) return null;

    const variant = nearestVariant(icon, Number(size));
    return variant ? new URL(variant.path, this.assetBase).href : null;
  }

  createImage(id, { size = 24, alt, className = '' } = {}) {
    const icon = this.get(id);
    const src = this.url(id, { size });
    if (!icon || !src) return null;

    const image = document.createElement('img');
    image.src = src;
    image.alt = alt ?? icon.name;
    image.className = className;
    image.width = Number(size);
    image.height = Number(size);
    image.decoding = 'async';
    return image;
  }

  search(query, { limit = 50 } = {}) {
    limit = Math.max(0, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 50);
    if (limit === 0) return [];
    const terms = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return this.manifest.icons.slice(0, limit);

    return this.manifest.icons
      .map((icon) => {
        const fields = [icon.id, icon.name, icon.legacyName, icon.source, ...icon.aliases, ...icon.tags]
          .join(' ')
          .toLowerCase();
        if (!terms.every((term) => fields.includes(term))) return null;

        const id = icon.id.toLowerCase();
        const score = id === terms.join(' ') ? 0 : id.startsWith(terms[0]) ? 1 : id.includes(terms[0]) ? 2 : 3;
        return { icon, score };
      })
      .filter(Boolean)
      .sort((left, right) => left.score - right.score || left.icon.id.localeCompare(right.icon.id))
      .slice(0, limit)
      .map(({ icon }) => icon);
  }
}

export async function loadIconLibrary({
  manifestUrl = new URL('./manifest.json', import.meta.url),
  assetBase = new URL('./', import.meta.url),
  fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl(manifestUrl);
  if (!response.ok) throw new Error(`Unable to load icon manifest (${response.status}).`);
  return new IconLibrary(await response.json(), { assetBase });
}