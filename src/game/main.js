import Phaser from 'phaser';
import { CONFIG } from './config.js';
import { TitleScene } from './scenes/TitleScene.js';
import { GameScene } from './scenes/GameScene.js';

export function StartGame(containerId, isNative) {
  const config = {
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
  };

  // On native handheld, scale to fill viewport while maintaining aspect ratio
  if (isNative) {
    config.scale = {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: CONFIG.WIDTH,
      height: CONFIG.HEIGHT,
    };
  }

  return new Phaser.Game(config);
}
