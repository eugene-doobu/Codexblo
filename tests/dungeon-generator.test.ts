import { describe, expect, it } from 'vitest';
import {
  DUNGEON_GENERATOR_VERSION,
  createGenerationRequest,
  generateDungeon,
  type DungeonType,
} from '../src/domain/world/dungeon-generator';
import { compareDungeonSnapshots, createDungeonComparisonSnapshot } from '../src/domain/world/dungeon-comparison';
import { rectsOverlap, type GridRect } from '../src/core/grid';

const cathedralV2Checksum = '44a45a64';

const baseRequest = createGenerationRequest({
  dungeonType: 'Cathedral',
  levelNumber: 1,
  seedMode: 'manual',
  seedText: 'cathedral-test-seed',
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
    'generates a valid seeded %s preview',
    (dungeonType) => {
      const result = generateDungeon(createGenerationRequest({ dungeonType, seedMode: 'manual', seedText: `${dungeonType}-seeded-preview` }));

      expect(result.level.dungeonType).toBe(dungeonType);
      expect(result.validation.ok).toBe(true);
      expect(result.graph.unreachablePassableTiles).toHaveLength(0);
    },
  );
});
