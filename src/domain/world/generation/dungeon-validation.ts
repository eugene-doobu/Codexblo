import { pointKey, rectsOverlap } from '../../../core/grid';
import type { GridPoint, GridRect } from '../../../core/grid';
import type {
  DungeonConnectivityGraph,
  DungeonLevel,
  DungeonResourceBindingReport,
  DungeonValidationIssue,
  DungeonValidationReport,
  TileKind,
} from '../dungeon-types';
import { REQUIRED_TILE_SEMANTICS } from '../tile-semantics';
import { inside, neighbors4, parsePointKey, PASSABLE_TILES, VALID_TILE_KINDS } from './shared';

export function isPassable(tile: TileKind): boolean {
  return PASSABLE_TILES.has(tile);
}

export function buildConnectivityGraph(level: DungeonLevel): DungeonConnectivityGraph {
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

export function validateResourceBindings(level: DungeonLevel): DungeonResourceBindingReport {
  const used = new Set<`tile.${TileKind}`>();
  forEachTile(level, (_point, tile) => used.add(`tile.${tile}`));
  const missingSemantics = [...used].filter((semantic) => !REQUIRED_TILE_SEMANTICS.includes(semantic));
  return {
    ok: missingSemantics.length === 0,
    missingSemantics,
    usedSemantics: [...used].sort(),
  };
}

export function validateDungeon(
  level: DungeonLevel,
  graph: DungeonConnectivityGraph,
  resourceBindings: DungeonResourceBindingReport,
): DungeonValidationReport {
  const issues: DungeonValidationIssue[] = [];
  const reachable = new Set(graph.reachableTiles.map(pointKey));

  if (level.width !== level.gridContract.baseGrid.width || level.height !== level.gridContract.baseGrid.height) {
    issues.push({ rule: 'BaseGridContract', severity: 'error', message: 'Level dimensions do not match the 40x40 base grid contract.' });
  }

  if (level.stairs.down && !reachable.has(pointKey(level.stairs.down))) {
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
    issues.push(...validateObjectPlacements(level, reachable));
    issues.push(...validateCathedralObjectPresetCoverage(level));
  }

  if (level.generation.familyId === 'Catacombs') {
    const generation = level.generation;
    if (generation.rooms.length > generation.roomNodeCapacity) {
      issues.push({ rule: 'CatacombsRoomCapacity', severity: 'error', message: 'Catacombs room count exceeds the room node capacity.' });
    }
    const outOfBoundsRooms = generation.rooms.filter((room) => !catacombsRoomWithinClamp(room, generation.clampBounds));
    if (outOfBoundsRooms.length > 0) {
      issues.push({ rule: 'CatacombsRoomClampBounds', severity: 'error', message: 'One or more Catacombs rooms exceed the documented clamp bounds.' });
    }
    const minisetIds = new Set(generation.minisetPlacements.map((placement) => placement.id));
    if (!minisetIds.has('USTAIRS') || !minisetIds.has('DSTAIRS')) {
      issues.push({ rule: 'CatacombsStairMinisets', severity: 'error', message: 'Catacombs must include up and down stair miniset metadata.' });
    }
    if (level.levelNumber === 5 && !minisetIds.has('WARPSTAIRS')) {
      issues.push({ rule: 'CatacombsTownWarp', severity: 'error', message: 'Catacombs level 5 must include town warp miniset metadata.' });
    }
  }

  if (level.generation.familyId === 'Caves') {
    const generation = level.generation;
    if (generation.floorArea < generation.floorAreaThreshold) {
      issues.push({ rule: 'CavesAreaThreshold', severity: 'error', message: 'Caves floor area is below the documented threshold.' });
    }
    if (generation.connectedFloorCount !== generation.floorArea) {
      issues.push({ rule: 'CavesConnectedFloor', severity: 'error', message: 'Caves floor mask must be a single connected component.' });
    }
    const minisetIds = new Set(generation.minisetPlacements.map((placement) => placement.id));
    if (!minisetIds.has('L3UP') || !minisetIds.has('L3DOWN')) {
      issues.push({ rule: 'CavesStairMinisets', severity: 'error', message: 'Caves must include up and down stair miniset metadata.' });
    }
    if (level.levelNumber === 9 && !minisetIds.has('L3HOLDWARP')) {
      issues.push({ rule: 'CavesTownWarp', severity: 'error', message: 'Caves level 9 must include town warp miniset metadata.' });
    }
    if (generation.pool.area > 40) {
      issues.push({ rule: 'CavesPoolSize', severity: 'error', message: 'Caves pool footprint must stay within the documented small-pool bound.' });
    }
    if (generation.anvilReserve.rect && rectsOverlap(generation.anvilReserve.rect, poolRect(generation.pool))) {
      issues.push({ rule: 'CavesAnvilPoolSeparation', severity: 'error', message: 'Caves anvil reserve must not overlap the pool footprint.' });
    }
  }

  if (level.generation.familyId === 'Hell') {
    const generation = level.generation;
    if (generation.floorArea < generation.areaThreshold) {
      issues.push({ rule: 'HellAreaThreshold', severity: 'error', message: 'Hell mirrored floor area is below the documented threshold.' });
    }
    if (generation.connectedFloorCount !== generation.floorArea) {
      issues.push({ rule: 'HellConnectedFloor', severity: 'error', message: 'Hell mirrored floor mask must be a single connected component.' });
    }
    if (!hellPassabilityIsMirrored(level)) {
      issues.push({ rule: 'HellQuadrantMirror', severity: 'error', message: 'Hell passability must be mirrored across the vertical and horizontal axes.' });
    }
    const minisetIds = new Set(generation.minisetPlacements.map((placement) => placement.id));
    if (!minisetIds.has('L4USTAIRS')) {
      issues.push({ rule: 'HellUpStairs', severity: 'error', message: 'Hell must include up stair miniset metadata.' });
    }
    if (level.levelNumber <= 14 && (!level.stairs.down || !minisetIds.has('L4DSTAIRS'))) {
      issues.push({ rule: 'HellDownStairs', severity: 'error', message: 'Hell levels 13-14 must include down stair miniset metadata.' });
    }
    if (level.levelNumber >= 15 && (level.stairs.down || minisetIds.has('L4DSTAIRS'))) {
      issues.push({ rule: 'HellTerminalDownStairs', severity: 'error', message: 'Hell levels 15-16 must not include down stair metadata.' });
    }
    if (level.levelNumber === 13 && !minisetIds.has('L4TWARP')) {
      issues.push({ rule: 'HellTownWarp', severity: 'error', message: 'Hell level 13 must include town warp miniset metadata.' });
    }
    if (level.levelNumber === 15 && !minisetIds.has('L4PENTA2')) {
      issues.push({ rule: 'HellGate', severity: 'error', message: 'Hell level 15 must include hell gate miniset metadata.' });
    }
    if (level.levelNumber === 16 && generation.protectedQuads.length !== 4) {
      issues.push({ rule: 'HellProtectedQuads', severity: 'error', message: 'Hell level 16 must reserve four protected quad regions.' });
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
      objectCount: level.objects?.length,
      maskTileCount: level.generation.familyId === 'Cathedral' ? level.generation.maskTileCount : level.generation.familyId === 'Caves' || level.generation.familyId === 'Hell' ? level.generation.floorArea : undefined,
      areaThreshold: level.generation.familyId === 'Cathedral' ? level.generation.areaThreshold : level.generation.familyId === 'Caves' ? level.generation.floorAreaThreshold : level.generation.familyId === 'Hell' ? level.generation.areaThreshold : undefined,
      minisetCount: level.generation.familyId === 'Cathedral' || level.generation.familyId === 'Catacombs' || level.generation.familyId === 'Caves' || level.generation.familyId === 'Hell'
        ? level.generation.minisetPlacements.length
        : undefined,
    },
  };
}

function validateObjectPlacements(level: DungeonLevel, reachable: ReadonlySet<string>): DungeonValidationIssue[] {
  const issues: DungeonValidationIssue[] = [];
  const objects = level.objects ?? [];
  const occupied: GridRect[] = [];

  for (const object of objects) {
    const area = objectRect(object);
    if (!rectPassable(level, area, reachable)) {
      issues.push({
        rule: 'ObjectPresetFits',
        severity: 'error',
        message: `Object preset ${object.id} overlaps blocked or unreachable cells.`,
      });
    }
    if (occupied.some((existing) => rectsOverlap(existing, area))) {
      issues.push({
        rule: 'ObjectPresetOverlap',
        severity: 'error',
        message: `Object preset ${object.id} overlaps another object preset.`,
      });
    }
    occupied.push(area);
  }

  return issues;
}

function validateCathedralObjectPresetCoverage(level: DungeonLevel): DungeonValidationIssue[] {
  const issues: DungeonValidationIssue[] = [];
  if (level.generation.familyId !== 'Cathedral' || !level.generation.objectPresetProfile.enabled) {
    return issues;
  }

  const expectedPresetIds = new Set(level.generation.objectPresetProfile.presets.map((preset) => preset.id));
  const countsByPreset = new Map<string, number>();
  for (const object of level.objects ?? []) {
    if (!expectedPresetIds.has(object.presetId)) {
      issues.push({
        rule: 'CathedralObjectPresetCoverage',
        severity: 'error',
        message: `Cathedral object preset is not part of the enabled profile: ${object.presetId}.`,
      });
    }
    countsByPreset.set(object.presetId, (countsByPreset.get(object.presetId) ?? 0) + 1);
  }

  for (const preset of level.generation.objectPresetProfile.presets) {
    const count = countsByPreset.get(preset.id) ?? 0;
    if (count < preset.count.min || count > preset.count.max) {
      issues.push({
        rule: 'CathedralObjectPresetCoverage',
        severity: 'error',
        message: `Cathedral object preset ${preset.id} count must be between ${preset.count.min} and ${preset.count.max}; got ${count}.`,
      });
    }
  }

  return issues;
}

function hellPassabilityIsMirrored(level: DungeonLevel): boolean {
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      const passable = PASSABLE_TILES.has(level.tiles[y][x]);
      const horizontal = PASSABLE_TILES.has(level.tiles[y][level.width - x - 1]);
      const vertical = PASSABLE_TILES.has(level.tiles[level.height - y - 1][x]);
      const diagonal = PASSABLE_TILES.has(level.tiles[level.height - y - 1][level.width - x - 1]);
      if (passable !== horizontal || passable !== vertical || passable !== diagonal) {
        return false;
      }
    }
  }
  return true;
}

export function catacombsRoomWithinClamp(room: GridRect, clampBounds: { min: number; max: number }): boolean {
  return (
    room.x >= clampBounds.min
    && room.y >= clampBounds.min
    && room.x + room.width - 1 <= clampBounds.max
    && room.y + room.height - 1 <= clampBounds.max
  );
}

function poolRect(pool: { position: GridPoint; size: { width: number; height: number } }): GridRect {
  return {
    x: pool.position.x,
    y: pool.position.y,
    width: pool.size.width,
    height: pool.size.height,
  };
}

function objectRect(object: { position: GridPoint; size: { width: number; height: number } }): GridRect {
  return {
    x: object.position.x,
    y: object.position.y,
    width: object.size.width,
    height: object.size.height,
  };
}

export function rectPassable(level: DungeonLevel, area: GridRect, reachable: ReadonlySet<string>): boolean {
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

export function countTiles(level: DungeonLevel, predicate: (tile: TileKind) => boolean): number {
  let count = 0;
  forEachTile(level, (_point, tile) => {
    if (predicate(tile)) {
      count += 1;
    }
  });
  return count;
}

export function forEachTile(level: DungeonLevel, visitor: (point: GridPoint, tile: TileKind) => void): void {
  for (let y = 0; y < level.height; y += 1) {
    for (let x = 0; x < level.width; x += 1) {
      visitor({ x, y }, level.tiles[y][x]);
    }
  }
}
