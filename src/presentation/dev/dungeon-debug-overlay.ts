import Phaser from 'phaser';
import type { GridPoint, GridRect } from '../../core/grid';
import type { DungeonGenerationResult, TileKind } from '../../domain/world/dungeon-generator';
import { isPassable } from '../../domain/world/dungeon-generator';
import { TILE_ASSET_KEYS } from '../bindings/cathedral-assets';
import { ISO_TILE_FOOTPRINT, type GridSize, toIso } from './isometric-projection';

export interface DebugOverlayOptions {
  showGrid: boolean;
  showCollision: boolean;
  showConnectivity: boolean;
  showZones: boolean;
}

export interface RenderedTileSnapshot {
  x: number;
  y: number;
  tile: TileKind;
  screenX: number;
  screenY: number;
  depth: number;
}

export interface DungeonRenderSnapshot {
  gridSize: GridSize;
  tileFootprint: typeof ISO_TILE_FOOTPRINT;
  renderedTiles: readonly RenderedTileSnapshot[];
}

export class DungeonDebugRenderer {
  private readonly tileSprites: Phaser.GameObjects.Image[] = [];
  private overlay?: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {}

  render(result: DungeonGenerationResult, options: DebugOverlayOptions): DungeonRenderSnapshot {
    this.clear();
    const { level } = result;
    const gridSize = { width: level.width, height: level.height };
    const renderedTiles: RenderedTileSnapshot[] = [];

    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const tile = level.tiles[y][x];
        if (tile === 'void' && !options.showGrid) {
          continue;
        }
        const screen = toIso({ x, y }, gridSize);
        const sprite = this.scene.add.image(screen.x, screen.y, TILE_ASSET_KEYS[tile]);
        sprite.setOrigin(0.5, 0.5);
        const depth = screen.y + depthBias(tile);
        sprite.setDepth(depth);
        sprite.setAlpha(tile === 'void' ? 0.25 : 1);
        sprite.setName(`tile-${x}-${y}-${tile}`);
        sprite.setData({
          gridX: x,
          gridY: y,
          tile,
          floorPlaneX: screen.x,
          floorPlaneY: screen.y,
        });
        this.tileSprites.push(sprite);
        renderedTiles.push({ x, y, tile, screenX: screen.x, screenY: screen.y, depth });
      }
    }

    this.overlay = this.scene.add.graphics();
    this.overlay.setDepth(100000);

    if (options.showGrid) {
      this.drawGrid(level.width, level.height);
    }
    if (options.showCollision) {
      this.drawCollision(result);
    }
    if (options.showConnectivity) {
      this.drawConnectivity(result);
    }
    if (options.showZones) {
      this.drawZones(result);
    }

    return {
      gridSize,
      tileFootprint: ISO_TILE_FOOTPRINT,
      renderedTiles,
    };
  }

  clear(): void {
    for (const sprite of this.tileSprites) {
      sprite.destroy();
    }
    this.tileSprites.length = 0;
    this.overlay?.destroy();
    this.overlay = undefined;
  }

  private drawGrid(width: number, height: number): void {
    if (!this.overlay) {
      return;
    }
    const gridSize = { width, height };
    this.overlay.lineStyle(1, 0x6b7280, 0.2);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        this.drawDiamond({ x, y }, gridSize, 0x6b7280, 0.16);
      }
    }
  }

  private drawCollision(result: DungeonGenerationResult): void {
    if (!this.overlay) {
      return;
    }
    for (let y = 0; y < result.level.height; y += 1) {
      for (let x = 0; x < result.level.width; x += 1) {
        if (!isPassable(result.level.tiles[y][x])) {
          this.fillDiamond({ x, y }, result.level, 0xff375f, 0.16);
        }
      }
    }
  }

  private drawConnectivity(result: DungeonGenerationResult): void {
    if (!this.overlay) {
      return;
    }
    for (const point of result.graph.reachableTiles) {
      this.fillDiamond(point, result.level, 0x4ade80, 0.12);
    }
    for (const point of result.graph.unreachablePassableTiles) {
      this.fillDiamond(point, result.level, 0xff0000, 0.55);
    }
  }

  private drawZones(result: DungeonGenerationResult): void {
    if (!this.overlay) {
      return;
    }
    const colorByKind = {
      object: 0xfacc15,
      spawn: 0x60a5fa,
      questLock: 0xc084fc,
    } as const;
    for (const zone of result.level.zones) {
      this.drawRect(zone.rect, result.level, colorByKind[zone.kind]);
    }
  }

  private drawRect(rect: GridRect, gridSize: GridSize, color: number): void {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        this.fillDiamond({ x, y }, gridSize, color, 0.22);
      }
    }
  }

  private drawDiamond(point: GridPoint, gridSize: GridSize, color: number, alpha: number): void {
    if (!this.overlay) {
      return;
    }
    const points = diamondPoints(point, gridSize);
    this.overlay.lineStyle(1, color, alpha);
    this.overlay.strokePoints(points, true, true);
  }

  private fillDiamond(point: GridPoint, gridSize: GridSize, color: number, alpha: number): void {
    if (!this.overlay) {
      return;
    }
    const points = diamondPoints(point, gridSize);
    this.overlay.fillStyle(color, alpha);
    this.overlay.fillPoints(points, true, true);
  }
}

function diamondPoints(point: GridPoint, gridSize: GridSize): Phaser.Math.Vector2[] {
  const center = toIso(point, gridSize);
  return [
    new Phaser.Math.Vector2(center.x, center.y - ISO_TILE_FOOTPRINT.halfHeight),
    new Phaser.Math.Vector2(center.x + ISO_TILE_FOOTPRINT.halfWidth, center.y),
    new Phaser.Math.Vector2(center.x, center.y + ISO_TILE_FOOTPRINT.halfHeight),
    new Phaser.Math.Vector2(center.x - ISO_TILE_FOOTPRINT.halfWidth, center.y),
  ];
}

function depthBias(tile: TileKind): number {
  switch (tile) {
    case 'wall':
      return 12;
    case 'door':
      return 8;
    case 'stairUp':
    case 'stairDown':
      return 4;
    case 'floor':
    case 'void':
      return 0;
  }
}
