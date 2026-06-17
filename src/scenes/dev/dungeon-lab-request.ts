import {
  createGenerationRequest,
  type DungeonGenerationRequest,
  type DungeonType,
  type SeedMode,
} from '../../domain/world/dungeon-generator';

export interface DungeonLabRequestFields {
  dungeonType: string;
  levelNumber: string;
  seedMode: string;
  seedText: string;
}

export function buildDungeonLabRequest(
  fields: DungeonLabRequestFields,
  previousRequest?: DungeonGenerationRequest,
): DungeonGenerationRequest {
  return createGenerationRequest({
    dungeonType: fields.dungeonType as DungeonType,
    levelNumber: Number(fields.levelNumber) || 1,
    seedMode: fields.seedMode as SeedMode,
    seedText: fields.seedText,
    includeObjects: previousRequest?.includeObjects,
    includeSpawnZones: previousRequest?.includeSpawnZones,
    includeQuestLocks: previousRequest?.includeQuestLocks,
  });
}
