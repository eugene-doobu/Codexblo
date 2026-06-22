import { describe, expect, it } from 'vitest';
import { createGenerationRequest } from '../src/domain/world/dungeon-generator';
import { buildDungeonLabRequest } from '../src/scenes/dev/dungeon-lab-request';
import { rawTileValuesForRequest, supportsRawCathedralTileValues } from '../src/scenes/dev/dungeon-raw-tile-values';

describe('dungeon lab request builder', () => {
  it('preserves generation flags that are not edited by visible lab controls', () => {
    const previous = createGenerationRequest({
      dungeonType: 'Cathedral',
      levelNumber: 1,
      seedText: 'objects-disabled',
      includeObjects: false,
      includeSpawnZones: false,
      includeQuestLocks: false,
    });

    const request = buildDungeonLabRequest({
      dungeonType: 'Cathedral',
      levelNumber: '1',
      seedMode: 'manual',
      seedText: 'objects-disabled',
    }, previous);

    expect(request.includeObjects).toBe(false);
    expect(request.includeSpawnZones).toBe(false);
    expect(request.includeQuestLocks).toBe(false);
  });

  it('exposes raw Cathedral tile values only for supported Diablo Cathedral levels', () => {
    const rawTileValues = rawTileValuesForRequest(createGenerationRequest({
      dungeonType: 'Cathedral',
      levelNumber: 1,
      seedMode: 'manual',
      seedText: 'cathedral-lab-default',
    }));

    expect(rawTileValues).toHaveLength(40);
    expect(rawTileValues?.every((row) => row.length === 40)).toBe(true);
    expect(rawTileValuesForRequest(createGenerationRequest({ dungeonType: 'Cathedral', levelNumber: 5 }))).toBeUndefined();
    expect(rawTileValuesForRequest(createGenerationRequest({ dungeonType: 'Catacombs', levelNumber: 5 }))).toBeUndefined();
    expect([1, 2, 3, 4].every(supportsRawCathedralTileValues)).toBe(true);
    expect(supportsRawCathedralTileValues(5)).toBe(false);
  });
});
