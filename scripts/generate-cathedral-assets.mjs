import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = JSON.parse(readFileSync(join(root, 'resources/source/cathedral-palette.json'), 'utf8'));
const outDir = join(root, 'public/assets/cathedral');
const bindingsDir = join(root, 'src/presentation/bindings');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(root, 'resources/generated'), { recursive: true });
mkdirSync(bindingsDir, { recursive: true });

const { width, height } = source.tileSize;
assertTileSize(width, height);
const diamond = `M ${width / 2} 2 L ${width - 4} ${height / 2} L ${width / 2} ${height - 4} L 4 ${height / 2} Z`;

const tileSpecs = {
  floor: {
    file: 'tile-floor.svg',
    title: 'Cathedral floor tile',
    body: (p) => `
      <path d="${diamond}" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path d="M 16 ${height / 2} H ${width - 16}" stroke="${p[2]}" stroke-width="2" opacity="0.55"/>
      <path d="M ${width / 2} 8 V ${height - 8}" stroke="${p[2]}" stroke-width="1.5" opacity="0.35"/>`,
  },
  wall: {
    file: 'tile-wall.svg',
    title: 'Cathedral wall block',
    body: (p) => `
      <path d="${diamond}" fill="${p[2]}" stroke="${p[1]}" stroke-width="2"/>
      <path d="M 12 ${height / 2} L ${width / 2} 7 L ${width - 12} ${height / 2} L ${width - 12} ${height / 2 + 16} L ${width / 2} ${height - 2} L 12 ${height / 2 + 16} Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path d="M ${width / 2} 7 V ${height - 2}" stroke="${p[1]}" stroke-width="1" opacity="0.7"/>`,
  },
  door: {
    file: 'tile-door.svg',
    title: 'Cathedral door tile',
    body: (p) => `
      <path d="${diamond}" fill="#292b33" stroke="#494d5a" stroke-width="2"/>
      <path d="M 24 16 H ${width - 24} V ${height - 12} H 24 Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="3"/>
      <circle cx="${width - 28}" cy="${height / 2 + 5}" r="3" fill="#c9a35b"/>`,
  },
  stairUp: {
    file: 'tile-stair-up.svg',
    title: 'Cathedral stair up tile',
    body: (p) => `
      <path d="${diamond}" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path d="M 22 31 H 50 M 26 25 H 46 M 30 19 H 42" stroke="${p[1]}" stroke-width="4" stroke-linecap="round"/>
      <path d="M 36 12 L 45 23 H 27 Z" fill="${p[2]}" opacity="0.75"/>`,
  },
  stairDown: {
    file: 'tile-stair-down.svg',
    title: 'Cathedral stair down tile',
    body: (p) => `
      <path d="${diamond}" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path d="M 20 18 H 52 M 24 24 H 48 M 28 30 H 44" stroke="${p[1]}" stroke-width="4" stroke-linecap="round"/>
      <path d="M 36 38 L 45 27 H 27 Z" fill="${p[2]}" opacity="0.85"/>`,
  },
  void: {
    file: 'tile-void.svg',
    title: 'Uncarved void tile',
    body: (p) => `
      <path d="${diamond}" fill="${p[0]}" stroke="${p[1]}" stroke-width="1" opacity="0.7"/>
      <path d="M 18 18 L 54 30 M 54 18 L 18 30" stroke="${p[1]}" stroke-width="1" opacity="0.35"/>`,
  },
};

const manifest = {
  schemaVersion: 1,
  resourcePackId: source.theme,
  tileSize: source.tileSize,
  assets: [],
};

for (const [key, spec] of Object.entries(tileSpecs)) {
  const colors = source.palette[key];
  assertPalette(key, colors);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${spec.title}">
    <title>${spec.title}</title>
    <rect width="${width}" height="${height}" fill="none"/>
    ${spec.body(colors)}
  </svg>
`;
  const filePath = join(outDir, spec.file);
  writeFileSync(filePath, svg, 'utf8');
  manifest.assets.push({
    key: `cathedral.${key}`,
    kind: 'image',
    semantic: `tile.${key}`,
    path: `/assets/cathedral/${spec.file}`,
    width,
    height,
  });
}

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(join(root, 'public/assets/asset-manifest.json'), manifestJson, 'utf8');
writeFileSync(join(root, 'resources/generated/cathedral-asset-manifest.snapshot.json'), manifestJson, 'utf8');
writeFileSync(join(bindingsDir, 'cathedral-asset-registry.generated.ts'), generatedRegistryModule(manifest), 'utf8');
console.log(`Generated ${manifest.assets.length} Cathedral lab assets.`);

function assertTileSize(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Cathedral tile size must use finite positive dimensions.');
  }
}

function assertPalette(key, colors) {
  if (!Array.isArray(colors) || colors.length !== 3) {
    throw new Error(`Palette entry ${key} must provide exactly three colors.`);
  }
  for (const color of colors) {
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new Error(`Palette entry ${key} includes an invalid color value.`);
    }
  }
}

function generatedRegistryModule(manifest) {
  return `import type { AssetManifestEntry } from './cathedral-assets';

export const CATHEDRAL_RESOURCE_PACK_ID = ${JSON.stringify(manifest.resourcePackId)};
export const CATHEDRAL_TILE_SIZE = ${JSON.stringify(manifest.tileSize, null, 2)} as const;
export const CATHEDRAL_ASSET_REGISTRY = ${JSON.stringify(manifest.assets, null, 2)} as const satisfies readonly AssetManifestEntry[];
`;
}
