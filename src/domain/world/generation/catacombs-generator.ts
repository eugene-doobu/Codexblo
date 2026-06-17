import { rectsOverlap } from '../../../core/grid';
import type { GridPoint, GridRect } from '../../../core/grid';
import { GameRng } from '../../../core/rng';
import type {
  CatacombsForcedRoomProfile,
  CatacombsGenerationMetadata,
  CatacombsHallDirection,
  CatacombsHallMetadata,
  DungeonGenerationRequest,
  DungeonLevel,
  DungeonMinisetPlacement,
  TileKind,
} from '../dungeon-types';
import {
  addWalls,
  BASE_HEIGHT,
  BASE_WIDTH,
  buildZones,
  carveRoom,
  chooseFootprintPosition,
  clamp,
  createGrid,
  FORCED_PLACEMENT_TRIES,
  GRID_CONTRACT,
  inside,
  partitionPoint,
  placeStairMiniset,
  protectFootprint,
  randomBetween,
  rect,
  uniquePoints,
} from './shared';

const CATACOMBS_ROOM_NODE_CAPACITY = 80;
const CATACOMBS_ROOM_NODE_ARRAY_CAPACITY = 81;
const CATACOMBS_INITIAL_TOP_LEFT: GridPoint = { x: 2, y: 2 };
const CATACOMBS_INITIAL_BOTTOM_RIGHT: GridPoint = { x: 39, y: 39 };
const CATACOMBS_ROOM_MIN_SIZE = 4;
const CATACOMBS_ROOM_MAX_EXCLUSIVE = 10;
const CATACOMBS_CLAMP_MIN = 1;
const CATACOMBS_CLAMP_MAX = 38;
const CATACOMBS_RECURSION_STANDOFF = { width: 2, height: 2 } as const;
const CATACOMBS_HALL_EXTENSION_PERCENT = 50;
const CATACOMBS_HALL_HORIZONTAL_MULTIPLIER = 2;
const CATACOMBS_HALL_HORIZONTAL_MAX_PERCENT = 30;
const CATACOMBS_HALL_VERTICAL_MULTIPLIER = 5;
const CATACOMBS_HALL_VERTICAL_MAX_PERCENT = 80;
const CATACOMBS_THEME_ROOM = {
  minSize: 6,
  maxSize: 10,
  floorTile: 3,
  frequency: 0,
  randomizeSize: false,
} as const;

interface CatacombsRoomNode {
  rect: GridRect;
}

interface CatacombsHallNode extends CatacombsHallMetadata {}

interface CatacombsLayout {
  tiles: TileKind[][];
  rooms: GridRect[];
  halls: CatacombsHallNode[];
  doors: GridPoint[];
  attemptSeed: number;
  attemptCount: number;
  forcedRoomProfile?: CatacombsForcedRoomProfile;
}

export function generateCatacombsLevel(request: DungeonGenerationRequest, seed: number): Omit<DungeonLevel, 'checksum'> {
  const rng = new GameRng(seed);
  const layout = generateCatacombsLayout(rng, resolveCatacombsForcedRoomProfile(request));
  addWalls(layout.tiles);

  const protectedFootprints = new Set<string>();
  const minisetPlacements: DungeonMinisetPlacement[] = [];
  const up = placeStairMiniset(rng, layout.tiles, protectedFootprints, 'USTAIRS', { width: 4, height: 4 });
  minisetPlacements.push(up.miniset);
  const down = placeStairMiniset(rng, layout.tiles, protectedFootprints, 'DSTAIRS', { width: 4, height: 4 });
  minisetPlacements.push(down.miniset);

  let townWarp: DungeonMinisetPlacement | undefined;
  if (request.levelNumber === 5) {
    townWarp = placePortalMiniset(rng, layout.tiles, protectedFootprints, 'WARPSTAIRS', { width: 4, height: 4 });
    minisetPlacements.push(townWarp);
  }

  const generation: CatacombsGenerationMetadata = {
    familyId: 'Catacombs',
    generatorKind: 'bsp-rooms',
    attemptCount: layout.attemptCount,
    attemptSeed: layout.attemptSeed,
    roomNodeCapacity: CATACOMBS_ROOM_NODE_CAPACITY,
    roomNodeArrayCapacity: CATACOMBS_ROOM_NODE_ARRAY_CAPACITY,
    initialPartition: {
      topLeft: CATACOMBS_INITIAL_TOP_LEFT,
      bottomRight: CATACOMBS_INITIAL_BOTTOM_RIGHT,
    },
    randomRoomSize: {
      min: CATACOMBS_ROOM_MIN_SIZE,
      maxExclusive: CATACOMBS_ROOM_MAX_EXCLUSIVE,
      effectiveMaxInclusiveWhenAreaAtLeastTen: 9,
    },
    clampBounds: {
      min: CATACOMBS_CLAMP_MIN,
      max: CATACOMBS_CLAMP_MAX,
    },
    recursionStandoff: CATACOMBS_RECURSION_STANDOFF,
    hallExtensionChance: {
      minusPercent: CATACOMBS_HALL_EXTENSION_PERCENT,
      plusPercent: CATACOMBS_HALL_EXTENSION_PERCENT,
    },
    hallSteering: {
      horizontalMultiplier: CATACOMBS_HALL_HORIZONTAL_MULTIPLIER,
      horizontalMaxPercent: CATACOMBS_HALL_HORIZONTAL_MAX_PERCENT,
      verticalMultiplier: CATACOMBS_HALL_VERTICAL_MULTIPLIER,
      verticalMaxPercent: CATACOMBS_HALL_VERTICAL_MAX_PERCENT,
    },
    themeRoom: CATACOMBS_THEME_ROOM,
    forcedRoomProfile: layout.forcedRoomProfile,
    rooms: layout.rooms,
    halls: layout.halls,
    minisetPlacements,
  };

  return {
    dungeonType: request.dungeonType,
    levelNumber: request.levelNumber,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    gridContract: GRID_CONTRACT,
    seed,
    tiles: layout.tiles,
    rooms: layout.rooms,
    doors: uniquePoints(layout.doors),
    stairs: { up: up.point, down: down.point },
    zones: buildZones(request, layout.rooms, layout.tiles),
    generation,
  };
}

export function generateCatacombsLayout(
  rng: GameRng,
  forcedRoomProfile: CatacombsForcedRoomProfile | undefined,
): CatacombsLayout {
  const tiles = createGrid(BASE_WIDTH, BASE_HEIGHT, 'void');
  const rooms: CatacombsRoomNode[] = [];
  const halls: CatacombsHallNode[] = [];
  const doors: GridPoint[] = [];
  const attemptSeed = rng.getState();

  createCatacombsRoom(
    rng,
    rooms,
    halls,
    CATACOMBS_INITIAL_TOP_LEFT,
    CATACOMBS_INITIAL_BOTTOM_RIGHT,
    undefined,
    undefined,
    forcedRoomProfile?.enabled ? forcedRoomProfile.size : undefined,
  );

  if (rooms.length < 2) {
    throw new Error('Catacombs generator failed to create enough rooms.');
  }

  for (const room of rooms) {
    carveRoom(tiles, room.rect);
  }
  for (const hall of halls) {
    carveCatacombsHall(tiles, hall, rng, doors);
  }

  const roomRects = rooms.map((room) => room.rect);
  return {
    tiles,
    rooms: roomRects,
    halls,
    doors: uniquePoints(doors),
    attemptSeed,
    attemptCount: 1,
    forcedRoomProfile: forcedRoomProfile?.enabled
      ? { ...forcedRoomProfile, actualRoom: roomRects[0] }
      : forcedRoomProfile,
  };
}

export function createCatacombsRoom(
  rng: GameRng,
  rooms: CatacombsRoomNode[],
  halls: CatacombsHallNode[],
  topLeft: GridPoint,
  bottomRight: GridPoint,
  parentIndex: number | undefined,
  directionToParent: CatacombsHallDirection | undefined,
  forcedSize?: { width: number; height: number },
): void {
  if (
    rooms.length >= CATACOMBS_ROOM_NODE_CAPACITY
    || topLeft.x + 2 > bottomRight.x
    || topLeft.y + 2 > bottomRight.y
  ) {
    return;
  }

  const partition = normalizeCatacombsPartition(topLeft, bottomRight);
  if (partition.width < 3 || partition.height < 3) {
    return;
  }

  const roomSize = forcedSize
    ? {
        width: Math.min(forcedSize.width, partition.width),
        height: Math.min(forcedSize.height, partition.height),
      }
    : chooseCatacombsRoomSize(rng, partition);
  if (roomSize.width < 3 || roomSize.height < 3) {
    return;
  }

  const randomX = partition.x + rng.generateRnd(Math.max(1, partition.width));
  const randomY = partition.y + rng.generateRnd(Math.max(1, partition.height));
  const x = clamp(randomX, partition.x, Math.max(partition.x, partition.x + partition.width - roomSize.width));
  const y = clamp(randomY, partition.y, Math.max(partition.y, partition.y + partition.height - roomSize.height));
  const room = rect(
    clamp(x, CATACOMBS_CLAMP_MIN, CATACOMBS_CLAMP_MAX - roomSize.width + 1),
    clamp(y, CATACOMBS_CLAMP_MIN, CATACOMBS_CLAMP_MAX - roomSize.height + 1),
    roomSize.width,
    roomSize.height,
  );

  if (rooms.some((existing) => rectsOverlap(existing.rect, room, 1))) {
    return;
  }

  const index = rooms.length;
  rooms.push({ rect: room });

  if (parentIndex !== undefined && directionToParent !== undefined) {
    halls.push(connectCatacombsRooms(room, rooms[parentIndex].rect, directionToParent, rng));
  }

  const left = { topLeft: partitionPoint(partition.x, partition.y), bottomRight: partitionPoint(room.x - CATACOMBS_RECURSION_STANDOFF.width, partition.y + partition.height - 1), direction: 'Right' as const };
  const right = { topLeft: partitionPoint(room.x + room.width - 1 + CATACOMBS_RECURSION_STANDOFF.width, partition.y), bottomRight: partitionPoint(partition.x + partition.width - 1, partition.y + partition.height - 1), direction: 'Left' as const };
  const up = { topLeft: partitionPoint(room.x, partition.y), bottomRight: partitionPoint(room.x + room.width - 1, room.y - CATACOMBS_RECURSION_STANDOFF.height), direction: 'Down' as const };
  const down = { topLeft: partitionPoint(room.x, room.y + room.height - 1 + CATACOMBS_RECURSION_STANDOFF.height), bottomRight: partitionPoint(room.x + room.width - 1, partition.y + partition.height - 1), direction: 'Up' as const };
  const verticalFirst = partition.height > partition.width;
  const branches = verticalFirst ? [right, left, up, down] : [down, up, right, left];

  for (const branch of branches) {
    createCatacombsRoom(rng, rooms, halls, branch.topLeft, branch.bottomRight, index, branch.direction);
  }
}

export function normalizeCatacombsPartition(topLeft: GridPoint, bottomRight: GridPoint): GridRect {
  const x = clamp(topLeft.x, CATACOMBS_CLAMP_MIN, CATACOMBS_CLAMP_MAX);
  const y = clamp(topLeft.y, CATACOMBS_CLAMP_MIN, CATACOMBS_CLAMP_MAX);
  const right = clamp(bottomRight.x, CATACOMBS_CLAMP_MIN, CATACOMBS_CLAMP_MAX);
  const bottom = clamp(bottomRight.y, CATACOMBS_CLAMP_MIN, CATACOMBS_CLAMP_MAX);
  return rect(x, y, Math.max(0, right - x + 1), Math.max(0, bottom - y + 1));
}

export function chooseCatacombsRoomSize(rng: GameRng, partition: GridRect): { width: number; height: number } {
  return {
    width: catacombsRoomDimension(rng, partition.width),
    height: catacombsRoomDimension(rng, partition.height),
  };
}

export function catacombsRoomDimension(rng: GameRng, areaLength: number): number {
  if (areaLength > CATACOMBS_ROOM_MIN_SIZE) {
    return rng.generateRnd(Math.min(areaLength, CATACOMBS_ROOM_MAX_EXCLUSIVE) - CATACOMBS_ROOM_MIN_SIZE)
      + CATACOMBS_ROOM_MIN_SIZE;
  }
  return Math.max(3, areaLength);
}

export function connectCatacombsRooms(
  child: GridRect,
  parent: GridRect,
  directionToParent: CatacombsHallDirection,
  rng: GameRng,
): CatacombsHallNode {
  const childRight = child.x + child.width - 1;
  const childBottom = child.y + child.height - 1;
  const parentRight = parent.x + parent.width - 1;
  const parentBottom = parent.y + parent.height - 1;
  let from: GridPoint;
  let to: GridPoint;

  switch (directionToParent) {
    case 'Up':
      from = { x: randomBetween(rng, child.x, childRight), y: child.y };
      to = { x: randomBetween(rng, parent.x, parentRight), y: parentBottom };
      break;
    case 'Right':
      from = { x: childRight, y: randomBetween(rng, child.y, childBottom) };
      to = { x: parent.x, y: randomBetween(rng, parent.y, parentBottom) };
      break;
    case 'Down':
      from = { x: randomBetween(rng, child.x, childRight), y: childBottom };
      to = { x: randomBetween(rng, parent.x, parentRight), y: parent.y };
      break;
    case 'Left':
      from = { x: child.x, y: randomBetween(rng, child.y, childBottom) };
      to = { x: parentRight, y: randomBetween(rng, parent.y, parentBottom) };
      break;
  }

  return {
    from,
    to,
    direction: directionToParent,
    minusExtension: rng.generateRnd(100) < CATACOMBS_HALL_EXTENSION_PERCENT,
    plusExtension: rng.generateRnd(100) < CATACOMBS_HALL_EXTENSION_PERCENT,
  };
}

export function carveCatacombsHall(tiles: TileKind[][], hall: CatacombsHallNode, rng: GameRng, doors: GridPoint[]): void {
  let current = { ...hall.from };
  carveHallDoor(tiles, current, doors);
  carveHallDoor(tiles, hall.to, doors);

  for (let guard = 0; guard < BASE_WIDTH * BASE_HEIGHT && (current.x !== hall.to.x || current.y !== hall.to.y); guard += 1) {
    const dx = Math.abs(hall.to.x - current.x);
    const dy = Math.abs(hall.to.y - current.y);
    const horizontal = chooseHallHorizontalStep(dx, dy, rng);
    if (horizontal && dx > 0) {
      current = { x: current.x + Math.sign(hall.to.x - current.x), y: current.y };
    } else if (dy > 0) {
      current = { x: current.x, y: current.y + Math.sign(hall.to.y - current.y) };
    } else if (dx > 0) {
      current = { x: current.x + Math.sign(hall.to.x - current.x), y: current.y };
    }

    carveHallFloor(tiles, current);
    carveHallExtension(tiles, current, horizontal ? 'horizontal' : 'vertical', hall, guard);
  }
}

export function chooseHallHorizontalStep(dx: number, dy: number, rng: GameRng): boolean {
  if (dx === 0) {
    return false;
  }
  if (dy === 0) {
    return true;
  }
  if (dx > dy) {
    return rng.generateRnd(100) < Math.min(dx * CATACOMBS_HALL_HORIZONTAL_MULTIPLIER, CATACOMBS_HALL_HORIZONTAL_MAX_PERCENT);
  }
  return !(rng.generateRnd(100) < Math.min(dy * CATACOMBS_HALL_VERTICAL_MULTIPLIER, CATACOMBS_HALL_VERTICAL_MAX_PERCENT));
}

export function carveHallExtension(
  tiles: TileKind[][],
  point: GridPoint,
  axis: 'horizontal' | 'vertical',
  hall: CatacombsHallNode,
  stepIndex: number,
): void {
  if (stepIndex % 4 !== 0) {
    return;
  }
  const minus = axis === 'horizontal' ? { x: point.x, y: point.y - 1 } : { x: point.x - 1, y: point.y };
  const plus = axis === 'horizontal' ? { x: point.x, y: point.y + 1 } : { x: point.x + 1, y: point.y };
  if (hall.minusExtension) {
    carveHallFloor(tiles, minus);
  }
  if (hall.plusExtension) {
    carveHallFloor(tiles, plus);
  }
}

export function carveHallDoor(tiles: TileKind[][], point: GridPoint, doors: GridPoint[]): void {
  if (!inside(tiles, point)) {
    return;
  }
  tiles[point.y][point.x] = 'door';
  doors.push(point);
}

export function carveHallFloor(tiles: TileKind[][], point: GridPoint): void {
  if (inside(tiles, point) && point.x > 0 && point.x < BASE_WIDTH - 1 && point.y > 0 && point.y < BASE_HEIGHT - 1) {
    tiles[point.y][point.x] = tiles[point.y][point.x] === 'door' ? 'door' : 'floor';
  }
}

export function resolveCatacombsForcedRoomProfile(request: DungeonGenerationRequest): CatacombsForcedRoomProfile | undefined {
  const fixture = request.seedMode === 'fixture' ? request.seedText.toLowerCase() : '';
  if (request.levelNumber === 5 && fixture.includes('blood')) {
    return { id: 'BloodRoom', levelNumber: 5, size: { width: 14, height: 20 }, enabled: true };
  }
  if (request.levelNumber === 6 && (fixture.includes('bone') || fixture.includes('chamber'))) {
    return { id: 'BoneRoom', levelNumber: 6, size: { width: 10, height: 10 }, enabled: true };
  }
  if (request.levelNumber === 7 && fixture.includes('blind')) {
    return { id: 'BlindRoom', levelNumber: 7, size: { width: 15, height: 15 }, enabled: true };
  }
  return undefined;
}

export function placePortalMiniset(
  rng: GameRng,
  tiles: TileKind[][],
  protectedFootprints: Set<string>,
  id: 'WARPSTAIRS',
  size: { width: number; height: number },
): DungeonMinisetPlacement {
  const position = chooseFootprintPosition(rng, tiles, protectedFootprints, size, FORCED_PLACEMENT_TRIES);
  protectFootprint(protectedFootprints, position, size);
  return { id, role: 'portal', position, size, tries: FORCED_PLACEMENT_TRIES };
}
