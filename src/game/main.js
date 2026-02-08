import Phaser from 'phaser';
import { CONFIG } from './config.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GameScene } from './scenes/GameScene.js';

export function StartGame(containerId) {
  return new Phaser.Game({
    type: Phaser.WEBGL,  // Switch to WebGL for proper depth control
    parent: containerId,
    width: CONFIG.WIDTH,
    height: CONFIG.HEIGHT,
    backgroundColor: CONFIG.COLORS.BG,
    scene: [TitleScene, GameScene],
    render: {
      pixelArt: false,
      antialias: true,
    },
  });
}
