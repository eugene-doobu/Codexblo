import type { TileKind } from './dungeon-types';

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
