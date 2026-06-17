import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TileKind } from '../src/domain/world/dungeon-generator';
import { REQUIRED_TILE_SEMANTICS } from '../src/domain/world/tile-semantics';
import {
  resourcePackIdForDungeonType,
  TILE_ASSET_ENTRIES,
  TILE_ASSET_KEYS,
  TILE_ASSET_KEYS_BY_DUNGEON,
  TILE_ASSET_PATHS,
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
      expect(TILE_ASSET_KEYS[tileKind]).toBe(entry!.key);
      expect(TILE_ASSET_PATHS[tileKind]).toBe(entry!.path);

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
    const wallPath = resolve(publicRoot, TILE_ASSET_PATHS.wall.replace(/^\//, ''));
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
    const assetPath = resolve(publicRoot, TILE_ASSET_PATHS[tileKind].replace(/^\//, ''));
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
    const doorPath = resolve(publicRoot, TILE_ASSET_PATHS.door.replace(/^\//, ''));
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
