import { checksumJson } from '../../core/hash';
import { GameRng } from '../../core/rng';
import type { GridPoint, GridRect } from '../../core/grid';
import { pointKey, rectCenter, rectsOverlap } from '../../core/grid';
import type {
  DungeonConnectivityGraph,
  DungeonGenerationRequest,
  DungeonGenerationResult,
  DungeonLevel,
  DungeonResourceBindingReport,
  DungeonType,
  DungeonValidationIssue,
  DungeonValidationReport,
  TileKind,
} from './dungeon-types';
import { resolveDungeonSeed } from './dungeon-generation-request';
import { REQUIRED_TILE_SEMANTICS } from './tile-semantics';

const PASSABLE_TILES = new Set<TileKind>(['floor', 'door', 'stairUp', 'stairDown']);
const VALID_TILE_KINDS = new Set<TileKind>(['void', ...PASSABLE_TILES, 'wall']);

export function generateDungeon(request: DungeonGenerationRequest): DungeonGenerationResult {
  const seed = resolveDungeonSeed(request);
  const rng = new GameRng(seed);
  const profile = profileFor(request.dungeonType);
  const width = profile.width;
  const height = profile.height;
  const tiles = createGrid(width, height, 'void');
  const rooms = placeRooms(rng, width, height, profile.roomCount);
  const doors: GridPoint[] = [];

  for (const room of rooms) {
    carveRoom(tiles, room);
  }

  for (let index = 1; index < rooms.length; index += 1) {
    const from = rectCenter(rooms[index - 1]);
    const to = rectCenter(rooms[index]);
    carveCorridor(tiles, from, to, rng, doors);
  }

  const up = rectCenter(rooms[0]);
  const down = rectCenter(rooms[rooms.length - 1]);
  tiles[up.y][up.x] = 'stairUp';
  tiles[down.y][down.x] = 'stairDown';
  addWalls(tiles);

  const zones = buildZones(request, rooms);
  const partialLevel: Omit<DungeonLevel, 'checksum'> = {
    dungeonType: request.dungeonType,
    levelNumber: request.levelNumber,
    width,
    height,
    seed,
    tiles,
    rooms,
    doors: uniquePoints(doors),
    stairs: { up, down },
    zones,
  };

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

function profileFor(dungeonType: DungeonType): { width: number; height: number; roomCount: number } {
  switch (dungeonType) {
    case 'Catacombs':
      return { width: 58, height: 46, roomCount: 10 };
    case 'Caves':
      return { width: 62, height: 46, roomCount: 9 };
    case 'Hell':
      return { width: 54, height: 42, roomCount: 8 };
    case 'Cathedral':
      return { width: 52, height: 40, roomCount: 9 };
  }
}

function createGrid(width: number, height: number, fill: TileKind): TileKind[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

function placeRooms(rng: GameRng, width: number, height: number, roomCount: number): GridRect[] {
  const rooms: GridRect[] = [];
  const attempts = roomCount * 40;

  for (let attempt = 0; attempt < attempts && rooms.length < roomCount; attempt += 1) {
    const room: GridRect = {
      x: rng.integer(3, width - 13),
      y: rng.integer(3, height - 11),
      width: rng.integer(6, 11),
      height: rng.integer(5, 9),
    };

    if (!rooms.some((existing) => rectsOverlap(existing, room, 2))) {
      rooms.push(room);
    }
  }

  if (rooms.length < 2) {
    throw new Error('Cathedral generator failed to place enough rooms.');
  }

  return rooms.sort((left, right) => rectCenter(left).x + rectCenter(left).y - (rectCenter(right).x + rectCenter(right).y));
}

function carveRoom(tiles: TileKind[][], room: GridRect): void {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      tiles[y][x] = 'floor';
    }
  }
}

function carveCorridor(tiles: TileKind[][], from: GridPoint, to: GridPoint, rng: GameRng, doors: GridPoint[]): void {
  const horizontalFirst = rng.nextFloat() > 0.5;
  const path: GridPoint[] = [];

  if (horizontalFirst) {
    path.push(...lineX(from, to.x), ...lineY({ x: to.x, y: from.y }, to.y));
  } else {
    path.push(...lineY(from, to.y), ...lineX({ x: from.x, y: to.y }, to.x));
  }

  for (const point of path) {
    if (!inside(tiles, point)) {
      continue;
    }
    const wasVoid = tiles[point.y][point.x] === 'void';
    tiles[point.y][point.x] = 'floor';
    if (wasVoid && countPassableNeighbors(tiles, point) >= 2 && rng.nextFloat() > 0.7) {
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
  for (let y = 1; y < tiles.length - 1; y += 1) {
    for (let x = 1; x < tiles[y].length - 1; x += 1) {
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

function buildZones(request: DungeonGenerationRequest, rooms: readonly GridRect[]) {
  const zones = [];
  if (request.includeObjects) {
    zones.push({ id: 'object-zone-01', kind: 'object' as const, rect: inset(rooms[Math.min(1, rooms.length - 1)], 1) });
  }
  if (request.includeSpawnZones) {
    zones.push({ id: 'spawn-zone-01', kind: 'spawn' as const, rect: inset(rooms[Math.max(0, rooms.length - 2)], 1) });
  }
  if (request.includeQuestLocks) {
    zones.push({ id: 'quest-lock-01', kind: 'questLock' as const, rect: inset(rooms[rooms.length - 1], 1) });
  }
  return zones;
}

function inset(rect: GridRect, amount: number): GridRect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    width: Math.max(1, rect.width - amount * 2),
    height: Math.max(1, rect.height - amount * 2),
  };
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
    },
  };
}

function rectPassable(level: DungeonLevel, rect: GridRect, reachable: ReadonlySet<string>): boolean {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
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
