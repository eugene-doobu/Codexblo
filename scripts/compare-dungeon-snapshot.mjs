#!/usr/bin/env node
import { readFileSync } from 'node:fs';

// Compares normalized 40x40 dungeon snapshots. It intentionally does not
// generate a native/reference snapshot; export that snapshot separately and
// pass both JSON files to this dev-only command.

const TILE_SYMBOLS = {
  void: ' ',
  floor: '.',
  wall: '#',
  door: '+',
  stairUp: '<',
  stairDown: '>',
};

const [candidatePath, referencePath] = process.argv.slice(2);
if (!candidatePath || !referencePath) {
  console.error('Usage: npm run compare:dungeon -- <candidate.json> <reference.json>');
  process.exit(2);
}

const candidate = normalize(readJson(candidatePath));
const reference = normalize(readJson(referencePath));
const width = Math.max(candidate.width, reference.width);
const height = Math.max(candidate.height, reference.height);
const dimensionsMatch = candidate.width === reference.width && candidate.height === reference.height;
const mismatches = [];
let mismatchCount = 0;

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const left = cellAt(candidate, x, y);
    const right = cellAt(reference, x, y);
    if (left !== right) {
      mismatchCount += 1;
      if (mismatches.length < 200) {
        mismatches.push({ x, y, candidate: left, reference: right });
      }
    }
  }
}

const report = {
  identical: dimensionsMatch && mismatchCount === 0,
  dimensionsMatch,
  mismatchCount,
  candidateHistogram: histogram(candidate.rows),
  referenceHistogram: histogram(reference.rows),
  firstMismatches: mismatches,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.identical ? 0 : 1);

function normalize(input) {
  const rows = input.tileRows ?? input.rows ?? input.tiles;
  const grid = input.grid ?? input;
  if (!Array.isArray(rows)) {
    throw new Error('Snapshot must contain tileRows, rows, or tiles.');
  }
  const normalizedRows = rows.map(normalizeRow);
  return {
    width: Number(grid.width ?? normalizedRows[0]?.length ?? 0),
    height: Number(grid.height ?? normalizedRows.length),
    rows: normalizedRows,
  };
}

function normalizeRow(row) {
  if (!Array.isArray(row)) {
    return String(row);
  }
  return row.map((cell) => TILE_SYMBOLS[cell] ?? String(cell)).join('');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function cellAt(snapshot, x, y) {
  if (x >= snapshot.width || y >= snapshot.height) {
    return '';
  }
  return snapshot.rows[y]?.[x] ?? '';
}

function histogram(rows) {
  const counts = {};
  for (const row of rows) {
    for (const cell of row) {
      counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }
  return counts;
}
