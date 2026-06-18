import Phaser from 'phaser';
import type { GridPoint, GridRect } from '../../core/grid';
import type { DungeonGenerationResult, DungeonObjectCategory, DungeonObjectPlacement, RenderTileKind, TileKind } from '../../domain/world/dungeon-generator';
import { isPassable } from '../../domain/world/dungeon-generator';
import { tileAssetKeysForResourcePack } from '../bindings/dungeon-assets';
import { isCathedralStructureTile, tileDepthBias } from './dungeon-render-depth';
import { ISO_TILE_FOOTPRINT, type GridSize, toIso } from './isometric-projection';

export interface DebugOverlayOptions {
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
  screenX: number;
  screenY: number;
  depth: number;
}

export interface DungeonRenderSnapshot {
  gridSize: GridSize;
  tileFootprint: typeof ISO_TILE_FOOTPRINT;
  renderedTiles: readonly RenderedTileSnapshot[];
  renderedObjects: readonly RenderedObjectSnapshot[];
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

  render(result: DungeonGenerationResult, options: DebugOverlayOptions): DungeonRenderSnapshot {
    this.clear();
    const { level } = result;
    const gridSize = { width: level.width, height: level.height };
    const tileAssetKeys = tileAssetKeysForResourcePack(result.request.resourcePackId);
    const renderedTiles: RenderedTileSnapshot[] = [];
    const renderedObjects = objectSnapshots(level.objects ?? [], gridSize);

    this.drawCathedralStructureCohesion(level.renderTiles, gridSize);

    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const tile = level.tiles[y][x];
        if (tile === 'void' && !options.showGrid) {
          continue;
        }
        const renderTile = level.renderTiles?.[y]?.[x] ?? tile;
        const assetKey = tileAssetKeys[renderTile] ?? tileAssetKeys[tile];
        const screen = toIso({ x, y }, gridSize);
        const sprite = this.scene.add.image(screen.x, screen.y, assetKey);
        sprite.setOrigin(0.5, 0.5);
        const depth = screen.y + tileDepthBias(renderTile);
        sprite.setDepth(depth);
        sprite.setAlpha(tile === 'void' ? 0.25 : 1);
        sprite.setName(`tile-${x}-${y}-${renderTile}`);
        sprite.setData({
          gridX: x,
          gridY: y,
          tile,
          renderTile,
          floorPlaneX: screen.x,
          floorPlaneY: screen.y,
        });
        this.tileSprites.push(sprite);
        renderedTiles.push({ x, y, tile, renderTile, screenX: screen.x, screenY: screen.y, depth });
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
    if (options.showObjects) {
      this.drawObjects(result);
    }

    return {
      gridSize,
      tileFootprint: ISO_TILE_FOOTPRINT,
      renderedTiles,
      renderedObjects,
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

  private drawCathedralStructureCohesion(renderTiles: readonly (readonly RenderTileKind[])[] | undefined, gridSize: GridSize): void {
    if (!renderTiles) {
      return;
    }

    for (let y = 0; y < renderTiles.length; y += 1) {
      for (let x = 0; x < renderTiles[y].length; x += 1) {
        const renderTile = renderTiles[y][x];
        if (!isCathedralStructureTile(renderTile)) {
          continue;
        }

        const screen = toIso({ x, y }, gridSize);
        this.drawStructureBed(screen, screen.y + tileDepthBias(renderTile) - 6);

        for (const neighbor of [
          { x: x + 1, y },
          { x, y: y + 1 },
        ]) {
          if (isStructureAt(renderTiles, neighbor)) {
            const neighborScreen = toIso(neighbor, gridSize);
            this.drawStructureBridge(screen, neighborScreen);
          }
        }
      }
    }
  }

  private drawStructureBed(screen: { x: number; y: number }, depth: number): void {
    const graphics = this.scene.add.graphics();
    graphics.setDepth(depth);
    graphics.fillStyle(0x020304, 0.42);
    graphics.fillPoints(diamondAround(screen, 39, 20, 3), true, true);
    graphics.fillStyle(0x3f4654, 0.36);
    graphics.fillPoints(diamondAround(screen, 37, 18, 0), true, true);
    graphics.lineStyle(2, 0xbfc6d4, 0.26);
    graphics.strokePoints(diamondAround(screen, 37, 18, 0), true, true);
    this.structureCohesionGraphics.push(graphics);
  }

  private drawStructureBridge(start: { x: number; y: number }, end: { x: number; y: number }): void {
    const graphics = this.scene.add.graphics();
    graphics.setDepth(Math.max(start.y, end.y) + 6);
    graphics.lineStyle(17, 0x020304, 0.26);
    graphics.beginPath();
    graphics.moveTo(start.x, start.y + 4);
    graphics.lineTo(end.x, end.y + 4);
    graphics.strokePath();
    graphics.lineStyle(13, 0x596171, 0.62);
    graphics.beginPath();
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(end.x, end.y);
    graphics.strokePath();
    graphics.lineStyle(4, 0xc4cad8, 0.42);
    graphics.beginPath();
    graphics.moveTo(start.x, start.y - 4);
    graphics.lineTo(end.x, end.y - 4);
    graphics.strokePath();
    this.structureCohesionGraphics.push(graphics);
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

  private drawObjects(result: DungeonGenerationResult): void {
    if (!this.overlay) {
      return;
    }
    for (const object of result.level.objects ?? []) {
      this.drawRect(objectRect(object), result.level, objectColor(object.category), object.blocksMovement ? 0.34 : 0.2);
    }
  }

  private drawRect(rect: GridRect, gridSize: GridSize, color: number, alpha = 0.22): void {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        this.fillDiamond({ x, y }, gridSize, color, alpha);
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

function objectRect(object: DungeonObjectPlacement): GridRect {
  return {
    x: object.position.x,
    y: object.position.y,
    width: object.size.width,
    height: object.size.height,
  };
}

function objectColor(category: DungeonObjectCategory): number {
  switch (category) {
    case 'shrine':
      return 0xf59e0b;
    case 'lore':
      return 0x22c55e;
    case 'container':
      return 0xd97706;
    case 'tomb':
      return 0x94a3b8;
    case 'rack':
      return 0xef4444;
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

function diamondAround(center: { x: number; y: number }, halfWidth: number, halfHeight: number, yOffset: number): Phaser.Math.Vector2[] {
  return [
    new Phaser.Math.Vector2(center.x, center.y - halfHeight + yOffset),
    new Phaser.Math.Vector2(center.x + halfWidth, center.y + yOffset),
    new Phaser.Math.Vector2(center.x, center.y + halfHeight + yOffset),
    new Phaser.Math.Vector2(center.x - halfWidth, center.y + yOffset),
  ];
}

function isStructureAt(renderTiles: readonly (readonly RenderTileKind[])[], point: GridPoint): boolean {
  const row = renderTiles[point.y];
  if (!row) {
    return false;
  }
  const tile = row[point.x];
  return tile ? isCathedralStructureTile(tile) : false;
}
