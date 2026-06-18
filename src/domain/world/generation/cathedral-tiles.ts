import { pointKey } from '../../../core/grid';
import type { GridPoint, GridRect } from '../../../core/grid';
import { CATHEDRAL_STRUCTURE_TILE_KINDS, type CathedralStructureTileKind } from '../cathedral-render-tiles';
import {
  type CathedralDividingWallMetadata,
  type CathedralTileizationMetadata,
  type DungeonMinisetPlacement,
  type RenderTileKind,
  type TileKind,
} from '../dungeon-types';
import { inside, PASSABLE_TILES } from './shared';

export interface CathedralTileizationInput {
  verticalLayout: boolean;
  chamberInteriors: readonly GridRect[];
  hallMask: GridRect;
  pillarPositions: readonly GridPoint[];
  minisetPlacements: readonly DungeonMinisetPlacement[];
}

export interface CathedralTileizationResult {
  renderTiles: RenderTileKind[][];
  metadata: CathedralTileizationMetadata;
}

type StructureOrientation = CathedralDividingWallMetadata['orientation'];

export function buildCathedralTileization(tiles: TileKind[][], input: CathedralTileizationInput): CathedralTileizationResult {
  const renderTiles = tiles.map((row) => [...row] as RenderTileKind[]);
  applyWallTileIds(tiles, renderTiles);
  const dividingWalls = applyDividingWallTileIds(tiles, renderTiles, input);
  const hallArchPositions = applyHallArchTileIds(tiles, renderTiles, input);
  applyPillarTileIds(tiles, renderTiles, input.pillarPositions);

  return {
    renderTiles,
    metadata: {
      renderTileKinds: CATHEDRAL_STRUCTURE_TILE_KINDS,
      structureTileCounts: countStructureTiles(renderTiles),
      hallArchPositions,
      dividingWalls,
    },
  };
}

function applyWallTileIds(tiles: TileKind[][], renderTiles: RenderTileKind[][]): void {
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] === 'wall') {
        renderTiles[y][x] = chooseWallTileId(tiles, { x, y });
      }
    }
  }
}

function chooseWallTileId(tiles: TileKind[][], point: GridPoint): CathedralStructureTileKind {
  const north = isPassableAt(tiles, { x: point.x, y: point.y - 1 });
  const south = isPassableAt(tiles, { x: point.x, y: point.y + 1 });
  const west = isPassableAt(tiles, { x: point.x - 1, y: point.y });
  const east = isPassableAt(tiles, { x: point.x + 1, y: point.y });
  const verticalTouch = north || south;
  const horizontalTouch = west || east;

  if (verticalTouch && horizontalTouch) {
    return 'cathedralCornerWall';
  }
  if (verticalTouch) {
    return 'cathedralVerticalWall';
  }
  if (horizontalTouch) {
    return 'cathedralHorizontalWall';
  }
  return 'cathedralDiagonalWall';
}

function applyDividingWallTileIds(
  tiles: TileKind[][],
  renderTiles: RenderTileKind[][],
  input: CathedralTileizationInput,
): CathedralDividingWallMetadata[] {
  const protectedPoints = protectedFootprintKeys(input.minisetPlacements);
  const orientation: StructureOrientation = input.verticalLayout ? 'horizontal' : 'vertical';
  return input.chamberInteriors
    .map((interior) => createDividingWall(tiles, renderTiles, interior, orientation, protectedPoints))
    .filter((wall): wall is CathedralDividingWallMetadata => wall !== undefined);
}

function createDividingWall(
  tiles: TileKind[][],
  renderTiles: RenderTileKind[][],
  interior: GridRect,
  orientation: StructureOrientation,
  protectedPoints: ReadonlySet<string>,
): CathedralDividingWallMetadata | undefined {
  const points = dividingLinePoints(interior, orientation);
  const wallPositions: GridPoint[] = [];
  const archPositions: GridPoint[] = [];

  points.forEach((point, index) => {
    if (protectedPoints.has(pointKey(point)) || !isPlainFloor(tiles, renderTiles, point)) {
      return;
    }
    if (index === Math.floor(points.length / 2) || index % 4 === 1) {
      const archTile: CathedralStructureTileKind = orientation === 'vertical' ? 'cathedralVerticalArch' : 'cathedralHorizontalArch';
      renderTiles[point.y][point.x] = archTile;
      archPositions.push(point);
      return;
    }
    renderTiles[point.y][point.x] = 'cathedralDividingWall';
    wallPositions.push(point);
  });

  if (wallPositions.length === 0 && archPositions.length === 0) {
    return undefined;
  }

  return {
    orientation,
    line: lineRect(points),
    wallPositions,
    archPositions,
  };
}

function dividingLinePoints(interior: GridRect, orientation: StructureOrientation): GridPoint[] {
  const points: GridPoint[] = [];
  if (orientation === 'vertical') {
    const x = interior.x + Math.floor(interior.width / 2);
    for (let y = interior.y + 1; y < interior.y + interior.height - 1; y += 1) {
      points.push({ x, y });
    }
    return points;
  }

  const y = interior.y + Math.floor(interior.height / 2);
  for (let x = interior.x + 1; x < interior.x + interior.width - 1; x += 1) {
    points.push({ x, y });
  }
  return points;
}

function applyHallArchTileIds(
  tiles: TileKind[][],
  renderTiles: RenderTileKind[][],
  input: CathedralTileizationInput,
): GridPoint[] {
  const archPositions: GridPoint[] = [];
  const protectedPoints = protectedFootprintKeys(input.minisetPlacements);
  const archTile: CathedralStructureTileKind = input.verticalLayout ? 'cathedralVerticalArch' : 'cathedralHorizontalArch';
  const laneOffsetA = Math.max(1, Math.floor((input.verticalLayout ? input.hallMask.width : input.hallMask.height) / 2) - 1);
  const laneOffsetB = laneOffsetA + 1;
  const start = input.verticalLayout ? input.hallMask.y + 1 : input.hallMask.x + 1;
  const end = input.verticalLayout
    ? input.hallMask.y + input.hallMask.height - 1
    : input.hallMask.x + input.hallMask.width - 1;

  for (let cursor = start + 1; cursor < end; cursor += 4) {
    for (const laneOffset of [laneOffsetA, laneOffsetB]) {
      const point = input.verticalLayout
        ? { x: input.hallMask.x + laneOffset, y: cursor }
        : { x: cursor, y: input.hallMask.y + laneOffset };
      if (protectedPoints.has(pointKey(point)) || !isPlainFloor(tiles, renderTiles, point)) {
        continue;
      }
      renderTiles[point.y][point.x] = archTile;
      archPositions.push(point);
    }
  }

  return archPositions;
}

function applyPillarTileIds(tiles: TileKind[][], renderTiles: RenderTileKind[][], pillarPositions: readonly GridPoint[]): void {
  for (const pillar of pillarPositions) {
    if (inside(tiles, pillar) && tiles[pillar.y][pillar.x] === 'wall') {
      renderTiles[pillar.y][pillar.x] = 'cathedralPillar';
    }
  }
}

function protectedFootprintKeys(placements: readonly DungeonMinisetPlacement[]): Set<string> {
  const protectedPoints = new Set<string>();
  for (const placement of placements) {
    for (let y = placement.position.y; y < placement.position.y + placement.size.height; y += 1) {
      for (let x = placement.position.x; x < placement.position.x + placement.size.width; x += 1) {
        protectedPoints.add(pointKey({ x, y }));
      }
    }
  }
  return protectedPoints;
}

function isPlainFloor(tiles: TileKind[][], renderTiles: RenderTileKind[][], point: GridPoint): boolean {
  return inside(tiles, point) && tiles[point.y][point.x] === 'floor' && renderTiles[point.y][point.x] === 'floor';
}

function isPassableAt(tiles: TileKind[][], point: GridPoint): boolean {
  return inside(tiles, point) && PASSABLE_TILES.has(tiles[point.y][point.x]);
}

function countStructureTiles(renderTiles: RenderTileKind[][]): Record<CathedralStructureTileKind, number> {
  const counts = Object.fromEntries(CATHEDRAL_STRUCTURE_TILE_KINDS.map((tileKind) => [tileKind, 0])) as Record<
    CathedralStructureTileKind,
    number
  >;
  for (const row of renderTiles) {
    for (const tile of row) {
      if (isCathedralStructureTile(tile)) {
        counts[tile] += 1;
      }
    }
  }
  return counts;
}

function isCathedralStructureTile(tile: RenderTileKind): tile is CathedralStructureTileKind {
  return (CATHEDRAL_STRUCTURE_TILE_KINDS as readonly string[]).includes(tile);
}

function lineRect(points: readonly GridPoint[]): GridRect {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}
