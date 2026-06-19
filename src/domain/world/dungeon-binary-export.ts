import { checksumJson, hashStringToUint32 } from '../../core/hash';
import { generateDevilutionxCathedralRawLevel } from './devilutionx-cathedral-raw';
import { generateDungeon } from './dungeon-generation-engine';
import { createGenerationRequest } from './dungeon-generation-request';
import type { DungeonGenerationRequest, DungeonGenerationResult, DungeonLevel, DungeonType, TileKind } from './dungeon-types';

export const DUNGEON_BINARY_SCHEMA = 'codexblo-dungeon-binary-v1' as const;
export const DUNGEON_BINARY_VERSION = 1;
export const DUNGEON_BINARY_HEADER_SIZE = 32;
export const DUNGEON_BINARY_MAGIC = [0x43, 0x44, 0x42, 0x44] as const;

export const DUNGEON_BINARY_FORMAT_FLAGS = {
  SEMANTIC_TILE_KIND: 0x00,
  DEVILUTIONX_RAW_DUNGEON: 0x01,
} as const;

export const DUNGEON_BINARY_TILE_BYTE_FORMATS = {
  SEMANTIC_TILE_KIND: 'codexblo-semantic-tile-kind',
  DEVILUTIONX_RAW_DUNGEON: 'devilutionx-dungeon-uint8',
} as const;

export type DungeonBinaryExportFormat = 'semantic' | 'devilutionx';

export interface DungeonBinaryExportOptions {
  format?: DungeonBinaryExportFormat;
}

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

export interface DecodedDungeonBinaryFile {
  schema: typeof DUNGEON_BINARY_SCHEMA;
  header: DungeonBinaryHeader;
  tileBytes: Uint8Array;
  tileByteFormat: DungeonBinaryTileByteFormat;
  checksum: string;
}

export interface DungeonBinaryByteMismatch {
  offset: number;
  x: number;
  y: number;
  candidate: number;
  reference: number;
}

export interface DungeonBinaryByteComparison {
  comparable: boolean;
  identical: boolean;
  reason?: string;
  metadataMatch: boolean;
  formatMatch: boolean;
  dimensionsMatch: boolean;
  seedMatch: boolean;
  tileByteCountMatch: boolean;
  mismatchCount: number;
  mismatches: DungeonBinaryByteMismatch[];
  candidate: DungeonBinaryComparisonSummary;
  reference: DungeonBinaryComparisonSummary;
}

export interface DungeonBinaryComparisonSummary {
  dungeonType: DungeonType;
  levelNumber: number;
  seed: number;
  width: number;
  height: number;
  tileByteCount: number;
  formatFlags: number;
  tileByteFormat: DungeonBinaryTileByteFormat;
  checksum: string;
}

export type DungeonBinaryTileByteFormat = typeof DUNGEON_BINARY_TILE_BYTE_FORMATS[keyof typeof DUNGEON_BINARY_TILE_BYTE_FORMATS];

const DUNGEON_TYPE_BY_BYTE = Object.fromEntries(
  Object.entries(DUNGEON_TYPE_BYTE_VALUES).map(([type, value]) => [value, type]),
) as Record<number, DungeonType>;

export function createDungeonBinaryExport(
  input: Partial<DungeonGenerationRequest> = {},
  options: DungeonBinaryExportOptions = {},
): DungeonBinaryExport {
  return createDungeonBinaryExportFromRequest(createGenerationRequest(input), options);
}

export function createDungeonBinaryExportFromRequest(
  request: DungeonGenerationRequest,
  options: DungeonBinaryExportOptions = {},
): DungeonBinaryExport {
  const result = generateDungeon(request);
  const format = options.format ?? 'semantic';
  const rawResult = format === 'devilutionx' ? generateDevilutionxRawDungeonTileBytes(result.request, result.seed) : undefined;
  const tileBytes = rawResult?.tileBytes ?? serializeDungeonTileBytes(result.level);
  const header = createDungeonBinaryHeader(result, tileBytes.length, format);
  const fileBytes = serializeDungeonBinaryFile(header, tileBytes);

  return {
    schema: DUNGEON_BINARY_SCHEMA,
    request: result.request,
    seed: result.seed,
    checksum: checksumJson(Array.from(fileBytes)),
    header,
    tileByteLayout: rawResult?.tileByteLayout ?? serializeDungeonTileByteLayout(result.level),
    tileBytes,
    fileBytes,
    result,
  };
}

export function decodeDungeonBinaryFile(bytes: Uint8Array): DecodedDungeonBinaryFile {
  const header = decodeDungeonBinaryHeader(bytes);
  const expectedLength = header.headerSize + header.tileByteCount;
  if (bytes.length !== expectedLength) {
    throw new Error(`Dungeon binary file length mismatch: expected ${expectedLength}, received ${bytes.length}.`);
  }
  const tileBytes = bytes.slice(header.headerSize);
  return {
    schema: DUNGEON_BINARY_SCHEMA,
    header,
    tileBytes,
    tileByteFormat: tileByteFormatForHeader(header),
    checksum: checksumJson(Array.from(bytes)),
  };
}

export function compareDungeonBinaryTileBytes(
  candidate: DungeonBinaryExport | DecodedDungeonBinaryFile,
  reference: DungeonBinaryExport | DecodedDungeonBinaryFile,
  maxMismatches = 200,
): DungeonBinaryByteComparison {
  const candidateSummary = summarizeBinary(candidate);
  const referenceSummary = summarizeBinary(reference);
  const dimensionsMatch = candidateSummary.width === referenceSummary.width && candidateSummary.height === referenceSummary.height;
  const seedMatch = candidateSummary.seed === referenceSummary.seed;
  const tileByteCountMatch = candidateSummary.tileByteCount === referenceSummary.tileByteCount;
  const metadataMatch = candidateSummary.dungeonType === referenceSummary.dungeonType
    && candidateSummary.levelNumber === referenceSummary.levelNumber
    && seedMatch
    && dimensionsMatch
    && tileByteCountMatch;
  const formatMatch = candidateSummary.formatFlags === referenceSummary.formatFlags;

  if (!metadataMatch) {
    return {
      comparable: false,
      identical: false,
      reason: 'Dungeon binary metadata differs; byte parity would be ambiguous.',
      metadataMatch,
      formatMatch,
      dimensionsMatch,
      seedMatch,
      tileByteCountMatch,
      mismatchCount: 0,
      mismatches: [],
      candidate: candidateSummary,
      reference: referenceSummary,
    };
  }

  if (!formatMatch) {
    return {
      comparable: false,
      identical: false,
      reason: `Dungeon binary payload formats differ: candidate=${candidateSummary.tileByteFormat}, reference=${referenceSummary.tileByteFormat}.`,
      metadataMatch,
      formatMatch,
      dimensionsMatch,
      seedMatch,
      tileByteCountMatch,
      mismatchCount: 0,
      mismatches: [],
      candidate: candidateSummary,
      reference: referenceSummary,
    };
  }

  const mismatches: DungeonBinaryByteMismatch[] = [];
  let mismatchCount = 0;
  for (let offset = 0; offset < candidate.tileBytes.length; offset += 1) {
    if (candidate.tileBytes[offset] !== reference.tileBytes[offset]) {
      mismatchCount += 1;
      if (mismatches.length < maxMismatches) {
        mismatches.push({
          offset,
          x: offset % candidateSummary.width,
          y: Math.floor(offset / candidateSummary.width),
          candidate: candidate.tileBytes[offset],
          reference: reference.tileBytes[offset],
        });
      }
    }
  }

  return {
    comparable: true,
    identical: mismatchCount === 0,
    metadataMatch,
    formatMatch,
    dimensionsMatch,
    seedMatch,
    tileByteCountMatch,
    mismatchCount,
    mismatches,
    candidate: candidateSummary,
    reference: referenceSummary,
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

function createDungeonBinaryHeader(
  result: DungeonGenerationResult,
  tileByteCount: number,
  format: DungeonBinaryExportFormat,
): DungeonBinaryHeader {
  const level = result.level;
  return {
    magic: 'CDBD',
    version: DUNGEON_BINARY_VERSION,
    headerSize: DUNGEON_BINARY_HEADER_SIZE,
    dungeonType: level.dungeonType,
    dungeonTypeByte: DUNGEON_TYPE_BYTE_VALUES[level.dungeonType],
    levelNumber: assertByteRange(level.levelNumber, 'levelNumber'),
    optionFlags: dungeonOptionFlags(result.request),
    formatFlags: format === 'devilutionx'
      ? DUNGEON_BINARY_FORMAT_FLAGS.DEVILUTIONX_RAW_DUNGEON
      : DUNGEON_BINARY_FORMAT_FLAGS.SEMANTIC_TILE_KIND,
    seed: result.seed >>> 0,
    width: level.width,
    height: level.height,
    generatorVersionHash: hashStringToUint32(result.request.generatorVersion),
    tileByteCount,
    reserved: 0,
    extensionBytes: new Uint8Array(0),
  };
}

function generateDevilutionxRawDungeonTileBytes(
  request: DungeonGenerationRequest,
  seed: number,
): Pick<DungeonBinaryExport, 'tileBytes' | 'tileByteLayout'> {
  if (request.dungeonType !== 'Cathedral') {
    throw new Error(`DevilutionX raw dungeon export currently supports Cathedral only; received ${request.dungeonType}.`);
  }
  if (request.levelNumber !== 1 && request.levelNumber !== 2 && request.levelNumber !== 3 && request.levelNumber !== 4) {
    throw new Error(`DevilutionX Cathedral raw export requires level 1-4; received ${request.levelNumber}.`);
  }

  const generated = generateDevilutionxCathedralRawLevel(seed, {
    levelNumber: request.levelNumber,
    poisonedWaterAvailable: request.includeQuestLocks && request.levelNumber === 2,
    lightBannerAvailable: false,
  });
  return {
    tileBytes: generated.tileBytes,
    tileByteLayout: generated.tileLayout,
  };
}

export function tileByteFormatForHeader(header: DungeonBinaryHeader): DungeonBinaryTileByteFormat {
  switch (header.formatFlags) {
    case DUNGEON_BINARY_FORMAT_FLAGS.SEMANTIC_TILE_KIND:
      return DUNGEON_BINARY_TILE_BYTE_FORMATS.SEMANTIC_TILE_KIND;
    case DUNGEON_BINARY_FORMAT_FLAGS.DEVILUTIONX_RAW_DUNGEON:
      return DUNGEON_BINARY_TILE_BYTE_FORMATS.DEVILUTIONX_RAW_DUNGEON;
    default:
      throw new Error(`Unsupported dungeon binary format flags: ${header.formatFlags}.`);
  }
}

function summarizeBinary(binary: DungeonBinaryExport | DecodedDungeonBinaryFile): DungeonBinaryComparisonSummary {
  return {
    dungeonType: binary.header.dungeonType,
    levelNumber: binary.header.levelNumber,
    seed: binary.header.seed,
    width: binary.header.width,
    height: binary.header.height,
    tileByteCount: binary.header.tileByteCount,
    formatFlags: binary.header.formatFlags,
    tileByteFormat: tileByteFormatForHeader(binary.header),
    checksum: binary.checksum,
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
