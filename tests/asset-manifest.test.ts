import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TileKind } from '../src/domain/world/dungeon-generator';
import { REQUIRED_TILE_SEMANTICS } from '../src/domain/world/tile-semantics';
import { TILE_ASSET_ENTRIES, TILE_ASSET_KEYS, TILE_ASSET_PATHS, type AssetManifestEntry } from '../src/presentation/bindings/cathedral-assets';

describe('Cathedral generated resources', () => {
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
});
