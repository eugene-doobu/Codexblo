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

export type DungeonMinisetId =
  | 'STAIRSUP'
  | 'STAIRSDOWN'
  | 'LAMPS'
  | 'PWATERIN'
  | 'USTAIRS'
  | 'DSTAIRS'
  | 'WARPSTAIRS'
  | 'L3UP'
  | 'L3DOWN'
  | 'L3HOLDWARP'
  | 'L4USTAIRS'
  | 'L4DSTAIRS'
  | 'L4TWARP'
  | 'L4PENTA'
  | 'L4PENTA2';

export interface DungeonMinisetPlacement {
  id: DungeonMinisetId;
  role: 'stair' | 'decoration' | 'portal';
  position: GridPoint;
  size: {
    width: number;
    height: number;
  };
  tries: number;
}

export type DungeonObjectPresetId = 'SHRINE' | 'BOOKCASE' | 'BARREL_CLUSTER' | 'SARCOPHAGUS' | 'WEAPON_RACK';
export type DungeonObjectCategory = 'shrine' | 'lore' | 'container' | 'tomb' | 'rack';

export interface DungeonObjectPlacement {
  id: string;
  presetId: DungeonObjectPresetId;
  category: DungeonObjectCategory;
  position: GridPoint;
  size: {
    width: number;
    height: number;
  };
  blocksMovement: boolean;
  tries: number;
}

export interface CathedralObjectPresetProfile {
  enabled: boolean;
  placementOrder: readonly DungeonObjectPresetId[];
  presets: readonly {
    id: DungeonObjectPresetId;
    category: DungeonObjectCategory;
    size: {
      width: number;
      height: number;
    };
    count: {
      min: number;
      max: number;
    };
    blocksMovement: boolean;
    tries: number;
  }[];
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
  objectPresetProfile: CathedralObjectPresetProfile;
}

export type CatacombsHallDirection = 'Up' | 'Right' | 'Down' | 'Left';

export interface CatacombsHallMetadata {
  from: GridPoint;
  to: GridPoint;
  direction: CatacombsHallDirection;
  minusExtension: boolean;
  plusExtension: boolean;
}

export interface CatacombsForcedRoomProfile {
  id: 'BloodRoom' | 'BoneRoom' | 'BlindRoom';
  levelNumber: number;
  size: {
    width: number;
    height: number;
  };
  enabled: boolean;
  actualRoom?: GridRect;
}

export interface CatacombsGenerationMetadata {
  familyId: 'Catacombs';
  generatorKind: 'bsp-rooms';
  attemptCount: number;
  attemptSeed: number;
  roomNodeCapacity: 80;
  roomNodeArrayCapacity: 81;
  initialPartition: {
    topLeft: GridPoint;
    bottomRight: GridPoint;
  };
  randomRoomSize: {
    min: 4;
    maxExclusive: 10;
    effectiveMaxInclusiveWhenAreaAtLeastTen: 9;
  };
  clampBounds: {
    min: 1;
    max: 38;
  };
  recursionStandoff: {
    width: 2;
    height: 2;
  };
  hallExtensionChance: {
    minusPercent: 50;
    plusPercent: 50;
  };
  hallSteering: {
    horizontalMultiplier: 2;
    horizontalMaxPercent: 30;
    verticalMultiplier: 5;
    verticalMaxPercent: 80;
  };
  themeRoom: {
    minSize: 6;
    maxSize: 10;
    floorTile: 3;
    frequency: 0;
    randomizeSize: false;
  };
  forcedRoomProfile?: CatacombsForcedRoomProfile;
  rooms: readonly GridRect[];
  halls: readonly CatacombsHallMetadata[];
  minisetPlacements: readonly DungeonMinisetPlacement[];
}

export type CavesCleanupPass = 'diagonals' | 'singles' | 'straights' | 'edges';

export interface CavesPoolMetadata {
  position: GridPoint;
  size: {
    width: number;
    height: number;
  };
  area: number;
  placementGatePercent: 25;
  tries: number;
}

export interface CavesAnvilReserveMetadata {
  enabled: boolean;
  rect?: GridRect;
  searchLimit: 198;
}

export type CavesFixtureId = 'standard' | 'anvil-reserve';

export interface CavesFixtureProfile {
  id: CavesFixtureId;
  reserveAnvil: boolean;
}

export interface CavesGenerationMetadata {
  familyId: 'Caves';
  generatorKind: 'cellular-cave';
  attemptCount: number;
  attemptSeed: number;
  levelRange: {
    min: 9;
    max: 12;
  };
  seedRoom: {
    origin: GridPoint;
    size: {
      width: 2;
      height: 2;
    };
    originRange: {
      min: 10;
      max: 29;
    };
  };
  fillRoomBounds: {
    x1MinExclusive: 1;
    x2MaxExclusive: 34;
    y1MinExclusive: 1;
    y2MaxExclusive: 38;
  };
  firstExpansion: {
    blockSize: 2;
    directions: readonly [0, 1, 2, 3];
  };
  cleanupPasses: readonly CavesCleanupPass[];
  floorAreaThreshold: 600;
  floorArea: number;
  connectedFloorCount: number;
  themeRoom: {
    minSize: 5;
    maxSize: 10;
    floorTile: 7;
    frequency: 0;
    randomizeSize: false;
  };
  fencePass: {
    scanBounds: {
      min: 1;
      max: 38;
    };
    horizontalGatePercent: 50;
    verticalGatePercent: 50;
  };
  fixtureProfile: CavesFixtureProfile;
  anvilReserve: CavesAnvilReserveMetadata;
  pool: CavesPoolMetadata;
  themeRooms: readonly GridRect[];
  minisetPlacements: readonly DungeonMinisetPlacement[];
}

export interface HellGenerationMetadata {
  familyId: 'Hell';
  generatorKind: 'quadrant-mirror';
  attemptCount: number;
  attemptSeed: number;
  levelRange: {
    min: 13;
    max: 16;
  };
  workingQuadrant: {
    width: 20;
    height: 20;
  };
  mirrorAxes: {
    vertical: 19.5;
    horizontal: 19.5;
  };
  areaThreshold: 692;
  floorArea: number;
  connectedFloorCount: number;
  firstRoom: {
    size: {
      width: number;
      height: number;
    };
    position: GridPoint;
  };
  sideRoomAttemptsPerSide: 20;
  sideRoomSizes: readonly [2, 4, 6];
  innerBorderConnectors: {
    horizontal: GridPoint;
    vertical: GridPoint;
  };
  themeRoom: {
    minSize: 7;
    maxSize: 10;
    floorTile: 6;
    frequency: 8;
    randomizeSize: true;
    enabled: boolean;
  };
  townWarp: {
    enabled: boolean;
    levelNumber: 13;
    placement?: DungeonMinisetPlacement;
  };
  hellGate: {
    enabled: boolean;
    levelNumber: 15;
    placement?: DungeonMinisetPlacement;
  };
  protectedQuads: readonly GridRect[];
  themeRooms: readonly GridRect[];
  minisetPlacements: readonly DungeonMinisetPlacement[];
}

export type DungeonGenerationMetadata =
  | CathedralGenerationMetadata
  | CatacombsGenerationMetadata
  | CavesGenerationMetadata
  | HellGenerationMetadata;

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
    down?: GridPoint;
  };
  zones: DungeonZone[];
  objects?: readonly DungeonObjectPlacement[];
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
    objectCount?: number;
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
