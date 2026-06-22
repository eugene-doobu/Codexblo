import type { CathedralStructureTileKind } from '../../domain/world/cathedral-render-tiles';
import type { DungeonAssetSemantic, DungeonObjectPresetId, DungeonType, ObjectAssetSemantic, RenderTileKind, TileAssetSemantic, TileKind } from '../../domain/world/dungeon-types';
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
  semantic: DungeonAssetSemantic;
  path: string;
  width: number;
  height: number;
}

export type TileAssetMap = Record<TileKind, string> & Partial<Record<CathedralStructureTileKind, string>> & {
  [tileKind: string]: string | undefined;
};

export type ObjectAssetMap = Partial<Record<DungeonObjectPresetId, string>> & {
  [presetId: string]: string | undefined;
};

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
export const DUNGEON_ASSET_ENTRIES = DUNGEON_ASSET_REGISTRY;

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
} satisfies Record<string, TileAssetMap>;

export const TILE_ASSET_PATHS_BY_RESOURCE_PACK = {
  [CATHEDRAL_RESOURCE_PACK_ID]: mapTileAssets(CATHEDRAL_ASSET_REGISTRY, (entry) => entry.path),
  [CATACOMBS_RESOURCE_PACK_ID]: mapTileAssets(CATACOMBS_ASSET_REGISTRY, (entry) => entry.path),
  [CAVES_RESOURCE_PACK_ID]: mapTileAssets(CAVES_ASSET_REGISTRY, (entry) => entry.path),
  [HELL_RESOURCE_PACK_ID]: mapTileAssets(HELL_ASSET_REGISTRY, (entry) => entry.path),
} satisfies Record<string, TileAssetMap>;

export const OBJECT_ASSET_KEYS_BY_RESOURCE_PACK = {
  [CATHEDRAL_RESOURCE_PACK_ID]: mapObjectAssets(CATHEDRAL_ASSET_REGISTRY, (entry) => entry.key),
  [CATACOMBS_RESOURCE_PACK_ID]: mapObjectAssets(CATACOMBS_ASSET_REGISTRY, (entry) => entry.key),
  [CAVES_RESOURCE_PACK_ID]: mapObjectAssets(CAVES_ASSET_REGISTRY, (entry) => entry.key),
  [HELL_RESOURCE_PACK_ID]: mapObjectAssets(HELL_ASSET_REGISTRY, (entry) => entry.key),
} satisfies Record<string, ObjectAssetMap>;

export const OBJECT_ASSET_PATHS_BY_RESOURCE_PACK = {
  [CATHEDRAL_RESOURCE_PACK_ID]: mapObjectAssets(CATHEDRAL_ASSET_REGISTRY, (entry) => entry.path),
  [CATACOMBS_RESOURCE_PACK_ID]: mapObjectAssets(CATACOMBS_ASSET_REGISTRY, (entry) => entry.path),
  [CAVES_RESOURCE_PACK_ID]: mapObjectAssets(CAVES_ASSET_REGISTRY, (entry) => entry.path),
  [HELL_RESOURCE_PACK_ID]: mapObjectAssets(HELL_ASSET_REGISTRY, (entry) => entry.path),
} satisfies Record<string, ObjectAssetMap>;

export const TILE_ASSET_KEYS_BY_DUNGEON = {
  Cathedral: tileAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Cathedral),
  Catacombs: tileAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Catacombs),
  Caves: tileAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Caves),
  Hell: tileAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Hell),
} satisfies Record<DungeonType, TileAssetMap>;

export const TILE_ASSET_PATHS_BY_DUNGEON = {
  Cathedral: tileAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Cathedral),
  Catacombs: tileAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Catacombs),
  Caves: tileAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Caves),
  Hell: tileAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Hell),
} satisfies Record<DungeonType, TileAssetMap>;

export const OBJECT_ASSET_KEYS_BY_DUNGEON = {
  Cathedral: objectAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Cathedral),
  Catacombs: objectAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Catacombs),
  Caves: objectAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Caves),
  Hell: objectAssetKeysForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Hell),
} satisfies Record<DungeonType, ObjectAssetMap>;

export const OBJECT_ASSET_PATHS_BY_DUNGEON = {
  Cathedral: objectAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Cathedral),
  Catacombs: objectAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Catacombs),
  Caves: objectAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Caves),
  Hell: objectAssetPathsForResourcePack(RESOURCE_PACK_ID_BY_DUNGEON.Hell),
} satisfies Record<DungeonType, ObjectAssetMap>;

export const CATHEDRAL_TILE_ASSET_KEYS = TILE_ASSET_KEYS_BY_DUNGEON.Cathedral;
export const CATHEDRAL_TILE_ASSET_PATHS = TILE_ASSET_PATHS_BY_DUNGEON.Cathedral;
export const CATHEDRAL_OBJECT_ASSET_KEYS = OBJECT_ASSET_KEYS_BY_DUNGEON.Cathedral;
export const CATHEDRAL_OBJECT_ASSET_PATHS = OBJECT_ASSET_PATHS_BY_DUNGEON.Cathedral;

export { REQUIRED_TILE_SEMANTICS };

export function resourcePackIdForDungeonType(dungeonType: DungeonType): string {
  return RESOURCE_PACK_ID_BY_DUNGEON[dungeonType];
}

export function tileAssetKeysForResourcePack(resourcePackId: string): TileAssetMap {
  return requiredPack(TILE_ASSET_KEYS_BY_RESOURCE_PACK, resourcePackId);
}

export function tileAssetPathsForResourcePack(resourcePackId: string): TileAssetMap {
  return requiredPack(TILE_ASSET_PATHS_BY_RESOURCE_PACK, resourcePackId);
}

export function objectAssetKeysForResourcePack(resourcePackId: string): ObjectAssetMap {
  return requiredPack(OBJECT_ASSET_KEYS_BY_RESOURCE_PACK, resourcePackId);
}

export function objectAssetPathsForResourcePack(resourcePackId: string): ObjectAssetMap {
  return requiredPack(OBJECT_ASSET_PATHS_BY_RESOURCE_PACK, resourcePackId);
}

function mapTileAssets(
  entries: readonly AssetManifestEntry[],
  valueOf: (entry: AssetManifestEntry) => string,
): TileAssetMap {
  const mapped = Object.fromEntries(
    REQUIRED_TILE_KINDS.map((tileKind) => [tileKind, valueOf(requiredEntryFor(entries, tileKind))]),
  ) as TileAssetMap;
  for (const entry of entries) {
    if (isTileAssetSemantic(entry.semantic)) {
      mapped[tileKindFromSemantic(entry.semantic)] = valueOf(entry);
    }
  }
  return mapped;
}

function mapObjectAssets(
  entries: readonly AssetManifestEntry[],
  valueOf: (entry: AssetManifestEntry) => string,
): ObjectAssetMap {
  const mapped: ObjectAssetMap = {};
  for (const entry of entries) {
    if (isObjectAssetSemantic(entry.semantic)) {
      mapped[objectPresetIdFromSemantic(entry.semantic)] = valueOf(entry);
    }
  }
  return mapped;
}

function requiredEntryFor(entries: readonly AssetManifestEntry[], tileKind: TileKind): AssetManifestEntry {
  const semantic = `tile.${tileKind}` as const;
  const entry = entries.find((asset) => asset.semantic === semantic);
  if (!entry) {
    throw new Error(`Missing dungeon asset registry entry for ${semantic}.`);
  }
  return entry;
}

function tileKindFromSemantic(semantic: TileAssetSemantic): RenderTileKind {
  return semantic.slice('tile.'.length) as RenderTileKind;
}

function objectPresetIdFromSemantic(semantic: ObjectAssetSemantic): DungeonObjectPresetId {
  return semantic.slice('object.'.length) as DungeonObjectPresetId;
}

function isTileAssetSemantic(semantic: DungeonAssetSemantic): semantic is TileAssetSemantic {
  return semantic.startsWith('tile.');
}

function isObjectAssetSemantic(semantic: DungeonAssetSemantic): semantic is ObjectAssetSemantic {
  return semantic.startsWith('object.');
}

function requiredPack<T>(packs: Readonly<Record<string, T>>, resourcePackId: string): T {
  const pack = packs[resourcePackId];
  if (!pack) {
    throw new Error(`Missing dungeon resource pack: ${resourcePackId}.`);
  }
  return pack;
}
