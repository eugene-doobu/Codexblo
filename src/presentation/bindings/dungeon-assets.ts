import type { DungeonType, TileKind } from '../../domain/world/dungeon-types';
import { REQUIRED_TILE_KINDS, REQUIRED_TILE_SEMANTICS } from '../../domain/world/tile-semantics';
import {
  CATACOMBS_ASSET_REGISTRY,
  CATACOMBS_RESOURCE_PACK_ID,
  CATHEDRAL_ASSET_REGISTRY,
  CATHEDRAL_RESOURCE_PACK_ID,
  CAVES_ASSET_REGISTRY,
  CAVES_RESOURCE_PACK_ID,
  DUNGEON_ASSET_REGISTRY,
  HELL_ASSET_REGISTRY,
  HELL_RESOURCE_PACK_ID,
} from './dungeon-asset-registry.generated';

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
  resourcePacks?: readonly {
    resourcePackId: string;
    dungeonTypes: readonly DungeonType[];
    tileSize: {
      width: number;
      height: number;
    };
    assets: readonly AssetManifestEntry[];
  }[];
  assets: readonly AssetManifestEntry[];
}

export const TILE_ASSET_ENTRIES = DUNGEON_ASSET_REGISTRY;

export const RESOURCE_PACK_ID_BY_DUNGEON = {
  Cathedral: CATHEDRAL_RESOURCE_PACK_ID,
  Catacombs: CATACOMBS_RESOURCE_PACK_ID,
  Caves: CAVES_RESOURCE_PACK_ID,
  Hell: HELL_RESOURCE_PACK_ID,
} satisfies Record<DungeonType, string>;

export const TILE_ASSET_KEYS_BY_RESOURCE_PACK = {
  [CATHEDRAL_RESOURCE_PACK_ID]: mapTileAssets(CATHEDRAL_ASSET_REGISTRY, (entry) => entry.key),
  [CATACOMBS_RESOURCE_PACK_ID]: mapTileAssets(CATACOMBS_ASSET_REGISTRY, (entry) => entry.key),
  [CAVES_RESOURCE_PACK_ID]: mapTileAssets(CAVES_ASSET_REGISTRY, (entry) => entry.key),
  [HELL_RESOURCE_PACK_ID]: mapTileAssets(HELL_ASSET_REGISTRY, (entry) => entry.key),
} satisfies Record<string, Record<TileKind, string>>;

export const TILE_ASSET_PATHS_BY_RESOURCE_PACK = {
  [CATHEDRAL_RESOURCE_PACK_ID]: mapTileAssets(CATHEDRAL_ASSET_REGISTRY, (entry) => entry.path),
  [CATACOMBS_RESOURCE_PACK_ID]: mapTileAssets(CATACOMBS_ASSET_REGISTRY, (entry) => entry.path),
  [CAVES_RESOURCE_PACK_ID]: mapTileAssets(CAVES_ASSET_REGISTRY, (entry) => entry.path),
  [HELL_RESOURCE_PACK_ID]: mapTileAssets(HELL_ASSET_REGISTRY, (entry) => entry.path),
} satisfies Record<string, Record<TileKind, string>>;

export const TILE_ASSET_KEYS_BY_DUNGEON = {
  Cathedral: tileAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Cathedral),
  Catacombs: tileAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Catacombs),
  Caves: tileAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Caves),
  Hell: tileAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Hell),
} satisfies Record<DungeonType, Record<TileKind, string>>;

export const TILE_ASSET_PATHS_BY_DUNGEON = {
  Cathedral: tileAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Cathedral),
  Catacombs: tileAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Catacombs),
  Caves: tileAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Caves),
  Hell: tileAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Hell),
} satisfies Record<DungeonType, Record<TileKind, string>>;

export const TILE_ASSET_KEYS = TILE_ASSET_KEYS_BY_DUNGEON.Cathedral;
export const TILE_ASSET_PATHS = TILE_ASSET_PATHS_BY_DUNGEON.Cathedral;

export { REQUIRED_TILE_SEMANTICS };

export function resourcePackIdForDungeonType(dungeonType: DungeonType): string {
  return RESOURCE_PACK_ID_BY_DUNGEON[dungeonType];
}

export function tileAssetKeysForResourcePack(resourcePackId: string): Record<TileKind, string> {
  return requiredPack(TILE_ASSET_KEYS_BY_RESOURCE_PACK, resourcePackId);
}

export function tileAssetPathsForResourcePack(resourcePackId: string): Record<TileKind, string> {
  return requiredPack(TILE_ASSET_PATHS_BY_RESOURCE_PACK, resourcePackId);
}

function mapTileAssets(
  entries: readonly AssetManifestEntry[],
  valueOf: (entry: AssetManifestEntry) => string,
): Record<TileKind, string> {
  return Object.fromEntries(
    REQUIRED_TILE_KINDS.map((tileKind) => [tileKind, valueOf(requiredEntryFor(entries, tileKind))]),
  ) as Record<TileKind, string>;
}

function requiredEntryFor(entries: readonly AssetManifestEntry[], tileKind: TileKind): AssetManifestEntry {
  const semantic = `tile.${tileKind}` as const;
  const entry = entries.find((asset) => asset.semantic === semantic);
  if (!entry) {
    throw new Error(`Missing dungeon asset registry entry for ${semantic}.`);
  }
  return entry;
}

function requiredPack<T>(packs: Readonly<Record<string, T>>, resourcePackId: string): T {
  const pack = packs[resourcePackId];
  if (!pack) {
    throw new Error(`Missing dungeon resource pack: ${resourcePackId}.`);
  }
  return pack;
}
