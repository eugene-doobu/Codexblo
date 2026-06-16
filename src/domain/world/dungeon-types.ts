import type { GridPoint, GridRect } from '../../core/grid';

export type DungeonType = 'Cathedral' | 'Catacombs' | 'Caves' | 'Hell';
export type SeedMode = 'random' | 'manual' | 'fixture';
export type TileKind = 'void' | 'floor' | 'wall' | 'door' | 'stairUp' | 'stairDown';

export interface DungeonGenerationRequest {
  dungeonType: DungeonType;
  levelNumber: number;
  seedMode: SeedMode;
  seedText: string;
  generatorVersion: string;
  resourcePackId: string;
  includeObjects: boolean;
  includeSpawnZones: boolean;
  includeQuestLocks: boolean;
}

export interface DungeonZone {
  id: string;
  kind: 'object' | 'spawn' | 'questLock';
  rect: GridRect;
}

export interface DungeonLevel {
  dungeonType: DungeonType;
  levelNumber: number;
  width: number;
  height: number;
  seed: number;
  tiles: TileKind[][];
  rooms: GridRect[];
  doors: GridPoint[];
  stairs: {
    up: GridPoint;
    down: GridPoint;
  };
  zones: DungeonZone[];
  checksum: string;
}

export interface DungeonConnectivityGraph {
  reachableTiles: readonly GridPoint[];
  unreachablePassableTiles: readonly GridPoint[];
}

export type ValidationSeverity = 'info' | 'warning' | 'error';

export interface DungeonValidationIssue {
  rule: string;
  severity: ValidationSeverity;
  message: string;
  points?: readonly GridPoint[];
}

export interface DungeonValidationReport {
  ok: boolean;
  issues: readonly DungeonValidationIssue[];
  metrics: {
    passableTileCount: number;
    reachableTileCount: number;
    roomCount: number;
    doorCount: number;
    zoneCount: number;
  };
}

export interface DungeonResourceBindingReport {
  ok: boolean;
  missingSemantics: readonly string[];
  usedSemantics: readonly string[];
}

export interface DungeonGenerationResult {
  request: DungeonGenerationRequest;
  seed: number;
  level: DungeonLevel;
  graph: DungeonConnectivityGraph;
  validation: DungeonValidationReport;
  resourceBindings: DungeonResourceBindingReport;
}