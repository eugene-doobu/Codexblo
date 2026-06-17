import { pointKey } from '../../../core/grid';
import type { GridPoint, GridRect } from '../../../core/grid';
import { GameRng } from '../../../core/rng';
import type { DungeonGenerationRequest, DungeonGridContract, DungeonMinisetId, DungeonMinisetPlacement, TileKind } from '../dungeon-types';

export const BASE_WIDTH = 40;
export const BASE_HEIGHT = 40;
const EXPANDED_WIDTH = 112;
const EXPANDED_HEIGHT = 112;
const EXPANDED_PADDING = 16;
const MEGA_TO_WORLD_SCALE = 2;
export const FORCED_PLACEMENT_TRIES = BASE_WIDTH * BASE_HEIGHT;

export const GRID_CONTRACT: DungeonGridContract = {
  baseGrid: { width: BASE_WIDTH, height: BASE_HEIGHT },
  expandedGrid: {
    width: EXPANDED_WIDTH,
    height: EXPANDED_HEIGHT,
    padding: EXPANDED_PADDING,
    scale: MEGA_TO_WORLD_SCALE,
  },
};

export const PASSABLE_TILES = new Set<TileKind>(['floor', 'door', 'stairUp', 'stairDown']);
export const VALID_TILE_KINDS = new Set<TileKind>(['void', ...PASSABLE_TILES, 'wall']);

export interface StairPlacementResult {
  point: GridPoint;
  miniset: DungeonMinisetPlacement;
}

export function placeStairMiniset(
  rng: GameRng,
  tiles: TileKind[][],
  protectedFootprints: Set<string>,
  id: Extract<DungeonMinisetId, 'STAIRSUP' | 'STAIRSDOWN' | 'USTAIRS' | 'DSTAIRS' | 'L3UP' | 'L3DOWN'>,
  size: { width: number; height: number },
): StairPlacementResult {
  const position = chooseFootprintPosition(rng, tiles, protectedFootprints, size, FORCED_PLACEMENT_TRIES);
  protectFootprint(protectedFootprints, position, size);
  const point = {
    x: position.x + Math.floor(size.width / 2),
    y: position.y + Math.floor(size.height / 2),
  };
  tiles[point.y][point.x] = id === 'STAIRSUP' || id === 'USTAIRS' || id === 'L3UP' ? 'stairUp' : 'stairDown';
  return {
    point,
    miniset: { id, role: 'stair', position, size, tries: FORCED_PLACEMENT_TRIES },
  };
}

export function placeLampMinisets(rng: GameRng, tiles: TileKind[][], protectedFootprints: Set<string>): DungeonMinisetPlacement[] {
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

export function chooseFootprintPosition(
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

export function footprintFits(
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

export function protectFootprint(protectedFootprints: Set<string>, position: GridPoint, size: { width: number; height: number }): void {
  for (let y = position.y; y < position.y + size.height; y += 1) {
    for (let x = position.x; x < position.x + size.width; x += 1) {
      protectedFootprints.add(pointKey({ x, y }));
    }
  }
}

export function inferDoorCandidates(tiles: TileKind[][]): GridPoint[] {
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

export function carveRoom(tiles: TileKind[][], room: GridRect): void {
  const clipped = clipRect(room);
  for (let y = clipped.y; y < clipped.y + clipped.height; y += 1) {
    for (let x = clipped.x; x < clipped.x + clipped.width; x += 1) {
      tiles[y][x] = 'floor';
    }
  }
}

export function carveCorridor(tiles: TileKind[][], from: GridPoint, to: GridPoint, rng: GameRng, doors: GridPoint[]): void {
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

export function lineX(from: GridPoint, toX: number): GridPoint[] {
  const step = Math.sign(toX - from.x) || 1;
  const points: GridPoint[] = [];
  for (let x = from.x; x !== toX + step; x += step) {
    points.push({ x, y: from.y });
  }
  return points;
}

export function lineY(from: GridPoint, toY: number): GridPoint[] {
  const step = Math.sign(toY - from.y) || 1;
  const points: GridPoint[] = [];
  for (let y = from.y; y !== toY + step; y += step) {
    points.push({ x: from.x, y });
  }
  return points;
}

export function addWalls(tiles: TileKind[][]): void {
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

export function buildZones(request: DungeonGenerationRequest, rooms: readonly GridRect[], tiles: TileKind[][]) {
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

export function findZoneRects(room: GridRect, tiles: TileKind[][]): GridRect[] {
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

export function countPassableNeighbors(tiles: TileKind[][], point: GridPoint): number {
  return neighbors4(point).filter((neighbor) => inside(tiles, neighbor) && PASSABLE_TILES.has(tiles[neighbor.y][neighbor.x])).length;
}

export function neighbors4(point: GridPoint): GridPoint[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ];
}

export function neighbors8(point: GridPoint): GridPoint[] {
  return [
    ...neighbors4(point),
    { x: point.x + 1, y: point.y + 1 },
    { x: point.x - 1, y: point.y - 1 },
    { x: point.x + 1, y: point.y - 1 },
    { x: point.x - 1, y: point.y + 1 },
  ];
}

export function inside(tiles: TileKind[][], point: GridPoint): boolean {
  return point.y >= 0 && point.y < tiles.length && point.x >= 0 && point.x < tiles[point.y].length;
}

export function uniquePoints(points: readonly GridPoint[]): GridPoint[] {
  return [...new Map(points.map((point) => [pointKey(point), point])).values()];
}

export function parsePointKey(key: string): GridPoint {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function createGrid(width: number, height: number, fill: TileKind): TileKind[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

export function createMask(): boolean[][] {
  return Array.from({ length: BASE_HEIGHT }, () => Array.from({ length: BASE_WIDTH }, () => false));
}

export function checkRoom(mask: boolean[][], room: GridRect): boolean {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (x < 0 || x >= BASE_WIDTH || y < 0 || y >= BASE_HEIGHT || mask[y][x]) {
        return false;
      }
    }
  }
  return true;
}

export function leadingSideRoomProbe(room: GridRect, verticalLayout: boolean): GridRect {
  if (verticalLayout) {
    return rect(room.x - 1, room.y - 1, room.width + 1, room.height + 2);
  }
  return rect(room.x - 1, room.y - 1, room.width + 2, room.height + 1);
}

export function trailingSideRoomProbe(room: GridRect, verticalLayout: boolean): GridRect {
  if (verticalLayout) {
    return rect(room.x, room.y - 1, room.width + 1, room.height + 2);
  }
  return rect(room.x - 1, room.y, room.width + 2, room.height + 1);
}

export function countMaskTiles(mask: boolean[][]): number {
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

export function rect(x: number, y: number, width: number, height: number): GridRect {
  return { x, y, width, height };
}

export function partitionPoint(x: number, y: number): GridPoint {
  return { x, y };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function randomBetween(rng: GameRng, minInclusive: number, maxInclusive: number): number {
  return rng.integer(minInclusive, maxInclusive);
}

export function clipRect(area: GridRect): GridRect {
  const x = Math.max(0, area.x);
  const y = Math.max(0, area.y);
  const right = Math.min(BASE_WIDTH, area.x + area.width);
  const bottom = Math.min(BASE_HEIGHT, area.y + area.height);
  return rect(x, y, Math.max(0, right - x), Math.max(0, bottom - y));
}

export function swapRect(area: GridRect): GridRect {
  return rect(area.y, area.x, area.height, area.width);
}

export function swapPoint(point: GridPoint): GridPoint {
  return { x: point.y, y: point.x };
}

export function rectContainsOnlyPassable(tiles: TileKind[][], area: GridRect): boolean {
  for (let y = area.y; y < area.y + area.height; y += 1) {
    for (let x = area.x; x < area.x + area.width; x += 1) {
      if (!inside(tiles, { x, y }) || !PASSABLE_TILES.has(tiles[y][x])) {
        return false;
      }
    }
  }
  return true;
}
