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
      strokeThickness: 1.5,
    });
    this.scoreText.setDepth(10);

    this.multiplierText = scene.add.text(16, 52, '', {
      fontFamily: 'Hyperspace',
      fontSize: '24px',
      color: CONFIG.COLORS.HUD,
      stroke: CONFIG.COLORS.HUD,
      strokeThickness: 1.5,
    });
    this.multiplierText.setDepth(10);

    this.healthLabel = scene.add.text(CONFIG.WIDTH - 350, 10, 'HEALTH', {
      fontFamily: 'Hyperspace',
      fontSize: '42px',
      color: CONFIG.COLORS.HUD,
      stroke: CONFIG.COLORS.HUD,
      strokeThickness: 1.5,
    });
    this.healthLabel.setDepth(10);

    this.healthGfx = scene.add.graphics();
    this.healthGfx.setDepth(10);

    // Wall warning text — centered, large, fades out
    this.warningText = scene.add.text(CONFIG.CENTER_X, CONFIG.CENTER_Y - 120, '', {
      fontFamily: 'Hyperspace',
      fontSize: '36px',
      color: '#ffffff',
      align: 'center',
      stroke: '#ffffff',
      strokeThickness: 2,
    });
    this.warningText.setOrigin(0.5);
    this.warningText.setDepth(11);
    this._warningTimer = 0;

    // Health bar pulse state
    this._pulseTimer = 0;
    this._pulseActive = false;

    this.gameOverText = scene.add.text(CONFIG.CENTER_X, CONFIG.CENTER_Y - 48, '', {
      fontFamily: 'Hyperspace',
      fontSize: '48px',
      color: '#ffffff',
      align: 'center',
      stroke: '#ffffff',
      strokeThickness: 1.5,
    });
    this.gameOverText.setOrigin(0.5);
    this.gameOverText.setDepth(10);

    this.pauseText = scene.add.text(CONFIG.CENTER_X, CONFIG.CENTER_Y - 48, '', {
      fontFamily: 'Hyperspace',
      fontSize: '48px',
      color: CONFIG.COLORS.HUD,
      align: 'center',
      stroke: CONFIG.COLORS.HUD,
      strokeThickness: 1.5,
    });
    this.pauseText.setOrigin(0.5);
    this.pauseText.setDepth(12);
  }

  showWarning(tier) {
    if (tier === 1) {
      this.warningText.setText('WARNING');
      this._warningTimer = 2000;
    } else if (tier === 2) {
      this.warningText.setText('STRUCTURE CRITICAL');
      this._warningTimer = 3000;
      this._pulseActive = true;
      this._pulseTimer = 3000;
    }
    // Tier 3 = game over, no warning needed
  }

  showIntegrityWarning(message) {
    this.warningText.setText(message);
    this._warningTimer = 3000;
  }

  _drawHexDiagram(gfx) {
    const cx = CONFIG.CENTER_X;
    const cy = 40;
    const r = 16;
    const VISUAL_OFFSET = 2;

    // Compute hex vertices (flat-bottom, matching game orientation)
    const verts = [];
    for (let i = 0; i < 6; i++) {
      const angle = CONFIG.ANGLE_OFFSET + (i * Math.PI * 2) / 6;
      verts.push({
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      });
    }

    // Map logical damage to visual lanes (same as GameScene)
    const visualDamage = new Array(6).fill(false);
    for (let l = 0; l < 6; l++) {
      if (this.state.segmentDamage[l]) {
        const vl = (this.state.getRenderLane(l) + VISUAL_OFFSET) % 6;
        visualDamage[vl] = true;
      }
    }

    // Draw each face
    for (let i = 0; i < 6; i++) {
      const v1 = verts[i];
      const v2 = verts[(i + 1) % 6];

      if (visualDamage[i]) {
        // Damaged: filled red triangle from center + bright red edge
        gfx.fillStyle(0xff4444, 0.3);
        gfx.fillTriangle(cx, cy, v1.x, v1.y, v2.x, v2.y);
        gfx.lineStyle(2, 0xff4444, 1);
        gfx.beginPath();
        gfx.moveTo(v1.x, v1.y);
        gfx.lineTo(v2.x, v2.y);
        gfx.strokePath();
      } else {
        // Intact: green outline
        gfx.lineStyle(1.5, 0xa0ffd0, 0.8);
        gfx.beginPath();
        gfx.moveTo(v1.x, v1.y);
        gfx.lineTo(v2.x, v2.y);
        gfx.strokePath();
      }
    }
  }

  update(delta) {
    this.scoreText.setText(`SCORE: ${this.state.score}`);

    // Multiplier display
    if (this.state.scoreMultiplier > 1) {
      this.multiplierText.setText(`x${this.state.scoreMultiplier.toFixed(1)}`);
    } else {
      this.multiplierText.setText('');
    }

    // Warning text fade
    if (this._warningTimer > 0) {
      this._warningTimer -= delta;
      const alpha = Math.min(1, this._warningTimer / 500);
      this.warningText.setAlpha(alpha);
      if (this._warningTimer <= 0) {
        this.warningText.setText('');
        this.warningText.setAlpha(1);
      }
    }

    // Health bar pulse decay
    if (this._pulseActive) {
      this._pulseTimer -= delta;
      if (this._pulseTimer <= 0) {
        this._pulseActive = false;
      }
    }

    // Health bar — positioned to the right of the HEALTH label, vertically centered
    const barX = CONFIG.WIDTH - 190;
    const barY = 25;
    const barW = 174;
    const barH = 20;
    const pad = 5;
    const innerW = barW - pad * 2;
    const innerH = barH - pad * 2;
    const segments = 10;
    const segW = innerW / segments;
    const filledSegs = Math.ceil(this.state.health / 10);

    this.healthGfx.clear();

    // Pulse effect: alternate border brightness
    const pulseAlpha = this._pulseActive ? 0.5 + 0.5 * Math.sin(Date.now() * 0.01) : 1;
    const borderColor = this.state.health > 30 ? 0xa0ffd0 : 0xff4444;

    // Outer border
    this.healthGfx.lineStyle(2, borderColor, pulseAlpha);
    this.healthGfx.strokeRect(barX, barY, barW, barH);
    // Segment divider lines (only within filled area)
    for (let i = 1; i < filledSegs; i++) {
      const lx = barX + pad + i * segW;
      this.healthGfx.lineBetween(lx, barY + pad, lx, barY + pad + innerH);
    }
    // Inner bar snaps to segment boundaries
    if (filledSegs > 0) {
      const color = this.state.health > 30 ? 0xa0ffd0 : 0xff4444;
      this.healthGfx.lineStyle(2, color, pulseAlpha);
      this.healthGfx.strokeRect(barX + pad, barY + pad, filledSegs * segW, innerH);
    }

    // Mini hex integrity diagram — shows damaged segments
    this._drawHexDiagram(this.healthGfx);

    this.pauseText.setText(this.scene._paused ? 'PAUSED' : '');

    if (this.state.gameOver) {
      const canRestart = this.state.gameOverElapsed >= 3000;
      if (this.state.newHighScore) {
        this.gameOverText.setText(canRestart
          ? 'GAME OVER\n\nNEW HIGH SCORE!\n\nPress Fire to Restart'
          : 'GAME OVER\n\nNEW HIGH SCORE!');
      } else {
        this.gameOverText.setText(canRestart
          ? 'GAME OVER\nPress Fire to Restart'
          : 'GAME OVER');
      }
    } else {
      this.gameOverText.setText('');
    }
  }
}
