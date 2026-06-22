import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clampByte, createRasterCanvas, darken, downsample, encodePng, fill, hashNoise, hashString, hexToRgb, lighten, stroke } from './png-raster.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bindingsDir = join(root, 'src/presentation/bindings');
const packSpecs = [
  {
    exportName: 'CATHEDRAL',
    keyPrefix: 'cathedral',
    label: 'Cathedral',
    dungeonTypes: ['Cathedral'],
    includeStructureTiles: true,
    sourcePath: join(root, 'resources/source/cathedral-palette.json'),
    outDir: join(root, 'public/assets/cathedral'),
  },
  {
    exportName: 'CATACOMBS',
    keyPrefix: 'catacombs',
    label: 'Catacombs',
    dungeonTypes: ['Catacombs'],
    sourcePath: join(root, 'resources/source/catacombs-palette.json'),
    outDir: join(root, 'public/assets/catacombs'),
  },
  {
    exportName: 'CAVES',
    keyPrefix: 'caves',
    label: 'Caves',
    dungeonTypes: ['Caves'],
    sourcePath: join(root, 'resources/source/caves-palette.json'),
    outDir: join(root, 'public/assets/caves'),
  },
  {
    exportName: 'HELL',
    keyPrefix: 'hell',
    label: 'Hell',
    dungeonTypes: ['Hell'],
    sourcePath: join(root, 'resources/source/hell-palette.json'),
    outDir: join(root, 'public/assets/hell'),
  },
];

const staleStructureSvgFiles = [
  'tile-vertical-wall.svg',
  'tile-horizontal-wall.svg',
  'tile-corner-wall.svg',
  'tile-diagonal-wall.svg',
  'tile-vertical-arch.svg',
  'tile-horizontal-arch.svg',
  'tile-pillar.svg',
  'tile-dividing-wall.svg',
];

mkdirSync(join(root, 'resources/generated'), { recursive: true });
mkdirSync(bindingsDir, { recursive: true });

const packs = packSpecs.map(generatePackAssets);
const manifest = {
  schemaVersion: 2,
  resourcePacks: packs.map((pack) => ({
    resourcePackId: pack.resourcePackId,
    dungeonTypes: pack.dungeonTypes,
    tileSize: pack.tileSize,
    assets: pack.assets,
  })),
  assets: packs.flatMap((pack) => pack.assets),
};

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(join(root, 'public/assets/asset-manifest.json'), manifestJson, 'utf8');
writeFileSync(join(root, 'resources/generated/dungeon-asset-manifest.snapshot.json'), manifestJson, 'utf8');
writeFileSync(join(bindingsDir, 'dungeon-asset-registry.generated.ts'), generatedRegistryModule(packs, manifest.assets), 'utf8');
console.log(`Generated ${manifest.assets.length} dungeon lab assets across ${packs.length} packs.`);

function generatePackAssets(spec) {
  const source = JSON.parse(readFileSync(spec.sourcePath, 'utf8'));
  mkdirSync(spec.outDir, { recursive: true });
  if (spec.includeStructureTiles === true) {
    removeStaleStructureSvgAssets(spec.outDir);
  }

  const { width, height } = source.tileSize;
  assertTileSize(width, height, spec.label);
  const tileSpecs = createTileSpecs(width, height, spec.label, spec.includeStructureTiles === true);
  const assets = [];

  for (const [key, tileSpec] of Object.entries(tileSpecs)) {
    const paletteKey = tileSpec.paletteKey ?? key;
    const colors = source.palette[paletteKey];
    assertPalette(paletteKey, colors, spec.label);
    const filePath = join(spec.outDir, tileSpec.file);
    if (tileSpec.format === 'png') {
      writeFileSync(filePath, tileSpec.body(colors));
    } else {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${tileSpec.title}">
    <title>${tileSpec.title}</title>
    <rect width="${width}" height="${height}" fill="none"/>
    ${tileSpec.body(colors)}
  </svg>
`;
      writeFileSync(filePath, svg, 'utf8');
    }
    assets.push({
      key: `${spec.keyPrefix}.${key}`,
      kind: 'image',
      semantic: `tile.${key}`,
      path: `/assets/${spec.keyPrefix}/${tileSpec.file}`,
      width,
      height,
    });
  }

  return {
    exportName: spec.exportName,
    keyPrefix: spec.keyPrefix,
    label: spec.label,
    dungeonTypes: spec.dungeonTypes,
    resourcePackId: source.theme,
    tileSize: source.tileSize,
    assets,
  };
}

function createTileSpecs(width, height, label, includeStructureTiles) {
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

  const specs = {
    floor: {
      file: 'tile-floor.svg',
      title: `${label} floor tile`,
      body: (p) => `
      <path d="${diamond}" fill="${p[0]}" stroke="${p[1]}" stroke-width="1.2" opacity="0.78"/>
      <path d="M 14 ${floorPlane.centerY} H ${width - 14}" stroke="${p[2]}" stroke-width="1.3" opacity="0.22"/>
      <path d="M ${floorPlane.centerX} ${floorPlane.centerY - 12} V ${floorPlane.centerY + 12}" stroke="${p[2]}" stroke-width="1" opacity="0.16"/>`,
    },
    wall: {
      file: 'tile-wall.svg',
      title: `${label} wall block`,
      body: (p) => `
      <path data-layer="wall-footprint" d="${diamond}" fill="${p[2]}" stroke="${p[1]}" stroke-width="2"/>
      <path data-layer="wall-left-face" d="M ${floorPlane.inset} ${floorPlane.centerY} L 12 16 L ${floorPlane.centerX} 28 L ${floorPlane.centerX} ${floorPlane.centerY + floorPlane.halfHeight} Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="2" opacity="0.92"/>
      <path data-layer="wall-right-face" d="M 60 16 L ${width - floorPlane.inset} ${floorPlane.centerY} L ${floorPlane.centerX} ${floorPlane.centerY + floorPlane.halfHeight} L ${floorPlane.centerX} 28 Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path data-layer="wall-top" d="M ${floorPlane.centerX} 4 L 60 16 L ${floorPlane.centerX} 28 L 12 16 Z" fill="${p[2]}" stroke="${p[1]}" stroke-width="2"/>
      <path data-layer="wall-center-ridge" d="M ${floorPlane.centerX} 4 V ${floorPlane.centerY + floorPlane.halfHeight}" stroke="${p[1]}" stroke-width="1" opacity="0.65"/>`,
    },
    door: {
      file: 'tile-door.svg',
      title: `${label} door tile`,
      body: (p) => `
      <path data-layer="door-footprint" d="${diamond}" fill="#29221d" stroke="#514235" stroke-width="2"/>
      <path data-layer="door-fill" d="M ${floorPlane.centerX} 8 L 64 ${floorPlane.centerY} L ${floorPlane.centerX} 40 L 8 ${floorPlane.centerY} Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="3"/>
      <path data-layer="door-grain" d="M 18 ${floorPlane.centerY} L ${floorPlane.centerX} 14 L 54 ${floorPlane.centerY} M 18 ${floorPlane.centerY} L ${floorPlane.centerX} 34 L 54 ${floorPlane.centerY}" fill="none" stroke="${p[2]}" stroke-width="2" opacity="0.55"/>
      <path data-layer="door-brace" d="M 24 18 L 48 30 M 48 18 L 24 30" stroke="${p[1]}" stroke-width="3" stroke-linecap="round" opacity="0.72"/>`,
    },
    stairUp: {
      file: 'tile-stair-up.svg',
      title: `${label} stair up tile`,
      body: (p) => `
      <path data-layer="stair-up-fill" d="M ${floorPlane.centerX} 8 L 64 ${floorPlane.centerY} L ${floorPlane.centerX} 40 L 8 ${floorPlane.centerY} Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path data-layer="stair-up-treads" d="M 16 28 L 36 18 L 56 28 M 20 32 L 36 24 L 52 32 M 24 36 L 36 30 L 48 36" fill="none" stroke="${p[1]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path data-layer="stair-up-arrow" d="M ${floorPlane.centerX} 10 L 48 24 L 24 24 Z" fill="${p[2]}" opacity="0.78"/>`,
    },
    stairDown: {
      file: 'tile-stair-down.svg',
      title: `${label} stair down tile`,
      body: (p) => `
      <path data-layer="stair-down-fill" d="M ${floorPlane.centerX} 8 L 64 ${floorPlane.centerY} L ${floorPlane.centerX} 40 L 8 ${floorPlane.centerY} Z" fill="${p[0]}" stroke="${p[1]}" stroke-width="2"/>
      <path data-layer="stair-down-treads" d="M 16 20 L 36 30 L 56 20 M 20 16 L 36 24 L 52 16 M 24 12 L 36 18 L 48 12" fill="none" stroke="${p[1]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path data-layer="stair-down-arrow" d="M ${floorPlane.centerX} 40 L 48 26 L 24 26 Z" fill="${p[2]}" opacity="0.85"/>`,
    },
    void: {
      file: 'tile-void.svg',
      title: `${label} void tile`,
      body: (p) => `
      <path d="${diamond}" fill="${p[0]}" stroke="${p[1]}" stroke-width="1" opacity="0.7"/>
      <path d="M 18 ${floorPlane.centerY - 6} L 54 ${floorPlane.centerY + 6} M 54 ${floorPlane.centerY - 6} L 18 ${floorPlane.centerY + 6}" stroke="${p[1]}" stroke-width="1" opacity="0.35"/>`,
    },
  };

  if (!includeStructureTiles) {
    return specs;
  }

  const structureSprite = (variant) => (p) => renderStructurePng(width, height, p, variant);

  return {
    ...specs,
    cathedralVerticalWall: {
      file: 'tile-vertical-wall.png',
      format: 'png',
      title: `${label} vertical wall tile`,
      paletteKey: 'wall',
      body: structureSprite('verticalWall'),
    },
    cathedralHorizontalWall: {
      file: 'tile-horizontal-wall.png',
      format: 'png',
      title: `${label} horizontal wall tile`,
      paletteKey: 'wall',
      body: structureSprite('horizontalWall'),
    },
    cathedralCornerWall: {
      file: 'tile-corner-wall.png',
      format: 'png',
      title: `${label} corner wall tile`,
      paletteKey: 'wall',
      body: structureSprite('cornerWall'),
    },
    cathedralDiagonalWall: {
      file: 'tile-diagonal-wall.png',
      format: 'png',
      title: `${label} diagonal wall tile`,
      paletteKey: 'wall',
      body: structureSprite('diagonalWall'),
    },
    cathedralVerticalArch: {
      file: 'tile-vertical-arch.png',
      format: 'png',
      title: `${label} vertical arch tile`,
      paletteKey: 'wall',
      body: structureSprite('verticalArch'),
    },
    cathedralHorizontalArch: {
      file: 'tile-horizontal-arch.png',
      format: 'png',
      title: `${label} horizontal arch tile`,
      paletteKey: 'wall',
      body: structureSprite('horizontalArch'),
    },
    cathedralPillar: {
      file: 'tile-pillar.png',
      format: 'png',
      title: `${label} pillar tile`,
      paletteKey: 'wall',
      body: structureSprite('pillar'),
    },
    cathedralDividingWall: {
      file: 'tile-dividing-wall.png',
      format: 'png',
      title: `${label} dividing wall tile`,
      paletteKey: 'wall',
      body: structureSprite('dividingWall'),
    },
  };
}

function removeStaleStructureSvgAssets(outDir) {
  for (const file of staleStructureSvgFiles) {
    const filePath = join(outDir, file);
    if (existsSync(filePath)) {
      rmSync(filePath);
    }
  }
}

function renderStructurePng(width, height, palette, variant) {
  const canvas = createRasterCanvas(width, height, 4);
  const colors = structureColors(palette);
  drawStructureBase(canvas, colors);

  switch (variant) {
    case 'verticalWall':
      drawMasonrySlab(canvas, [
        [20, 39],
        [21, 10],
        [36, 2],
        [51, 10],
        [52, 39],
        [36, 47],
      ], colors, 7);
      stroke(canvas, [[36, 4], [36, 45]], colors.highlight, 2.1, 0.72);
      stroke(canvas, [[24, 18], [48, 18], [48, 19], [24, 19]], colors.joint, 1.2, 0.48);
      stroke(canvas, [[23, 28], [49, 28], [49, 29], [23, 29]], colors.joint, 1.2, 0.44);
      break;
    case 'horizontalWall':
      drawMasonrySlab(canvas, [
        [2, 24],
        [36, 4],
        [70, 24],
        [60, 35],
        [36, 44],
        [12, 35],
      ], colors, 13);
      stroke(canvas, [[6, 24], [36, 7], [66, 24]], colors.highlight, 2.4, 0.68);
      stroke(canvas, [[14, 31], [58, 31]], colors.joint, 1.2, 0.46);
      stroke(canvas, [[22, 36], [50, 36]], colors.joint, 1.2, 0.42);
      break;
    case 'cornerWall':
      drawMasonrySlab(canvas, [[3, 24], [36, 4], [40, 27], [14, 42], [7, 33]], colors, 19);
      drawMasonrySlab(canvas, [[36, 4], [69, 24], [64, 33], [40, 27]], colors, 23);
      fill(canvas, [[3, 24], [36, 4], [69, 24], [40, 27]], colors.cap, 0.96);
      stroke(canvas, [[4, 24], [36, 5], [68, 24]], colors.highlight, 2.2, 0.62);
      stroke(canvas, [[36, 7], [39, 27]], colors.joint, 1.1, 0.5);
      break;
    case 'diagonalWall':
      drawMasonrySlab(canvas, [[10, 18], [28, 7], [64, 31], [47, 43]], colors, 29);
      stroke(canvas, [[17, 18], [54, 38]], colors.highlight, 2.5, 0.62);
      stroke(canvas, [[28, 17], [37, 22], [37, 23], [28, 18]], colors.joint, 1.1, 0.5);
      stroke(canvas, [[38, 25], [48, 31]], colors.joint, 1.1, 0.5);
      break;
    case 'verticalArch':
      fill(canvas, [[13, 42], [13, 21], [17, 12], [27, 5], [36, 2], [36, 15], [30, 20], [27, 28], [27, 46]], colors.shadow, 0.36);
      fill(canvas, [[59, 42], [59, 21], [55, 12], [45, 5], [36, 2], [36, 15], [42, 20], [45, 28], [45, 46]], colors.shadow, 0.36);
      fill(canvas, [
        [15, 42],
        [15, 20],
        [19, 10],
        [28, 4],
        [36, 2],
        [44, 4],
        [53, 10],
        [57, 20],
        [57, 42],
        [47, 47],
        [47, 27],
        [44, 19],
        [36, 13],
        [28, 19],
        [25, 27],
        [25, 47],
      ], colors.wall, 1);
      fill(canvas, [[20, 18], [28, 7], [36, 4], [44, 7], [52, 18], [45, 21], [36, 16], [27, 21]], colors.cap, 0.98);
      stroke(canvas, [[15, 42], [15, 20], [19, 10], [28, 4], [36, 2], [44, 4], [53, 10], [57, 20], [57, 42]], colors.outline, 2.4, 0.98);
      fill(canvas, [[29, 46], [29, 27], [31, 20], [36, 16], [41, 20], [43, 27], [43, 46]], colors.opening, 0.98);
      stroke(canvas, [[20, 19], [29, 8], [36, 5], [43, 8], [52, 19]], colors.highlight, 2.4, 0.78);
      stroke(canvas, [[23, 32], [23, 43]], colors.highlight, 1.5, 0.36);
      stroke(canvas, [[49, 32], [49, 43]], colors.highlight, 1.5, 0.36);
      drawChipHighlights(canvas, 37, colors, [[22, 30], [50, 30], [26, 19], [46, 19]]);
      break;
    case 'horizontalArch':
      fill(canvas, [[4, 24], [24, 11], [36, 3], [48, 11], [68, 24], [60, 38], [46, 34], [36, 28], [26, 34], [12, 38]], colors.shadow, 0.34);
      fill(canvas, [[5, 24], [28, 9], [36, 3], [44, 9], [67, 24], [58, 38], [46, 33], [36, 27], [26, 33], [14, 38]], colors.wall, 1);
      fill(canvas, [[8, 24], [28, 11], [36, 6], [44, 11], [64, 24], [54, 30], [36, 22], [18, 30]], colors.cap, 0.98);
      fill(canvas, [[7, 24], [20, 16], [30, 22], [22, 41], [11, 36]], colors.wall, 1);
      fill(canvas, [[65, 24], [52, 16], [42, 22], [50, 41], [61, 36]], colors.wall, 1);
      stroke(canvas, [[5, 24], [28, 9], [36, 3], [44, 9], [67, 24], [58, 38], [46, 33], [36, 27], [26, 33], [14, 38], [5, 24]], colors.outline, 2.4, 0.98);
      fill(canvas, [[19, 29], [36, 16], [53, 29], [45, 38], [36, 34], [27, 38]], colors.opening, 0.98);
      stroke(canvas, [[8, 24], [29, 10], [36, 6], [43, 10], [64, 24]], colors.highlight, 2.5, 0.78);
      stroke(canvas, [[16, 30], [25, 35]], colors.highlight, 1.4, 0.36);
      stroke(canvas, [[56, 30], [47, 35]], colors.highlight, 1.4, 0.36);
      drawChipHighlights(canvas, 41, colors, [[17, 29], [55, 29], [28, 18], [44, 18]]);
      break;
    case 'pillar':
      fill(canvas, [[21, 15], [36, 5], [51, 15], [47, 22], [25, 22]], colors.cap, 1);
      drawMasonrySlab(canvas, [[24, 17], [48, 17], [52, 37], [36, 47], [20, 37]], colors, 43);
      fill(canvas, [[20, 36], [36, 28], [52, 36], [36, 46]], colors.cap, 0.96);
      stroke(canvas, [[36, 8], [36, 44]], colors.highlight, 2.1, 0.62);
      stroke(canvas, [[27, 25], [45, 25], [45, 26], [27, 26]], colors.joint, 1.1, 0.5);
      break;
    case 'dividingWall':
      drawMasonrySlab(canvas, [[6, 24], [36, 10], [66, 24], [36, 38]], colors, 47);
      stroke(canvas, [[10, 24], [36, 14], [62, 24]], colors.highlight, 3, 0.68);
      stroke(canvas, [[20, 25], [36, 18], [52, 25]], colors.joint, 1.2, 0.48);
      break;
    default:
      throw new Error(`Unsupported structure sprite variant: ${variant}`);
  }

  const pixels = downsample(canvas);
  applyStoneTexture(pixels, width, height, hashString(variant));
  return encodePng(width, height, pixels);
}

function structureColors(palette) {
  return {
    floor: hexToRgb(palette[0]),
    outline: hexToRgb(palette[1]),
    wall: lighten(hexToRgb(palette[2]), 12),
    wallDark: darken(hexToRgb(palette[2]), 28),
    cap: lighten(hexToRgb(palette[2]), 24),
    joint: [193, 199, 212],
    highlight: [218, 223, 234],
    shadow: [2, 3, 4],
    opening: [3, 4, 6],
  };
}

function drawStructureBase(canvas, colors) {
  fill(canvas, [[4, 29], [36, 47], [68, 29], [36, 39]], colors.shadow, 0.72);
  fill(canvas, [[36, 6], [70, 24], [36, 42], [2, 24]], colors.floor, 0.88);
  stroke(canvas, [[36, 6], [70, 24], [36, 42], [2, 24], [36, 6]], colors.outline, 1.2, 0.72);
  fill(canvas, [[5, 24], [36, 7], [67, 24], [36, 41]], colors.wallDark, 0.94);
  stroke(canvas, [[8, 24], [36, 39], [64, 24]], colors.highlight, 2.2, 0.42);
  stroke(canvas, [[10, 24], [62, 24]], colors.outline, 1.1, 0.48);
  stroke(canvas, [[36, 9], [36, 40]], colors.outline, 1, 0.38);
}

function drawMasonrySlab(canvas, points, colors, seed) {
  fill(canvas, points.map(([x, y]) => [x, y + 2]), colors.shadow, 0.34);
  fill(canvas, points, colors.wall, 1);
  stroke(canvas, [...points, points[0]], colors.outline, 2.2, 0.96);
  stroke(canvas, [points[0], points[1], points[2]], colors.highlight, 1.4, 0.48);
  drawChipHighlights(canvas, seed, colors, points.slice(0, 4));
}

function drawChipHighlights(canvas, seed, colors, anchors) {
  for (let index = 0; index < anchors.length; index += 1) {
    const [x, y] = anchors[index];
    const offset = (hashNoise(seed + index, index) - 0.5) * 4;
    stroke(canvas, [[x - 3, y + offset], [x + 4, y + offset + 1]], colors.joint, 1.1, 0.34);
  }
}

function applyStoneTexture(pixels, width, height, seed) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (pixels[index + 3] < 80) {
        continue;
      }
      const grain = Math.floor((hashNoise(x + seed, y - seed) - 0.5) * 18);
      pixels[index] = clampByte(pixels[index] + grain);
      pixels[index + 1] = clampByte(pixels[index + 1] + grain);
      pixels[index + 2] = clampByte(pixels[index + 2] + grain + 1);
      if (hashNoise(x * 7 + seed, y * 11 - seed) > 0.965) {
        pixels[index] = clampByte(pixels[index] + 22);
        pixels[index + 1] = clampByte(pixels[index + 1] + 22);
        pixels[index + 2] = clampByte(pixels[index + 2] + 24);
      }
      if (hashNoise(x * 13 - seed, y * 5 + seed) < 0.025) {
        pixels[index] = clampByte(pixels[index] - 20);
        pixels[index + 1] = clampByte(pixels[index + 1] - 20);
        pixels[index + 2] = clampByte(pixels[index + 2] - 18);
      }
    }
  }
}

function assertTileSize(width, height, label) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`${label} tile size must use finite positive dimensions.`);
  }
}

function assertPalette(key, colors, label) {
  if (!Array.isArray(colors) || colors.length !== 3) {
    throw new Error(`${label} palette entry ${key} must provide exactly three colors.`);
  }
  for (const color of colors) {
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new Error(`${label} palette entry ${key} includes an invalid color value.`);
    }
  }
}

function generatedRegistryModule(packs, allAssets) {
  const packExports = packs.map((pack) => `export const ${pack.exportName}_RESOURCE_PACK_ID = ${JSON.stringify(pack.resourcePackId)};
export const ${pack.exportName}_TILE_SIZE = ${JSON.stringify(pack.tileSize, null, 2)} as const;
export const ${pack.exportName}_ASSET_REGISTRY = ${JSON.stringify(pack.assets, null, 2)} as const satisfies readonly AssetManifestEntry[];
`).join('\n');

  return `import type { AssetManifestEntry } from './dungeon-assets';

${packExports}export const DUNGEON_ASSET_REGISTRY = ${JSON.stringify(allAssets, null, 2)} as const satisfies readonly AssetManifestEntry[];
`;
}
