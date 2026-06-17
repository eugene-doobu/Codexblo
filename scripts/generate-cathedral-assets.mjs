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
      <path data-layer="wall-footprint" d="${diamond}" fill="${p[2]}" stroke="${p[1]}" stroke-width="2"/>
      <path data-layer="wall-left-face" d="M ${floorPlane.inset} ${floorPlane.centerY} L 12 16 L ${floorPlane.centerX} 28 L ${floorPlane.centerX} ${floorPlane.centerY + floorPlane.halfHeight} Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="2" opacity="0.92"/>
      <path data-layer="wall-right-face" d="M 60 16 L ${width - floorPlane.inset} ${floorPlane.centerY} L ${floorPlane.centerX} ${floorPlane.centerY + floorPlane.halfHeight} L ${floorPlane.centerX} 28 Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path data-layer="wall-top" d="M ${floorPlane.centerX} 4 L 60 16 L ${floorPlane.centerX} 28 L 12 16 Z" fill="${p[2]}" stroke="${p[1]}" stroke-width="2"/>
      <path data-layer="wall-center-ridge" d="M ${floorPlane.centerX} 4 V ${floorPlane.centerY + floorPlane.halfHeight}" stroke="${p[1]}" stroke-width="1" opacity="0.65"/>`,
  },
  door: {
    file: 'tile-door.svg',
    title: 'Cathedral door tile',
    body: (p) => `
      <path data-layer="door-footprint" d="${diamond}" fill="#292b33" stroke="#494d5a" stroke-width="2"/>
      <path data-layer="door-fill" d="M ${floorPlane.centerX} 8 L 64 ${floorPlane.centerY} L ${floorPlane.centerX} 40 L 8 ${floorPlane.centerY} Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="3"/>
      <path data-layer="door-grain" d="M 18 ${floorPlane.centerY} L ${floorPlane.centerX} 14 L 54 ${floorPlane.centerY} M 18 ${floorPlane.centerY} L ${floorPlane.centerX} 34 L 54 ${floorPlane.centerY}" fill="none" stroke="${p[2]}" stroke-width="2" opacity="0.55"/>
      <path data-layer="door-brace" d="M 24 18 L 48 30 M 48 18 L 24 30" stroke="${p[1]}" stroke-width="3" stroke-linecap="round" opacity="0.72"/>`,
  },
  stairUp: {
    file: 'tile-stair-up.svg',
    title: 'Cathedral stair up tile',
    body: (p) => `
      <path data-layer="stair-up-fill" d="M ${floorPlane.centerX} 8 L 64 ${floorPlane.centerY} L ${floorPlane.centerX} 40 L 8 ${floorPlane.centerY} Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path data-layer="stair-up-treads" d="M 16 28 L 36 18 L 56 28 M 20 32 L 36 24 L 52 32 M 24 36 L 36 30 L 48 36" fill="none" stroke="${p[1]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path data-layer="stair-up-arrow" d="M ${floorPlane.centerX} 10 L 48 24 L 24 24 Z" fill="${p[2]}" opacity="0.78"/>`,
  },
  stairDown: {
    file: 'tile-stair-down.svg',
    title: 'Cathedral stair down tile',
    body: (p) => `
      <path data-layer="stair-down-fill" d="M ${floorPlane.centerX} 8 L 64 ${floorPlane.centerY} L ${floorPlane.centerX} 40 L 8 ${floorPlane.centerY} Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path data-layer="stair-down-treads" d="M 16 20 L 36 30 L 56 20 M 20 16 L 36 24 L 52 16 M 24 12 L 36 18 L 48 12" fill="none" stroke="${p[1]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path data-layer="stair-down-arrow" d="M ${floorPlane.centerX} 40 L 48 26 L 24 26 Z" fill="${p[2]}" opacity="0.85"/>`,
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
