import Phaser from 'phaser';
import { CONFIG } from './config.js';
import { GameScene } from './scenes/GameScene.js';
import { createShaderOverlay } from './shaderOverlay.js';

export function StartGame(containerId) {
  const game = new Phaser.Game({
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
    scale: {
      zoom: CONFIG.GAME_SCALE,
      width: CONFIG.WIDTH,
      height: CONFIG.HEIGHT,
    },
  });

  // Apply CRT shader overlay after canvas is ready
  setTimeout(() => {
    createShaderOverlay(game.canvas);
  }, 100);

  return game;
}
