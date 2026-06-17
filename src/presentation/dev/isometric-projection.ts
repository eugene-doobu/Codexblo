import type { GridPoint } from '../../core/grid';

export interface GridSize {
  width: number;
  height: number;
}

export interface IsoBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface IsoPoint {
  x: number;
  y: number;
}

export const ISO_TILE_FOOTPRINT = {
  width: 72,
  height: 36,
  halfWidth: 36,
  halfHeight: 18,
} as const;

export const ISO_TILE_IMAGE = {
  width: 72,
  height: 48,
  halfWidth: 36,
  halfHeight: 24,
} as const;

export function toIso(point: GridPoint, gridSize: GridSize): IsoPoint {
  return {
    x: (point.x - point.y) * ISO_TILE_FOOTPRINT.halfWidth + (gridSize.height - 1) * ISO_TILE_FOOTPRINT.halfWidth,
    y: (point.x + point.y) * ISO_TILE_FOOTPRINT.halfHeight,
  };
}

export function isoGridBounds(gridSize: GridSize, padding = 0): IsoBounds {
  const corners = [
    toIso({ x: 0, y: 0 }, gridSize),
    toIso({ x: gridSize.width - 1, y: 0 }, gridSize),
    toIso({ x: 0, y: gridSize.height - 1 }, gridSize),
    toIso({ x: gridSize.width - 1, y: gridSize.height - 1 }, gridSize),
  ];

  const left = Math.min(...corners.map((point) => point.x)) - ISO_TILE_IMAGE.halfWidth - padding;
  const right = Math.max(...corners.map((point) => point.x)) + ISO_TILE_IMAGE.halfWidth + padding;
  const top = Math.min(...corners.map((point) => point.y)) - ISO_TILE_IMAGE.halfHeight - padding;
  const bottom = Math.max(...corners.map((point) => point.y)) + ISO_TILE_IMAGE.halfHeight + padding;

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}
