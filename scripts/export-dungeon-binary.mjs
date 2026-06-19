#!/usr/bin/env node
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const realRoot = realpathSync(root);
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
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
  const { createDungeonBinaryExport } = await server.ssrLoadModule('/src/domain/world/dungeon-binary-export.ts');
  const dungeonType = parseDungeonType(args.type);
  const levelNumber = parseLevelNumber(args.level ?? defaultLevelForType(dungeonType));
  const seedMode = parseSeedMode(args.seedMode);
  const seedText = args.seed;
  const exportResult = createDungeonBinaryExport({
    dungeonType,
    levelNumber,
    seedMode,
    seedText,
    includeObjects: !args.noObjects,
    includeSpawnZones: !args.noSpawnZones,
    includeQuestLocks: !args.noQuestLocks,
  }, {
    format: parseExportFormat(args.format),
  });

  const bytes = args.raw ? exportResult.tileBytes : exportResult.fileBytes;
  const outputPath = resolveOutputPath(args.out ?? defaultOutputPath(exportResult, args.raw));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(bytes), { flag: args.force ? 'w' : 'wx' });

  console.log(JSON.stringify({
    schema: exportResult.schema,
    outputPath,
    rawTileBytes: args.raw,
    bytesWritten: bytes.length,
    tileByteCount: exportResult.tileBytes.length,
    checksum: exportResult.checksum,
    tileByteFormat: args.format ?? 'semantic',
    seed: exportResult.seed,
    dungeonType: exportResult.header.dungeonType,
    levelNumber: exportResult.header.levelNumber,
    width: exportResult.header.width,
    height: exportResult.header.height,
  }, null, 2));
} finally {
  await server.close();
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
      case '--format':
        parsed.format = readValue(argv, ++index, arg);
        break;
      case '--out':
        parsed.out = readValue(argv, ++index, arg);
        break;
      case '--raw':
        parsed.raw = true;
        break;
      case '--force':
        parsed.force = true;
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

function defaultOutputPath(exportResult, raw) {
  const suffix = raw ? 'tiles.bin' : 'cdbd';
  const optionFlags = exportResult.header.optionFlags.toString(16).padStart(2, '0');
  const format = exportResult.header.formatFlags === 1 ? 'devilutionx' : 'semantic';
  return `dist/dungeons/${exportResult.header.dungeonType.toLowerCase()}-l${exportResult.header.levelNumber}-seed-${exportResult.seed}-opts-${optionFlags}-${format}.${suffix}`;
}

function resolveOutputPath(value) {
  const outputPath = resolve(root, value);
  const relativePath = relative(root, outputPath);
  if (isOutsideRelativePath(relativePath)) {
    throw new Error(`Output path must stay inside the project root: ${value}`);
  }
  ensureRealParentInsideRoot(dirname(outputPath), value);
  assertOutputFileIsNotLink(outputPath, value);
  return outputPath;
}

function ensureRealParentInsideRoot(parentPath, requestedPath) {
  const parentRelativePath = relative(root, parentPath);
  let currentPath = root;
  for (const segment of parentRelativePath.split(/[\\/]+/).filter(Boolean)) {
    currentPath = resolve(currentPath, segment);
    try {
      lstatSync(currentPath);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
      mkdirSync(currentPath);
    }
    assertRealPathInsideRoot(currentPath, requestedPath);
  }
}

function assertRealPathInsideRoot(path, requestedPath) {
  const realPath = realpathSync(path);
  const realRelative = relative(realRoot, realPath);
  if (isOutsideRelativePath(realRelative)) {
    throw new Error(`Output path must not traverse a linked directory outside the project root: ${requestedPath}`);
  }
}

function isOutsideRelativePath(relativePath) {
  return relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
}

function assertOutputFileIsNotLink(outputPath, requestedPath) {
  try {
    const stat = lstatSync(outputPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Output path must not be a symbolic link: ${requestedPath}`);
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
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

function parseExportFormat(value = 'semantic') {
  if (value === 'semantic' || value === 'devilutionx') {
    return value;
  }
  throw new Error(`Unsupported export format: ${value}. Expected semantic or devilutionx.`);
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

function printUsage() {
  console.log(`Usage: npm run export:dungeon -- [options]

Options:
  --type <Cathedral|Catacombs|Caves|Hell>  Dungeon family (default: Cathedral)
  --level <number>                         Dungeon level number (default by type)
  --seed <text|uint32>                     Manual seed text or uint32 (default: domain request default)
  --seed-mode <manual|random|fixture>      Seed mode (default: manual)
  --format <semantic|devilutionx>          Payload tile format (default: semantic)
  --out <path>                             Output path (default: dist/dungeons/<type>-l<level>-seed-<seed>-opts-<flags>.cdbd)
  --raw                                    Write only the 40x40 row-major tile payload (1600 bytes)
  --force                                  Overwrite an existing output file
  --no-objects                             Disable object placement before export
  --no-spawn-zones                         Disable spawn-zone option before export
  --no-quest-locks                         Disable quest-lock option before export
`);
}
