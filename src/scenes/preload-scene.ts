import Phaser from 'phaser';
import { TILE_ASSET_ENTRIES } from '../presentation/bindings/cathedral-assets';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    for (const asset of TILE_ASSET_ENTRIES) {
      this.load.image(asset.key, asset.path);
    }
  }

  create(): void {
    this.scene.start('DungeonGenerationLabScene');
  }
}
