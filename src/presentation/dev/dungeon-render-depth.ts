import { CATHEDRAL_STRUCTURE_TILE_KINDS } from '../../domain/world/cathedral-render-tiles';
import type { RenderTileKind } from '../../domain/world/dungeon-generator';

const CATHEDRAL_STRUCTURE_TILE_SET = new Set<RenderTileKind>(CATHEDRAL_STRUCTURE_TILE_KINDS);

export function tileDepthBias(tile: RenderTileKind): number {
  if (tile === 'cathedralPillar') {
    return 16;
  }
  if (isCathedralStructureTile(tile)) {
    return 12;
  }
  switch (tile) {
    case 'wall':
      return 12;
    case 'door':
      return 8;
    case 'stairUp':
    case 'stairDown':
      return 4;
    case 'floor':
    case 'void':
      return 0;
    default:
      return 0;
  }
}

export function isCathedralStructureTile(tile: RenderTileKind): boolean {
  return CATHEDRAL_STRUCTURE_TILE_SET.has(tile);
}
