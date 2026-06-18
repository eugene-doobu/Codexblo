import { describe, expect, it } from 'vitest';
import { CATHEDRAL_STRUCTURE_TILE_KINDS } from '../src/domain/world/cathedral-render-tiles';
import { isCathedralStructureTile, tileDepthBias } from '../src/presentation/dev/dungeon-render-depth';

describe('Dungeon render depth', () => {
  it('treats Cathedral arch, corner, and wall variants as one raised structure family', () => {
    for (const tileKind of CATHEDRAL_STRUCTURE_TILE_KINDS) {
      if (tileKind === 'cathedralPillar') {
        continue;
      }
      expect(tileDepthBias(tileKind)).toBe(tileDepthBias('wall'));
    }
  });

  it('keeps Cathedral pillars taller than the connected wall structure family', () => {
    expect(tileDepthBias('cathedralPillar')).toBeGreaterThan(tileDepthBias('wall'));
  });

  it('identifies every Cathedral wall, arch, corner, and pillar as one cohesion family', () => {
    for (const tileKind of CATHEDRAL_STRUCTURE_TILE_KINDS) {
      expect(isCathedralStructureTile(tileKind)).toBe(true);
    }

    expect(isCathedralStructureTile('wall')).toBe(false);
    expect(isCathedralStructureTile('floor')).toBe(false);
  });
});
