import { describe, expect, it } from 'vitest';
import {
  DUNGEON_GENERATOR_VERSION,
  createGenerationRequest,
  generateDungeon,
  type DungeonType,
} from '../src/domain/world/dungeon-generator';

const cathedralV1Checksum = 'd93706f6';

const baseRequest = createGenerationRequest({
  dungeonType: 'Cathedral',
  levelNumber: 1,
  seedMode: 'manual',
  seedText: 'cathedral-test-seed',
});

describe('Cathedral dungeon generation', () => {
  it('is deterministic for the same manual seed', () => {
    const first = generateDungeon(baseRequest);
    const second = generateDungeon(baseRequest);

    expect(first.seed).toBe(second.seed);
    expect(first.level.checksum).toBe(second.level.checksum);
    expect(first.level.tiles).toEqual(second.level.tiles);
  });

  it('pins the Cathedral v1 fixture checksum', () => {
    const result = generateDungeon(baseRequest);

    expect(DUNGEON_GENERATOR_VERSION).toBe('cathedral-lab-v1');
    expect(result.level.checksum).toBe(cathedralV1Checksum);
  });

  it('changes layout checksum for a different seed', () => {
    const first = generateDungeon(baseRequest);
    const second = generateDungeon(createGenerationRequest({ ...baseRequest, seedText: 'cathedral-other-seed' }));

    expect(first.level.checksum).not.toBe(second.level.checksum);
  });

  it('passes reachability and resource validation', () => {
    const result = generateDungeon(baseRequest);

    expect(result.validation.ok).toBe(true);
    expect(result.resourceBindings.ok).toBe(true);
    expect(result.graph.unreachablePassableTiles).toHaveLength(0);
    expect(result.validation.metrics.roomCount).toBeGreaterThanOrEqual(2);
  });

  it('supports random seed requests as first-class lab input', () => {
    const result = generateDungeon(createGenerationRequest({ dungeonType: 'Cathedral', seedMode: 'random', seedText: '1781600000000' }));

    expect(result.request.seedMode).toBe('random');
    expect(result.validation.ok).toBe(true);
  });

  it.each(['Cathedral', 'Catacombs', 'Caves', 'Hell'] satisfies DungeonType[])(
    'generates a valid seeded %s preview',
    (dungeonType) => {
      const result = generateDungeon(createGenerationRequest({ dungeonType, seedMode: 'manual', seedText: `${dungeonType}-seeded-preview` }));

      expect(result.level.dungeonType).toBe(dungeonType);
      expect(result.validation.ok).toBe(true);
      expect(result.graph.unreachablePassableTiles).toHaveLength(0);
    },
  );
});
