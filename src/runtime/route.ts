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
    levelNumber: parseLevelNumber(params.get('level')),
    seedMode,
    seedText: seedValue === 'random' ? String(Date.now()) : seedValue,
    includeObjects: params.get('objects') !== 'false',
    includeSpawnZones: params.get('spawns') !== 'false',
    includeQuestLocks: params.get('quests') !== 'false',
  });
}

function parseLevelNumber(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const level = Number.parseInt(value, 10);
  return Number.isFinite(level) && level >= 1 && level <= 16 ? level : undefined;
}
