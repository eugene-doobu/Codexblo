import { describe, expect, it } from 'vitest';
import {
  DUNGEON_RESOURCE_PACK_IDS,
  DUNGEON_GENERATOR_VERSION,
  createGenerationRequest,
  generateDungeon,
  type DungeonType,
} from '../src/domain/world/dungeon-generator';
import { compareDungeonSnapshots, createDungeonComparisonSnapshot } from '../src/domain/world/dungeon-comparison';
import { rectsOverlap, type GridRect } from '../src/core/grid';

const cathedralV2Checksum = '44a45a64';
const catacombsBspChecksum = '919ab6df';

const baseRequest = createGenerationRequest({
  dungeonType: 'Cathedral',
  levelNumber: 1,
  seedMode: 'manual',
  seedText: 'cathedral-test-seed',
});
const catacombsRequest = createGenerationRequest({
  dungeonType: 'Catacombs',
  levelNumber: 5,
  seedMode: 'manual',
  seedText: 'catacombs-test-seed',
});

describe('Cathedral dungeon generation', () => {
  it('is deterministic for the same manual seed', () => {
    const first = generateDungeon(baseRequest);
    const second = generateDungeon(baseRequest);

    expect(first.seed).toBe(second.seed);
    expect(first.level.checksum).toBe(second.level.checksum);
    expect(first.level.tiles).toEqual(second.level.tiles);
  });

  it('pins the Cathedral v2 fixture checksum', () => {
    const result = generateDungeon(baseRequest);

    expect(DUNGEON_GENERATOR_VERSION).toBe('cathedral-lab-v2');
    expect(result.level.checksum).toBe(cathedralV2Checksum);
  });

  it('changes layout checksum for a different seed', () => {
    const first = generateDungeon(baseRequest);
    const second = generateDungeon(createGenerationRequest({ ...baseRequest, seedText: 'cathedral-other-seed' }));

    expect(first.level.checksum).not.toBe(second.level.checksum);
  });

  it('passes reachability and resource validation', () => {
    const result = generateDungeon(baseRequest);

    expect(result.validation.ok).toBe(true);
    expect(result.resourceBindings.ok).toBe(true);
    expect(result.graph.unreachablePassableTiles).toHaveLength(0);
    expect(result.validation.metrics.roomCount).toBeGreaterThanOrEqual(2);
  });

  it('uses the documented Cathedral grid, area, chamber, and miniset contracts', () => {
    const result = generateDungeon(baseRequest);
    const generation = result.level.generation;

    expect(result.level.width).toBe(40);
    expect(result.level.height).toBe(40);
    expect(result.level.gridContract.expandedGrid).toEqual({ width: 112, height: 112, padding: 16, scale: 2 });
    expect(generation.familyId).toBe('Cathedral');
    if (generation.familyId !== 'Cathedral') {
      throw new Error('Expected Cathedral metadata.');
    }
    expect(generation.generatorKind).toBe('chamber-recursive');
    expect(generation.maskTileCount).toBeGreaterThanOrEqual(generation.areaThreshold);
    expect(generation.chamberInteriors.length).toBeGreaterThanOrEqual(1);
    for (const chamber of generation.chamberInteriors) {
      expect(chamber.width).toBe(10);
      expect(chamber.height).toBe(10);
    }
    expect(generation.minisetPlacements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'STAIRSUP', size: { width: 4, height: 4 }, tries: 1600 }),
        expect.objectContaining({ id: 'STAIRSDOWN', size: { width: 4, height: 3 }, tries: 1600 }),
      ]),
    );
    const lampCount = generation.minisetPlacements.filter((placement) => placement.id === 'LAMPS').length;
    expect(lampCount).toBeGreaterThanOrEqual(5);
    expect(lampCount).toBeLessThanOrEqual(9);
  });

  it('keeps recursive Cathedral side rooms from overlapping the existing mask', () => {
    const result = generateDungeon(createGenerationRequest({ dungeonType: 'Cathedral', levelNumber: 1, seedText: '0' }));
    const generation = result.level.generation;

    expect(generation.familyId).toBe('Cathedral');
    if (generation.familyId !== 'Cathedral') {
      throw new Error('Expected Cathedral metadata.');
    }

    const occupied: GridRect[] = [...generation.chamberInteriors, generation.hallMask];
    const overlaps: string[] = [];
    generation.sideRooms.forEach((sideRoom, index) => {
      occupied.forEach((existing, existingIndex) => {
        if (rectsOverlap(sideRoom, existing)) {
          overlaps.push(`side-${index}-overlaps-${existingIndex}`);
        }
      });
      occupied.push(sideRoom);
    });

    expect(overlaps).toEqual([]);
  });

  it('accepts numeric manual seeds directly for external snapshot comparison', () => {
    const result = generateDungeon(createGenerationRequest({ dungeonType: 'Cathedral', levelNumber: 1, seedText: '123456789' }));

    expect(result.seed).toBe(123456789);
    expect(result.validation.ok).toBe(true);
  });

  it('creates comparable grid snapshots and reports cell-level differences', () => {
    const result = generateDungeon(baseRequest);
    const snapshot = createDungeonComparisonSnapshot(result);
    const copy = { width: snapshot.grid.width, height: snapshot.grid.height, rows: [...snapshot.tileRows], checksum: snapshot.checksum };
    const changedRows = [...snapshot.tileRows];
    changedRows[0] = `${changedRows[0].slice(0, -1)}x`;

    expect(compareDungeonSnapshots(snapshot, copy).identical).toBe(true);
    const comparison = compareDungeonSnapshots(snapshot, { width: snapshot.grid.width, height: snapshot.grid.height, rows: changedRows });
    expect(comparison.identical).toBe(false);
    expect(comparison.mismatchCount).toBe(1);
    expect(comparison.mismatches[0]).toEqual({ x: snapshot.grid.width - 1, y: 0, candidate: snapshot.tileRows[0][snapshot.grid.width - 1], reference: 'x' });

    const wider = {
      width: snapshot.grid.width + 1,
      height: snapshot.grid.height,
      rows: snapshot.tileRows.map((row) => `${row}x`),
    };
    const dimensionComparison = compareDungeonSnapshots(snapshot, wider);
    expect(dimensionComparison.identical).toBe(false);
    expect(dimensionComparison.dimensionsMatch).toBe(false);
    expect(dimensionComparison.mismatchCount).toBe(snapshot.grid.height);
  });

  it('supports random seed requests as first-class lab input', () => {
    const result = generateDungeon(createGenerationRequest({ dungeonType: 'Cathedral', seedMode: 'random', seedText: '1781600000000' }));

    expect(result.request.seedMode).toBe('random');
    expect(result.validation.ok).toBe(true);
  });

  it.each(['Cathedral', 'Catacombs', 'Caves', 'Hell'] satisfies DungeonType[])(
    'generates a valid seeded %s level',
    (dungeonType) => {
      const result = generateDungeon(createGenerationRequest({ dungeonType, seedMode: 'manual', seedText: `${dungeonType}-seeded-preview` }));

      expect(result.level.dungeonType).toBe(dungeonType);
      expect(result.validation.ok).toBe(true);
      expect(result.graph.unreachablePassableTiles).toHaveLength(0);
    },
  );
});

describe('Catacombs dungeon generation', () => {
  it('is deterministic and pins the Catacombs BSP fixture checksum', () => {
    const first = generateDungeon(catacombsRequest);
    const second = generateDungeon(catacombsRequest);

    expect(first.seed).toBe(second.seed);
    expect(first.level.checksum).toBe(catacombsBspChecksum);
    expect(second.level.checksum).toBe(catacombsBspChecksum);
    expect(first.level.tiles).toEqual(second.level.tiles);
  });

  it('uses the documented Catacombs grid, BSP, room, hall, theme, and miniset contracts', () => {
    const result = generateDungeon(catacombsRequest);
    const generation = result.level.generation;

    expect(result.request.resourcePackId).toBe(DUNGEON_RESOURCE_PACK_IDS.Catacombs);
    expect(result.validation.ok).toBe(true);
    expect(result.level.width).toBe(40);
    expect(result.level.height).toBe(40);
    expect(result.level.gridContract.expandedGrid).toEqual({ width: 112, height: 112, padding: 16, scale: 2 });
    expect(generation.familyId).toBe('Catacombs');
    if (generation.familyId !== 'Catacombs') {
      throw new Error('Expected Catacombs metadata.');
    }

    expect(generation.generatorKind).toBe('bsp-rooms');
    expect(generation.roomNodeCapacity).toBe(80);
    expect(generation.roomNodeArrayCapacity).toBe(81);
    expect(generation.initialPartition).toEqual({ topLeft: { x: 2, y: 2 }, bottomRight: { x: 39, y: 39 } });
    expect(generation.randomRoomSize).toEqual({ min: 4, maxExclusive: 10, effectiveMaxInclusiveWhenAreaAtLeastTen: 9 });
    expect(generation.clampBounds).toEqual({ min: 1, max: 38 });
    expect(generation.recursionStandoff).toEqual({ width: 2, height: 2 });
    expect(generation.hallExtensionChance).toEqual({ minusPercent: 50, plusPercent: 50 });
    expect(generation.hallSteering).toEqual({
      horizontalMultiplier: 2,
      horizontalMaxPercent: 30,
      verticalMultiplier: 5,
      verticalMaxPercent: 80,
    });
    expect(generation.themeRoom).toEqual({ minSize: 6, maxSize: 10, floorTile: 3, frequency: 0, randomizeSize: false });
    expect(generation.rooms.length).toBeGreaterThan(10);
    expect(generation.rooms.length).toBeLessThanOrEqual(generation.roomNodeCapacity);
    for (const room of generation.rooms) {
      expect(room.x).toBeGreaterThanOrEqual(generation.clampBounds.min);
      expect(room.y).toBeGreaterThanOrEqual(generation.clampBounds.min);
      expect(room.x + room.width - 1).toBeLessThanOrEqual(generation.clampBounds.max);
      expect(room.y + room.height - 1).toBeLessThanOrEqual(generation.clampBounds.max);
    }
    expect(generation.halls.length).toBe(generation.rooms.length - 1);
    expect(generation.minisetPlacements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'USTAIRS', role: 'stair', size: { width: 4, height: 4 }, tries: 1600 }),
        expect.objectContaining({ id: 'DSTAIRS', role: 'stair', size: { width: 4, height: 4 }, tries: 1600 }),
        expect.objectContaining({ id: 'WARPSTAIRS', role: 'portal', size: { width: 4, height: 4 }, tries: 1600 }),
      ]),
    );
  });

  it('keeps Catacombs rooms, stairs, zones, and all passable tiles connected', () => {
    const result = generateDungeon(catacombsRequest);

    expect(result.validation.ok).toBe(true);
    expect(result.resourceBindings.ok).toBe(true);
    expect(result.graph.unreachablePassableTiles).toHaveLength(0);
    expect(result.validation.metrics.reachableTileCount).toBe(result.validation.metrics.passableTileCount);
    expect(result.validation.metrics.roomCount).toBe(result.level.generation.familyId === 'Catacombs' ? result.level.generation.rooms.length : 0);
    expect(result.validation.metrics.zoneCount).toBe(3);
  });

  it.each([
    [5, 'catacombs-l5-blood', 'BloodRoom', { width: 14, height: 20 }],
    [6, 'catacombs-l6-bone', 'BoneRoom', { width: 10, height: 10 }],
    [7, 'catacombs-l7-blind', 'BlindRoom', { width: 15, height: 15 }],
  ] as const)('supports level %s Catacombs forced-room fixture metadata', (levelNumber, seedText, id, size) => {
    const result = generateDungeon(createGenerationRequest({
      dungeonType: 'Catacombs',
      levelNumber,
      seedMode: 'fixture',
      seedText,
    }));
    const generation = result.level.generation;

    expect(result.validation.ok).toBe(true);
    expect(generation.familyId).toBe('Catacombs');
    if (generation.familyId !== 'Catacombs') {
      throw new Error('Expected Catacombs metadata.');
    }
    expect(generation.forcedRoomProfile).toEqual(expect.objectContaining({
      id,
      levelNumber,
      size,
      enabled: true,
      actualRoom: expect.objectContaining(size),
    }));
  });

  it('accepts numeric manual seeds directly for Catacombs snapshot comparison', () => {
    const result = generateDungeon(createGenerationRequest({ dungeonType: 'Catacombs', levelNumber: 5, seedText: '123456789' }));

    expect(result.seed).toBe(123456789);
    expect(result.level.checksum).toBe('2c5b3a7e');
    expect(result.validation.ok).toBe(true);
  });

  it('creates comparable Catacombs grid snapshots with generation metadata', () => {
    const result = generateDungeon(catacombsRequest);
    const generation = result.level.generation;
    if (generation.familyId !== 'Catacombs') {
      throw new Error('Expected Catacombs metadata.');
    }

    const snapshot = createDungeonComparisonSnapshot(result);
    expect(snapshot.generation).toEqual(expect.objectContaining({
      familyId: 'Catacombs',
      generatorKind: 'bsp-rooms',
      roomCount: generation.rooms.length,
      minisetCount: generation.minisetPlacements.length,
      roomNodeCapacity: generation.roomNodeCapacity,
    }));
    expect(compareDungeonSnapshots(snapshot, {
      width: snapshot.grid.width,
      height: snapshot.grid.height,
      rows: snapshot.tileRows,
      checksum: snapshot.checksum,
    }).identical).toBe(true);
  });
});
