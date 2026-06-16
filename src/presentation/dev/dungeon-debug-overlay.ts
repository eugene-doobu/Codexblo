import Phaser from 'phaser';
import type { GridPoint, GridRect } from '../../core/grid';
import type { DungeonGenerationResult, TileKind } from '../../domain/world/dungeon-generator';
import { isPassable } from '../../domain/world/dungeon-generator';
import { TILE_ASSET_KEYS } from '../bindings/cathedral-assets';

const TILE_WIDTH = 72;
const TILE_HEIGHT = 48;
const ISO_STEP_Y = 24;

export interface DebugOverlayOptions {
  showGrid: boolean;
  showCollision: boolean;
  showConnectivity: boolean;
  showZones: boolean;
}

export class DungeonDebugRenderer {
  private readonly tileSprites: Phaser.GameObjects.Image[] = [];
  private overlay?: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {}

  render(result: DungeonGenerationResult, options: DebugOverlayOptions): void {
    this.clear();
    const { level } = result;

    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const tile = level.tiles[y][x];
        if (tile === 'void' && !options.showGrid) {
          continue;
        }
        const screen = toIso({ x, y }, level.width);
        const sprite = this.scene.add.image(screen.x, screen.y, TILE_ASSET_KEYS[tile]);
        sprite.setOrigin(0.5, 0.5);
        sprite.setDepth(screen.y + depthBias(tile));
        sprite.setAlpha(tile === 'void' ? 0.25 : 1);
        this.tileSprites.push(sprite);
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
    this.overlay.lineStyle(1, 0x6b7280, 0.2);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        this.drawDiamond({ x, y }, width, 0x6b7280, 0.16);
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
          this.fillDiamond({ x, y }, result.level.width, 0xff375f, 0.16);
        }
      }
    }
  }

  private drawConnectivity(result: DungeonGenerationResult): void {
    if (!this.overlay) {
      return;
    }
    for (const point of result.graph.reachableTiles) {
      this.fillDiamond(point, result.level.width, 0x4ade80, 0.12);
    }
    for (const point of result.graph.unreachablePassableTiles) {
      this.fillDiamond(point, result.level.width, 0xff0000, 0.55);
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
      this.drawRect(zone.rect, result.level.width, colorByKind[zone.kind]);
    }
  }

  private drawRect(rect: GridRect, width: number, color: number): void {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        this.fillDiamond({ x, y }, width, color, 0.22);
      }
    }
  }

  private drawDiamond(point: GridPoint, width: number, color: number, alpha: number): void {
    if (!this.overlay) {
      return;
    }
    const points = diamondPoints(point, width);
    this.overlay.lineStyle(1, color, alpha);
    this.overlay.strokePoints(points, true, true);
  }

  private fillDiamond(point: GridPoint, width: number, color: number, alpha: number): void {
    if (!this.overlay) {
      return;
    }
    const points = diamondPoints(point, width);
    this.overlay.fillStyle(color, alpha);
    this.overlay.fillPoints(points, true, true);
  }
}

export function toIso(point: GridPoint, levelWidth: number): GridPoint {
  return {
    x: (point.x - point.y) * (TILE_WIDTH / 2) + levelWidth * (TILE_WIDTH / 2),
    y: (point.x + point.y) * (TILE_HEIGHT / 4),
  };
}

function diamondPoints(point: GridPoint, width: number): Phaser.Math.Vector2[] {
  const center = toIso(point, width);
  return [
    new Phaser.Math.Vector2(center.x, center.y - ISO_STEP_Y / 2),
    new Phaser.Math.Vector2(center.x + TILE_WIDTH / 2, center.y),
    new Phaser.Math.Vector2(center.x, center.y + ISO_STEP_Y / 2),
    new Phaser.Math.Vector2(center.x - TILE_WIDTH / 2, center.y),
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