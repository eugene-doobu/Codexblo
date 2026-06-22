import Phaser from 'phaser';
import { DUNGEON_ASSET_ENTRIES } from '../presentation/bindings/dungeon-assets';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    // The dev lab preloads the small placeholder packs up front so switching
    // dungeon type or resource pack is immediate; render-time lookup still
    // uses the active request.resourcePackId.
    for (const asset of DUNGEON_ASSET_ENTRIES) {
      this.load.image(asset.key, asset.path);
    }
  }

  create(): void {
    this.scene.start('DungeonGenerationLabScene');
  }
}
