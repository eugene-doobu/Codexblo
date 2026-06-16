import {
  createGenerationRequest,
  parseDungeonType,
  parseSeedMode,
  type DungeonGenerationRequest,
} from '../domain/world/dungeon-generator';

export function requestFromLocation(location: Location): DungeonGenerationRequest {
  const params = new URLSearchParams(location.search);
  const type = parseDungeonType(params.get('type'));
  const seedValue = params.get('seed') ?? 'cathedral-lab-default';
  const seedMode = seedValue === 'random' ? 'random' : parseSeedMode(params.get('seedMode'));
  return createGenerationRequest({
    dungeonType: type,
    seedMode,
    seedText: seedValue === 'random' ? String(Date.now()) : seedValue,
    includeObjects: params.get('objects') !== 'false',
    includeSpawnZones: params.get('spawns') !== 'false',
    includeQuestLocks: params.get('quests') !== 'false',
  });
}