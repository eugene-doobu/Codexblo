import { CATHEDRAL_STRUCTURE_TILE_KINDS } from './cathedral-render-tiles';
import type { DungeonType, TileAssetSemantic, TileKind } from './dungeon-types';

export const REQUIRED_TILE_KINDS: readonly TileKind[] = [
  'floor',
  'wall',
  'door',
  'stairUp',
  'stairDown',
  'void',
];

export const REQUIRED_TILE_SEMANTICS: readonly `tile.${TileKind}`[] = REQUIRED_TILE_KINDS.map(
  (tileKind) => `tile.${tileKind}` as const,
);

const CATHEDRAL_STRUCTURE_TILE_SEMANTICS: readonly TileAssetSemantic[] = CATHEDRAL_STRUCTURE_TILE_KINDS.map(
  (tileKind) => `tile.${tileKind}` as const,
);

export function knownTileSemanticsForDungeon(dungeonType: DungeonType): readonly TileAssetSemantic[] {
  if (dungeonType === 'Cathedral') {
    return [...REQUIRED_TILE_SEMANTICS, ...CATHEDRAL_STRUCTURE_TILE_SEMANTICS];
  }
  return REQUIRED_TILE_SEMANTICS;
}
