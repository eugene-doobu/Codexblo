import { pointKey, rectsOverlap } from '../../../core/grid';
import type { GridPoint, GridRect } from '../../../core/grid';
import { GameRng } from '../../../core/rng';
import type {
  DungeonGenerationRequest,
  DungeonLevel,
  DungeonMinisetId,
  DungeonMinisetPlacement,
  HellGenerationMetadata,
  TileKind,
} from '../dungeon-types';
import {
  addWalls,
  BASE_HEIGHT,
  BASE_WIDTH,
  buildZonesWithFallback,
  chooseFootprintPosition,
  FORCED_PLACEMENT_TRIES,
  GRID_CONTRACT,
  neighbors4,
  placeStairMiniset,
  protectFootprint,
  randomBetween,
  rect,
  rectContainsOnlyPassable,
} from './shared';

const HELL_LEVEL_RANGE = { min: 13, max: 16 } as const;
const HELL_WORKING_QUADRANT = { width: 20, height: 20 } as const;
const HELL_MIRROR_AXES = { vertical: 19.5, horizontal: 19.5 } as const;
const HELL_AREA_THRESHOLD = 692;
const HELL_SIDE_ROOM_ATTEMPTS_PER_SIDE = 20;
const HELL_SIDE_ROOM_SIZES = [2, 4, 6] as const;
const HELL_THEME_ROOM = { minSize: 7, maxSize: 10, floorTile: 6, frequency: 8, randomizeSize: true } as const;
const HELL_LAYOUT_ATTEMPTS = 80;
const HELL_DIRECTIONS = [0, 1, 2, 3] as const;

type HellDirection = typeof HELL_DIRECTIONS[number];
type HellMask = boolean[][];

interface HellLayout {
  tiles: TileKind[][];
  attemptSeed: number;
  attemptCount: number;
  firstRoom: HellGenerationMetadata['firstRoom'];
  innerBorderConnectors: HellGenerationMetadata['innerBorderConnectors'];
  floorArea: number;
  connectedFloorCount: number;
}

interface HellAssembly {
  layout: HellLayout;
  themeRooms: GridRect[];
  protectedQuads: GridRect[];
  minisetPlacements: DungeonMinisetPlacement[];
  up: GridPoint;
  down?: GridPoint;
  townWarp?: DungeonMinisetPlacement;
  hellGate?: DungeonMinisetPlacement;
}

export function generateHellLevel(request: DungeonGenerationRequest, seed: number): Omit<DungeonLevel, 'checksum'> {
  const rng = new GameRng(seed);

  for (let attempt = 1; attempt <= HELL_LAYOUT_ATTEMPTS; attempt += 1) {
    const layout = generateHellLayoutAttempt(rng, request.levelNumber, attempt);
    if (!layout) {
      continue;
    }

    const assembly = tryAssembleHellLevel(request, rng, layout);
    if (!assembly) {
      continue;
    }

    const generation: HellGenerationMetadata = {
      familyId: 'Hell',
      generatorKind: 'quadrant-mirror',
      attemptCount: assembly.layout.attemptCount,
      attemptSeed: assembly.layout.attemptSeed,
      levelRange: HELL_LEVEL_RANGE,
      workingQuadrant: HELL_WORKING_QUADRANT,
      mirrorAxes: HELL_MIRROR_AXES,
      areaThreshold: HELL_AREA_THRESHOLD,
      floorArea: assembly.layout.floorArea,
      connectedFloorCount: assembly.layout.connectedFloorCount,
      firstRoom: assembly.layout.firstRoom,
      sideRoomAttemptsPerSide: HELL_SIDE_ROOM_ATTEMPTS_PER_SIDE,
      sideRoomSizes: HELL_SIDE_ROOM_SIZES,
      innerBorderConnectors: assembly.layout.innerBorderConnectors,
      themeRoom: {
        ...HELL_THEME_ROOM,
        enabled: request.levelNumber !== HELL_LEVEL_RANGE.max,
      },
      townWarp: assembly.townWarp
        ? { enabled: true, levelNumber: HELL_LEVEL_RANGE.min, placement: assembly.townWarp }
        : { enabled: false, levelNumber: HELL_LEVEL_RANGE.min },
      hellGate: assembly.hellGate
        ? { enabled: true, levelNumber: 15, placement: assembly.hellGate }
        : { enabled: false, levelNumber: 15 },
      protectedQuads: assembly.protectedQuads,
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
      rooms: assembly.themeRooms.length > 0 ? assembly.themeRooms : assembly.protectedQuads,
      doors: [],
      stairs: assembly.down ? { up: assembly.up, down: assembly.down } : { up: assembly.up },
      zones: buildZonesWithFallback(request, assembly.themeRooms.length > 0 ? assembly.themeRooms : assembly.protectedQuads, assembly.layout.tiles),
      generation,
    };
  }

  throw new Error('Hell generator failed to produce a mirrored connected level with required placements.');
}

function tryAssembleHellLevel(request: DungeonGenerationRequest, rng: GameRng, layout: HellLayout): HellAssembly | undefined {
  try {
    return assembleHellLevel(request, rng, layout);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unable to place ')) {
      return undefined;
    }
    throw error;
  }
}

function generateHellLayoutAttempt(rng: GameRng, levelNumber: number, attemptCount: number): HellLayout | undefined {
  const attemptSeed = rng.getState();
  const mask = createHellMask(false);
  const firstRoom = chooseFirstRoom(rng, levelNumber);
  const quadrantRooms: GridRect[] = [rect(firstRoom.position.x, firstRoom.position.y, firstRoom.size.width, firstRoom.size.height)];

  carveMirroredRect(mask, quadrantRooms[0]);
  carveFullRect(mask, rect(17, 17, 6, 6));
  carveMirroredCorridor(mask, rectCenter(quadrantRooms[0]), { x: 18, y: 18 }, rng);

  for (const direction of HELL_DIRECTIONS) {
    for (let attempt = 0; attempt < HELL_SIDE_ROOM_ATTEMPTS_PER_SIDE; attempt += 1) {
      tryAddSideRoom(mask, quadrantRooms, rng, direction);
    }
  }

  const innerBorderConnectors = carveInnerBorderConnectors(mask, rng);
  addHellEdgeNoise(mask, rng);

  const floorArea = countMaskFloor(mask);
  const connectedFloorCount = countConnectedMaskFloor(mask);
  if (floorArea < HELL_AREA_THRESHOLD || connectedFloorCount !== floorArea) {
    return undefined;
  }

  return {
    tiles: maskToTiles(mask),
    attemptSeed,
    attemptCount,
    firstRoom,
    innerBorderConnectors,
    floorArea,
    connectedFloorCount,
  };
}

function assembleHellLevel(request: DungeonGenerationRequest, rng: GameRng, layout: HellLayout): HellAssembly | undefined {
  const protectedFootprints = new Set<string>();
  const minisetPlacements: DungeonMinisetPlacement[] = [];

  const up = placeStairMiniset(rng, layout.tiles, protectedFootprints, 'L4USTAIRS', { width: 4, height: 5 });
  minisetPlacements.push(up.miniset);

  let down: GridPoint | undefined;
  if (request.levelNumber <= 14) {
    const downStairs = placeStairMiniset(rng, layout.tiles, protectedFootprints, 'L4DSTAIRS', { width: 5, height: 5 });
    down = downStairs.point;
    minisetPlacements.push(downStairs.miniset);
  }

  let townWarp: DungeonMinisetPlacement | undefined;
  if (request.levelNumber === HELL_LEVEL_RANGE.min) {
    townWarp = placeHellPortalMiniset(rng, layout.tiles, protectedFootprints, 'L4TWARP', { width: 4, height: 5 });
    minisetPlacements.push(townWarp);
  }

  let hellGate: DungeonMinisetPlacement | undefined;
  if (request.levelNumber === 15) {
    minisetPlacements.push(placeHellPortalMiniset(rng, layout.tiles, protectedFootprints, 'L4PENTA', { width: 5, height: 5 }));
    hellGate = placeHellPortalMiniset(rng, layout.tiles, protectedFootprints, 'L4PENTA2', { width: 5, height: 5 });
    minisetPlacements.push(hellGate);
  }

  addWalls(layout.tiles);
  const protectedQuads = request.levelNumber === HELL_LEVEL_RANGE.max ? hellProtectedQuads() : [];
  const reservedAreas = [...minisetPlacements.map(minisetRect), ...protectedQuads];
  const themeRooms = request.levelNumber === HELL_LEVEL_RANGE.max ? [] : findHellThemeRooms(layout.tiles, reservedAreas, rng);
  if (request.levelNumber !== HELL_LEVEL_RANGE.max && themeRooms.length === 0) {
    return undefined;
  }

  return {
    layout,
    themeRooms,
    protectedQuads,
    minisetPlacements,
    up: up.point,
    down,
    townWarp,
    hellGate,
  };
}

function chooseFirstRoom(rng: GameRng, levelNumber: number): HellGenerationMetadata['firstRoom'] {
  if (levelNumber === HELL_LEVEL_RANGE.max) {
    return {
      size: { width: 14, height: 14 },
      position: { x: 3, y: 3 },
    };
  }

  const width = rng.generateRnd(5) + 2;
  const height = rng.generateRnd(5) + 2;
  return {
    size: { width, height },
    position: {
      x: randomBetween(rng, 7, Math.max(7, 18 - width)),
      y: randomBetween(rng, 7, Math.max(7, 18 - height)),
    },
  };
}

function tryAddSideRoom(mask: HellMask, rooms: GridRect[], rng: GameRng, direction: HellDirection): void {
  const anchor = rooms[rng.generateRnd(rooms.length)];
  const width = HELL_SIDE_ROOM_SIZES[rng.generateRnd(HELL_SIDE_ROOM_SIZES.length)];
  const height = HELL_SIDE_ROOM_SIZES[rng.generateRnd(HELL_SIDE_ROOM_SIZES.length)];
  const candidate = sideRoomFor(anchor, { width, height }, rng, direction);

  if (!roomWithinQuadrant(candidate) || rooms.some((room) => rectsOverlap(room, candidate))) {
    return;
  }

  carveMirroredRect(mask, candidate);
  carveMirroredCorridor(mask, rectCenter(anchor), rectCenter(candidate), rng);
  rooms.push(candidate);
}

function sideRoomFor(anchor: GridRect, size: { width: number; height: number }, rng: GameRng, direction: HellDirection): GridRect {
  switch (direction) {
    case 0:
      return rect(anchor.x + randomBetween(rng, 1 - size.width, anchor.width - 1), anchor.y - size.height, size.width, size.height);
    case 1:
      return rect(anchor.x + anchor.width, anchor.y + randomBetween(rng, 1 - size.height, anchor.height - 1), size.width, size.height);
    case 2:
      return rect(anchor.x + randomBetween(rng, 1 - size.width, anchor.width - 1), anchor.y + anchor.height, size.width, size.height);
    case 3:
      return rect(anchor.x - size.width, anchor.y + randomBetween(rng, 1 - size.height, anchor.height - 1), size.width, size.height);
  }
}

function roomWithinQuadrant(room: GridRect): boolean {
  return room.x >= 1
    && room.y >= 1
    && room.x + room.width <= HELL_WORKING_QUADRANT.width
    && room.y + room.height <= HELL_WORKING_QUADRANT.height;
}

function carveInnerBorderConnectors(mask: HellMask, rng: GameRng): HellGenerationMetadata['innerBorderConnectors'] {
  const horizontal = { x: 19, y: randomBetween(rng, 11, 18) };
  const vertical = { x: randomBetween(rng, 11, 18), y: 19 };

  carveMirroredCorridor(mask, { x: 18, y: 18 }, { x: 18, y: horizontal.y }, rng);
  carveMirroredRect(mask, rect(18, horizontal.y, 2, 1));
  carveMirroredCorridor(mask, { x: 18, y: 18 }, { x: vertical.x, y: 18 }, rng);
  carveMirroredRect(mask, rect(vertical.x, 18, 1, 2));

  return { horizontal, vertical };
}

function addHellEdgeNoise(mask: HellMask, rng: GameRng): void {
  for (let y = 1; y < HELL_WORKING_QUADRANT.height - 1; y += 1) {
    for (let x = 1; x < HELL_WORKING_QUADRANT.width - 1; x += 1) {
      if (mask[y][x] || rng.generateRnd(100) >= 22) {
        continue;
      }
      if (countMaskedNeighbors(mask, { x, y }) >= 3) {
        carveMirroredRect(mask, rect(x, y, 1, 1));
      }
    }
  }
}

function findHellThemeRooms(tiles: TileKind[][], reservedAreas: readonly GridRect[], rng: GameRng): GridRect[] {
  const rooms: GridRect[] = [];

  for (let y = 1; y <= BASE_HEIGHT - HELL_THEME_ROOM.minSize - 1; y += 1) {
    for (let x = 1; x <= BASE_WIDTH - HELL_THEME_ROOM.minSize - 1; x += 1) {
      const room = passableThemeRoomAt(tiles, { x, y }, rng);
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
      if (rooms.length >= HELL_THEME_ROOM.frequency) {
        return rooms;
      }
    }
  }

  return rooms;
}

function passableThemeRoomAt(tiles: TileKind[][], origin: GridPoint, rng: GameRng): GridRect | undefined {
  const randomizedStart = randomBetween(rng, HELL_THEME_ROOM.minSize, HELL_THEME_ROOM.maxSize);
  for (let delta = 0; delta <= HELL_THEME_ROOM.maxSize - HELL_THEME_ROOM.minSize; delta += 1) {
    const size = HELL_THEME_ROOM.maxSize - ((HELL_THEME_ROOM.maxSize - randomizedStart + delta) % (HELL_THEME_ROOM.maxSize - HELL_THEME_ROOM.minSize + 1));
    const candidate = rect(origin.x, origin.y, size, size);
    if (rectContainsOnlyPassable(tiles, candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function placeHellPortalMiniset(
  rng: GameRng,
  tiles: TileKind[][],
  protectedFootprints: Set<string>,
  id: Extract<DungeonMinisetId, 'L4TWARP' | 'L4PENTA' | 'L4PENTA2'>,
  size: { width: number; height: number },
): DungeonMinisetPlacement {
  const position = chooseFootprintPosition(rng, tiles, protectedFootprints, size, FORCED_PLACEMENT_TRIES);
  protectFootprint(protectedFootprints, position, size);
  return { id, role: id === 'L4PENTA' ? 'decoration' : 'portal', position, size, tries: FORCED_PLACEMENT_TRIES };
}

function hellProtectedQuads(): GridRect[] {
  return [
    rect(2, 2, 14, 14),
    rect(24, 2, 14, 14),
    rect(2, 24, 14, 14),
    rect(24, 24, 14, 14),
  ];
}

function minisetRect(placement: DungeonMinisetPlacement): GridRect {
  return rect(placement.position.x, placement.position.y, placement.size.width, placement.size.height);
}

function carveMirroredCorridor(mask: HellMask, from: GridPoint, to: GridPoint, rng: GameRng): void {
  const horizontalFirst = rng.flipCoin();
  if (horizontalFirst) {
    carveMirroredLineX(mask, from, to.x);
    carveMirroredLineY(mask, { x: to.x, y: from.y }, to.y);
    return;
  }
  carveMirroredLineY(mask, from, to.y);
  carveMirroredLineX(mask, { x: from.x, y: to.y }, to.x);
}

function carveMirroredLineX(mask: HellMask, from: GridPoint, toX: number): void {
  const step = Math.sign(toX - from.x) || 1;
  for (let x = from.x; x !== toX + step; x += step) {
    carveMirroredRect(mask, rect(x, from.y, 1, 1));
  }
}

function carveMirroredLineY(mask: HellMask, from: GridPoint, toY: number): void {
  const step = Math.sign(toY - from.y) || 1;
  for (let y = from.y; y !== toY + step; y += step) {
    carveMirroredRect(mask, rect(from.x, y, 1, 1));
  }
}

function carveMirroredRect(mask: HellMask, room: GridRect): void {
  for (const mirrored of mirroredRects(room)) {
    carveFullRect(mask, mirrored);
  }
}

function mirroredRects(room: GridRect): GridRect[] {
  const mirrorX = BASE_WIDTH - room.x - room.width;
  const mirrorY = BASE_HEIGHT - room.y - room.height;
  const variants = [
    room,
    rect(mirrorX, room.y, room.width, room.height),
    rect(room.x, mirrorY, room.width, room.height),
    rect(mirrorX, mirrorY, room.width, room.height),
  ];
  return [...new Map(variants.map((variant) => [`${variant.x},${variant.y},${variant.width},${variant.height}`, variant])).values()];
}

function carveFullRect(mask: HellMask, area: GridRect): void {
  for (let y = Math.max(0, area.y); y < Math.min(BASE_HEIGHT, area.y + area.height); y += 1) {
    for (let x = Math.max(0, area.x); x < Math.min(BASE_WIDTH, area.x + area.width); x += 1) {
      mask[y][x] = true;
    }
  }
}

function countMaskedNeighbors(mask: HellMask, point: GridPoint): number {
  let count = 0;
  for (let y = point.y - 1; y <= point.y + 1; y += 1) {
    for (let x = point.x - 1; x <= point.x + 1; x += 1) {
      if ((x !== point.x || y !== point.y) && mask[y]?.[x]) {
        count += 1;
      }
    }
  }
  return count;
}

function countMaskFloor(mask: HellMask): number {
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

function countConnectedMaskFloor(mask: HellMask): number {
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

function findFirstMaskFloor(mask: HellMask): GridPoint | undefined {
  for (let y = 0; y < BASE_HEIGHT; y += 1) {
    for (let x = 0; x < BASE_WIDTH; x += 1) {
      if (mask[y][x]) {
        return { x, y };
      }
    }
  }
  return undefined;
}

function rectCenter(area: GridRect): GridPoint {
  return {
    x: Math.floor(area.x + area.width / 2),
    y: Math.floor(area.y + area.height / 2),
  };
}

function maskToTiles(mask: HellMask): TileKind[][] {
  return mask.map((row) => row.map((cell) => (cell ? 'floor' : 'void')));
}

function createHellMask(fill: boolean): HellMask {
  return Array.from({ length: BASE_HEIGHT }, () => Array.from({ length: BASE_WIDTH }, () => fill));
}

function insideMask(mask: HellMask, point: GridPoint): boolean {
  return point.y >= 0 && point.y < mask.length && point.x >= 0 && point.x < mask[point.y].length;
}
