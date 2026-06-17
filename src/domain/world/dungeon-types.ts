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

export interface DungeonGridContract {
  baseGrid: {
    width: 40;
    height: 40;
  };
  expandedGrid: {
    width: 112;
    height: 112;
    padding: 16;
    scale: 2;
  };
}

export interface DungeonMinisetPlacement {
  id: 'STAIRSUP' | 'STAIRSDOWN' | 'LAMPS' | 'PWATERIN';
  role: 'stair' | 'decoration' | 'portal';
  position: GridPoint;
  size: {
    width: number;
    height: number;
  };
  tries: number;
}

export interface CathedralGenerationMetadata {
  familyId: 'Cathedral';
  generatorKind: 'chamber-recursive';
  attemptCount: number;
  attemptSeed: number;
  areaThreshold: number;
  maskTileCount: number;
  verticalLayout: boolean;
  chamberFlags: {
    chamber1: boolean;
    chamber2: boolean;
    chamber3: boolean;
  };
  chamberInteriors: readonly GridRect[];
  sideRooms: readonly GridRect[];
  hallMask: GridRect;
  pillarPositions: readonly GridPoint[];
  minisetPlacements: readonly DungeonMinisetPlacement[];
}

export interface PreviewGenerationMetadata {
  familyId: Exclude<DungeonType, 'Cathedral'>;
  generatorKind: 'preview-rooms';
  attemptCount: number;
}

export type DungeonGenerationMetadata = CathedralGenerationMetadata | PreviewGenerationMetadata;

export interface DungeonLevel {
  dungeonType: DungeonType;
  levelNumber: number;
  width: number;
  height: number;
  gridContract: DungeonGridContract;
  seed: number;
  tiles: TileKind[][];
  rooms: GridRect[];
  doors: GridPoint[];
  stairs: {
    up: GridPoint;
    down: GridPoint;
  };
  zones: DungeonZone[];
  generation: DungeonGenerationMetadata;
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
    maskTileCount?: number;
    areaThreshold?: number;
    minisetCount?: number;
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
