import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDungeonBinaryExport } from '../src/domain/world/dungeon-binary-export';

const projectRoot = resolve('.');
const cliPath = resolve(projectRoot, 'scripts/export-dungeon-binary.mjs');
const compareCliPath = resolve(projectRoot, 'scripts/compare-dungeon-binary.mjs');
const tempDir = `coverage/tmp/dungeon-binary-cli-${process.pid}`;
const outsideTempDir = resolve(projectRoot, '..', `dungeon-binary-cli-outside-${process.pid}`);

interface DungeonBinaryCliReport {
  seed: number;
  bytesWritten: number;
  outputPath: string;
  rawTileBytes: boolean;
  checksum: string;
  tileChecksum: string;
  fileChecksum: string;
  tileByteFormat: string;
  emittedByteLayout: 'tile-payload' | 'binary-file';
  emittedByteFormat: string;
}

describe('Dungeon binary export CLI', () => {
  beforeAll(() => {
    removeTempDir();
    rmSync(outsideTempDir, { recursive: true, force: true });
  });

  afterAll(() => {
    removeTempDir();
    rmSync(outsideTempDir, { recursive: true, force: true });
  });

  it('lets random seed mode choose a fresh seed when --seed is omitted', () => {
    const out = `${tempDir}/random.cdbd`;
    const report = runCli(['--seed-mode', 'random', '--out', out]);

    expect(report.seed).not.toBe(123456789);
    expect(report.bytesWritten).toBe(1632);
    expect(existsSync(resolve(projectRoot, out))).toBe(true);
  });

  it('includes option flags in the default output name', () => {
    const report = runCli(['--seed', `cli-default-name-${process.pid}`, '--no-objects']);

    expect(report.outputPath).toContain('opts-06');
    expect(report.bytesWritten).toBe(1632);
    rmSync(report.outputPath, { force: true });
  });

  it('refuses accidental overwrites unless --force is provided', () => {
    const out = `${tempDir}/overwrite.cdbd`;
    runCli(['--seed', '123456789', '--out', out]);

    const rejected = spawnCli(['--seed', '123456789', '--out', out]);
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('EEXIST');

    const forced = runCli(['--seed', '123456789', '--out', out, '--force']);
    expect(forced.bytesWritten).toBe(1632);
  });

  it('writes raw Cathedral tile bytes matching the generated logical grid', () => {
    const out = `${tempDir}/cathedral-raw.tiles.bin`;
    const report = runCli(['--type', 'Cathedral', '--level', '1', '--seed', 'cathedral-test-seed', '--raw', '--out', out]);
    const bytes = readFileSync(resolve(projectRoot, out));
    const expected = createDungeonBinaryExport({ dungeonType: 'Cathedral', levelNumber: 1, seedText: 'cathedral-test-seed' }).tileBytes;

    expect(report.rawTileBytes).toBe(true);
    expect(report.bytesWritten).toBe(1600);
    expect(report.tileByteFormat).toBe('codexblo-semantic-tile-kind');
    expect(report.emittedByteLayout).toBe('tile-payload');
    expect(report.emittedByteFormat).toBe(report.tileByteFormat);
    expect(report.checksum).toBe(checksumBytes(bytes));
    expect(report.tileChecksum).toBe(report.checksum);
    expect(report.fileChecksum).not.toBe(report.checksum);
    expect(Array.from(bytes)).toEqual(Array.from(expected));
  });

  it('keeps output paths inside the project root', () => {
    const rejected = spawnCli(['--out', '../outside.cdbd']);

    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('Output path must stay inside the project root');
  });

  it('rejects output through linked directories that escape the project root', () => {
    const outsidePath = outsideTempDir;
    const linkPath = resolve(projectRoot, tempDir, 'link-outside');
    mkdirSync(outsidePath, { recursive: true });
    mkdirSync(resolve(projectRoot, tempDir), { recursive: true });
    try {
      symlinkSync(outsidePath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    const rejected = spawnCli(['--out', `${tempDir}/link-outside/escaped.cdbd`]);

    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('linked directory outside the project root');
    expect(existsSync(resolve(outsidePath, 'escaped.cdbd'))).toBe(false);
  });

  it('compares a generated semantic binary fixture against the current generator output', () => {
    const out = `${tempDir}/cathedral-semantic.cdbd`;
    runCli(['--type', 'Cathedral', '--level', '1', '--seed', '123456789', '--out', out]);

    const result = spawnCompareCli([
      '--reference', out,
      '--type', 'Cathedral',
      '--level', '1',
      '--seed', '123456789',
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.comparison.comparable).toBe(true);
    expect(report.comparison.identical).toBe(true);
    expect(report.comparison.mismatchCount).toBe(0);
  });

  it('compares a DevilutionX raw Cathedral reference against a raw candidate byte-for-byte', () => {
    const referencePath = `${tempDir}/cathedral-devilutionx-2588.raw`;
    mkdirSync(resolve(projectRoot, tempDir), { recursive: true });
    writeFileSync(
      resolve(projectRoot, referencePath),
      createDungeonBinaryExport({
        dungeonType: 'Cathedral',
        levelNumber: 1,
        seedText: '2588',
      }, { format: 'devilutionx' }).tileBytes,
    );

    const result = spawnCompareCli([
      '--reference', referencePath,
      '--reference-format', 'devilutionx',
      '--candidate-format', 'devilutionx',
      '--type', 'Cathedral',
      '--level', '1',
      '--seed', '2588',
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.comparison.comparable).toBe(true);
    expect(report.comparison.identical).toBe(true);
    expect(report.comparison.formatMatch).toBe(true);
    expect(report.comparison.mismatchCount).toBe(0);
  });

  it('reports DevilutionX raw reference payloads as format mismatches against semantic candidates', () => {
    const rawPath = resolve(projectRoot, tempDir, 'cathedral-devilutionx.raw');
    mkdirSync(resolve(projectRoot, tempDir), { recursive: true });
    writeFileSync(rawPath, Buffer.alloc(1600, 7));

    const result = spawnCompareCli([
      '--reference', `${tempDir}/cathedral-devilutionx.raw`,
      '--reference-format', 'devilutionx',
      '--type', 'Cathedral',
      '--level', '1',
      '--seed', '123456789',
      '--allow-format-mismatch',
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.comparison.comparable).toBe(false);
    expect(report.comparison.metadataMatch).toBe(true);
    expect(report.comparison.formatMatch).toBe(false);
    expect(report.comparison.reason).toContain('payload formats differ');
  });

  it('rejects format-mismatch allowance when binary metadata differs', () => {
    const out = `${tempDir}/metadata-source.cdbd`;
    const mutated = resolve(projectRoot, tempDir, 'metadata-format-mismatch.cdbd');
    runCli(['--type', 'Cathedral', '--level', '1', '--seed', '123456789', '--out', out]);
    const bytes = Buffer.from(readFileSync(resolve(projectRoot, out)));
    bytes[7] = 2;
    bytes[9] = 1;
    writeFileSync(mutated, bytes);

    const result = spawnCompareCli([
      '--reference', `${tempDir}/metadata-format-mismatch.cdbd`,
      '--type', 'Cathedral',
      '--level', '1',
      '--seed', '123456789',
      '--allow-format-mismatch',
    ]);
    const report = JSON.parse(result.stdout);

    expect(result.status).not.toBe(0);
    expect(report.comparison.metadataMatch).toBe(false);
    expect(report.comparison.formatMatch).toBe(false);
    expect(report.comparison.reason).toContain('metadata differs');
  });

  it('keeps compare reference paths inside the project root', () => {
    mkdirSync(outsideTempDir, { recursive: true });
    writeFileSync(resolve(outsideTempDir, 'outside.raw'), Buffer.alloc(1600, 7));

    const rejected = spawnCompareCli([
      '--reference', `../${basename(outsideTempDir)}/outside.raw`,
      '--reference-format', 'devilutionx',
      '--allow-format-mismatch',
    ]);

    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('Reference path must stay inside the project root');
  });

  it('rejects compare references through linked directories that escape the project root', () => {
    const outsidePath = outsideTempDir;
    const linkPath = resolve(projectRoot, tempDir, 'compare-link-outside');
    mkdirSync(outsidePath, { recursive: true });
    mkdirSync(resolve(projectRoot, tempDir), { recursive: true });
    writeFileSync(resolve(outsidePath, 'linked.raw'), Buffer.alloc(1600, 7));
    try {
      symlinkSync(outsidePath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    const rejected = spawnCompareCli([
      '--reference', `${tempDir}/compare-link-outside/linked.raw`,
      '--reference-format', 'devilutionx',
      '--allow-format-mismatch',
    ]);

    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('linked directory outside the project root');
  });
});

function runCli(args: string[]): DungeonBinaryCliReport {
  const stdout = execFileSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return JSON.parse(stdout) as DungeonBinaryCliReport;
}

function spawnCli(args: string[]): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr };
}

function spawnCompareCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [compareCliPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function removeTempDir(): void {
  rmSync(resolve(projectRoot, tempDir), { recursive: true, force: true });
}

function checksumBytes(bytes: Uint8Array): string {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
