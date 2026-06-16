import { hashStringToUint32 } from '../../core/hash';
import type { DungeonGenerationRequest, DungeonType, SeedMode } from './dungeon-types';

export const DUNGEON_GENERATOR_VERSION = 'cathedral-lab-v1';
export const DEFAULT_RESOURCE_PACK_ID = 'cathedral-lab-placeholder';

export function createGenerationRequest(input: Partial<DungeonGenerationRequest> = {}): DungeonGenerationRequest {
  const dungeonType = input.dungeonType ?? 'Cathedral';
  const levelNumber = input.levelNumber ?? defaultLevelNumber(dungeonType);
  const seedMode = input.seedMode ?? 'manual';
  const seedText = input.seedText?.trim() || (seedMode === 'random' ? String(Date.now()) : 'cathedral-lab-default');

  return {
    dungeonType,
    levelNumber,
    seedMode,
    seedText,
    generatorVersion: input.generatorVersion ?? DUNGEON_GENERATOR_VERSION,
    resourcePackId: input.resourcePackId ?? DEFAULT_RESOURCE_PACK_ID,
    includeObjects: input.includeObjects ?? true,
    includeSpawnZones: input.includeSpawnZones ?? true,
    includeQuestLocks: input.includeQuestLocks ?? true,
  };
}

export function resolveDungeonSeed(request: DungeonGenerationRequest): number {
  const seedSource = `${request.generatorVersion}:${request.dungeonType}:${request.levelNumber}:${request.seedMode}:${request.seedText}`;
  return hashStringToUint32(seedSource);
}

export function parseDungeonType(value: string | null | undefined): DungeonType {
  if (value === 'Catacombs' || value === 'Caves' || value === 'Hell') {
    return value;
  }
  return 'Cathedral';
}

export function parseSeedMode(value: string | null | undefined): SeedMode {
  if (value === 'random' || value === 'fixture') {
    return value;
  }
  return 'manual';
}

function defaultLevelNumber(dungeonType: DungeonType): number {
  switch (dungeonType) {
    case 'Catacombs':
      return 5;
    case 'Caves':
      return 9;
    case 'Hell':
      return 13;
    case 'Cathedral':
      return 1;
  }
}