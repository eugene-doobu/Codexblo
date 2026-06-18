export const CATHEDRAL_STRUCTURE_TILE_KINDS = [
  'cathedralVerticalWall',
  'cathedralHorizontalWall',
  'cathedralCornerWall',
  'cathedralDiagonalWall',
  'cathedralVerticalArch',
  'cathedralHorizontalArch',
  'cathedralPillar',
  'cathedralDividingWall',
] as const;

export type CathedralStructureTileKind = typeof CATHEDRAL_STRUCTURE_TILE_KINDS[number];
