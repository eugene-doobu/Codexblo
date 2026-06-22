import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateDevilutionxCathedralRawLevel } from '../src/domain/world/devilutionx-cathedral-raw';

interface RawFixtureManifest {
  schema: 'cathedral-raw-fixture-manifest-v1';
  width: 40;
  height: 40;
  tileByteFormat: 'uint8-row-major-40x40';
  fixtures: RawFixtureEntry[];
}

interface RawFixtureEntry {
  id: string;
  levelNumber: 1 | 2 | 3 | 4;
  seed: number;
  options: { lightBannerAvailable?: boolean };
  tileBytesBase64: string;
}

const rawFixtureManifest = JSON.parse(
  readFileSync(resolve('tests/fixtures/cathedral-raw-fixtures.json'), 'utf8'),
) as RawFixtureManifest;
const rawFixturePayloads = new Map(rawFixtureManifest.fixtures.map((fixture) => [fixture.id, fixture.tileBytesBase64]));
const additionalRawFixtures = rawFixtureManifest.fixtures.map(
  (fixture) => [fixture.levelNumber, fixture.seed, `inline:${fixture.id}`, fixture.options] as const,
);

describe('DevilutionX Cathedral raw parity', () => {
  it('documents the inline raw fixture manifest contract', () => {
    expect(rawFixtureManifest.schema).toBe('cathedral-raw-fixture-manifest-v1');
    expect(rawFixtureManifest.width).toBe(40);
    expect(rawFixtureManifest.height).toBe(40);
    expect(rawFixtureManifest.tileByteFormat).toBe('uint8-row-major-40x40');
    expect(rawFixtureManifest.fixtures).toHaveLength(15);
    expect(new Set(rawFixtureManifest.fixtures.map((fixture) => fixture.id)).size).toBe(rawFixtureManifest.fixtures.length);
    expect(new Set(rawFixtureManifest.fixtures.map((fixture) => `${fixture.levelNumber}:${fixture.seed}`)).size)
      .toBe(rawFixtureManifest.fixtures.length);
    for (const fixture of rawFixtureManifest.fixtures) {
      expect(Buffer.from(fixture.tileBytesBase64, 'base64')).toHaveLength(rawFixtureManifest.width * rawFixtureManifest.height);
    }
  });

  it.each([
    [1, 2588, 'diablo-1-2588.raw', {}],
    [1, 743271966, 'diablo-1-743271966.raw', {}],
    [2, 1383137027, 'diablo-2-1383137027.raw', {}],
    [3, 844660068, 'diablo-3-844660068.raw', {}],
    [4, 609325643, 'diablo-4-609325643.raw', { lightBannerAvailable: false }],
    ...additionalRawFixtures,
  ] as const)('matches the 40x40 dungeon tile bytes for level %i seed %i', (levelNumber, seed, fixtureName, options) => {
    // These fixtures capture the "original cathedral" quest-off variant. The
    // generator now defaults to the non-original variant (matching the raw tile
    // dataset), so pin the original flags here explicitly for this legacy set.
    const generated = generateDevilutionxCathedralRawLevel(seed, {
      levelNumber,
      originalCathedral: true,
      poisonedWaterAvailable: levelNumber === 2,
      ...options,
    });
    const reference = readRawFixture(fixtureName);

    expect(generated.tileBytes).toHaveLength(1600);
    expectRegeneratesManifestPayload(fixtureName, generated.tileBytes);
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
  if (name.startsWith('inline:')) {
    const payload = rawFixturePayloads.get(name.slice('inline:'.length));
    if (!payload) {
      throw new Error(`Unknown inline raw fixture: ${name}.`);
    }
    return new Uint8Array(Buffer.from(payload, 'base64'));
  }
  return new Uint8Array(readFileSync(resolve('tests/fixtures/devilutionx', name)));
}

function expectRegeneratesManifestPayload(name: string, generatedBytes: Uint8Array): void {
  if (!name.startsWith('inline:')) {
    return;
  }
  const payload = rawFixturePayloads.get(name.slice('inline:'.length));
  expect(Buffer.from(generatedBytes).toString('base64')).toBe(payload);
}
