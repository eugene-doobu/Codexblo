import { checksumJson } from '../../core/hash';
import { GameRng } from '../../core/rng';
import type { GridPoint, GridRect } from '../../core/grid';
import { pointKey, rectCenter, rectsOverlap } from '../../core/grid';
import type {
  CathedralGenerationMetadata,
  DungeonConnectivityGraph,
  DungeonGenerationRequest,
  DungeonGenerationResult,
  DungeonGridContract,
  DungeonLevel,
  DungeonMinisetPlacement,
  DungeonResourceBindingReport,
  DungeonType,
  DungeonValidationIssue,
  DungeonValidationReport,
  PreviewGenerationMetadata,
  TileKind,
} from './dungeon-types';
import { resolveDungeonSeed } from './dungeon-generation-request';
import { REQUIRED_TILE_SEMANTICS } from './tile-semantics';

const BASE_WIDTH = 40;
const BASE_HEIGHT = 40;
const EXPANDED_WIDTH = 112;
const EXPANDED_HEIGHT = 112;
const EXPANDED_PADDING = 16;
const MEGA_TO_WORLD_SCALE = 2;
const FORCED_PLACEMENT_TRIES = BASE_WIDTH * BASE_HEIGHT;
const CATHEDRAL_REGENERATION_LIMIT = 256;
const SIDE_ROOM_ATTEMPTS = 20;

const GRID_CONTRACT: DungeonGridContract = {
  baseGrid: { width: BASE_WIDTH, height: BASE_HEIGHT },
  expandedGrid: {
    width: EXPANDED_WIDTH,
    height: EXPANDED_HEIGHT,
    padding: EXPANDED_PADDING,
    scale: MEGA_TO_WORLD_SCALE,
  },
};

const PASSABLE_TILES = new Set<TileKind>(['floor', 'door', 'stairUp', 'stairDown']);
const VALID_TILE_KINDS = new Set<TileKind>(['void', ...PASSABLE_TILES, 'wall']);
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

interface StairPlacementResult {
  point: GridPoint;
  miniset: DungeonMinisetPlacement;
}

export function generateDungeon(request: DungeonGenerationRequest): DungeonGenerationResult {
  const seed = resolveDungeonSeed(request);
  const partialLevel = request.dungeonType === 'Cathedral'
    ? generateCathedralLevel(request, seed)
    : generatePreviewLevel(request, seed);

  const level: DungeonLevel = {
    ...partialLevel,
    checksum: checksumJson(partialLevel),
  };
  const graph = buildConnectivityGraph(level);
  const resourceBindings = validateResourceBindings(level);
  const validation = validateDungeon(level, graph, resourceBindings);

  return { request, seed, level, graph, validation, resourceBindings };
}

export function isPassable(tile: TileKind): boolean {
  return PASSABLE_TILES.has(tile);
}

function generateCathedralLevel(request: DungeonGenerationRequest, seed: number): Omit<DungeonLevel, 'checksum'> {
  const rng = new GameRng(seed);
  const areaThreshold = cathedralAreaThreshold(request.levelNumber);
  const layout = generateAcceptedCathedralMask(rng, areaThreshold);
  const tiles = maskToTiles(layout.mask);
  const pillarPositions = applyChamberDetails(tiles, layout);
  addWalls(tiles);

  const protectedFootprints = new Set<string>(pillarPositions.map(pointKey));
  const minisetPlacements: DungeonMinisetPlacement[] = [];
  const up = placeStairMiniset(rng, tiles, protectedFootprints, 'STAIRSUP', { width: 4, height: 4 });
  minisetPlacements.push(up.miniset);
  const down = placeStairMiniset(rng, tiles, protectedFootprints, 'STAIRSDOWN', { width: 4, height: 3 });
  minisetPlacements.push(down.miniset);
  minisetPlacements.push(...placeLampMinisets(rng, tiles, protectedFootprints));

  const rooms = layout.rooms.map((room) => room.rect);
  const doors = inferDoorCandidates(tiles);
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
    minisetPlacements,
  };

  return {
    dungeonType: request.dungeonType,
    levelNumber: request.levelNumber,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    gridContract: GRID_CONTRACT,
    seed,
    tiles,
    rooms,
    doors,
    stairs: { up: up.point, down: down.point },
    zones: buildZones(request, rooms, tiles),
    generation,
  };
}

function generateAcceptedCathedralMask(rng: GameRng, areaThreshold: number): CathedralLayoutMask {
  for (let attemptCount = 1; attemptCount <= CATHEDRAL_REGENERATION_LIMIT; attemptCount += 1) {
    const attemptSeed = rng.getState();
    const layout = generateCathedralMaskAttempt(rng, attemptSeed, attemptCount);
    if (layout.maskTileCount >= areaThreshold) {
      return layout;
    }
  }

  throw new Error(`Cathedral generator failed to reach area threshold ${areaThreshold}.`);
}

function generateCathedralMaskAttempt(rng: GameRng, attemptSeed: number, attemptCount: number): CathedralLayoutMask {
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

  const mapRoom = (room: GridRect, kind: MaskRoom['kind'], id: string): void => {
    const clipped = clipRect(room);
    if (clipped.width <= 0 || clipped.height <= 0) {
      return;
    }
    for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
      for (let x = clipped.x; x < clipped.x + clipped.width; x += 1) {
        mask[y][x] = true;
      }
    }
    rooms.push({ rect: clipped, kind, id });
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
        placeRoom1 = checkRoom(mask, leadingSideRoomProbe(room1, sideVerticalLayout));
      } else {
        room1 = rect(
          room1.x + Math.floor(area.width / 2) - Math.floor(room1.width / 2),
          room1.y - room1.height,
          room1.width,
          room1.height,
        );
        placeRoom1 = checkRoom(mask, leadingSideRoomProbe(room1, sideVerticalLayout));
      }
      if (placeRoom1) {
        break;
      }
    }

    if (placeRoom1) {
      const clampedRoom1 = rect(
        room1.x,
        room1.y,
        Math.min(BASE_WIDTH - room1.x, room1.width),
        Math.min(BASE_HEIGHT - room1.y, room1.height),
      );
      mapRoom(clampedRoom1, 'side', `side-${rooms.length + 1}`);
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

    if (placeRoom2) {
      mapRoom(room2, 'side', `side-${rooms.length + 1}`);
    }
    if (placeRoom1) {
      generateSideRooms(room1, !sideVerticalLayout);
    }
    if (placeRoom2) {
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

function maskToTiles(mask: boolean[][]): TileKind[][] {
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

function applyChamberDetails(tiles: TileKind[][], layout: CathedralLayoutMask): GridPoint[] {
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

function chamberInteriorRects(
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

function interiorFromAnchor(anchor: GridPoint): GridRect {
  return rect(anchor.x + 1, anchor.y + 1, 10, 10);
}

function placeStairMiniset(
  rng: GameRng,
  tiles: TileKind[][],
  protectedFootprints: Set<string>,
  id: 'STAIRSUP' | 'STAIRSDOWN',
  size: { width: number; height: number },
): StairPlacementResult {
  const position = chooseFootprintPosition(rng, tiles, protectedFootprints, size, FORCED_PLACEMENT_TRIES);
  protectFootprint(protectedFootprints, position, size);
  const point = {
    x: position.x + Math.floor(size.width / 2),
    y: position.y + Math.floor(size.height / 2),
  };
  tiles[point.y][point.x] = id === 'STAIRSUP' ? 'stairUp' : 'stairDown';
  return {
    point,
    miniset: { id, role: 'stair', position, size, tries: FORCED_PLACEMENT_TRIES },
  };
}

function placeLampMinisets(rng: GameRng, tiles: TileKind[][], protectedFootprints: Set<string>): DungeonMinisetPlacement[] {
  const placements: DungeonMinisetPlacement[] = [];
  const count = rng.generateRnd(5) + 5;
  const size = { width: 2, height: 2 };
  for (let index = 0; index < count; index += 1) {
    const position = chooseFootprintPosition(rng, tiles, protectedFootprints, size, FORCED_PLACEMENT_TRIES);
    protectFootprint(protectedFootprints, position, size);
    placements.push({ id: 'LAMPS', role: 'decoration', position, size, tries: FORCED_PLACEMENT_TRIES });
  }
  return placements;
}

function chooseFootprintPosition(
  rng: GameRng,
  tiles: TileKind[][],
  protectedFootprints: ReadonlySet<string>,
  size: { width: number; height: number },
  tries: number,
): GridPoint {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const candidate = {
      x: rng.integer(0, BASE_WIDTH - size.width),
      y: rng.integer(0, BASE_HEIGHT - size.height),
    };
    if (footprintFits(tiles, protectedFootprints, candidate, size)) {
      return candidate;
    }
  }

  for (let y = 0; y <= BASE_HEIGHT - size.height; y += 1) {
    for (let x = 0; x <= BASE_WIDTH - size.width; x += 1) {
      const candidate = { x, y };
      if (footprintFits(tiles, protectedFootprints, candidate, size)) {
        return candidate;
      }
    }
  }

  throw new Error(`Unable to place ${size.width}x${size.height} footprint.`);
}

function footprintFits(
  tiles: TileKind[][],
  protectedFootprints: ReadonlySet<string>,
  position: GridPoint,
  size: { width: number; height: number },
): boolean {
  for (let y = position.y; y < position.y + size.height; y += 1) {
    for (let x = position.x; x < position.x + size.width; x += 1) {
      if (!inside(tiles, { x, y }) || tiles[y][x] !== 'floor' || protectedFootprints.has(pointKey({ x, y }))) {
        return false;
      }
    }
  }
  return true;
}

function protectFootprint(protectedFootprints: Set<string>, position: GridPoint, size: { width: number; height: number }): void {
  for (let y = position.y; y < position.y + size.height; y += 1) {
    for (let x = position.x; x < position.x + size.width; x += 1) {
      protectedFootprints.add(pointKey({ x, y }));
    }
  }
}

function inferDoorCandidates(tiles: TileKind[][]): GridPoint[] {
  const doors: GridPoint[] = [];
  for (let y = 1; y < BASE_HEIGHT - 1; y += 1) {
    for (let x = 1; x < BASE_WIDTH - 1; x += 1) {
      if (tiles[y][x] !== 'floor') {
        continue;
      }
      const horizontal = PASSABLE_TILES.has(tiles[y][x - 1]) && PASSABLE_TILES.has(tiles[y][x + 1]);
      const vertical = PASSABLE_TILES.has(tiles[y - 1][x]) && PASSABLE_TILES.has(tiles[y + 1][x]);
      const blockedHorizontal = !PASSABLE_TILES.has(tiles[y][x - 1]) && !PASSABLE_TILES.has(tiles[y][x + 1]);
      const blockedVertical = !PASSABLE_TILES.has(tiles[y - 1][x]) && !PASSABLE_TILES.has(tiles[y + 1][x]);
      if ((horizontal && blockedVertical) || (vertical && blockedHorizontal)) {
        doors.push({ x, y });
      }
    }
  }
  return doors.slice(0, 24);
}

function generatePreviewLevel(request: DungeonGenerationRequest, seed: number): Omit<DungeonLevel, 'checksum'> {
  const rng = new GameRng(seed);
  const profile = previewProfileFor(request.dungeonType);
  const tiles = createGrid(BASE_WIDTH, BASE_HEIGHT, 'void');
  const rooms = placePreviewRooms(rng, profile.roomCount);
  const doors: GridPoint[] = [];

  for (const room of rooms) {
    carveRoom(tiles, room);
  }
  for (let index = 1; index < rooms.length; index += 1) {
    carveCorridor(tiles, rectCenter(rooms[index - 1]), rectCenter(rooms[index]), rng, doors);
  }

  const up = rectCenter(rooms[0]);
  const down = rectCenter(rooms[rooms.length - 1]);
  tiles[up.y][up.x] = 'stairUp';
  tiles[down.y][down.x] = 'stairDown';
  addWalls(tiles);

  const generation: PreviewGenerationMetadata = {
    familyId: request.dungeonType as Exclude<DungeonType, 'Cathedral'>,
    generatorKind: 'preview-rooms',
    attemptCount: 1,
  };

  return {
    dungeonType: request.dungeonType,
    levelNumber: request.levelNumber,
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    gridContract: GRID_CONTRACT,
    seed,
    tiles,
    rooms,
    doors: uniquePoints(doors),
    stairs: { up, down },
    zones: buildZones(request, rooms, tiles),
    generation,
  };
}

function previewProfileFor(dungeonType: DungeonType): { roomCount: number } {
  switch (dungeonType) {
    case 'Catacombs':
      return { roomCount: 10 };
    case 'Caves':
      return { roomCount: 9 };
    case 'Hell':
      return { roomCount: 8 };
    case 'Cathedral':
      return { roomCount: 9 };
  }
}

function placePreviewRooms(rng: GameRng, roomCount: number): GridRect[] {
  const rooms: GridRect[] = [];
  const attempts = roomCount * 60;

  for (let attempt = 0; attempt < attempts && rooms.length < roomCount; attempt += 1) {
    const room = rect(
      rng.integer(2, BASE_WIDTH - 12),
      rng.integer(2, BASE_HEIGHT - 10),
      rng.integer(5, 10),
      rng.integer(5, 8),
    );

    if (!rooms.some((existing) => rectsOverlap(existing, room, 1))) {
      rooms.push(room);
    }
  }

  if (rooms.length < 2) {
    throw new Error('Preview generator failed to place enough rooms.');
  }

  return rooms.sort((left, right) => rectCenter(left).x + rectCenter(left).y - (rectCenter(right).x + rectCenter(right).y));
}

function carveRoom(tiles: TileKind[][], room: GridRect): void {
  const clipped = clipRect(room);
  for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
    for (let x = clipped.x; x < clipped.x + clipped.width; x += 1) {
      tiles[y][x] = 'floor';
    }
  }
}

function carveCorridor(tiles: TileKind[][], from: GridPoint, to: GridPoint, rng: GameRng, doors: GridPoint[]): void {
  const horizontalFirst = rng.flipCoin();
  const path = horizontalFirst
    ? [...lineX(from, to.x), ...lineY({ x: to.x, y: from.y }, to.y)]
    : [...lineY(from, to.y), ...lineX({ x: from.x, y: to.y }, to.x)];

  for (const point of path) {
    if (!inside(tiles, point)) {
      continue;
    }
    const wasVoid = tiles[point.y][point.x] === 'void';
    tiles[point.y][point.x] = 'floor';
    if (wasVoid && countPassableNeighbors(tiles, point) >= 2 && rng.generateRnd(10) > 6) {
      tiles[point.y][point.x] = 'door';
      doors.push(point);
    }
  }
}

function lineX(from: GridPoint, toX: number): GridPoint[] {
  const step = Math.sign(toX - from.x) || 1;
  const points: GridPoint[] = [];
  for (let x = from.x; x !== toX + step; x += step) {
    points.push({ x, y: from.y });
  }
  return points;
}

function lineY(from: GridPoint, toY: number): GridPoint[] {
  const step = Math.sign(toY - from.y) || 1;
  const points: GridPoint[] = [];
  for (let y = from.y; y !== toY + step; y += step) {
    points.push({ x: from.x, y });
  }
  return points;
}

function addWalls(tiles: TileKind[][]): void {
  const wallCandidates: GridPoint[] = [];
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] !== 'void') {
        continue;
      }
      if (neighbors8({ x, y }).some((point) => inside(tiles, point) && PASSABLE_TILES.has(tiles[point.y][point.x]))) {
        wallCandidates.push({ x, y });
      }
    }
  }
  for (const point of wallCandidates) {
    tiles[point.y][point.x] = 'wall';
  }
}

function buildZones(request: DungeonGenerationRequest, rooms: readonly GridRect[], tiles: TileKind[][]) {
  const zones = [];
  const candidates = rooms.flatMap((room) => findZoneRects(room, tiles));
  if (request.includeObjects && candidates[0]) {
    zones.push({ id: 'object-zone-01', kind: 'object' as const, rect: candidates[0] });
  }
  if (request.includeSpawnZones && candidates[1]) {
    zones.push({ id: 'spawn-zone-01', kind: 'spawn' as const, rect: candidates[1] });
  }
  if (request.includeQuestLocks && candidates[2]) {
    zones.push({ id: 'quest-lock-01', kind: 'questLock' as const, rect: candidates[2] });
  }
  return zones;
}

function findZoneRects(room: GridRect, tiles: TileKind[][]): GridRect[] {
  const zones: GridRect[] = [];
  const clipped = clipRect(room);
  for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
    for (let x = clipped.x; x < clipped.x + clipped.width; x += 1) {
      const candidate = rect(x, y, 2, 2);
      if (rectContainsOnlyPassable(tiles, candidate)) {
        zones.push(candidate);
      }
    }
  }
  return zones.slice(0, 1);
}

function buildConnectivityGraph(level: DungeonLevel): DungeonConnectivityGraph {
  const visited = new Set<string>();
  const queue = [level.stairs.up];

  while (queue.length > 0) {
    const point = queue.shift()!;
    const key = pointKey(point);
    if (visited.has(key) || !inside(level.tiles, point) || !PASSABLE_TILES.has(level.tiles[point.y][point.x])) {
      continue;
    }
    visited.add(key);
    queue.push(...neighbors4(point));
  }

  const reachableTiles = [...visited].map(parsePointKey);
  const unreachablePassableTiles: GridPoint[] = [];

  forEachTile(level, (point, tile) => {
    if (PASSABLE_TILES.has(tile) && !visited.has(pointKey(point))) {
      unreachablePassableTiles.push(point);
    }
  });

  return { reachableTiles, unreachablePassableTiles };
}

function validateResourceBindings(level: DungeonLevel): DungeonResourceBindingReport {
  const used = new Set<`tile.${TileKind}`>();
  forEachTile(level, (_point, tile) => used.add(`tile.${tile}`));
  const missingSemantics = [...used].filter((semantic) => !REQUIRED_TILE_SEMANTICS.includes(semantic));
  return {
    ok: missingSemantics.length === 0,
    missingSemantics,
    usedSemantics: [...used].sort(),
  };
}

function validateDungeon(
  level: DungeonLevel,
  graph: DungeonConnectivityGraph,
  resourceBindings: DungeonResourceBindingReport,
): DungeonValidationReport {
  const issues: DungeonValidationIssue[] = [];
  const reachable = new Set(graph.reachableTiles.map(pointKey));

  if (level.width !== level.gridContract.baseGrid.width || level.height !== level.gridContract.baseGrid.height) {
    issues.push({ rule: 'BaseGridContract', severity: 'error', message: 'Level dimensions do not match the 40x40 base grid contract.' });
  }

  if (!reachable.has(pointKey(level.stairs.down))) {
    issues.push({ rule: 'StartExitReachable', severity: 'error', message: 'Entrance cannot reach exit stair.', points: [level.stairs.up, level.stairs.down] });
  }

  if (graph.unreachablePassableTiles.length > 0) {
    issues.push({ rule: 'NoCriticalIslands', severity: 'error', message: `${graph.unreachablePassableTiles.length} passable tiles are isolated.`, points: graph.unreachablePassableTiles.slice(0, 20) });
  }

  const invalidTiles: GridPoint[] = [];
  forEachTile(level, (point, tile) => {
    if (!VALID_TILE_KINDS.has(tile)) {
      invalidTiles.push(point);
    }
  });
  if (invalidTiles.length > 0) {
    issues.push({ rule: 'TileIdBounded', severity: 'error', message: 'Level includes unknown tile ids.', points: invalidTiles });
  }

  const invalidZones = level.zones.filter((zone) => !rectPassable(level, zone.rect, reachable));
  if (invalidZones.length > 0) {
    issues.push({ rule: 'ObjectZoneFits', severity: 'error', message: 'One or more zones overlap blocked or unreachable cells.' });
  }

  if (level.generation.familyId === 'Cathedral') {
    if (level.generation.maskTileCount < level.generation.areaThreshold) {
      issues.push({ rule: 'CathedralAreaThreshold', severity: 'error', message: 'Cathedral mask area is below the documented level threshold.' });
    }
    const lampCount = level.generation.minisetPlacements.filter((placement) => placement.id === 'LAMPS').length;
    if (lampCount < 5 || lampCount > 9) {
      issues.push({ rule: 'CathedralLampCount', severity: 'error', message: 'Cathedral lamp miniset count must be between 5 and 9.' });
    }
  }

  if (!resourceBindings.ok) {
    issues.push({ rule: 'ResourceBindingComplete', severity: 'error', message: `Missing resource bindings: ${resourceBindings.missingSemantics.join(', ')}` });
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues,
    metrics: {
      passableTileCount: countTiles(level, (tile) => PASSABLE_TILES.has(tile)),
      reachableTileCount: graph.reachableTiles.length,
      roomCount: level.rooms.length,
      doorCount: level.doors.length,
      zoneCount: level.zones.length,
      maskTileCount: level.generation.familyId === 'Cathedral' ? level.generation.maskTileCount : undefined,
      areaThreshold: level.generation.familyId === 'Cathedral' ? level.generation.areaThreshold : undefined,
      minisetCount: level.generation.familyId === 'Cathedral' ? level.generation.minisetPlacements.length : undefined,
    },
  };
}

function rectPassable(level: DungeonLevel, area: GridRect, reachable: ReadonlySet<string>): boolean {
  for (let y = area.y; y < area.y + area.height; y += 1) {
    for (let x = area.x; x < area.x + area.width; x += 1) {
      const point = { x, y };
      if (!inside(level.tiles, point) || !PASSABLE_TILES.has(level.tiles[y][x]) || !reachable.has(pointKey(point))) {
        return false;
      }
    }
  }
  return true;
}

function countTiles(level: DungeonLevel, predicate: (tile: TileKind) => boolean): number {
  let count = 0;
  forEachTile(level, (_point, tile) => {
    if (predicate(tile)) {
      count += 1;
    }
  });
  return count;
}

function forEachTile(level: DungeonLevel, visitor: (point: GridPoint, tile: TileKind) => void): void {
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      visitor({ x, y }, level.tiles[y][x]);
    }
  }
}

function countPassableNeighbors(tiles: TileKind[][], point: GridPoint): number {
  return neighbors4(point).filter((neighbor) => inside(tiles, neighbor) && PASSABLE_TILES.has(tiles[neighbor.y][neighbor.x])).length;
}

function neighbors4(point: GridPoint): GridPoint[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ];
}

function neighbors8(point: GridPoint): GridPoint[] {
  return [
    ...neighbors4(point),
    { x: point.x + 1, y: point.y + 1 },
    { x: point.x - 1, y: point.y - 1 },
    { x: point.x + 1, y: point.y - 1 },
    { x: point.x - 1, y: point.y + 1 },
  ];
}

function inside(tiles: TileKind[][], point: GridPoint): boolean {
  return point.y >= 0 && point.y < tiles.length && point.x >= 0 && point.x < tiles[point.y].length;
}

function uniquePoints(points: readonly GridPoint[]): GridPoint[] {
  return [...new Map(points.map((point) => [pointKey(point), point])).values()];
}

function parsePointKey(key: string): GridPoint {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function createGrid(width: number, height: number, fill: TileKind): TileKind[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

function createMask(): boolean[][] {
  return Array.from({ length: BASE_HEIGHT }, () => Array.from({ length: BASE_WIDTH }, () => false));
}

function checkRoom(mask: boolean[][], room: GridRect): boolean {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (x < 0 || x >= BASE_WIDTH || y < 0 || y >= BASE_HEIGHT || mask[y][x]) {
        return false;
      }
    }
  }
  return true;
}

function leadingSideRoomProbe(room: GridRect, verticalLayout: boolean): GridRect {
  if (verticalLayout) {
    return rect(room.x - 1, room.y - 1, room.width + 1, room.height + 2);
  }
  return rect(room.x - 1, room.y - 1, room.width + 2, room.height + 1);
}

function trailingSideRoomProbe(room: GridRect, verticalLayout: boolean): GridRect {
  if (verticalLayout) {
    return rect(room.x, room.y - 1, room.width + 1, room.height + 2);
  }
  return rect(room.x - 1, room.y, room.width + 2, room.height + 1);
}

function countMaskTiles(mask: boolean[][]): number {
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

function rect(x: number, y: number, width: number, height: number): GridRect {
  return { x, y, width, height };
}

function clipRect(area: GridRect): GridRect {
  const x = Math.max(0, area.x);
  const y = Math.max(0, area.y);
  const right = Math.min(BASE_WIDTH, area.x + area.width);
  const bottom = Math.min(BASE_HEIGHT, area.y + area.height);
  return rect(x, y, Math.max(0, right - x), Math.max(0, bottom - y));
}

function swapRect(area: GridRect): GridRect {
  return rect(area.y, area.x, area.height, area.width);
}

function swapPoint(point: GridPoint): GridPoint {
  return { x: point.y, y: point.x };
}

function rectContainsOnlyPassable(tiles: TileKind[][], area: GridRect): boolean {
  for (let y = area.y; y < area.y + area.height; y += 1) {
    for (let x = area.x; x < area.x + area.width; x += 1) {
      if (!inside(tiles, { x, y }) || !PASSABLE_TILES.has(tiles[y][x])) {
        return false;
      }
    }
  }
  return true;
}

function cathedralAreaThreshold(levelNumber: number): number {
  switch (levelNumber) {
    case 1:
      return 533;
    case 2:
      return 693;
    default:
      return 761;
  }
}
