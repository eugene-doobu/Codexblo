import Phaser from 'phaser';
import type { GridPoint, GridRect } from '../../core/grid';
import { devilutionxCathedralRenderTileForTileId } from '../../domain/world/devilutionx-cathedral-raw';
import type { DungeonGenerationResult, DungeonObjectCategory, DungeonObjectPlacement, RenderTileKind, TileKind } from '../../domain/world/dungeon-generator';
import { isPassable } from '../../domain/world/dungeon-generator';
import { objectAssetKeysForResourcePack, tileAssetKeysForResourcePack } from '../bindings/dungeon-assets';
import { tileDepthBias } from './dungeon-render-depth';
import { ISO_TILE_FOOTPRINT, type GridSize, toIso } from './isometric-projection';

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
  assetKey: string;
  screenX: number;
  screenY: number;
  depth: number;
}

export class DungeonDebugRenderer {
  private readonly tileSprites: Phaser.GameObjects.Image[] = [];
  private readonly objectSprites: Phaser.GameObjects.Image[] = [];
  private readonly debugGraphics: Phaser.GameObjects.Graphics[] = [];
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
    const tileAssetKeys = tileAssetKeysForResourcePack(result.request.resourcePackId);
    const objectAssetKeys = objectAssetKeysForResourcePack(result.request.resourcePackId);
    const renderedTiles: RenderedTileSnapshot[] = [];
    const renderedObjects = objectSnapshots(level.objects ?? [], gridSize, objectAssetKeys);

    // Diablo-style view: all tile debug surfaces are placed on the same 2:1
    // isometric floor plane. Raw Cathedral ids remain available as a colored
    // diamond layer, but the camera/view never falls back to a top-down grid.
    const rawTiles = options.showRawTiles ? this.scene.add.graphics() : undefined;
    rawTiles?.setDepth(90000);
    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const tile = level.tiles[y][x];
        const rawValue = rawTileValues?.[y]?.[x];
        const renderTile = devilutionxCathedralRenderTileForTileId(rawValue) ?? level.renderTiles?.[y]?.[x] ?? tile;
        const assetKey = tileAssetKeys[renderTile] ?? tileAssetKeys[tile];
        const screen = toIso({ x, y }, gridSize);
        const depth = screen.y + tileDepthBias(renderTile);

        if (renderTile !== 'void') {
          const sprite = this.scene.add.image(screen.x, screen.y, assetKey);
          sprite.setOrigin(0.5, 0.5);
          sprite.setDepth(depth);
          sprite.setAlpha(1);
          sprite.setName(`tile-${x}-${y}-${renderTile}`);
          sprite.setData({
            gridX: x,
            gridY: y,
            tile,
            renderTile,
            assetKey,
            floorPlaneX: screen.x,
            floorPlaneY: screen.y,
          });
          this.tileSprites.push(sprite);
          renderedTiles.push({ x, y, tile, renderTile, assetKey, screenX: screen.x, screenY: screen.y, depth });
        }

        if (rawTiles && tile !== 'void') {
          const color = rawValue !== undefined ? rawTileColor(rawValue) : semanticTileColor(tile);
          fillDiamondAt(rawTiles, screen, color, 0.34);
        }
      }
    }
    if (rawTiles) {
      this.debugGraphics.push(rawTiles);
    }
    for (const object of renderedObjects) {
      const sprite = this.scene.add.image(object.screenX, object.screenY, object.assetKey);
      sprite.setOrigin(0.5, 0.75);
      sprite.setDepth(object.depth);
      sprite.setName(`object-${object.id}-${object.presetId}`);
      sprite.setData({
        id: object.id,
        presetId: object.presetId,
        assetKey: object.assetKey,
        gridX: object.x,
        gridY: object.y,
        width: object.width,
        height: object.height,
        floorPlaneX: object.screenX,
        floorPlaneY: object.screenY,
      });
      this.objectSprites.push(sprite);
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
      this.drawObjectFootprints(result);
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
    for (const sprite of this.objectSprites) {
      sprite.destroy();
    }
    this.objectSprites.length = 0;
    for (const graphics of this.debugGraphics) {
      graphics.destroy();
    }
    this.debugGraphics.length = 0;
    this.overlay?.destroy();
    this.overlay = undefined;
  }

  private drawGrid(width: number, height: number): void {
    if (!this.overlay) {
      return;
    }
    const gridSize = { width, height };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        this.drawDiamond({ x, y }, gridSize, 0x0b0d12, 0.42);
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

  private drawObjectFootprints(result: DungeonGenerationResult): void {
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
    fillDiamondAt(this.overlay, toIso(point, gridSize), color, alpha);
  }
}

function objectSnapshots(
  objects: readonly DungeonObjectPlacement[],
  gridSize: GridSize,
  objectAssetKeys: Readonly<Record<string, string | undefined>>,
): RenderedObjectSnapshot[] {
  return objects.map((object) => {
    const screen = objectScreenPoint(object, gridSize);
    const assetKey = objectAssetKeys[object.presetId];
    if (!assetKey) {
      throw new Error(`Missing object asset for ${object.presetId}.`);
    }
    return {
      id: object.id,
      presetId: object.presetId,
      category: object.category,
      x: object.position.x,
      y: object.position.y,
      width: object.size.width,
      height: object.size.height,
      blocksMovement: object.blocksMovement,
      assetKey,
      screenX: screen.x,
      screenY: screen.y,
      depth: objectDepth(object, gridSize),
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

function objectScreenPoint(object: DungeonObjectPlacement, gridSize: GridSize): { x: number; y: number } {
  return toIso(object.position, gridSize);
}

function objectDepth(object: DungeonObjectPlacement, gridSize: GridSize): number {
  const rearTile = toIso({
    x: object.position.x + object.size.width - 1,
    y: object.position.y + object.size.height - 1,
  }, gridSize);
  return rearTile.y + ISO_TILE_FOOTPRINT.halfHeight + objectDepthBias(object.presetId);
}

function objectDepthBias(presetId: string): number {
  switch (presetId) {
    case 'SHRINE':
      return 30;
    case 'BOOKCASE':
      return 28;
    case 'BARREL_CLUSTER':
      return 24;
    case 'SARCOPHAGUS':
      return 20;
    case 'WEAPON_RACK':
      return 26;
    default:
      return 24;
  }
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

function diamondPoints(point: GridPoint, gridSize: GridSize): Phaser.Math.Vector2[] {
  return diamondAround(toIso(point, gridSize));
}

function diamondAround(
  center: { x: number; y: number },
  halfWidth: number = ISO_TILE_FOOTPRINT.halfWidth,
  halfHeight: number = ISO_TILE_FOOTPRINT.halfHeight,
): Phaser.Math.Vector2[] {
  return [
    new Phaser.Math.Vector2(center.x, center.y - halfHeight),
    new Phaser.Math.Vector2(center.x + halfWidth, center.y),
    new Phaser.Math.Vector2(center.x, center.y + halfHeight),
    new Phaser.Math.Vector2(center.x - halfWidth, center.y),
  ];
}

function fillDiamondAt(graphics: Phaser.GameObjects.Graphics, center: { x: number; y: number }, color: number, alpha: number): void {
  graphics.fillStyle(color, alpha);
  graphics.fillPoints(diamondAround(center), true, true);
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
