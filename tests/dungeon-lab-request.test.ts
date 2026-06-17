import { describe, expect, it } from 'vitest';
import { createGenerationRequest } from '../src/domain/world/dungeon-generator';
import { buildDungeonLabRequest } from '../src/scenes/dev/dungeon-lab-request';

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
});
