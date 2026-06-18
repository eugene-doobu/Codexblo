import { describe, expect, it } from 'vitest';
import {
  createGenerationRequest,
  generateDungeon,
  type DungeonType,
} from '../src/domain/world/dungeon-generator';
import {
  DUNGEON_TILE_BYTE_VALUES,
  createDungeonBinaryExport,
  decodeDungeonBinaryHeader,
  serializeDungeonBinaryFile,
  serializeDungeonTileBytes,
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
