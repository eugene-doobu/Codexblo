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
const floorPlane = {
  centerX: width / 2,
  centerY: height / 2,
  halfWidth: width / 2,
  halfHeight: width / 4,
  inset: 2,
};
const diamond = [
  `M ${floorPlane.centerX} ${floorPlane.centerY - floorPlane.halfHeight}`,
  `L ${width - floorPlane.inset} ${floorPlane.centerY}`,
  `L ${floorPlane.centerX} ${floorPlane.centerY + floorPlane.halfHeight}`,
  `L ${floorPlane.inset} ${floorPlane.centerY}`,
  'Z',
].join(' ');

const tileSpecs = {
  floor: {
    file: 'tile-floor.svg',
    title: 'Cathedral floor tile',
    body: (p) => `
      <path d="${diamond}" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path d="M 14 ${floorPlane.centerY} H ${width - 14}" stroke="${p[2]}" stroke-width="2" opacity="0.5"/>
      <path d="M ${floorPlane.centerX} ${floorPlane.centerY - 12} V ${floorPlane.centerY + 12}" stroke="${p[2]}" stroke-width="1.5" opacity="0.38"/>`,
  },
  wall: {
    file: 'tile-wall.svg',
    title: 'Cathedral wall block',
    body: (p) => `
      <path d="${diamond}" fill="${p[2]}" stroke="${p[1]}" stroke-width="2"/>
      <path d="M 12 ${floorPlane.centerY} L ${floorPlane.centerX} ${floorPlane.centerY - 15} L ${width - 12} ${floorPlane.centerY} L ${width - 12} ${floorPlane.centerY + 14} L ${floorPlane.centerX} ${height - 3} L 12 ${floorPlane.centerY + 14} Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path d="M ${floorPlane.centerX} ${floorPlane.centerY - 15} V ${height - 3}" stroke="${p[1]}" stroke-width="1" opacity="0.7"/>`,
  },
  door: {
    file: 'tile-door.svg',
    title: 'Cathedral door tile',
    body: (p) => `
      <path d="${diamond}" fill="#292b33" stroke="#494d5a" stroke-width="2"/>
      <path d="M 24 ${floorPlane.centerY - 9} H ${width - 24} V ${floorPlane.centerY + 13} H 24 Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="3"/>
      <circle cx="${width - 28}" cy="${floorPlane.centerY + 4}" r="3" fill="#c9a35b"/>`,
  },
  stairUp: {
    file: 'tile-stair-up.svg',
    title: 'Cathedral stair up tile',
    body: (p) => `
      <path d="${diamond}" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path d="M 22 ${floorPlane.centerY + 8} H 50 M 26 ${floorPlane.centerY + 2} H 46 M 30 ${floorPlane.centerY - 4} H 42" stroke="${p[1]}" stroke-width="4" stroke-linecap="round"/>
      <path d="M 36 ${floorPlane.centerY - 13} L 45 ${floorPlane.centerY - 2} H 27 Z" fill="${p[2]}" opacity="0.75"/>`,
  },
  stairDown: {
    file: 'tile-stair-down.svg',
    title: 'Cathedral stair down tile',
    body: (p) => `
      <path d="${diamond}" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path d="M 20 ${floorPlane.centerY - 6} H 52 M 24 ${floorPlane.centerY} H 48 M 28 ${floorPlane.centerY + 6} H 44" stroke="${p[1]}" stroke-width="4" stroke-linecap="round"/>
      <path d="M 36 ${floorPlane.centerY + 14} L 45 ${floorPlane.centerY + 3} H 27 Z" fill="${p[2]}" opacity="0.85"/>`,
  },
  void: {
    file: 'tile-void.svg',
    title: 'Uncarved void tile',
    body: (p) => `
      <path d="${diamond}" fill="${p[0]}" stroke="${p[1]}" stroke-width="1" opacity="0.7"/>
      <path d="M 18 ${floorPlane.centerY - 6} L 54 ${floorPlane.centerY + 6} M 54 ${floorPlane.centerY - 6} L 18 ${floorPlane.centerY + 6}" stroke="${p[1]}" stroke-width="1" opacity="0.35"/>`,
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
