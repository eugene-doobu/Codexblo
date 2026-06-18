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
  const renderChecksum = partialLevel.renderTiles ? checksumJson(renderChecksumInput(partialLevel)) : undefined;

  const level: DungeonLevel = {
    ...partialLevel,
    ...(renderChecksum ? { renderChecksum } : {}),
    checksum: checksumJson(gameplayChecksumInput(partialLevel)),
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

function gameplayChecksumInput(level: Omit<DungeonLevel, 'checksum'>): unknown {
  const { renderTiles: _renderTiles, renderChecksum: _renderChecksum, generation, ...logicalLevel } = level;
  if (generation.familyId !== 'Cathedral') {
    return { ...logicalLevel, generation };
  }

  const { tileization: _tileization, ...logicalGeneration } = generation;
  return {
    ...logicalLevel,
    generation: logicalGeneration,
  };
}

function renderChecksumInput(level: Omit<DungeonLevel, 'checksum'>): unknown {
  return {
    renderTiles: level.renderTiles,
    tileization: level.generation.familyId === 'Cathedral' ? level.generation.tileization : undefined,
  };
}
