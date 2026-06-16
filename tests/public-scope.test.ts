import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const forbidden = [
  ['mvd', 'Test'].join(''),
  ['Codexblo', 'Docs'].join(''),
  ['ultra', 'goal'].join(''),
  ['ra', 'lph'].join(''),
  ['oh-my', '-codex'].join(''),
  ['.', 'om', 'x'].join(''),
];
const ignoredDirs = new Set(['node_modules', 'dist']);
const checkedExtensions = new Set(['.ts', '.tsx', '.js', '.json', '.md', '.html', '.css', '.svg']);

describe('public project scope', () => {
  it('does not mention planning repository or internal workflow markers in public files', () => {
    const offenders: string[] = [];
    for (const file of walk(process.cwd())) {
      if (!checkedExtensions.has(extension(file))) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      for (const marker of forbidden) {
        if (text.includes(marker)) {
          offenders.push(`${file}: ${marker}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || ignoredDirs.has(entry)) {
      continue;
    }
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      entries.push(...walk(path));
    } else {
      entries.push(path);
    }
  }
  return entries;
}

function extension(file: string): string {
  const index = file.lastIndexOf('.');
  return index === -1 ? '' : file.slice(index);
}
