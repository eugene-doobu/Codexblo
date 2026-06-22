import { describe, expect, it } from 'vitest';
import { generateDevilutionxCathedralRawLevel } from '../src/domain/world/devilutionx-cathedral-raw';
import {
  createGenerationRequest,
  generateDungeon,
  type DungeonType,
} from '../src/domain/world/dungeon-generator';
import {
  DUNGEON_BINARY_FORMAT_FLAGS,
  DUNGEON_BINARY_TILE_BYTE_FORMATS,
  DUNGEON_TILE_BYTE_VALUES,
  compareDungeonBinaryTileBytes,
  createDungeonBinaryExport,
  decodeDungeonBinaryFile,
  decodeDungeonBinaryHeader,
  serializeDungeonBinaryFile,
  serializeDungeonTileBytes,
  tileByteFormatForHeader,
  tileByteValue,
} from '../src/domain/world/dungeon-binary-export';

describe('Dungeon binary export', () => {
  it('serializes the generated 40x40 tile grid as stable row-major bytes', () => {
    const request = createGenerationRequest({ dungeonType: 'Cathedral', levelNumber: 1, seedText: '123456789' });
    const result = generateDungeon(request);
    const bytes = serializeDungeonTileBytes(result.level);

    expect(bytes).toHaveLength(1600);
    expect(Array.from(bytes.slice(0, result.level.width))).toEqual(
      result.level.tiles[0].map((tile) => DUNGEON_TILE_BYTE_VALUES[tile]),
    );
    expect(bytes[0]).toBe(DUNGEON_TILE_BYTE_VALUES[result.level.tiles[0][0]]);
    expect(bytes[41]).toBe(DUNGEON_TILE_BYTE_VALUES[result.level.tiles[1][1]]);
  });

  it('exports every Cathedral logical tile as its documented semantic byte', () => {
    const exported = createDungeonBinaryExport({ dungeonType: 'Cathedral', levelNumber: 1, seedText: '123456789' });
    const expectedBytes = exported.result.level.tiles.flatMap((row) => row.map((tile) => DUNGEON_TILE_BYTE_VALUES[tile]));

    expect(Array.from(exported.tileBytes)).toEqual(expectedBytes);
    expect(exported.tileByteLayout.flat()).toEqual(expectedBytes);
  });

  it('keeps Cathedral render-only inner structures out of semantic tile bytes', () => {
    const exported = createDungeonBinaryExport({ dungeonType: 'Cathedral', levelNumber: 1, seedText: 'cathedral-test-seed' });
    const { level } = exported.result;
    const { renderTiles, generation } = level;

    if (!renderTiles || generation.familyId !== 'Cathedral') {
      throw new Error('Expected Cathedral render tile metadata.');
    }

    const logicalWallStructures = new Set([
      'cathedralVerticalWall',
      'cathedralHorizontalWall',
      'cathedralCornerWall',
      'cathedralDiagonalWall',
      'cathedralPillar',
    ]);
    const renderOnlyStructures = new Set([
      'cathedralDividingWall',
      'cathedralVerticalArch',
      'cathedralHorizontalArch',
    ]);
    let assertedLogicalWallCount = 0;
    let assertedRenderOnlyCount = 0;

    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const renderTile = renderTiles[y][x];
        const offset = y * level.width + x;

        if (logicalWallStructures.has(renderTile)) {
          expect(level.tiles[y][x]).toBe('wall');
          expect(exported.tileBytes[offset]).toBe(DUNGEON_TILE_BYTE_VALUES.wall);
          assertedLogicalWallCount += 1;
        }

        if (renderOnlyStructures.has(renderTile)) {
          expect(level.tiles[y][x]).toBe('floor');
          expect(exported.tileBytes[offset]).toBe(DUNGEON_TILE_BYTE_VALUES.floor);
          assertedRenderOnlyCount += 1;
        }
      }
    }

    expect(assertedLogicalWallCount).toBeGreaterThan(0);
    expect(assertedRenderOnlyCount).toBeGreaterThan(0);
  });

  it('wraps tile bytes in a deterministic binary header', () => {
    const exported = createDungeonBinaryExport({ dungeonType: 'Catacombs', levelNumber: 5, seedText: '123456789' });
    const decoded = decodeDungeonBinaryHeader(exported.fileBytes);

    expect(exported.tileBytes).toHaveLength(1600);
    expect(exported.fileBytes).toHaveLength(exported.header.headerSize + exported.tileBytes.length);
    expect(decoded).toEqual(exported.header);
    expect(decoded).toEqual(expect.objectContaining({
      magic: 'CDBD',
      version: 1,
      headerSize: 32,
      dungeonType: 'Catacombs',
      dungeonTypeByte: 2,
      levelNumber: 5,
      optionFlags: 0x07,
      formatFlags: 0,
      seed: 123456789,
      width: 40,
      height: 40,
      tileByteCount: 1600,
      reserved: 0,
    }));
    expect(Array.from(exported.fileBytes.slice(exported.header.headerSize))).toEqual(Array.from(exported.tileBytes));
  });

  it('decodes complete binary files with semantic payload format metadata', () => {
    const exported = createDungeonBinaryExport({ dungeonType: 'Cathedral', levelNumber: 1, seedText: '123456789' });
    const decoded = decodeDungeonBinaryFile(exported.fileBytes);

    expect(decoded.header).toEqual(exported.header);
    expect(decoded.tileByteFormat).toBe(DUNGEON_BINARY_TILE_BYTE_FORMATS.SEMANTIC_TILE_KIND);
    expect(Array.from(decoded.tileBytes)).toEqual(Array.from(exported.tileBytes));
    expect(decoded.checksum).toBe(exported.checksum);
  });

  it('compares identical semantic binary payloads byte-for-byte', () => {
    const exported = createDungeonBinaryExport({ dungeonType: 'Hell', levelNumber: 13, seedText: '123456789' });
    const decoded = decodeDungeonBinaryFile(exported.fileBytes);
    const comparison = compareDungeonBinaryTileBytes(exported, decoded);

    expect(comparison.comparable).toBe(true);
    expect(comparison.identical).toBe(true);
    expect(comparison.metadataMatch).toBe(true);
    expect(comparison.formatMatch).toBe(true);
    expect(comparison.mismatchCount).toBe(0);
  });

  it('refuses to claim byte parity between semantic bytes and DevilutionX raw dungeon bytes', () => {
    const exported = createDungeonBinaryExport({ dungeonType: 'Cathedral', levelNumber: 1, seedText: '123456789' });
    const rawReference = {
      schema: exported.schema,
      header: {
        ...exported.header,
        formatFlags: DUNGEON_BINARY_FORMAT_FLAGS.DEVILUTIONX_RAW_DUNGEON,
      },
      tileBytes: Uint8Array.from(exported.tileBytes),
      tileByteFormat: DUNGEON_BINARY_TILE_BYTE_FORMATS.DEVILUTIONX_RAW_DUNGEON,
      checksum: 'fake-devilutionx-raw',
    };
    const comparison = compareDungeonBinaryTileBytes(exported, rawReference);

    expect(comparison.comparable).toBe(false);
    expect(comparison.identical).toBe(false);
    expect(comparison.metadataMatch).toBe(true);
    expect(comparison.formatMatch).toBe(false);
    expect(comparison.reason).toContain('payload formats differ');
  });

  it('exports DevilutionX raw Cathedral tile bytes with matching payload metadata', () => {
    const exported = createDungeonBinaryExport({
      dungeonType: 'Cathedral',
      levelNumber: 1,
      seedText: '2588',
    }, { format: 'devilutionx' });
    const reference = generateDevilutionxCathedralRawLevel(2588, {
      levelNumber: 1,
      poisonedWaterAvailable: false,
      lightBannerAvailable: false,
    }).tileBytes;

    expect(exported.header.formatFlags).toBe(DUNGEON_BINARY_FORMAT_FLAGS.DEVILUTIONX_RAW_DUNGEON);
    expect(tileByteFormatForHeader(exported.header)).toBe(DUNGEON_BINARY_TILE_BYTE_FORMATS.DEVILUTIONX_RAW_DUNGEON);
    expect(exported.tileBytes).toHaveLength(1600);
    expect(Array.from(exported.tileBytes)).toEqual(Array.from(reference));
    expect(exported.tileByteLayout[0].slice(0, 20)).toEqual(Array.from(reference.slice(0, 20)));
  });

  it('does not silently emit raw DevilutionX bytes for unsupported dungeon families', () => {
    expect(() => createDungeonBinaryExport({
      dungeonType: 'Catacombs',
      levelNumber: 5,
      seedText: '123456789',
    }, { format: 'devilutionx' })).toThrow('supports Cathedral only');
  });

  it('preserves future header extension bytes when decoding', () => {
    const exported = createDungeonBinaryExport({ dungeonType: 'Cathedral', levelNumber: 1, seedText: '123456789' });
    const extensionBytes = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);
    const fileBytes = serializeDungeonBinaryFile({
      ...exported.header,
      headerSize: exported.header.headerSize + extensionBytes.length,
      extensionBytes,
    }, exported.tileBytes);

    expect(decodeDungeonBinaryHeader(fileBytes).extensionBytes).toEqual(extensionBytes);
    expect(Array.from(fileBytes.slice(exported.header.headerSize + extensionBytes.length))).toEqual(Array.from(exported.tileBytes));
  });

  it('rejects extension bytes that exceed the declared header capacity', () => {
    const exported = createDungeonBinaryExport({ dungeonType: 'Cathedral', levelNumber: 1, seedText: '123456789' });

    expect(() => serializeDungeonBinaryFile({
      ...exported.header,
      extensionBytes: new Uint8Array([0xaa]),
    }, exported.tileBytes)).toThrow('Dungeon binary extension bytes exceed declared header capacity');
  });

  it('keeps identical requests byte-for-byte deterministic', () => {
    const request = { dungeonType: 'Caves' as const, levelNumber: 9, seedText: 'caves-binary-export' };
    const first = createDungeonBinaryExport(request);
    const second = createDungeonBinaryExport(request);

    expect(first.seed).toBe(second.seed);
    expect(first.checksum).toBe(second.checksum);
    expect(Array.from(first.fileBytes)).toEqual(Array.from(second.fileBytes));
    expect(first.tileByteLayout).toEqual(second.tileByteLayout);
  });

  it('changes exported bytes when the seed changes', () => {
    const first = createDungeonBinaryExport({ dungeonType: 'Hell', levelNumber: 13, seedText: 'hell-binary-a' });
    const second = createDungeonBinaryExport({ dungeonType: 'Hell', levelNumber: 13, seedText: 'hell-binary-b' });

    expect(first.seed).not.toBe(second.seed);
    expect(first.checksum).not.toBe(second.checksum);
    expect(Array.from(first.tileBytes)).not.toEqual(Array.from(second.tileBytes));
  });

  it('fails explicitly for unknown runtime tile values', () => {
    expect(() => tileByteValue('lava' as never)).toThrow('Unknown dungeon tile kind: lava.');
  });

  it.each([
    ['Cathedral', 1],
    ['Catacombs', 5],
    ['Caves', 9],
    ['Hell', 13],
  ] satisfies [DungeonType, number][])('exports a valid %s binary payload', (dungeonType, levelNumber) => {
    const exported = createDungeonBinaryExport({ dungeonType, levelNumber, seedText: `${dungeonType}-binary-export` });

    expect(exported.result.validation.ok).toBe(true);
    expect(exported.header.dungeonType).toBe(dungeonType);
    expect(exported.header.levelNumber).toBe(levelNumber);
    expect(exported.header.width).toBe(40);
    expect(exported.header.height).toBe(40);
    expect(exported.header.tileByteCount).toBe(1600);
  });
});
