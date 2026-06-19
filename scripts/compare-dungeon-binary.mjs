#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const realRoot = realpathSync(root);
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

if (!args.reference) {
  throw new Error('--reference is required.');
}

const server = await createServer({
  root,
  appType: 'custom',
  logLevel: 'error',
  server: {
    hmr: false,
    middlewareMode: true,
  },
});

try {
  const binary = await server.ssrLoadModule('/src/domain/world/dungeon-binary-export.ts');
  const {
    DUNGEON_BINARY_FORMAT_FLAGS,
    DUNGEON_BINARY_HEADER_SIZE,
    DUNGEON_BINARY_SCHEMA,
    DUNGEON_BINARY_TILE_BYTE_FORMATS,
    DUNGEON_BINARY_VERSION,
    DUNGEON_TYPE_BYTE_VALUES,
    compareDungeonBinaryTileBytes,
    createDungeonBinaryExport,
    decodeDungeonBinaryFile,
    tileByteFormatForHeader,
  } = binary;

  const dungeonType = parseDungeonType(args.type);
  const levelNumber = parseLevelNumber(args.level ?? defaultLevelForType(dungeonType));
  const referencePath = resolveReferencePath(args.reference);
  const candidateFormat = parsePayloadFormat(args.candidateFormat ?? 'semantic');
  const candidate = createDungeonBinaryExport({
    dungeonType,
    levelNumber,
    seedMode: parseSeedMode(args.seedMode),
    seedText: args.seed,
    includeObjects: !args.noObjects,
    includeSpawnZones: !args.noSpawnZones,
    includeQuestLocks: !args.noQuestLocks,
  }, {
    format: candidateFormat,
  });
  const referenceBytes = new Uint8Array(readFileSync(referencePath));
  const reference = isCdbd(referenceBytes)
    ? decodeDungeonBinaryFile(referenceBytes)
    : createRawReference({
      bytes: referenceBytes,
      candidate,
      referenceFormat: parseReferenceFormat(args.referenceFormat, DUNGEON_BINARY_FORMAT_FLAGS),
      constants: {
        DUNGEON_BINARY_SCHEMA,
        DUNGEON_BINARY_VERSION,
        DUNGEON_BINARY_HEADER_SIZE,
        DUNGEON_TYPE_BYTE_VALUES,
        DUNGEON_BINARY_TILE_BYTE_FORMATS,
      },
      tileByteFormatForHeader,
    });

  const comparison = compareDungeonBinaryTileBytes(candidate, reference);
  const report = {
    schema: 'codexblo-dungeon-binary-compare-v1',
    referencePath,
    allowFormatMismatch: Boolean(args.allowFormatMismatch),
    comparison,
  };

  console.log(JSON.stringify(report, null, 2));
  const allowedFormatOnlyMismatch = Boolean(args.allowFormatMismatch && comparison.metadataMatch && !comparison.formatMatch);
  if (comparison.identical || allowedFormatOnlyMismatch) {
    process.exit(0);
  }
  process.exit(1);
} finally {
  await server.close();
}

function createRawReference({
  bytes,
  candidate,
  referenceFormat,
  constants,
  tileByteFormatForHeader,
}) {
  if (bytes.length !== candidate.tileBytes.length) {
    throw new Error(`Raw reference byte count must be ${candidate.tileBytes.length}; received ${bytes.length}.`);
  }
  const header = {
    ...candidate.header,
    formatFlags: referenceFormat,
    tileByteCount: bytes.length,
    extensionBytes: new Uint8Array(0),
  };
  return {
    schema: constants.DUNGEON_BINARY_SCHEMA,
    header,
    tileBytes: bytes,
    tileByteFormat: tileByteFormatForHeader(header),
    checksum: checksumBytes(bytes),
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      case '--reference':
        parsed.reference = readValue(argv, ++index, arg);
        break;
      case '--reference-format':
        parsed.referenceFormat = readValue(argv, ++index, arg);
        break;
      case '--type':
        parsed.type = readValue(argv, ++index, arg);
        break;
      case '--level':
        parsed.level = readValue(argv, ++index, arg);
        break;
      case '--seed':
        parsed.seed = readValue(argv, ++index, arg);
        break;
      case '--seed-mode':
        parsed.seedMode = readValue(argv, ++index, arg);
        break;
      case '--candidate-format':
        parsed.candidateFormat = readValue(argv, ++index, arg);
        break;
      case '--allow-format-mismatch':
        parsed.allowFormatMismatch = true;
        break;
      case '--no-objects':
        parsed.noObjects = true;
        break;
      case '--no-spawn-zones':
        parsed.noSpawnZones = true;
        break;
      case '--no-quest-locks':
        parsed.noQuestLocks = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function readValue(argv, index, label) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${label} requires a value.`);
  }
  return value;
}

function resolveReferencePath(value) {
  const referencePath = resolve(root, value);
  const relativePath = relative(root, referencePath);
  if (isOutsideRelativePath(relativePath)) {
    throw new Error(`Reference path must stay inside the project root: ${value}`);
  }
  const realPath = realpathSync(referencePath);
  const realRelativePath = relative(realRoot, realPath);
  if (isOutsideRelativePath(realRelativePath)) {
    throw new Error(`Reference path must not traverse a linked directory outside the project root: ${value}`);
  }
  return referencePath;
}

function isOutsideRelativePath(relativePath) {
  return relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
}

function isCdbd(bytes) {
  return bytes.length >= 4
    && bytes[0] === 0x43
    && bytes[1] === 0x44
    && bytes[2] === 0x42
    && bytes[3] === 0x44;
}

function parseReferenceFormat(value = 'semantic', flags) {
  switch (parsePayloadFormat(value)) {
    case 'semantic':
      return flags.SEMANTIC_TILE_KIND;
    case 'devilutionx':
      return flags.DEVILUTIONX_RAW_DUNGEON;
  }
}

function parsePayloadFormat(value = 'semantic') {
  switch (value) {
    case 'semantic':
    case 'devilutionx':
      return value;
    default:
      throw new Error(`Unsupported payload format: ${value}. Expected semantic or devilutionx.`);
  }
}

function parseDungeonType(value = 'Cathedral') {
  if (value === 'Cathedral' || value === 'Catacombs' || value === 'Caves' || value === 'Hell') {
    return value;
  }
  throw new Error(`Unsupported dungeon type: ${value}`);
}

function parseSeedMode(value = 'manual') {
  if (value === 'manual' || value === 'random' || value === 'fixture') {
    return value;
  }
  throw new Error(`Unsupported seed mode: ${value}`);
}

function parseLevelNumber(value) {
  const levelNumber = Number.parseInt(value, 10);
  if (!Number.isInteger(levelNumber) || String(levelNumber) !== String(value).trim() || levelNumber < 0 || levelNumber > 255) {
    throw new Error(`Level number must be an integer from 0 to 255; received ${value}.`);
  }
  return levelNumber;
}

function defaultLevelForType(dungeonType) {
  switch (dungeonType) {
    case 'Catacombs':
      return '5';
    case 'Caves':
      return '9';
    case 'Hell':
      return '13';
    default:
      return '1';
  }
}

function checksumBytes(bytes) {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function printUsage() {
  console.log(`Usage: npm run compare:dungeon-binary -- [options]

Options:
  --reference <path>                       Reference .cdbd or raw 1600-byte payload
  --reference-format <semantic|devilutionx> Raw payload format when --reference is not .cdbd (default: semantic)
  --type <Cathedral|Catacombs|Caves|Hell>  Dungeon family (default: Cathedral)
  --level <number>                         Dungeon level number (default by type)
  --seed <text|uint32>                     Manual seed text or uint32
  --seed-mode <manual|random|fixture>      Seed mode (default: manual)
  --candidate-format <semantic|devilutionx> Candidate payload format (default: semantic)
  --allow-format-mismatch                  Exit 0 when metadata matches but payload format differs
  --no-objects                             Disable object placement before export
  --no-spawn-zones                         Disable spawn-zone option before export
  --no-quest-locks                         Disable quest-lock option before export
`);
}
