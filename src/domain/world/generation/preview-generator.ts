import { rectCenter, rectsOverlap } from '../../../core/grid';
import type { GridPoint, GridRect } from '../../../core/grid';
import { GameRng } from '../../../core/rng';
import type { DungeonGenerationRequest, DungeonLevel, DungeonType, PreviewGenerationMetadata } from '../dungeon-types';
import {
  addWalls,
  BASE_HEIGHT,
  BASE_WIDTH,
  buildZones,
  carveCorridor,
  carveRoom,
  createGrid,
  GRID_CONTRACT,
  rect,
  uniquePoints,
} from './shared';

export function generatePreviewLevel(request: DungeonGenerationRequest, seed: number): Omit<DungeonLevel, 'checksum'> {
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
    familyId: request.dungeonType as Exclude<DungeonType, 'Cathedral' | 'Catacombs'>,
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

export function previewProfileFor(dungeonType: DungeonType): { roomCount: number } {
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

export function placePreviewRooms(rng: GameRng, roomCount: number): GridRect[] {
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
