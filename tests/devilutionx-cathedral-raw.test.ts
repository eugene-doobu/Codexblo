import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateDevilutionxCathedralRawLevel } from '../src/domain/world/devilutionx-cathedral-raw';

describe('DevilutionX Cathedral raw parity', () => {
  it.each([
    [1, 2588, 'diablo-1-2588.raw', {}],
    [1, 743271966, 'diablo-1-743271966.raw', {}],
    [2, 1383137027, 'diablo-2-1383137027.raw', {}],
    [3, 844660068, 'diablo-3-844660068.raw', {}],
    [4, 609325643, 'diablo-4-609325643.raw', { lightBannerAvailable: false }],
  ] as const)('matches the 40x40 dungeon tile bytes for level %i seed %i', (levelNumber, seed, fixtureName, options) => {
    const generated = generateDevilutionxCathedralRawLevel(seed, { levelNumber, ...options });
    const reference = readRawFixture(fixtureName);

    expect(generated.tileBytes).toHaveLength(1600);
    expect(Array.from(generated.tileBytes)).toEqual(Array.from(reference));
  });

  it('refuses unsupported light-banner setpiece parity instead of emitting non-identical bytes', () => {
    expect(() => generateDevilutionxCathedralRawLevel(902156014, {
      levelNumber: 4,
      lightBannerAvailable: true,
    })).toThrow('light-banner setpiece levels is not implemented');
  });
});

function readRawFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve('tests/fixtures/devilutionx', name)));
}
