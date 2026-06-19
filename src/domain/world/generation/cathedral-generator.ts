import { checksumJson } from '../../../core/hash';
import { GameRng } from '../../../core/rng';
import { pointKey } from '../../../core/grid';
import type { GridPoint, GridRect } from '../../../core/grid';
import type {
  CathedralGenerationMetadata,
  CathedralGenerationTrace,
  CathedralStageTraceEntry,
  DungeonGenerationRequest,
  DungeonLevel,
  DungeonMinisetId,
  DungeonMinisetPlacement,
  RenderTileKind,
  TileKind,
} from '../dungeon-types';
import {
  addWalls,
  BASE_HEIGHT,
  BASE_WIDTH,
  buildZones,
  carveRoom,
  checkRoom,
  clipRect,
  countMaskTiles,
  createGrid,
  createMask,
  footprintFits,
  FORCED_PLACEMENT_TRIES,
  GRID_CONTRACT,
  inferDoorCandidates,
  inside,
  PASSABLE_TILES,
  protectFootprint,
  rect,
  swapPoint,
  swapRect,
  trailingSideRoomProbe,
} from './shared';
import { cathedralObjectPresetProfile, placeCathedralObjectPresets } from './cathedral-object-presets';
import { buildCathedralTileization } from './cathedral-tiles';

const CATHEDRAL_REGENERATION_LIMIT = 256;
const SIDE_ROOM_ATTEMPTS = 20;
const CATHEDRAL_SIDE_ROOM_SIZES = [2, 4, 6] as const;
const CATHEDRAL_MINISET_PLACEMENT_ORDER = ['STAIRSUP', 'STAIRSDOWN', 'LAMPS'] as const satisfies readonly DungeonMinisetId[];
const CHAMBER_PILLAR_OFFSETS: readonly GridPoint[] = [
  { x: 4, y: 4 },
  { x: 7, y: 4 },
  { x: 4, y: 7 },
  { x: 7, y: 7 },
];

interface MaskRoom {
  rect: GridRect;
  kind: 'chamber' | 'hall' | 'side';
  id: string;
}

interface CathedralLayoutMask {
  mask: boolean[][];
  rooms: MaskRoom[];
  verticalLayout: boolean;
  chamberFlags: CathedralGenerationMetadata['chamberFlags'];
  chamberInteriors: GridRect[];
  hallMask: GridRect;
  maskTileCount: number;
  attemptSeed: number;
  attemptCount: number;
}

interface CathedralMinisetSearchResult {
  position: GridPoint;
  searchStart: GridPoint;
  selectedAttempt: number;
  fallback: boolean;
}

export function generateCathedralLevel(request: DungeonGenerationRequest, seed: number): Omit<DungeonLevel, 'checksum'> {
  const rng = new GameRng(seed);
  const areaThreshold = cathedralAreaThreshold(request.levelNumber);
  const layout = generateAcceptedCathedralMask(rng, areaThreshold);
  const traceStages: CathedralStageTraceEntry[] = [maskStageTrace(layout)];
  const tiles = maskToTiles(layout.mask);
  traceStages.push(tileStageTrace('make-dmt-semantic', tiles, layout));
  const pillarPositions = applyChamberDetails(tiles, layout);
  traceStages.push(tileStageTrace('fill-chambers-semantic', tiles, layout));
  addWalls(tiles);
  traceStages.push(tileStageTrace('add-walls-semantic', tiles, layout));

  const protectedFootprints = new Set<string>(pillarPositions.map(pointKey));
  const minisetPlacements: DungeonMinisetPlacement[] = [];
  const up = placeCathedralStairMiniset(rng, tiles, protectedFootprints, 'STAIRSUP', { width: 4, height: 4 });
  minisetPlacements.push(up.miniset);
  const down = placeCathedralStairMiniset(rng, tiles, protectedFootprints, 'STAIRSDOWN', { width: 4, height: 3 });
  minisetPlacements.push(down.miniset);
  minisetPlacements.push(...placeCathedralLampMinisets(rng, tiles, protectedFootprints));
  traceStages.push(tileStageTrace('place-minisets-semantic', tiles, layout));
  const tileization = buildCathedralTileization(tiles, {
    verticalLayout: layout.verticalLayout,
    chamberInteriors: layout.chamberInteriors,
    hallMask: layout.hallMask,
    pillarPositions,
    minisetPlacements,
  });
  traceStages.push(renderStageTrace(tileization.renderTiles, tiles, layout));

  const rooms = layout.rooms.map((room) => room.rect);
  const doors = inferDoorCandidates(tiles);
  const zones = buildZones(request, rooms, tiles);
  const objectPlacements = placeCathedralObjectPresets(rng, tiles, protectedFootprints, zones, request.includeObjects);
  const generation: CathedralGenerationMetadata = {
    familyId: 'Cathedral',
    generatorKind: 'chamber-recursive',
    attemptCount: layout.attemptCount,
    attemptSeed: layout.attemptSeed,
    areaThreshold,
    maskTileCount: layout.maskTileCount,
    verticalLayout: layout.verticalLayout,
    chamberFlags: layout.chamberFlags,
    chamberInteriors: layout.chamberInteriors,
    sideRooms: layout.rooms.filter((room) => room.kind === 'side').map((room) => room.rect),
    hallMask: layout.hallMask,
    pillarPositions,
    tileization: tileization.metadata,
    minisetPlacements,
    objectPresetProfile: cathedralObjectPresetProfile(request.includeObjects),
    trace: createCathedralGenerationTrace(traceStages),
  };

  return {
    dungeonType: request.dungeonType,
    levelNumber: request.levelNumber,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    gridContract: GRID_CONTRACT,
    seed,
    tiles,
    renderTiles: tileization.renderTiles,
    rooms,
    doors,
    stairs: { up: up.point, down: down.point },
    zones,
    objects: objectPlacements,
    generation,
  };
}

export function generateAcceptedCathedralMask(rng: GameRng, areaThreshold: number): CathedralLayoutMask {
  for (let attemptCount = 1; attemptCount <= CATHEDRAL_REGENERATION_LIMIT; attemptCount += 1) {
    const attemptSeed = rng.getState();
    const layout = generateCathedralMaskAttempt(rng, attemptSeed, attemptCount);
    if (layout.maskTileCount >= areaThreshold) {
      return layout;
    }
  }

  throw new Error(`Cathedral generator failed to reach area threshold ${areaThreshold}.`);
}

export function generateCathedralMaskAttempt(rng: GameRng, attemptSeed: number, attemptCount: number): CathedralLayoutMask {
  const mask = createMask();
  const rooms: MaskRoom[] = [];
  const verticalLayout = rng.flipCoin();
  const chamberFlags = {
    chamber1: !rng.flipCoin(),
    chamber2: !rng.flipCoin(),
    chamber3: !rng.flipCoin(),
  };

  if (!chamberFlags.chamber1 || !chamberFlags.chamber3) {
    chamberFlags.chamber2 = true;
  }

  let chamber1 = rect(1, 15, 10, 10);
  const chamber2 = rect(15, 15, 10, 10);
  let chamber3 = rect(29, 15, 10, 10);
  let hallway = rect(1, 17, 38, 6);

  if (!chamberFlags.chamber1) {
    hallway = rect(hallway.x + 17, hallway.y, hallway.width - 17, hallway.height);
  }
  if (!chamberFlags.chamber3) {
    hallway = rect(hallway.x, hallway.y, hallway.width - 16, hallway.height);
  }
  if (verticalLayout) {
    chamber1 = swapRect(chamber1);
    chamber3 = swapRect(chamber3);
    hallway = swapRect(hallway);
  }

  const mapRoom = (room: GridRect, kind: MaskRoom['kind'], id: string): boolean => {
    const clipped = clipRect(room);
    if (clipped.width <= 0 || clipped.height <= 0) {
      return false;
    }
    if (kind === 'side' && !roomFootprintClear(mask, clipped)) {
      return false;
    }
    for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
      for (let x = clipped.x; x < clipped.x + clipped.width; x += 1) {
        mask[y][x] = true;
      }
    }
    rooms.push({ rect: clipped, kind, id });
    return true;
  };

  if (chamberFlags.chamber1) {
    mapRoom(chamber1, 'chamber', 'chamber-1-mask');
  }
  if (chamberFlags.chamber2) {
    mapRoom(chamber2, 'chamber', 'chamber-2-mask');
  }
  if (chamberFlags.chamber3) {
    mapRoom(chamber3, 'chamber', 'chamber-3-mask');
  }
  mapRoom(hallway, 'hall', 'hall-mask');

  const generateSideRooms = (area: GridRect, currentVerticalLayout: boolean): void => {
    const rotate = rng.flipCoin(4);
    const sideVerticalLayout = (!currentVerticalLayout && rotate) || (currentVerticalLayout && !rotate);
    let room1 = rect(area.x, area.y, 2, 2);
    let placeRoom1 = false;

    for (let attempt = 0; attempt < SIDE_ROOM_ATTEMPTS; attempt += 1) {
      const randomWidth = (rng.generateRnd(5) + 2) & ~1;
      const randomHeight = (rng.generateRnd(5) + 2) & ~1;
      room1 = rect(area.x, area.y, randomWidth, randomHeight);
      if (sideVerticalLayout) {
        room1 = rect(
          room1.x - room1.width,
          room1.y + Math.floor(area.height / 2) - Math.floor(room1.height / 2),
          room1.width,
          room1.height,
        );
        placeRoom1 = checkRoom(mask, cathedralLeadingSideRoomProbe(room1, sideVerticalLayout));
      } else {
        room1 = rect(
          room1.x + Math.floor(area.width / 2) - Math.floor(room1.width / 2),
          room1.y - room1.height,
          room1.width,
          room1.height,
        );
        placeRoom1 = checkRoom(mask, cathedralLeadingSideRoomProbe(room1, sideVerticalLayout));
      }
      if (placeRoom1) {
        break;
      }
    }

    let mappedRoom1 = false;
    if (placeRoom1) {
      const clampedRoom1 = rect(
        room1.x,
        room1.y,
        Math.min(BASE_WIDTH - room1.x, room1.width),
        Math.min(BASE_HEIGHT - room1.y, room1.height),
      );
      mappedRoom1 = mapRoom(clampedRoom1, 'side', `side-${rooms.length + 1}`);
    }

    let room2 = { ...room1 };
    let placeRoom2: boolean;
    if (sideVerticalLayout) {
      room2 = rect(area.x + area.width, room2.y, room2.width, room2.height);
      placeRoom2 = checkRoom(mask, trailingSideRoomProbe(room2, sideVerticalLayout));
    } else {
      room2 = rect(room2.x, area.y + area.height, room2.width, room2.height);
      placeRoom2 = checkRoom(mask, trailingSideRoomProbe(room2, sideVerticalLayout));
    }

    let mappedRoom2 = false;
    if (placeRoom2) {
      mappedRoom2 = mapRoom(room2, 'side', `side-${rooms.length + 1}`);
    }
    if (mappedRoom1) {
      generateSideRooms(room1, !sideVerticalLayout);
    }
    if (mappedRoom2) {
      generateSideRooms(room2, !sideVerticalLayout);
    }
  };

  if (chamberFlags.chamber1) {
    generateSideRooms(chamber1, verticalLayout);
  }
  if (chamberFlags.chamber2) {
    generateSideRooms(chamber2, verticalLayout);
  }
  if (chamberFlags.chamber3) {
    generateSideRooms(chamber3, verticalLayout);
  }

  return {
    mask,
    rooms,
    verticalLayout,
    chamberFlags,
    chamberInteriors: chamberInteriorRects(chamberFlags, verticalLayout),
    hallMask: hallway,
    maskTileCount: countMaskTiles(mask),
    attemptSeed,
    attemptCount,
  };
}

export function maskToTiles(mask: boolean[][]): TileKind[][] {
  const tiles = createGrid(BASE_WIDTH, BASE_HEIGHT, 'void');
  for (let y = 0; y < BASE_HEIGHT - 1; y += 1) {
    for (let x = 0; x < BASE_WIDTH - 1; x += 1) {
      if (mask[y][x] || (!mask[y + 1][x + 1] && mask[y + 1][x] && mask[y][x + 1])) {
        tiles[y][x] = 'floor';
      }
    }
  }
  return tiles;
}

export function applyChamberDetails(tiles: TileKind[][], layout: CathedralLayoutMask): GridPoint[] {
  const pillars: GridPoint[] = [];
  for (const interior of layout.chamberInteriors) {
    carveRoom(tiles, interior);
    const anchor = { x: interior.x - 1, y: interior.y - 1 };
    for (const offset of CHAMBER_PILLAR_OFFSETS) {
      const pillar = { x: anchor.x + offset.x, y: anchor.y + offset.y };
      if (inside(tiles, pillar)) {
        tiles[pillar.y][pillar.x] = 'wall';
        pillars.push(pillar);
      }
    }
  }
  return pillars;
}

export function chamberInteriorRects(
  chamberFlags: CathedralGenerationMetadata['chamberFlags'],
  verticalLayout: boolean,
): GridRect[] {
  const interiors: GridRect[] = [];
  let chamber1Anchor = { x: 0, y: 14 };
  const chamber2Anchor = { x: 14, y: 14 };
  let chamber3Anchor = { x: 28, y: 14 };
  if (verticalLayout) {
    chamber1Anchor = swapPoint(chamber1Anchor);
    chamber3Anchor = swapPoint(chamber3Anchor);
  }
  if (chamberFlags.chamber1) {
    interiors.push(interiorFromAnchor(chamber1Anchor));
  }
  if (chamberFlags.chamber2) {
    interiors.push(interiorFromAnchor(chamber2Anchor));
  }
  if (chamberFlags.chamber3) {
    interiors.push(interiorFromAnchor(chamber3Anchor));
  }
  return interiors;
}

export function interiorFromAnchor(anchor: GridPoint): GridRect {
  return rect(anchor.x + 1, anchor.y + 1, 10, 10);
}

export function cathedralAreaThreshold(levelNumber: number): number {
  switch (levelNumber) {
    case 1:
      return 533;
    case 2:
      return 693;
    default:
      return 761;
  }
}

function placeCathedralStairMiniset(
  rng: GameRng,
  tiles: TileKind[][],
  protectedFootprints: Set<string>,
  id: Extract<DungeonMinisetId, 'STAIRSUP' | 'STAIRSDOWN'>,
  size: { width: number; height: number },
): { point: GridPoint; miniset: DungeonMinisetPlacement } {
  const profile = id === 'STAIRSUP' ? 'drlg1-scan-wall-backed-up-stair' : 'drlg1-scan-floor-down-stair';
  const search = chooseCathedralMinisetPosition(
    rng,
    tiles,
    protectedFootprints,
    size,
    (position) => (id === 'STAIRSUP' ? cathedralUpStairFootprintFits(tiles, protectedFootprints, position, size) : footprintFits(tiles, protectedFootprints, position, size)),
    profile,
  );

  protectFootprint(protectedFootprints, search.position, size);
  const point = {
    x: search.position.x + Math.floor(size.width / 2),
    y: search.position.y + Math.floor(size.height / 2),
  };
  tiles[point.y][point.x] = id === 'STAIRSUP' ? 'stairUp' : 'stairDown';

  return {
    point,
    miniset: {
      id,
      role: 'stair',
      position: search.position,
      size,
      tries: FORCED_PLACEMENT_TRIES,
      searchStart: search.searchStart,
      selectedAttempt: search.selectedAttempt,
      matchProfile: search.fallback ? `${profile}-fallback-floor` : profile,
    },
  };
}

function placeCathedralLampMinisets(rng: GameRng, tiles: TileKind[][], protectedFootprints: Set<string>): DungeonMinisetPlacement[] {
  const placements: DungeonMinisetPlacement[] = [];
  const count = rng.generateRnd(5) + 5;
  const size = { width: 2, height: 2 };
  for (let index = 0; index < count; index += 1) {
    const search = chooseCathedralMinisetPosition(
      rng,
      tiles,
      protectedFootprints,
      size,
      (position) => footprintFits(tiles, protectedFootprints, position, size),
      'drlg1-scan-lamp',
    );
    protectFootprint(protectedFootprints, search.position, size);
    placements.push({
      id: 'LAMPS',
      role: 'decoration',
      position: search.position,
      size,
      tries: FORCED_PLACEMENT_TRIES,
      searchStart: search.searchStart,
      selectedAttempt: search.selectedAttempt,
      matchProfile: search.fallback ? 'drlg1-scan-lamp-fallback-floor' : 'drlg1-scan-lamp',
    });
  }
  return placements;
}

function chooseCathedralMinisetPosition(
  rng: GameRng,
  tiles: TileKind[][],
  protectedFootprints: ReadonlySet<string>,
  size: { width: number; height: number },
  predicate: (position: GridPoint) => boolean,
  profile: string,
): CathedralMinisetSearchResult {
  const searchStart = {
    x: rng.generateRnd(BASE_WIDTH - size.width),
    y: rng.generateRnd(BASE_HEIGHT - size.height),
  };
  const position = { ...searchStart };

  for (let attempt = 1; attempt <= FORCED_PLACEMENT_TRIES; attempt += 1, position.x += 1) {
    if (position.x === BASE_WIDTH - size.width) {
      position.x = 0;
      position.y += 1;
      if (position.y === BASE_HEIGHT - size.height) {
        position.y = 0;
      }
    }

    let valid = true;
    if (position.x <= 12) {
      position.x += 1;
      valid = false;
    }
    if (position.y <= 12) {
      position.y += 1;
      valid = false;
    }
    if (!valid) {
      continue;
    }

    if (predicate(position)) {
      return {
        position: { ...position },
        searchStart,
        selectedAttempt: attempt,
        fallback: false,
      };
    }
  }

  // Gameplay fail-safe: if the source-order scan exhausts, still keep the lab
  // level playable and expose the deviation through `matchProfile`.
  for (let y = 13; y < BASE_HEIGHT - size.height; y += 1) {
    for (let x = 13; x < BASE_WIDTH - size.width; x += 1) {
      const fallback = { x, y };
      if (footprintFits(tiles, protectedFootprints, fallback, size)) {
        return {
          position: fallback,
          searchStart,
          selectedAttempt: FORCED_PLACEMENT_TRIES + 1,
          fallback: true,
        };
      }
    }
  }

  throw new Error(`Unable to place Cathedral ${profile} ${size.width}x${size.height} miniset.`);
}

function cathedralUpStairFootprintFits(
  tiles: TileKind[][],
  protectedFootprints: ReadonlySet<string>,
  position: GridPoint,
  size: { width: number; height: number },
): boolean {
  return footprintFits(tiles, protectedFootprints, position, size) && footprintTouchesWallRun(tiles, position, size, 2);
}

function footprintTouchesWallRun(
  tiles: TileKind[][],
  position: GridPoint,
  size: { width: number; height: number },
  minimumRun: number,
): boolean {
  const north = countWallRun(tiles, position.x, position.y - 1, size.width, 0);
  const south = countWallRun(tiles, position.x, position.y + size.height, size.width, 0);
  const west = countWallRun(tiles, position.x - 1, position.y, size.height, 1);
  const east = countWallRun(tiles, position.x + size.width, position.y, size.height, 1);
  return Math.max(north, south, west, east) >= minimumRun;
}

function countWallRun(tiles: TileKind[][], startX: number, startY: number, length: number, axis: 0 | 1): number {
  let count = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const point = axis === 0 ? { x: startX + offset, y: startY } : { x: startX, y: startY + offset };
    if (inside(tiles, point) && tiles[point.y][point.x] === 'wall') {
      count += 1;
    }
  }
  return count;
}

function cathedralLeadingSideRoomProbe(room: GridRect, verticalLayout: boolean): GridRect {
  if (verticalLayout) {
    return rect(room.x - 1, room.y - 1, room.height + 2, room.width + 1);
  }
  return rect(room.x - 1, room.y - 1, room.width + 2, room.height + 1);
}

function roomFootprintClear(mask: boolean[][], room: GridRect): boolean {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (x < 0 || x >= BASE_WIDTH || y < 0 || y >= BASE_HEIGHT || mask[y][x]) {
        return false;
      }
    }
  }
  return true;
}

function createCathedralGenerationTrace(stages: readonly CathedralStageTraceEntry[]): CathedralGenerationTrace {
  return {
    sourceAlgorithm: 'drlg-l1-compatible-stage-order',
    sideRoomSearch: {
      attemptsPerSide: SIDE_ROOM_ATTEMPTS,
      sizes: CATHEDRAL_SIDE_ROOM_SIZES,
      verticalLeadingProbeUsesSwappedSizeQuirk: true,
    },
    minisetSearch: {
      tries: FORCED_PLACEMENT_TRIES as 1600,
      startBoundsExcludeLastFitColumnAndRow: true,
      drlg1QuirkMinimumCoordinate: 13,
      placementOrder: CATHEDRAL_MINISET_PLACEMENT_ORDER,
    },
    stages,
  };
}

function maskStageTrace(layout: CathedralLayoutMask): CathedralStageTraceEntry {
  return {
    stage: 'layout-mask',
    checksum: checksumJson(layout.mask.map((row) => row.map((cell) => (cell ? 1 : 0)).join(''))),
    maskTileCount: layout.maskTileCount,
    roomCount: layout.rooms.length,
    sideRoomCount: layout.rooms.filter((room) => room.kind === 'side').length,
  };
}

function tileStageTrace(stage: CathedralStageTraceEntry['stage'], tiles: TileKind[][], layout: CathedralLayoutMask): CathedralStageTraceEntry {
  return {
    stage,
    checksum: checksumJson(tiles.map((row) => row.join(','))),
    passableTileCount: countPassableTiles(tiles),
    roomCount: layout.rooms.length,
    sideRoomCount: layout.rooms.filter((room) => room.kind === 'side').length,
  };
}

function renderStageTrace(renderTiles: RenderTileKind[][], logicalTiles: TileKind[][], layout: CathedralLayoutMask): CathedralStageTraceEntry {
  return {
    stage: 'tileize-render',
    checksum: checksumJson(renderTiles.map((row) => row.join(','))),
    passableTileCount: countPassableTiles(logicalTiles),
    roomCount: layout.rooms.length,
    sideRoomCount: layout.rooms.filter((room) => room.kind === 'side').length,
  };
}

function countPassableTiles(tiles: readonly (readonly string[])[]): number {
  let count = 0;
  for (const row of tiles) {
    for (const tile of row) {
      if (PASSABLE_TILES.has(tile as TileKind)) {
        count += 1;
      }
    }
  }
  return count;
}
