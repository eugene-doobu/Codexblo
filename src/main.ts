import Phaser from 'phaser';
import './styles/global.css';
import { BootScene } from './scenes/boot-scene';
import { PreloadScene } from './scenes/preload-scene';
import { DungeonGenerationLabScene } from './scenes/dev/dungeon-generation-lab-scene';

const host = document.querySelector<HTMLElement>('#game');
if (!host) {
  throw new Error('Missing #game host.');
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: host,
  backgroundColor: '#07080b',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: host.clientWidth,
    height: host.clientHeight,
  },
  render: {
    pixelArt: true,
    antialias: false,
  },
  scene: [BootScene, PreloadScene, DungeonGenerationLabScene],
});