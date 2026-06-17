import { checksumJson } from '../../core/hash';
import type { DungeonGenerationResult, TileKind } from './dungeon-types';

export const DUNGEON_COMPARISON_SCHEMA = 'dungeon-grid-v1' as const;

const TILE_TO_SYMBOL: Record<TileKind, string> = {
  void: ' ',
  floor: '.',
  wall: '#',
  door: '+',
  stairUp: '<',
  stairDown: '>',
};

export interface DungeonComparisonSnapshot {
  schema: typeof DUNGEON_COMPARISON_SCHEMA;
  seed: number;
  dungeonType: string;
  levelNumber: number;
  generatorVersion: string;
  grid: {
    width: number;
    height: number;
  };
  checksum: string;
  requestOptions: {
    includeObjects: boolean;
    includeSpawnZones: boolean;
    includeQuestLocks: boolean;
  };
  tileRows: string[];
  legend: Record<TileKind, string>;
  generation: {
    familyId: string;
    generatorKind: string;
    areaThreshold?: number;
    maskTileCount?: number;
    roomCount?: number;
    minisetCount?: number;
    objectCount?: number;
    roomNodeCapacity?: number;
  };
}

export interface NormalizedDungeonSnapshot {
  width: number;
  height: number;
  rows: string[];
  checksum?: string;
}

export interface DungeonSnapshotMismatch {
  x: number;
  y: number;
  candidate: string;
  reference: string;
}

export interface DungeonSnapshotComparison {
  identical: boolean;
  dimensionsMatch: boolean;
  checksumMatch?: boolean;
  mismatchCount: number;
  mismatches: DungeonSnapshotMismatch[];
  candidateHistogram: Record<string, number>;
  referenceHistogram: Record<string, number>;
}

export function createDungeonComparisonSnapshot(result: DungeonGenerationResult): DungeonComparisonSnapshot {
  return {
    schema: DUNGEON_COMPARISON_SCHEMA,
    seed: result.seed,
    dungeonType: result.level.dungeonType,
    levelNumber: result.level.levelNumber,
    generatorVersion: result.request.generatorVersion,
    grid: {
      width: result.level.width,
      height: result.level.height,
    },
    checksum: result.level.checksum,
    requestOptions: {
      includeObjects: result.request.includeObjects,
      includeSpawnZones: result.request.includeSpawnZones,
      includeQuestLocks: result.request.includeQuestLocks,
    },
    tileRows: result.level.tiles.map((row) => row.map((tile) => TILE_TO_SYMBOL[tile]).join('')),
    legend: TILE_TO_SYMBOL,
    generation: {
      familyId: result.level.generation.familyId,
      generatorKind: result.level.generation.generatorKind,
      areaThreshold: result.level.generation.familyId === 'Cathedral'
        ? result.level.generation.areaThreshold
        : result.level.generation.familyId === 'Hell'
          ? result.level.generation.areaThreshold
          : undefined,
      maskTileCount: result.level.generation.familyId === 'Cathedral'
        ? result.level.generation.maskTileCount
        : result.level.generation.familyId === 'Hell'
          ? result.level.generation.floorArea
          : undefined,
      roomCount: result.level.generation.familyId === 'Catacombs'
        ? result.level.generation.rooms.length
        : result.level.generation.familyId === 'Caves'
          ? result.level.generation.themeRooms.length
          : result.level.generation.familyId === 'Hell'
            ? result.level.generation.themeRooms.length || result.level.generation.protectedQuads.length
        : undefined,
      minisetCount: result.level.generation.familyId === 'Cathedral' || result.level.generation.familyId === 'Catacombs' || result.level.generation.familyId === 'Caves' || result.level.generation.familyId === 'Hell'
        ? result.level.generation.minisetPlacements.length
        : undefined,
      objectCount: result.level.objects?.length,
      roomNodeCapacity: result.level.generation.familyId === 'Catacombs' ? result.level.generation.roomNodeCapacity : undefined,
    },
  };
}

export function compareDungeonSnapshots(
  candidateInput: DungeonComparisonSnapshot | NormalizedDungeonSnapshot,
  referenceInput: DungeonComparisonSnapshot | NormalizedDungeonSnapshot,
  maxMismatches = 200,
): DungeonSnapshotComparison {
  const candidate = normalizeDungeonSnapshot(candidateInput);
  const reference = normalizeDungeonSnapshot(referenceInput);
  const dimensionsMatch = candidate.width === reference.width && candidate.height === reference.height;
  const width = Math.max(candidate.width, reference.width);
  const height = Math.max(candidate.height, reference.height);
  const mismatches: DungeonSnapshotMismatch[] = [];
  let mismatchCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const candidateCell = cellAt(candidate, x, y);
      const referenceCell = cellAt(reference, x, y);
      if (candidateCell !== referenceCell) {
        mismatchCount += 1;
        if (mismatches.length < maxMismatches) {
          mismatches.push({ x, y, candidate: candidateCell, reference: referenceCell });
        }
      }
    }
  }

  const checksumMatch = candidate.checksum && reference.checksum ? candidate.checksum === reference.checksum : undefined;
  return {
    identical: dimensionsMatch && mismatchCount === 0,
    dimensionsMatch,
    checksumMatch,
    mismatchCount,
    mismatches,
    candidateHistogram: histogram(candidate.rows),
    referenceHistogram: histogram(reference.rows),
  };
}

export function normalizeDungeonSnapshot(input: DungeonComparisonSnapshot | NormalizedDungeonSnapshot): NormalizedDungeonSnapshot {
  if ('tileRows' in input) {
    return {
      width: input.grid.width,
      height: input.grid.height,
      rows: input.tileRows,
      checksum: input.checksum,
    };
  }

  return {
    width: input.width,
    height: input.height,
    rows: input.rows,
    checksum: input.checksum,
  };
}

export function checksumDungeonRows(rows: readonly string[]): string {
  return checksumJson(rows);
}

function cellAt(snapshot: NormalizedDungeonSnapshot, x: number, y: number): string {
  if (x >= snapshot.width || y >= snapshot.height) {
    return '';
  }
  return snapshot.rows[y]?.[x] ?? '';
}

function histogram(rows: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const cell of row) {
      counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }
  return counts;
}
