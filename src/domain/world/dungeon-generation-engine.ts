import { checksumJson } from '../../core/hash';
import type { DungeonGenerationRequest, DungeonGenerationResult, DungeonLevel } from './dungeon-types';
import { resolveDungeonSeed } from './dungeon-generation-request';
import { generateCatacombsLevel } from './generation/catacombs-generator';
import { generateCathedralLevel } from './generation/cathedral-generator';
import { generateCavesLevel } from './generation/caves-generator';
import { generateHellLevel } from './generation/hell-generator';
import { buildConnectivityGraph, isPassable, validateDungeon, validateResourceBindings } from './generation/dungeon-validation';

export { isPassable };

export function generateDungeon(request: DungeonGenerationRequest): DungeonGenerationResult {
  const seed = resolveDungeonSeed(request);
  const partialLevel = generateLevelByType(request, seed);

  const level: DungeonLevel = {
    ...partialLevel,
    checksum: checksumJson(partialLevel),
  };
  const graph = buildConnectivityGraph(level);
  const resourceBindings = validateResourceBindings(level);
  const validation = validateDungeon(level, graph, resourceBindings);

  return { request, seed, level, graph, validation, resourceBindings };
}

function generateLevelByType(request: DungeonGenerationRequest, seed: number): Omit<DungeonLevel, 'checksum'> {
  switch (request.dungeonType) {
    case 'Cathedral':
      return generateCathedralLevel(request, seed);
    case 'Catacombs':
      return generateCatacombsLevel(request, seed);
    case 'Caves':
      return generateCavesLevel(request, seed);
    case 'Hell':
      return generateHellLevel(request, seed);
  }
}
