import Phaser from 'phaser';
import { CONFIG } from './config.js';
import { GameScene } from './scenes/GameScene.js';

export function StartGame(containerId) {
  return new Phaser.Game({
    type: Phaser.CANVAS,
    parent: containerId,
    width: CONFIG.WIDTH,
    height: CONFIG.HEIGHT,
    backgroundColor: CONFIG.COLORS.BG,
    scene: [GameScene],
    render: {
      pixelArt: false,
      antialias: true,
    },
  });
}
