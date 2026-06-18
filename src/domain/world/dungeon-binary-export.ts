import { checksumJson, hashStringToUint32 } from '../../core/hash';
import { generateDungeon } from './dungeon-generation-engine';
import { createGenerationRequest } from './dungeon-generation-request';
import type { DungeonGenerationRequest, DungeonGenerationResult, DungeonLevel, DungeonType, TileKind } from './dungeon-types';

export const DUNGEON_BINARY_SCHEMA = 'codexblo-dungeon-binary-v1' as const;
export const DUNGEON_BINARY_VERSION = 1;
export const DUNGEON_BINARY_HEADER_SIZE = 32;
export const DUNGEON_BINARY_MAGIC = [0x43, 0x44, 0x42, 0x44] as const;

export const DUNGEON_TILE_BYTE_VALUES = {
  void: 0x00,
  floor: 0x01,
  wall: 0x02,
  door: 0x03,
  stairUp: 0x04,
  stairDown: 0x05,
} as const satisfies Record<TileKind, number>;

export const DUNGEON_TYPE_BYTE_VALUES = {
  Cathedral: 0x01,
  Catacombs: 0x02,
  Caves: 0x03,
  Hell: 0x04,
} as const satisfies Record<DungeonType, number>;

export interface DungeonBinaryHeader {
  magic: 'CDBD';
  version: typeof DUNGEON_BINARY_VERSION;
  headerSize: number;
  dungeonType: DungeonType;
  dungeonTypeByte: number;
  levelNumber: number;
  optionFlags: number;
  formatFlags: number;
  seed: number;
  width: number;
  height: number;
  generatorVersionHash: number;
  tileByteCount: number;
  reserved: number;
  extensionBytes: Uint8Array;
}

export interface DungeonBinaryExport {
  schema: typeof DUNGEON_BINARY_SCHEMA;
  request: DungeonGenerationRequest;
  seed: number;
  checksum: string;
  header: DungeonBinaryHeader;
  tileByteLayout: number[][];
  tileBytes: Uint8Array;
  fileBytes: Uint8Array;
  result: DungeonGenerationResult;
}

const DUNGEON_TYPE_BY_BYTE = Object.fromEntries(
  Object.entries(DUNGEON_TYPE_BYTE_VALUES).map(([type, value]) => [value, type]),
) as Record<number, DungeonType>;

export function createDungeonBinaryExport(input: Partial<DungeonGenerationRequest> = {}): DungeonBinaryExport {
  return createDungeonBinaryExportFromRequest(createGenerationRequest(input));
}

export function createDungeonBinaryExportFromRequest(request: DungeonGenerationRequest): DungeonBinaryExport {
  const result = generateDungeon(request);
  const tileBytes = serializeDungeonTileBytes(result.level);
  const header = createDungeonBinaryHeader(result, tileBytes.length);
  const fileBytes = serializeDungeonBinaryFile(header, tileBytes);

  return {
    schema: DUNGEON_BINARY_SCHEMA,
    request: result.request,
    seed: result.seed,
    checksum: checksumJson(Array.from(fileBytes)),
    header,
    tileByteLayout: serializeDungeonTileByteLayout(result.level),
    tileBytes,
    fileBytes,
    result,
  };
}

export function serializeDungeonTileByteLayout(level: DungeonLevel): number[][] {
  assertDungeonGrid(level);
  return level.tiles.map((row) => row.map(tileByteValue));
}

export function serializeDungeonTileBytes(level: DungeonLevel): Uint8Array {
  const layout = serializeDungeonTileByteLayout(level);
  const bytes = new Uint8Array(level.width * level.height);
  let offset = 0;
  for (const row of layout) {
    for (const byte of row) {
      bytes[offset] = byte;
      offset += 1;
    }
  }
  return bytes;
}

export function serializeDungeonBinaryFile(header: DungeonBinaryHeader, tileBytes: Uint8Array): Uint8Array {
  if (tileBytes.length !== header.tileByteCount) {
    throw new Error(`Dungeon binary tile byte count mismatch: header=${header.tileByteCount}, payload=${tileBytes.length}.`);
  }
  if (header.headerSize < DUNGEON_BINARY_HEADER_SIZE) {
    throw new Error(`Dungeon binary header size must be at least ${DUNGEON_BINARY_HEADER_SIZE} bytes; received ${header.headerSize}.`);
  }
  const extensionCapacity = header.headerSize - DUNGEON_BINARY_HEADER_SIZE;
  if (header.extensionBytes.length > extensionCapacity) {
    throw new Error(`Dungeon binary extension bytes exceed declared header capacity: capacity=${extensionCapacity}, received=${header.extensionBytes.length}.`);
  }

  const bytes = new Uint8Array(header.headerSize + tileBytes.length);
  bytes.set(DUNGEON_BINARY_MAGIC, 0);
  bytes[4] = header.version;
  bytes[5] = header.headerSize;
  bytes[6] = header.dungeonTypeByte;
  bytes[7] = header.levelNumber;
  bytes[8] = header.optionFlags;
  bytes[9] = header.formatFlags;
  writeUint16LE(bytes, 10, 0);
  writeUint32LE(bytes, 12, header.seed);
  writeUint16LE(bytes, 16, header.width);
  writeUint16LE(bytes, 18, header.height);
  writeUint32LE(bytes, 20, header.generatorVersionHash);
  writeUint32LE(bytes, 24, header.tileByteCount);
  writeUint32LE(bytes, 28, header.reserved);
  bytes.set(header.extensionBytes, DUNGEON_BINARY_HEADER_SIZE);
  bytes.set(tileBytes, header.headerSize);
  return bytes;
}

export function decodeDungeonBinaryHeader(bytes: Uint8Array): DungeonBinaryHeader {
  if (bytes.length < DUNGEON_BINARY_HEADER_SIZE) {
    throw new Error(`Dungeon binary header requires ${DUNGEON_BINARY_HEADER_SIZE} bytes; received ${bytes.length}.`);
  }
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== 'CDBD') {
    throw new Error(`Dungeon binary magic mismatch: expected CDBD, received ${JSON.stringify(magic)}.`);
  }
  const version = bytes[4];
  if (version !== DUNGEON_BINARY_VERSION) {
    throw new Error(`Unsupported dungeon binary version: ${version}.`);
  }
  const headerSize = bytes[5];
  if (headerSize < DUNGEON_BINARY_HEADER_SIZE) {
    throw new Error(`Unsupported dungeon binary header size: ${headerSize}.`);
  }
  if (bytes.length < headerSize) {
    throw new Error(`Dungeon binary header requires ${headerSize} bytes; received ${bytes.length}.`);
  }
  const dungeonTypeByte = bytes[6];
  const dungeonType = DUNGEON_TYPE_BY_BYTE[dungeonTypeByte];
  if (!dungeonType) {
    throw new Error(`Unknown dungeon type byte: ${dungeonTypeByte}.`);
  }

  return {
    magic: 'CDBD',
    version,
    headerSize,
    dungeonType,
    dungeonTypeByte,
    levelNumber: bytes[7],
    optionFlags: bytes[8],
    formatFlags: bytes[9],
    seed: readUint32LE(bytes, 12),
    width: readUint16LE(bytes, 16),
    height: readUint16LE(bytes, 18),
    generatorVersionHash: readUint32LE(bytes, 20),
    tileByteCount: readUint32LE(bytes, 24),
    reserved: readUint32LE(bytes, 28),
    extensionBytes: bytes.slice(DUNGEON_BINARY_HEADER_SIZE, headerSize),
  };
}

export function tileByteValue(tile: TileKind): number {
  const byte = (DUNGEON_TILE_BYTE_VALUES as Partial<Record<string, number>>)[tile];
  if (byte === undefined) {
    throw new Error(`Unknown dungeon tile kind: ${String(tile)}.`);
  }
  return byte;
}

function createDungeonBinaryHeader(result: DungeonGenerationResult, tileByteCount: number): DungeonBinaryHeader {
  const level = result.level;
  return {
    magic: 'CDBD',
    version: DUNGEON_BINARY_VERSION,
    headerSize: DUNGEON_BINARY_HEADER_SIZE,
    dungeonType: level.dungeonType,
    dungeonTypeByte: DUNGEON_TYPE_BYTE_VALUES[level.dungeonType],
    levelNumber: assertByteRange(level.levelNumber, 'levelNumber'),
    optionFlags: dungeonOptionFlags(result.request),
    formatFlags: 0,
    seed: result.seed >>> 0,
    width: level.width,
    height: level.height,
    generatorVersionHash: hashStringToUint32(result.request.generatorVersion),
    tileByteCount,
    reserved: 0,
    extensionBytes: new Uint8Array(0),
  };
}

function dungeonOptionFlags(request: DungeonGenerationRequest): number {
  return (request.includeObjects ? 0x01 : 0)
    | (request.includeSpawnZones ? 0x02 : 0)
    | (request.includeQuestLocks ? 0x04 : 0);
}

function assertDungeonGrid(level: DungeonLevel): void {
  if (level.width !== 40 || level.height !== 40) {
    throw new Error(`Dungeon binary export requires a 40x40 grid; received ${level.width}x${level.height}.`);
  }
  if (level.tiles.length !== level.height || level.tiles.some((row) => row.length !== level.width)) {
    throw new Error('Dungeon binary export requires rectangular tile rows matching level dimensions.');
  }
}

function assertByteRange(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`Dungeon binary ${label} must fit in one byte; received ${value}.`);
  }
  return value;
}

function writeUint16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
