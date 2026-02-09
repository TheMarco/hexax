import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { HighScore } from '../HighScore.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  preload() {
    this.load.image('logo', '/logo.png');
  }

  create() {
    this.gfx = this.add.graphics();
    this.gfx.setBlendMode(Phaser.BlendModes.ADD);

    this.elapsed = 0;

    // Pulsing alpha for "PRESS FIRE"
    this.pressFireAlpha = 1.0;
    this.pressFireDir = -1;

    // Create green-tinted logo for CRT mode (Phaser Canvas renderer ignores setTint)
    if (!this.textures.exists('logo-green')) {
      const src = this.textures.get('logo').getSourceImage();
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(src, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#7cffb2';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(src, 0, 0); // restore original alpha
      this.textures.addCanvas('logo-green', c);
    }

    // Logo with bloom effect — multiple layers with additive blend
    const logoScale = (CONFIG.WIDTH * 0.8) / this.textures.get('logo').getSourceImage().width;

    // Bloom layers (behind main logo)
    this.logoBloom3 = this.add.image(CONFIG.CENTER_X, CONFIG.CENTER_Y - 100, 'logo');
    this.logoBloom3.setScale(logoScale * 1.06);
    this.logoBloom3.setAlpha(0.15);
    this.logoBloom3.setBlendMode(Phaser.BlendModes.ADD);
    this.logoBloom3.setDepth(7);

    this.logoBloom2 = this.add.image(CONFIG.CENTER_X, CONFIG.CENTER_Y - 100, 'logo');
    this.logoBloom2.setScale(logoScale * 1.03);
    this.logoBloom2.setAlpha(0.3);
    this.logoBloom2.setBlendMode(Phaser.BlendModes.ADD);
    this.logoBloom2.setDepth(8);

    this.logoBloom1 = this.add.image(CONFIG.CENTER_X, CONFIG.CENTER_Y - 100, 'logo');
    this.logoBloom1.setScale(logoScale * 1.01);
    this.logoBloom1.setAlpha(0.5);
    this.logoBloom1.setBlendMode(Phaser.BlendModes.ADD);
    this.logoBloom1.setDepth(9);

    // Main logo on top
    this.logo = this.add.image(CONFIG.CENTER_X, CONFIG.CENTER_Y - 100, 'logo');
    this.logo.setScale(logoScale);
    this.logo.setDepth(10);

    // High Score display (top of screen)
    const highScore = HighScore.get();
    this.highScoreText = this.add.text(CONFIG.CENTER_X, 40, `HIGH SCORE: ${highScore}`, {
      fontFamily: 'Hyperspace',
      fontSize: '32px',
      color: '#7cffb2',
      align: 'center',
    }).setOrigin(0.5).setDepth(10);

    // Press Fire text (pulsing)
    this.pressFireText = this.add.text(CONFIG.CENTER_X, CONFIG.CENTER_Y + 100, 'PRESS FIRE TO START', {
      fontFamily: 'Hyperspace',
      fontSize: '38px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(10);

    // Copyright
    this.copyrightText = this.add.text(CONFIG.CENTER_X, CONFIG.HEIGHT - 40, '\u00a9 2026 AI & DESIGN GAME STUDIOS', {
      fontFamily: 'Hyperspace',
      fontSize: '28px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(10).setAlpha(0.9);

    // Start game on space
    this.input.keyboard.once('keydown-SPACE', () => {
      this.scene.start('GameScene');
    });
  }

  update(time, delta) {
    this.elapsed += delta / 1000;
    this.gfx.clear();

    // Animated hex wireframe background
    this.drawAnimatedHexGrid();

    // Swap logo texture based on display mode (setTint doesn't work in Canvas renderer)
    const overlay = this.game.registry.get('shaderOverlay');
    const isCRT = overlay && overlay.getShaderName() === 'crt';
    const logoTexture = isCRT ? 'logo-green' : 'logo';
    this.logo.setTexture(logoTexture);
    this.logoBloom1.setTexture(logoTexture);
    this.logoBloom2.setTexture(logoTexture);
    this.logoBloom3.setTexture(logoTexture);

    // Pulsing "PRESS FIRE"
    this.pressFireAlpha += this.pressFireDir * delta / 500;
    if (this.pressFireAlpha <= 0.5) {
      this.pressFireAlpha = 0.5;
      this.pressFireDir = 1;
    } else if (this.pressFireAlpha >= 1.0) {
      this.pressFireAlpha = 1.0;
      this.pressFireDir = -1;
    }
    this.pressFireText.setAlpha(this.pressFireAlpha);
  }

  drawAnimatedHexGrid() {
    const cx = CONFIG.CENTER_X;
    const cy = CONFIG.CENTER_Y;

    for (let i = 0; i < 5; i++) {
      const phase = (this.elapsed * 0.3 + i * 0.5) % 3;
      const radius = 50 + phase * 100;
      const alpha = 1.0 - phase / 3;

      this.gfx.lineStyle(1.5, CONFIG.COLORS.TUNNEL, alpha * 0.4);
      this.drawHex(cx, cy, radius);
    }
  }

  drawHex(cx, cy, radius) {
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI / 3) + CONFIG.ANGLE_OFFSET;
      points.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    }

    this.gfx.beginPath();
    this.gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < 6; i++) {
      this.gfx.lineTo(points[i].x, points[i].y);
    }
    this.gfx.closePath();
    this.gfx.strokePath();
  }
}
