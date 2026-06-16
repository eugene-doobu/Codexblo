import type { TileKind } from '../../domain/world/dungeon-types';
import { REQUIRED_TILE_KINDS, REQUIRED_TILE_SEMANTICS } from '../../domain/world/tile-semantics';
import { CATHEDRAL_ASSET_REGISTRY } from './cathedral-asset-registry.generated';

export interface AssetManifestEntry {
  key: string;
  kind: 'image';
  semantic: `tile.${TileKind}`;
  path: string;
  width: number;
  height: number;
}

export interface AssetManifest {
  schemaVersion: number;
  resourcePackId: string;
  tileSize: {
    width: number;
    height: number;
  };
  assets: readonly AssetManifestEntry[];
}

export const TILE_ASSET_ENTRIES = CATHEDRAL_ASSET_REGISTRY;

export const TILE_ASSET_KEYS = mapTileAssets((entry) => entry.key);
export const TILE_ASSET_PATHS = mapTileAssets((entry) => entry.path);

export { REQUIRED_TILE_SEMANTICS };

function mapTileAssets(valueOf: (entry: AssetManifestEntry) => string): Record<TileKind, string> {
  return Object.fromEntries(
    REQUIRED_TILE_KINDS.map((tileKind) => [tileKind, valueOf(requiredEntryFor(tileKind))]),
  ) as Record<TileKind, string>;
}

function requiredEntryFor(tileKind: TileKind): AssetManifestEntry {
  const semantic = `tile.${tileKind}` as const;
  const entry = TILE_ASSET_ENTRIES.find((asset) => asset.semantic === semantic);
  if (!entry) {
    throw new Error(`Missing Cathedral asset registry entry for ${semantic}.`);
  }
  return entry;
}
