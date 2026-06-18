import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CATHEDRAL_STRUCTURE_TILE_KINDS } from '../src/domain/world/cathedral-render-tiles';
import type { TileKind } from '../src/domain/world/dungeon-generator';
import { REQUIRED_TILE_SEMANTICS } from '../src/domain/world/tile-semantics';
import {
  resourcePackIdForDungeonType,
  CATHEDRAL_TILE_ASSET_KEYS,
  CATHEDRAL_TILE_ASSET_PATHS,
  TILE_ASSET_ENTRIES,
  TILE_ASSET_KEYS_BY_DUNGEON,
  TILE_ASSET_PATHS_BY_DUNGEON,
  tileAssetKeysForResourcePack,
  tileAssetPathsForResourcePack,
  type AssetManifestEntry,
} from '../src/presentation/bindings/dungeon-assets';

describe('Dungeon generated resources', () => {
  it('uses one generated registry for manifest files and runtime preload mappings', () => {
    const publicRoot = resolve(process.cwd(), 'public');
    const manifestPath = join(publicRoot, 'assets/asset-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { assets: AssetManifestEntry[] };
    const semantics = new Set(manifest.assets.map((asset) => asset.semantic));

    expect(manifest.assets).toEqual(TILE_ASSET_ENTRIES);

    for (const semantic of REQUIRED_TILE_SEMANTICS) {
      expect(semantics.has(semantic)).toBe(true);
      const entry = manifest.assets.find((asset) => asset.semantic === semantic);
      expect(entry).toBeDefined();
      expect(entry!.path.startsWith('/assets/')).toBe(true);
      expect(entry!.path.includes('..')).toBe(false);

      const tileKind = entry!.semantic.replace('tile.', '') as TileKind;
      expect(CATHEDRAL_TILE_ASSET_KEYS[tileKind]).toBe(entry!.key);
      expect(CATHEDRAL_TILE_ASSET_PATHS[tileKind]).toBe(entry!.path);

      const assetPath = resolve(publicRoot, entry!.path.replace(/^\//, ''));
      const relativeAssetPath = relative(publicRoot, assetPath);

      expect(relativeAssetPath !== '..' && !relativeAssetPath.startsWith(`..${sep}`)).toBe(true);
      expect(existsSync(assetPath)).toBe(true);
    }
  });

  it('includes a separate Catacombs resource pack and runtime asset mapping', () => {
    const publicRoot = resolve(process.cwd(), 'public');
    const manifestPath = join(publicRoot, 'assets/asset-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      resourcePacks: { resourcePackId: string; dungeonTypes: string[]; assets: AssetManifestEntry[] }[];
    };
    const pack = manifest.resourcePacks.find((resourcePack) => resourcePack.resourcePackId === 'catacombs-lab-placeholder');

    expect(pack).toBeDefined();
    expect(pack!.dungeonTypes).toContain('Catacombs');
    expect(pack!.assets).toHaveLength(REQUIRED_TILE_SEMANTICS.length);
    expect(resourcePackIdForDungeonType('Catacombs')).toBe('catacombs-lab-placeholder');
    expect(tileAssetKeysForResourcePack('catacombs-lab-placeholder').floor).toBe('catacombs.floor');
    expect(tileAssetPathsForResourcePack('catacombs-lab-placeholder').floor).toBe('/assets/catacombs/tile-floor.svg');
    expect(TILE_ASSET_KEYS_BY_DUNGEON.Catacombs.floor).toBe('catacombs.floor');
    expect(TILE_ASSET_KEYS_BY_DUNGEON.Catacombs.floor).not.toBe(TILE_ASSET_KEYS_BY_DUNGEON.Cathedral.floor);

    for (const semantic of REQUIRED_TILE_SEMANTICS) {
      const tileKind = semantic.replace('tile.', '') as TileKind;
      const path = TILE_ASSET_PATHS_BY_DUNGEON.Catacombs[tileKind];
      const assetPath = resolve(publicRoot, path.replace(/^\//, ''));

      expect(path.startsWith('/assets/catacombs/')).toBe(true);
      expect(existsSync(assetPath)).toBe(true);
    }
  });

  it('includes Cathedral structure tile placeholders and runtime mappings', () => {
    const publicRoot = resolve(process.cwd(), 'public');
    const manifestPath = join(publicRoot, 'assets/asset-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      resourcePacks: { resourcePackId: string; dungeonTypes: string[]; assets: AssetManifestEntry[] }[];
    };
    const pack = manifest.resourcePacks.find((resourcePack) => resourcePack.resourcePackId === 'cathedral-lab-placeholder');

    expect(pack).toBeDefined();
    expect(pack!.dungeonTypes).toEqual(['Cathedral']);
    expect(pack!.assets).toHaveLength(REQUIRED_TILE_SEMANTICS.length + CATHEDRAL_STRUCTURE_TILE_KINDS.length);

    for (const tileKind of CATHEDRAL_STRUCTURE_TILE_KINDS) {
      const semantic = `tile.${tileKind}`;
      const entry = pack!.assets.find((asset) => asset.semantic === semantic);
      const path = TILE_ASSET_PATHS_BY_DUNGEON.Cathedral[tileKind];
      const assetPath = resolve(publicRoot, path!.replace(/^\//, ''));

      expect(entry).toBeDefined();
      expect(TILE_ASSET_KEYS_BY_DUNGEON.Cathedral[tileKind]).toBe(entry!.key);
      expect(path).toBe(entry!.path);
      expect(path).toMatch(/^\/assets\/cathedral\/tile-.+\.png$/);
      expect(existsSync(assetPath)).toBe(true);
    }

    expect(tileAssetKeysForResourcePack('cathedral-lab-placeholder').cathedralPillar).toBe('cathedral.cathedralPillar');
    expect(tileAssetPathsForResourcePack('cathedral-lab-placeholder').cathedralPillar).toBe('/assets/cathedral/tile-pillar.png');
    expect(tileAssetKeysForResourcePack('catacombs-lab-placeholder').cathedralPillar).toBeUndefined();
  });

  it('emits Cathedral structure sprites as transparent PNG images with shared wall coverage', () => {
    const publicRoot = resolve(process.cwd(), 'public');

    for (const tileKind of CATHEDRAL_STRUCTURE_TILE_KINDS) {
      const path = TILE_ASSET_PATHS_BY_DUNGEON.Cathedral[tileKind];
      const assetPath = resolve(publicRoot, path!.replace(/^\//, ''));
      const image = readPng(readFileSync(assetPath));
      const coverage = opaqueBounds(image);

      expect(path).toMatch(/\.png$/);
      expect(image.width).toBe(72);
      expect(image.height).toBe(48);
      expect(image.colorType).toBe(6);
      expect(coverage.opaquePixels).toBeGreaterThan(700);
      expect(coverage.transparentPixels).toBeGreaterThan(700);
      expect(coverage.minX).toBeLessThanOrEqual(6);
      expect(coverage.maxX).toBeGreaterThanOrEqual(66);
      expect(coverage.minY).toBeLessThanOrEqual(8);
      expect(coverage.maxY).toBeGreaterThanOrEqual(40);
    }
  });

  it('renders Cathedral arches as wall-like PNG sprites with dark pass-through openings', () => {
    const publicRoot = resolve(process.cwd(), 'public');
    const verticalPath = resolve(publicRoot, TILE_ASSET_PATHS_BY_DUNGEON.Cathedral.cathedralVerticalArch!.replace(/^\//, ''));
    const horizontalPath = resolve(publicRoot, TILE_ASSET_PATHS_BY_DUNGEON.Cathedral.cathedralHorizontalArch!.replace(/^\//, ''));
    const vertical = readPng(readFileSync(verticalPath));
    const horizontal = readPng(readFileSync(horizontalPath));

    expect(alphaAt(vertical, 36, 34)).toBeGreaterThan(180);
    expect(luminanceAt(vertical, 36, 34)).toBeLessThan(45);
    expect(luminanceAt(vertical, 23, 28)).toBeGreaterThan(55);
    expect(alphaAt(horizontal, 36, 28)).toBeGreaterThan(180);
    expect(luminanceAt(horizontal, 36, 28)).toBeLessThan(45);
    expect(luminanceAt(horizontal, 16, 27)).toBeGreaterThan(55);
  });

  it('includes a separate Caves resource pack and runtime asset mapping', () => {
    const publicRoot = resolve(process.cwd(), 'public');
    const manifestPath = join(publicRoot, 'assets/asset-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      resourcePacks: { resourcePackId: string; dungeonTypes: string[]; assets: AssetManifestEntry[] }[];
    };
    const pack = manifest.resourcePacks.find((resourcePack) => resourcePack.resourcePackId === 'caves-lab-placeholder');

    expect(pack).toBeDefined();
    expect(pack!.dungeonTypes).toEqual(['Caves']);
    expect(pack!.assets).toHaveLength(REQUIRED_TILE_SEMANTICS.length);
    expect(resourcePackIdForDungeonType('Caves')).toBe('caves-lab-placeholder');
    expect(tileAssetKeysForResourcePack('caves-lab-placeholder').floor).toBe('caves.floor');
    expect(tileAssetPathsForResourcePack('caves-lab-placeholder').floor).toBe('/assets/caves/tile-floor.svg');
    expect(TILE_ASSET_KEYS_BY_DUNGEON.Caves.floor).toBe('caves.floor');
    expect(TILE_ASSET_KEYS_BY_DUNGEON.Caves.floor).not.toBe(TILE_ASSET_KEYS_BY_DUNGEON.Catacombs.floor);
    expect(TILE_ASSET_KEYS_BY_DUNGEON.Caves.floor).not.toBe(TILE_ASSET_KEYS_BY_DUNGEON.Cathedral.floor);

    for (const semantic of REQUIRED_TILE_SEMANTICS) {
      const tileKind = semantic.replace('tile.', '') as TileKind;
      const path = TILE_ASSET_PATHS_BY_DUNGEON.Caves[tileKind];
      const assetPath = resolve(publicRoot, path.replace(/^\//, ''));

      expect(path.startsWith('/assets/caves/')).toBe(true);
      expect(existsSync(assetPath)).toBe(true);
    }
  });

  it('includes a separate Hell resource pack and runtime asset mapping', () => {
    const publicRoot = resolve(process.cwd(), 'public');
    const manifestPath = join(publicRoot, 'assets/asset-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      resourcePacks: { resourcePackId: string; dungeonTypes: string[]; assets: AssetManifestEntry[] }[];
    };
    const pack = manifest.resourcePacks.find((resourcePack) => resourcePack.resourcePackId === 'hell-lab-placeholder');

    expect(pack).toBeDefined();
    expect(pack!.dungeonTypes).toEqual(['Hell']);
    expect(pack!.assets).toHaveLength(REQUIRED_TILE_SEMANTICS.length);
    expect(resourcePackIdForDungeonType('Hell')).toBe('hell-lab-placeholder');
    expect(tileAssetKeysForResourcePack('hell-lab-placeholder').floor).toBe('hell.floor');
    expect(tileAssetPathsForResourcePack('hell-lab-placeholder').floor).toBe('/assets/hell/tile-floor.svg');
    expect(TILE_ASSET_KEYS_BY_DUNGEON.Hell.floor).toBe('hell.floor');
    expect(TILE_ASSET_KEYS_BY_DUNGEON.Hell.floor).not.toBe(TILE_ASSET_KEYS_BY_DUNGEON.Caves.floor);
    expect(TILE_ASSET_KEYS_BY_DUNGEON.Hell.floor).not.toBe(TILE_ASSET_KEYS_BY_DUNGEON.Catacombs.floor);
    expect(TILE_ASSET_KEYS_BY_DUNGEON.Hell.floor).not.toBe(TILE_ASSET_KEYS_BY_DUNGEON.Cathedral.floor);

    for (const semantic of REQUIRED_TILE_SEMANTICS) {
      const tileKind = semantic.replace('tile.', '') as TileKind;
      const path = TILE_ASSET_PATHS_BY_DUNGEON.Hell[tileKind];
      const assetPath = resolve(publicRoot, path.replace(/^\//, ''));

      expect(path.startsWith('/assets/hell/')).toBe(true);
      expect(existsSync(assetPath)).toBe(true);
    }
  });

  it('renders wall art as a raised block above the floor footprint', () => {
    const publicRoot = resolve(process.cwd(), 'public');
    const wallPath = resolve(publicRoot, CATHEDRAL_TILE_ASSET_PATHS.wall.replace(/^\//, ''));
    const wallSvg = readFileSync(wallPath, 'utf8');
    const topPath = pathDataForLayer(wallSvg, 'wall-top');
    const topPoints = pointsFromPath(topPath);

    expect(wallSvg).toContain('data-layer="wall-footprint"');
    expect(wallSvg.indexOf('data-layer="wall-top"')).toBeGreaterThan(wallSvg.indexOf('data-layer="wall-left-face"'));
    expect(wallSvg.indexOf('data-layer="wall-top"')).toBeGreaterThan(wallSvg.indexOf('data-layer="wall-right-face"'));
    expect(Math.min(...topPoints.map((point) => point.y))).toBeLessThan(24);
    expect(Math.max(...topPoints.map((point) => point.y))).toBeLessThan(42);
  });

  it.each([
    ['door', 'door-fill'],
    ['stairUp', 'stair-up-fill'],
    ['stairDown', 'stair-down-fill'],
  ] satisfies [TileKind, string][])('fills the tile footprint for %s object art', (tileKind, layer) => {
    const publicRoot = resolve(process.cwd(), 'public');
    const assetPath = resolve(publicRoot, CATHEDRAL_TILE_ASSET_PATHS[tileKind].replace(/^\//, ''));
    const svg = readFileSync(assetPath, 'utf8');
    const objectPoints = pointsFromPath(pathDataForLayer(svg, layer));
    const bounds = boundsForPoints(objectPoints);

    expect(bounds.minX).toBeLessThanOrEqual(8);
    expect(bounds.maxX).toBeGreaterThanOrEqual(64);
    expect(bounds.minY).toBeLessThanOrEqual(8);
    expect(bounds.maxY).toBeGreaterThanOrEqual(40);
  });

  it('renders doors as full-tile panels instead of small marker icons', () => {
    const publicRoot = resolve(process.cwd(), 'public');
    const doorPath = resolve(publicRoot, CATHEDRAL_TILE_ASSET_PATHS.door.replace(/^\//, ''));
    const doorSvg = readFileSync(doorPath, 'utf8');

    expect(doorSvg).toContain('data-layer="door-fill"');
    expect(doorSvg).not.toContain('<circle');
    expect(doorSvg).not.toContain('#c9a35b');
  });
});

function pathDataForLayer(svg: string, layer: string): string {
  const match = new RegExp(`data-layer="${layer}" d="([^"]+)"`).exec(svg);
  if (!match) {
    throw new Error(`Missing SVG path layer: ${layer}`);
  }
  return match[1];
}

function pointsFromPath(path: string): { x: number; y: number }[] {
  return [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

function boundsForPoints(points: { x: number; y: number }[]): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function readPng(buffer: Buffer): { width: number; height: number; colorType: number; pixels: Uint8Array } {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Invalid PNG signature.');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    }
    if (type === 'IDAT') {
      idatChunks.push(data);
    }
    offset += length + 12;
    if (type === 'IEND') {
      break;
    }
  }

  const stride = width * 4;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = inflated[rowStart];
    if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}`);
    }
    pixels.set(inflated.subarray(rowStart + 1, rowStart + 1 + stride), y * stride);
  }

  return { width, height, colorType, pixels };
}

function opaqueBounds(image: { width: number; height: number; pixels: Uint8Array }): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  opaquePixels: number;
  transparentPixels: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let opaquePixels = 0;
  let transparentPixels = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = alphaAt(image, x, y);
      if (alpha > 32) {
        opaquePixels += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      } else {
        transparentPixels += 1;
      }
    }
  }

  if (opaquePixels === 0) {
    throw new Error('PNG has no opaque pixels.');
  }

  return { minX, maxX, minY, maxY, opaquePixels, transparentPixels };
}

function alphaAt(image: { width: number; pixels: Uint8Array }, x: number, y: number): number {
  return image.pixels[(y * image.width + x) * 4 + 3];
}

function luminanceAt(image: { width: number; pixels: Uint8Array }, x: number, y: number): number {
  const index = (y * image.width + x) * 4;
  return image.pixels[index] * 0.2126 + image.pixels[index + 1] * 0.7152 + image.pixels[index + 2] * 0.0722;
}
