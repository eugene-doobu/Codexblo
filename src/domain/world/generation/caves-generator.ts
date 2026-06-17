import { pointKey, rectsOverlap } from '../../../core/grid';
import type { GridPoint, GridRect } from '../../../core/grid';
import { GameRng } from '../../../core/rng';
import type {
  CavesAnvilReserveMetadata,
  CavesCleanupPass,
  CavesFixtureProfile,
  CavesGenerationMetadata,
  CavesPoolMetadata,
  DungeonGenerationRequest,
  DungeonLevel,
  DungeonMinisetPlacement,
  DungeonZone,
  TileKind,
} from '../dungeon-types';
import {
  addWalls,
  BASE_HEIGHT,
  BASE_WIDTH,
  buildZones,
  chooseFootprintPosition,
  createGrid,
  FORCED_PLACEMENT_TRIES,
  GRID_CONTRACT,
  inside,
  neighbors4,
  PASSABLE_TILES,
  placeStairMiniset,
  protectFootprint,
  randomBetween,
  rect,
  rectContainsOnlyPassable,
} from './shared';

const CAVES_LEVEL_RANGE = { min: 9, max: 12 } as const;
const CAVES_SEED_ORIGIN_RANGE = { min: 10, max: 29 } as const;
const CAVES_SEED_ROOM_SIZE = { width: 2, height: 2 } as const;
const CAVES_FILL_ROOM_BOUNDS = {
  x1MinExclusive: 1,
  x2MaxExclusive: 34,
  y1MinExclusive: 1,
  y2MaxExclusive: 38,
} as const;
const CAVES_FIRST_EXPANSION = { blockSize: 2, directions: [0, 1, 2, 3] as const } as const;
const CAVES_CLEANUP_PASSES = ['diagonals', 'singles', 'straights', 'diagonals', 'edges'] as const satisfies readonly CavesCleanupPass[];
const CAVES_FLOOR_AREA_THRESHOLD = 600;
const CAVES_THEME_ROOM = { minSize: 5, maxSize: 10, floorTile: 7, frequency: 0, randomizeSize: false } as const;
const CAVES_FENCE_PASS = { scanBounds: { min: 1, max: 38 }, horizontalGatePercent: 50, verticalGatePercent: 50 } as const;
const CAVES_ANVIL_SEARCH_LIMIT = 198;
const CAVES_POOL_PLACEMENT_GATE_PERCENT = 25;
const CAVES_POOL_TRIES = 320;
const CAVES_LAYOUT_ATTEMPTS = 120;
const STANDARD_CAVES_FIXTURE: CavesFixtureProfile = { id: 'standard', reserveAnvil: false };
const ANVIL_RESERVE_FIXTURE: CavesFixtureProfile = { id: 'anvil-reserve', reserveAnvil: true };

type CaveDirection = 0 | 1 | 2 | 3;
type CaveMask = boolean[][];

interface CaveLayout {
  tiles: TileKind[][];
  seedRoomOrigin: GridPoint;
  attemptSeed: number;
  attemptCount: number;
  floorArea: number;
  connectedFloorCount: number;
  fixtureProfile: CavesFixtureProfile;
  anvilReserve: CavesAnvilReserveMetadata;
}

interface CaveAssembly {
  layout: CaveLayout;
  themeRooms: GridRect[];
  minisetPlacements: DungeonMinisetPlacement[];
  pool: CavesPoolMetadata;
  up: GridPoint;
  down: GridPoint;
}

export function generateCavesLevel(request: DungeonGenerationRequest, seed: number): Omit<DungeonLevel, 'checksum'> {
  const rng = new GameRng(seed);
  const fixtureProfile = resolveCavesFixtureProfile(request);

  for (let attempt = 1; attempt <= CAVES_LAYOUT_ATTEMPTS; attempt += 1) {
    const layout = generateCaveLayoutAttempt(rng, attempt, fixtureProfile);
    if (!layout) {
      continue;
    }

    const assembly = assembleCaveLevel(request, rng, layout);
    if (!assembly) {
      continue;
    }

    const generation: CavesGenerationMetadata = {
      familyId: 'Caves',
      generatorKind: 'cellular-cave',
      attemptCount: assembly.layout.attemptCount,
      attemptSeed: assembly.layout.attemptSeed,
      levelRange: CAVES_LEVEL_RANGE,
      seedRoom: {
        origin: assembly.layout.seedRoomOrigin,
        size: CAVES_SEED_ROOM_SIZE,
        originRange: CAVES_SEED_ORIGIN_RANGE,
      },
      fillRoomBounds: CAVES_FILL_ROOM_BOUNDS,
      firstExpansion: CAVES_FIRST_EXPANSION,
      cleanupPasses: CAVES_CLEANUP_PASSES,
      floorAreaThreshold: CAVES_FLOOR_AREA_THRESHOLD,
      floorArea: assembly.layout.floorArea,
      connectedFloorCount: assembly.layout.connectedFloorCount,
      themeRoom: CAVES_THEME_ROOM,
      fencePass: CAVES_FENCE_PASS,
      fixtureProfile: assembly.layout.fixtureProfile,
      anvilReserve: assembly.layout.anvilReserve,
      pool: assembly.pool,
      themeRooms: assembly.themeRooms,
      minisetPlacements: assembly.minisetPlacements,
    };

    return {
      dungeonType: request.dungeonType,
      levelNumber: request.levelNumber,
      width: BASE_WIDTH,
      height: BASE_HEIGHT,
      gridContract: GRID_CONTRACT,
      seed,
      tiles: assembly.layout.tiles,
      rooms: assembly.themeRooms,
      doors: [],
      stairs: { up: assembly.up, down: assembly.down },
      zones: buildCaveZones(request, assembly.themeRooms, assembly.layout.tiles),
      generation,
    };
  }

  throw new Error('Caves generator failed to produce a connected level with required placements.');
}

function generateCaveLayoutAttempt(rng: GameRng, attemptCount: number, fixtureProfile: CavesFixtureProfile): CaveLayout | undefined {
  const attemptSeed = rng.getState();
  const mask = createMask(false);
  const x1 = rng.generateRnd(20) + CAVES_SEED_ORIGIN_RANGE.min;
  const y1 = rng.generateRnd(20) + CAVES_SEED_ORIGIN_RANGE.min;
  const x2 = x1 + CAVES_SEED_ROOM_SIZE.width;
  const y2 = y1 + CAVES_SEED_ROOM_SIZE.height;

  fillRoom(mask, rng, x1, y1, x2, y2);
  createBlock(mask, rng, { x: x1, y: y1 }, CAVES_FIRST_EXPANSION.blockSize, 0);
  createBlock(mask, rng, { x: x2, y: y1 }, CAVES_FIRST_EXPANSION.blockSize, 1);
  createBlock(mask, rng, { x: x1, y: y2 }, CAVES_FIRST_EXPANSION.blockSize, 2);
  createBlock(mask, rng, { x: x1, y: y1 }, CAVES_FIRST_EXPANSION.blockSize, 3);

  const anvilReserve = fixtureProfile.reserveAnvil ? carveAnvilReserve(mask, rng) : disabledAnvilReserve();
  fillDiagonals(mask, rng);
  fillSingles(mask);
  fillStraights(mask, rng);
  fillDiagonals(mask, rng);
  clearBottomAndRightEdges(mask);

  const floorArea = countMaskFloor(mask);
  const connectedFloorCount = countConnectedMaskFloor(mask);
  if (floorArea < CAVES_FLOOR_AREA_THRESHOLD || connectedFloorCount !== floorArea) {
    return undefined;
  }

  return {
    tiles: maskToTiles(mask),
    seedRoomOrigin: { x: x1, y: y1 },
    attemptSeed,
    attemptCount,
    floorArea,
    connectedFloorCount,
    fixtureProfile,
    anvilReserve,
  };
}

function assembleCaveLevel(request: DungeonGenerationRequest, rng: GameRng, layout: CaveLayout): CaveAssembly | undefined {
  const protectedFootprints = new Set<string>();
  if (layout.anvilReserve.rect) {
    protectRectFootprint(protectedFootprints, layout.anvilReserve.rect);
  }

  const minisetPlacements: DungeonMinisetPlacement[] = [];
  const up = placeStairMiniset(rng, layout.tiles, protectedFootprints, 'L3UP', { width: 3, height: 3 });
  minisetPlacements.push(up.miniset);
  const down = placeStairMiniset(rng, layout.tiles, protectedFootprints, 'L3DOWN', { width: 3, height: 3 });
  minisetPlacements.push(down.miniset);

  if (request.levelNumber === CAVES_LEVEL_RANGE.min) {
    minisetPlacements.push(placeCavePortalMiniset(rng, layout.tiles, protectedFootprints, 'L3HOLDWARP', { width: 3, height: 3 }));
  }

  const pool = placeCavePool(rng, layout.tiles, protectedFootprints);
  if (!pool) {
    return undefined;
  }

  addWalls(layout.tiles);
  const reservedAreas = layout.anvilReserve.rect ? [layout.anvilReserve.rect] : [];
  const themeRooms = findCaveThemeRooms(layout.tiles, reservedAreas);
  if (themeRooms.length === 0) {
    return undefined;
  }

  return {
    layout,
    themeRooms,
    minisetPlacements,
    pool,
    up: up.point,
    down: down.point,
  };
}

function fillRoom(mask: CaveMask, rng: GameRng, x1: number, y1: number, x2: number, y2: number): boolean {
  if (
    x1 <= CAVES_FILL_ROOM_BOUNDS.x1MinExclusive
    || x2 >= CAVES_FILL_ROOM_BOUNDS.x2MaxExclusive
    || y1 <= CAVES_FILL_ROOM_BOUNDS.y1MinExclusive
    || y2 >= CAVES_FILL_ROOM_BOUNDS.y2MaxExclusive
  ) {
    return false;
  }

  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) {
      if (mask[y][x]) {
        return false;
      }
    }
  }

  for (let y = y1 + 1; y < y2; y += 1) {
    for (let x = x1 + 1; x < x2; x += 1) {
      mask[y][x] = true;
    }
  }
  for (let y = y1; y <= y2; y += 1) {
    if (!rng.flipCoin()) {
      mask[y][x1] = true;
    }
    if (!rng.flipCoin()) {
      mask[y][x2] = true;
    }
  }
  for (let x = x1; x <= x2; x += 1) {
    if (!rng.flipCoin()) {
      mask[y1][x] = true;
    }
    if (!rng.flipCoin()) {
      mask[y2][x] = true;
    }
  }

  return true;
}

function createBlock(mask: CaveMask, rng: GameRng, point: GridPoint, obs: number, direction: CaveDirection): void {
  const blockSizeX = randomBetween(rng, 3, 4);
  const blockSizeY = randomBetween(rng, 3, 4);
  let x1 = point.x;
  let y1 = point.y;
  let x2 = point.x;
  let y2 = point.y;

  if (direction === 0) {
    y2 = point.y - 1;
    y1 = y2 - blockSizeY;
    x1 = blockAlignedStart(rng, point.x, blockSizeX, obs);
    x2 = blockSizeX + x1;
  } else if (direction === 1) {
    x1 = point.x + 1;
    x2 = x1 + blockSizeX;
    y1 = blockAlignedStart(rng, point.y, blockSizeY, obs);
    y2 = y1 + blockSizeY;
  } else if (direction === 2) {
    y1 = point.y + 1;
    y2 = y1 + blockSizeY;
    x1 = blockAlignedStart(rng, point.x, blockSizeX, obs);
    x2 = blockSizeX + x1;
  } else {
    x2 = point.x - 1;
    x1 = x2 - blockSizeX;
    y1 = blockAlignedStart(rng, point.y, blockSizeY, obs);
    y2 = y1 + blockSizeY;
  }

  if (!fillRoom(mask, rng, x1, y1, x2, y2) || rng.flipCoin(4)) {
    return;
  }

  if (direction !== 2) {
    createBlock(mask, rng, { x: x1, y: y1 }, blockSizeY, 0);
  }
  if (direction !== 3) {
    createBlock(mask, rng, { x: x2, y: y1 }, blockSizeX, 1);
  }
  if (direction !== 0) {
    createBlock(mask, rng, { x: x1, y: y2 }, blockSizeY, 2);
  }
  if (direction !== 1) {
    createBlock(mask, rng, { x: x1, y: y1 }, blockSizeX, 3);
  }
}

function blockAlignedStart(rng: GameRng, origin: number, blockSize: number, obstacleSize: number): number {
  if (blockSize < obstacleSize) {
    return rng.generateRnd(blockSize) + origin;
  }
  if (blockSize === obstacleSize) {
    return origin;
  }
  return origin - rng.generateRnd(blockSize);
}

function carveAnvilReserve(mask: CaveMask, rng: GameRng): CavesAnvilReserveMetadata {
  const x1 = rng.generateRnd(10) + 10;
  const y1 = rng.generateRnd(10) + 10;
  const area = rect(x1, y1, 13, 13);
  for (let y = area.y; y < area.y + area.height; y += 1) {
    for (let x = area.x; x < area.x + area.width; x += 1) {
      mask[y][x] = true;
    }
  }
  return { enabled: true, rect: area, searchLimit: CAVES_ANVIL_SEARCH_LIMIT };
}

function disabledAnvilReserve(): CavesAnvilReserveMetadata {
  return { enabled: false, searchLimit: CAVES_ANVIL_SEARCH_LIMIT };
}

function fillDiagonals(mask: CaveMask, rng: GameRng): void {
  for (let y = 0; y < BASE_HEIGHT - 1; y += 1) {
    for (let x = 0; x < BASE_WIDTH - 1; x += 1) {
      const value = boolAt(mask, x + 1, y + 1) + 2 * boolAt(mask, x, y + 1) + 4 * boolAt(mask, x + 1, y) + 8 * boolAt(mask, x, y);
      if (value === 6) {
        if (rng.flipCoin()) {
          mask[y][x] = true;
        } else {
          mask[y + 1][x + 1] = true;
        }
      }
      if (value === 9) {
        if (rng.flipCoin()) {
          mask[y][x + 1] = true;
        } else {
          mask[y + 1][x] = true;
        }
      }
    }
  }
}

function fillSingles(mask: CaveMask): void {
  for (let y = 1; y < BASE_HEIGHT - 1; y += 1) {
    for (let x = 1; x < BASE_WIDTH - 1; x += 1) {
      if (
        !mask[y][x]
        && boolAt(mask, x, y - 1) + boolAt(mask, x - 1, y - 1) + boolAt(mask, x + 1, y - 1) === 3
        && boolAt(mask, x + 1, y) + boolAt(mask, x - 1, y) === 2
        && boolAt(mask, x, y + 1) + boolAt(mask, x - 1, y + 1) + boolAt(mask, x + 1, y + 1) === 3
      ) {
        mask[y][x] = true;
      }
    }
  }
}

function fillStraights(mask: CaveMask, rng: GameRng): void {
  for (let y = 0; y < BASE_HEIGHT - 1; y += 1) {
    let runLength = 0;
    let runStart = 0;
    for (let x = 0; x < BASE_WIDTH - 3; x += 1) {
      if (!mask[y][x] && mask[y + 1][x]) {
        if (runLength === 0) {
          runStart = x;
        }
        runLength += 1;
      } else {
        maybeRandomizeHorizontalRun(mask, rng, y, runStart, x, runLength);
        runLength = 0;
      }
    }
  }

  for (let y = 0; y < BASE_HEIGHT - 1; y += 1) {
    let runLength = 0;
    let runStart = 0;
    for (let x = 0; x < BASE_WIDTH - 3; x += 1) {
      if (mask[y][x] && !mask[y + 1][x]) {
        if (runLength === 0) {
          runStart = x;
        }
        runLength += 1;
      } else {
        maybeRandomizeHorizontalRun(mask, rng, y + 1, runStart, x, runLength);
        runLength = 0;
      }
    }
  }

  for (let x = 0; x < BASE_WIDTH - 1; x += 1) {
    let runLength = 0;
    let runStart = 0;
    for (let y = 0; y < BASE_HEIGHT - 3; y += 1) {
      if (!mask[y][x] && mask[y][x + 1]) {
        if (runLength === 0) {
          runStart = y;
        }
        runLength += 1;
      } else {
        maybeRandomizeVerticalRun(mask, rng, x, runStart, y, runLength);
        runLength = 0;
      }
    }
  }

  for (let x = 0; x < BASE_WIDTH - 1; x += 1) {
    let runLength = 0;
    let runStart = 0;
    for (let y = 0; y < BASE_HEIGHT - 3; y += 1) {
      if (mask[y][x] && !mask[y][x + 1]) {
        if (runLength === 0) {
          runStart = y;
        }
        runLength += 1;
      } else {
        maybeRandomizeVerticalRun(mask, rng, x + 1, runStart, y, runLength);
        runLength = 0;
      }
    }
  }
}

function maybeRandomizeHorizontalRun(
  mask: CaveMask,
  rng: GameRng,
  y: number,
  startX: number,
  endX: number,
  runLength: number,
): void {
  if (runLength <= 3 || rng.flipCoin()) {
    return;
  }
  for (let x = startX; x < endX; x += 1) {
    mask[y][x] = rng.generateRnd(2) === 1;
  }
}

function maybeRandomizeVerticalRun(
  mask: CaveMask,
  rng: GameRng,
  x: number,
  startY: number,
  endY: number,
  runLength: number,
): void {
  if (runLength <= 3 || rng.flipCoin()) {
    return;
  }
  for (let y = startY; y < endY; y += 1) {
    mask[y][x] = rng.generateRnd(2) === 1;
  }
}

function protectRectFootprint(protectedFootprints: Set<string>, area: GridRect): void {
  protectFootprint(protectedFootprints, { x: area.x, y: area.y }, { width: area.width, height: area.height });
}

function clearBottomAndRightEdges(mask: CaveMask): void {
  for (let y = 0; y < BASE_HEIGHT; y += 1) {
    mask[y][BASE_WIDTH - 1] = false;
  }
  for (let x = 0; x < BASE_WIDTH; x += 1) {
    mask[BASE_HEIGHT - 1][x] = false;
  }
}

function placeCavePortalMiniset(
  rng: GameRng,
  tiles: TileKind[][],
  protectedFootprints: Set<string>,
  id: 'L3HOLDWARP',
  size: { width: number; height: number },
): DungeonMinisetPlacement {
  const position = chooseFootprintPosition(rng, tiles, protectedFootprints, size, FORCED_PLACEMENT_TRIES);
  protectFootprint(protectedFootprints, position, size);
  return { id, role: 'portal', position, size, tries: FORCED_PLACEMENT_TRIES };
}

function placeCavePool(rng: GameRng, tiles: TileKind[][], protectedFootprints: Set<string>): CavesPoolMetadata | undefined {
  for (let attempt = 1; attempt <= CAVES_POOL_TRIES; attempt += 1) {
    if (rng.generateRnd(100) >= CAVES_POOL_PLACEMENT_GATE_PERCENT) {
      continue;
    }
    const size = { width: randomBetween(rng, 3, 5), height: randomBetween(rng, 3, 5) };
    const position = {
      x: randomBetween(rng, 1, BASE_WIDTH - size.width - 1),
      y: randomBetween(rng, 1, BASE_HEIGHT - size.height - 1),
    };
    if (!poolFootprintFits(tiles, protectedFootprints, position, size)) {
      continue;
    }

    const previous = carvePoolFootprint(tiles, position, size, 'void');
    if (allPassableTilesConnected(tiles)) {
      protectFootprint(protectedFootprints, position, size);
      return { position, size, area: size.width * size.height, placementGatePercent: CAVES_POOL_PLACEMENT_GATE_PERCENT, tries: attempt };
    }
    restorePoolFootprint(tiles, position, size, previous);
  }

  return undefined;
}

function poolFootprintFits(
  tiles: TileKind[][],
  protectedFootprints: ReadonlySet<string>,
  position: GridPoint,
  size: { width: number; height: number },
): boolean {
  for (let y = position.y; y < position.y + size.height; y += 1) {
    for (let x = position.x; x < position.x + size.width; x += 1) {
      const point = { x, y };
      if (!inside(tiles, point) || tiles[y][x] !== 'floor' || protectedFootprints.has(pointKey(point))) {
        return false;
      }
    }
  }
  return true;
}

function carvePoolFootprint(tiles: TileKind[][], position: GridPoint, size: { width: number; height: number }, tile: TileKind): TileKind[][] {
  const previous = createGrid(size.width, size.height, 'void');
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      previous[y][x] = tiles[position.y + y][position.x + x];
      tiles[position.y + y][position.x + x] = tile;
    }
  }
  return previous;
}

function restorePoolFootprint(tiles: TileKind[][], position: GridPoint, size: { width: number; height: number }, previous: TileKind[][]): void {
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      tiles[position.y + y][position.x + x] = previous[y][x];
    }
  }
}

function findCaveThemeRooms(tiles: TileKind[][], reservedAreas: readonly GridRect[]): GridRect[] {
  const rooms: GridRect[] = [];

  for (let y = 1; y <= BASE_HEIGHT - CAVES_THEME_ROOM.minSize - 1; y += 1) {
    for (let x = 1; x <= BASE_WIDTH - CAVES_THEME_ROOM.minSize - 1; x += 1) {
      const room = largestPassableSquareAt(tiles, { x, y });
      if (!room) {
        continue;
      }
      if (reservedAreas.some((reservedArea) => rectsOverlap(reservedArea, room))) {
        continue;
      }
      if (rooms.some((existing) => rectsOverlap(existing, room))) {
        continue;
      }
      rooms.push(room);
      if (rooms.length >= 8) {
        return rooms;
      }
    }
  }

  return rooms;
}

function largestPassableSquareAt(tiles: TileKind[][], origin: GridPoint): GridRect | undefined {
  for (let size = CAVES_THEME_ROOM.maxSize; size >= CAVES_THEME_ROOM.minSize; size -= 1) {
    const candidate = rect(origin.x, origin.y, size, size);
    if (rectContainsOnlyPassable(tiles, candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function resolveCavesFixtureProfile(request: DungeonGenerationRequest): CavesFixtureProfile {
  if (!request.includeQuestLocks || request.seedMode !== 'fixture') {
    return STANDARD_CAVES_FIXTURE;
  }

  switch (request.seedText.trim().toLowerCase()) {
    case 'caves-anvil':
    case 'caves-l9-anvil':
      return ANVIL_RESERVE_FIXTURE;
    default:
      return STANDARD_CAVES_FIXTURE;
  }
}

function buildCaveZones(request: DungeonGenerationRequest, rooms: readonly GridRect[], tiles: TileKind[][]): DungeonZone[] {
  const zones = buildZones(request, rooms, tiles);
  const candidates = findCaveZoneCandidates(tiles);
  const usedRects = new Set(zones.map((zone) => rectKey(zone.rect)));
  const specs = [
    { enabled: request.includeObjects, kind: 'object' as const, id: 'object-zone-01' },
    { enabled: request.includeSpawnZones, kind: 'spawn' as const, id: 'spawn-zone-01' },
    { enabled: request.includeQuestLocks, kind: 'questLock' as const, id: 'quest-lock-01' },
  ];

  for (const spec of specs) {
    if (!spec.enabled || zones.some((zone) => zone.kind === spec.kind)) {
      continue;
    }
    const rect = candidates.find((candidate) => !usedRects.has(rectKey(candidate)));
    if (!rect) {
      continue;
    }
    usedRects.add(rectKey(rect));
    zones.push({ id: spec.id, kind: spec.kind, rect });
  }

  return zones;
}

function findCaveZoneCandidates(tiles: TileKind[][]): GridRect[] {
  const candidates: GridRect[] = [];
  for (let y = 1; y < BASE_HEIGHT - 2; y += 1) {
    for (let x = 1; x < BASE_WIDTH - 2; x += 1) {
      const candidate = rect(x, y, 2, 2);
      if (rectContainsOnlyPassable(tiles, candidate)) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function rectKey(area: GridRect): string {
  return `${area.x},${area.y},${area.width},${area.height}`;
}

function countMaskFloor(mask: CaveMask): number {
  let count = 0;
  for (const row of mask) {
    for (const cell of row) {
      if (cell) {
        count += 1;
      }
    }
  }
  return count;
}

function countConnectedMaskFloor(mask: CaveMask): number {
  const start = findFirstMaskFloor(mask);
  if (!start) {
    return 0;
  }
  const visited = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const point = queue.shift()!;
    const key = pointKey(point);
    if (visited.has(key) || !insideMask(mask, point) || !mask[point.y][point.x]) {
      continue;
    }
    visited.add(key);
    queue.push(...neighbors4(point));
  }
  return visited.size;
}

function allPassableTilesConnected(tiles: TileKind[][]): boolean {
  const start = findFirstPassableTile(tiles);
  if (!start) {
    return false;
  }
  const visited = new Set<string>();
  const queue = [start];
  let passableCount = 0;
  while (queue.length > 0) {
    const point = queue.shift()!;
    const key = pointKey(point);
    if (visited.has(key) || !inside(tiles, point) || !PASSABLE_TILES.has(tiles[point.y][point.x])) {
      continue;
    }
    visited.add(key);
    queue.push(...neighbors4(point));
  }
  for (let y = 0; y < BASE_HEIGHT; y += 1) {
    for (let x = 0; x < BASE_WIDTH; x += 1) {
      if (PASSABLE_TILES.has(tiles[y][x])) {
        passableCount += 1;
      }
    }
  }
  return visited.size === passableCount;
}

function findFirstMaskFloor(mask: CaveMask): GridPoint | undefined {
  for (let y = 0; y < BASE_HEIGHT; y += 1) {
    for (let x = 0; x < BASE_WIDTH; x += 1) {
      if (mask[y][x]) {
        return { x, y };
      }
    }
  }
  return undefined;
}

function findFirstPassableTile(tiles: TileKind[][]): GridPoint | undefined {
  for (let y = 0; y < BASE_HEIGHT; y += 1) {
    for (let x = 0; x < BASE_WIDTH; x += 1) {
      if (PASSABLE_TILES.has(tiles[y][x])) {
        return { x, y };
      }
    }
  }
  return undefined;
}

function maskToTiles(mask: CaveMask): TileKind[][] {
  return mask.map((row) => row.map((cell) => (cell ? 'floor' : 'void')));
}

function createMask(fill: boolean): CaveMask {
  return Array.from({ length: BASE_HEIGHT }, () => Array.from({ length: BASE_WIDTH }, () => fill));
}

function boolAt(mask: CaveMask, x: number, y: number): number {
  return mask[y]?.[x] ? 1 : 0;
}

function insideMask(mask: CaveMask, point: GridPoint): boolean {
  return point.y >= 0 && point.y < mask.length && point.x >= 0 && point.x < mask[point.y].length;
}
