import { describe, expect, it } from 'vitest';
import { ISO_TILE_FOOTPRINT, isoGridBounds, toIso } from '../src/presentation/dev/isometric-projection';

describe('Cathedral isometric projection', () => {
  it('uses a 2:1 floor-plane footprint', () => {
    expect(ISO_TILE_FOOTPRINT.width).toBe(72);
    expect(ISO_TILE_FOOTPRINT.height).toBe(36);
    expect(ISO_TILE_FOOTPRINT.width / ISO_TILE_FOOTPRINT.height).toBe(2);
  });

  it('places adjacent grid tiles on the same isometric floor plane', () => {
    const gridSize = { width: 8, height: 6 };
    const origin = toIso({ x: 0, y: 0 }, gridSize);
    const east = toIso({ x: 1, y: 0 }, gridSize);
    const south = toIso({ x: 0, y: 1 }, gridSize);

    expect(east.x - origin.x).toBe(ISO_TILE_FOOTPRINT.halfWidth);
    expect(east.y - origin.y).toBe(ISO_TILE_FOOTPRINT.halfHeight);
    expect(south.x - origin.x).toBe(-ISO_TILE_FOOTPRINT.halfWidth);
    expect(south.y - origin.y).toBe(ISO_TILE_FOOTPRINT.halfHeight);
  });

  it('computes camera bounds around the full rendered diamond map', () => {
    const gridSize = { width: 8, height: 6 };
    const bounds = isoGridBounds(gridSize);

    expect(bounds.left).toBeLessThanOrEqual(toIso({ x: 0, y: gridSize.height - 1 }, gridSize).x - ISO_TILE_FOOTPRINT.halfWidth);
    expect(bounds.right).toBeGreaterThanOrEqual(toIso({ x: gridSize.width - 1, y: 0 }, gridSize).x + ISO_TILE_FOOTPRINT.halfWidth);
    expect(bounds.top).toBeLessThan(0);
    expect(bounds.bottom).toBeGreaterThan(toIso({ x: gridSize.width - 1, y: gridSize.height - 1 }, gridSize).y);
  });
});
