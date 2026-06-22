import Phaser from 'phaser';
import type { DungeonGenerationResult, DungeonObjectCategory, DungeonObjectPlacement, RenderTileKind, TileKind } from '../../domain/world/dungeon-generator';
import { FLAT_TILE_SIZE, ISO_TILE_FOOTPRINT, type GridSize, toIso } from './isometric-projection';

export interface DebugOverlayOptions {
  showRawTiles: boolean;
  showGrid: boolean;
  showCollision: boolean;
  showConnectivity: boolean;
  showZones: boolean;
  showObjects: boolean;
}

export interface RenderedTileSnapshot {
  x: number;
  y: number;
  tile: TileKind;
  renderTile: RenderTileKind;
  assetKey: string;
  screenX: number;
  screenY: number;
  depth: number;
}

export interface DungeonRenderSnapshot {
  gridSize: GridSize;
  tileFootprint: typeof ISO_TILE_FOOTPRINT;
  renderedTiles: readonly RenderedTileSnapshot[];
  renderedObjects: readonly RenderedObjectSnapshot[];
  rawTileValues?: readonly (readonly number[])[];
}

export interface RenderedObjectSnapshot {
  id: string;
  presetId: string;
  category: DungeonObjectCategory;
  x: number;
  y: number;
  width: number;
  height: number;
  blocksMovement: boolean;
  screenX: number;
  screenY: number;
}

export class DungeonDebugRenderer {
  private readonly tileSprites: Phaser.GameObjects.Image[] = [];
  private readonly structureCohesionGraphics: Phaser.GameObjects.Graphics[] = [];
  private overlay?: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {}

  render(
    result: DungeonGenerationResult,
    options: DebugOverlayOptions,
    rawTileValues?: readonly (readonly number[])[],
  ): DungeonRenderSnapshot {
    this.clear();
    const { level } = result;
    const gridSize = { width: level.width, height: level.height };
    const renderedTiles: RenderedTileSnapshot[] = [];
    const renderedObjects = objectSnapshots(level.objects ?? [], gridSize);

    // Flat top-down view: one colored square per tile, distinguished by tile value only.
    // Cathedral uses the raw DevilutionX tile ids (so inner walls are visible); other
    // dungeon types fall back to semantic tile colors.
    const tiles = this.scene.add.graphics();
    tiles.setDepth(1);
    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const tile = level.tiles[y][x];
        const rawValue = rawTileValues?.[y]?.[x];
        const color = rawValue !== undefined ? rawTileColor(rawValue) : semanticTileColor(tile);
        const screenX = x * FLAT_TILE_SIZE;
        const screenY = y * FLAT_TILE_SIZE;
        tiles.fillStyle(color, 1);
        tiles.fillRect(screenX, screenY, FLAT_TILE_SIZE, FLAT_TILE_SIZE);
        const renderTile = level.renderTiles?.[y]?.[x] ?? tile;
        renderedTiles.push({ x, y, tile, renderTile, assetKey: '', screenX, screenY, depth: 1 });
      }
    }
    this.structureCohesionGraphics.push(tiles);

    this.overlay = this.scene.add.graphics();
    this.overlay.setDepth(100000);

    if (options.showGrid) {
      this.overlay.lineStyle(1, 0x000000, 0.25);
      for (let gy = 0; gy <= level.height; gy += 1) {
        this.overlay.lineBetween(0, gy * FLAT_TILE_SIZE, level.width * FLAT_TILE_SIZE, gy * FLAT_TILE_SIZE);
      }
      for (let gx = 0; gx <= level.width; gx += 1) {
        this.overlay.lineBetween(gx * FLAT_TILE_SIZE, 0, gx * FLAT_TILE_SIZE, level.height * FLAT_TILE_SIZE);
      }
    }

    return {
      gridSize,
      tileFootprint: ISO_TILE_FOOTPRINT,
      renderedTiles,
      renderedObjects,
      rawTileValues,
    };
  }

  clear(): void {
    for (const sprite of this.tileSprites) {
      sprite.destroy();
    }
    this.tileSprites.length = 0;
    for (const graphics of this.structureCohesionGraphics) {
      graphics.destroy();
    }
    this.structureCohesionGraphics.length = 0;
    this.overlay?.destroy();
    this.overlay = undefined;
  }
}

function objectSnapshots(objects: readonly DungeonObjectPlacement[], gridSize: GridSize): RenderedObjectSnapshot[] {
  return objects.map((object) => {
    const screen = toIso(object.position, gridSize);
    return {
      id: object.id,
      presetId: object.presetId,
      category: object.category,
      x: object.position.x,
      y: object.position.y,
      width: object.size.width,
      height: object.size.height,
      blocksMovement: object.blocksMovement,
      screenX: screen.x,
      screenY: screen.y,
    };
  });
}

function semanticTileColor(tile: TileKind): number {
  switch (tile) {
    case 'floor':
      return 0xb8a888;
    case 'wall':
      return 0x586072;
    case 'door':
      return 0xc8902f;
    case 'stairUp':
      return 0x4ade80;
    case 'stairDown':
      return 0xf87171;
    default:
      return 0x111827;
  }
}

function rawTileColor(value: number): number {
  if (value === 0) {
    return 0x111827;
  }
  const hue = (value * 137.508) % 360;
  const saturation = 0.62 + ((value >> 2) % 4) * 0.08;
  const lightness = 0.42 + ((value >> 5) % 4) * 0.08;
  return hslToRgbNumber(hue, saturation, lightness);
}

function hslToRgbNumber(hue: number, saturation: number, lightness: number): number {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const [redPrime, greenPrime, bluePrime] = huePrime < 1
    ? [chroma, secondary, 0]
    : huePrime < 2
      ? [secondary, chroma, 0]
      : huePrime < 3
        ? [0, chroma, secondary]
        : huePrime < 4
          ? [0, secondary, chroma]
          : huePrime < 5
            ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  const red = Math.round((redPrime + match) * 255);
  const green = Math.round((greenPrime + match) * 255);
  const blue = Math.round((bluePrime + match) * 255);
  return (red << 16) | (green << 8) | blue;
}
