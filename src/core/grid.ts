export interface GridPoint {
  x: number;
  y: number;
}

export interface GridRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectCenter(rect: GridRect): GridPoint {
  return {
    x: Math.floor(rect.x + rect.width / 2),
    y: Math.floor(rect.y + rect.height / 2),
  };
}

export function rectsOverlap(left: GridRect, right: GridRect, padding = 0): boolean {
  return !(
    left.x + left.width + padding <= right.x ||
    right.x + right.width + padding <= left.x ||
    left.y + left.height + padding <= right.y ||
    right.y + right.height + padding <= left.y
  );
}

export function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}