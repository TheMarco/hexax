import Phaser from 'phaser';
import { CONFIG } from '../config.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create() {
    this.gfx = this.add.graphics();
    this.gfx.setBlendMode(Phaser.BlendModes.ADD);

    this.time = 0;

    // Pulsing alpha for "PRESS SPACE"
    this.pressSpaceAlpha = 1.0;
    this.pressSpaceDir = -1;

    // Start game on space
    this.input.keyboard.once('keydown-SPACE', () => {
      this.scene.start('GameScene');
    });
  }

  update(time, delta) {
    this.time += delta / 1000;
    this.gfx.clear();

    const cx = CONFIG.CENTER_X;
    const cy = CONFIG.CENTER_Y;

    // Animated hex wireframe background
    this.drawAnimatedHexGrid();

    // Title: HEXAX
    this.drawTitle(cx, cy - 120);

    // Subtitle
    this.gfx.lineStyle(1.5, CONFIG.COLORS.TUNNEL, 0.8);
    this.add.text(cx, cy - 40, 'VECTOR TUNNEL SHOOTER', {
      fontFamily: 'Hyperspace',
      fontSize: '32px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(10);

    // Press Space (pulsing)
    this.pressSpaceAlpha += this.pressSpaceDir * delta / 500;
    if (this.pressSpaceAlpha <= 0.5) {
      this.pressSpaceAlpha = 0.5;
      this.pressSpaceDir = 1;
    } else if (this.pressSpaceAlpha >= 1.0) {
      this.pressSpaceAlpha = 1.0;
      this.pressSpaceDir = -1;
    }

    const pressColor = Phaser.Display.Color.GetColor(
      Math.floor(0xff * this.pressSpaceAlpha),
      Math.floor(0xff * this.pressSpaceAlpha),
      Math.floor(0xff * this.pressSpaceAlpha)
    );

    this.add.text(cx, cy + 80, 'PRESS SPACE TO START', {
      fontFamily: 'Hyperspace',
      fontSize: '38px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(10).setAlpha(this.pressSpaceAlpha);

    // Copyright
    this.add.text(cx, CONFIG.HEIGHT - 40, '© 2026 AI & DESIGN GAME STUDIOS', {
      fontFamily: 'Hyperspace',
      fontSize: '22px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(10).setAlpha(0.9);

    // Clean up text objects (Phaser keeps creating new ones each frame)
    // Store references to avoid memory leak
    if (!this._textObjects) {
      this._textObjects = this.children.list.filter(c => c.type === 'Text');
    } else {
      // Remove old text objects
      const currentTexts = this.children.list.filter(c => c.type === 'Text');
      for (const txt of this._textObjects) {
        txt.destroy();
      }
      this._textObjects = currentTexts;
    }
  }

  drawTitle(cx, cy) {
    // Draw "HEXAX" with vector outline letters
    const letterSpacing = 70;
    const startX = cx - (5 * letterSpacing) / 2;

    this.drawLetterH(startX, cy);
    this.drawLetterE(startX + letterSpacing, cy);
    this.drawLetterX(startX + letterSpacing * 2, cy);
    this.drawLetterA(startX + letterSpacing * 3, cy);
    this.drawLetterX(startX + letterSpacing * 4, cy);
  }

  drawLetterH(x, y) {
    this.gfx.lineStyle(3, CONFIG.COLORS.TUNNEL, 1.0);
    this.gfx.beginPath();
    this.gfx.moveTo(x - 20, y - 30);
    this.gfx.lineTo(x - 20, y + 30);
    this.gfx.moveTo(x - 20, y);
    this.gfx.lineTo(x + 20, y);
    this.gfx.moveTo(x + 20, y - 30);
    this.gfx.lineTo(x + 20, y + 30);
    this.gfx.strokePath();
  }

  drawLetterE(x, y) {
    this.gfx.lineStyle(3, CONFIG.COLORS.TUNNEL, 1.0);
    this.gfx.beginPath();
    this.gfx.moveTo(x + 20, y - 30);
    this.gfx.lineTo(x - 20, y - 30);
    this.gfx.lineTo(x - 20, y + 30);
    this.gfx.lineTo(x + 20, y + 30);
    this.gfx.moveTo(x - 20, y);
    this.gfx.lineTo(x + 15, y);
    this.gfx.strokePath();
  }

  drawLetterX(x, y) {
    this.gfx.lineStyle(3, CONFIG.COLORS.TUNNEL, 1.0);
    this.gfx.beginPath();
    this.gfx.moveTo(x - 20, y - 30);
    this.gfx.lineTo(x + 20, y + 30);
    this.gfx.moveTo(x + 20, y - 30);
    this.gfx.lineTo(x - 20, y + 30);
    this.gfx.strokePath();
  }

  drawLetterA(x, y) {
    this.gfx.lineStyle(3, CONFIG.COLORS.TUNNEL, 1.0);
    this.gfx.beginPath();
    this.gfx.moveTo(x - 20, y + 30);
    this.gfx.lineTo(x, y - 30);
    this.gfx.lineTo(x + 20, y + 30);
    this.gfx.moveTo(x - 12, y + 5);
    this.gfx.lineTo(x + 12, y + 5);
    this.gfx.strokePath();
  }

  drawAnimatedHexGrid() {
    const cx = CONFIG.CENTER_X;
    const cy = CONFIG.CENTER_Y;

    // Draw multiple expanding hex rings
    for (let i = 0; i < 5; i++) {
      const phase = (this.time * 0.3 + i * 0.5) % 3;
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
