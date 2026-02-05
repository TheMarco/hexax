import { CONFIG } from '../config.js';

export class HUD {
  constructor(scene) {
    this.scene = scene;
    this.state = scene.state;

    this.scoreText = scene.add.text(16, 10, 'SCORE: 0', {
      fontFamily: 'Hyperspace',
      fontSize: '42px',
      color: CONFIG.COLORS.HUD,
      stroke: CONFIG.COLORS.HUD,
      strokeThickness: 1,
    });
    this.scoreText.setDepth(10);

    this.gameOverText = scene.add.text(CONFIG.CENTER_X, CONFIG.CENTER_Y - 48, '', {
      fontFamily: 'Hyperspace',
      fontSize: '48px',
      color: '#ffffff',
      align: 'center',
      stroke: '#ffffff',
      strokeThickness: 1,
    });
    this.gameOverText.setOrigin(0.5);
    this.gameOverText.setDepth(10);
  }

  update() {
    this.scoreText.setText(`SCORE: ${this.state.score}`);

    if (this.state.gameOver) {
      this.gameOverText.setText('GAME OVER\nPress R to Restart');
    } else {
      this.gameOverText.setText('');
    }
  }
}
