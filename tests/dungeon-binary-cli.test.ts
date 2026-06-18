import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const projectRoot = resolve('.');
const cliPath = resolve(projectRoot, 'scripts/export-dungeon-binary.mjs');
const tempDir = `coverage/tmp/dungeon-binary-cli-${process.pid}`;
const outsideTempDir = resolve(projectRoot, '..', `dungeon-binary-cli-outside-${process.pid}`);

interface DungeonBinaryCliReport {
  seed: number;
  bytesWritten: number;
  outputPath: string;
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

function removeTempDir(): void {
  rmSync(resolve(projectRoot, tempDir), { recursive: true, force: true });
}
