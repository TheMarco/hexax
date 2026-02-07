import { CONFIG } from '../config.js';

const PARTICLE_COUNT = 12; // fewer, chunkier pieces like Vectrex
const PARTICLE_SPEED = 200; // moderate speed
const PARTICLE_LIFE_MS = 1200; // snappy lifetime
const TAIL_LENGTH = 50; // long vector streaks

// Match tunnel line thickness for visibility
const LINE_WIDTH = 2.5;

const CX = CONFIG.CENTER_X;
const CY = CONFIG.CENTER_Y;

export class ExplosionRenderer {
  constructor() {
    this.explosions = []; // array of { particles: [...], elapsed: 0 }
    this._prevAngle = 0;
  }

  spawn(x, y, color) {
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = PARTICLE_SPEED * (0.6 + Math.random() * 0.7);

      // Boost brightness to match tunnel lines
      const r = Math.min(255, ((color >> 16) & 0xff) * 1.3);
      const g = Math.min(255, ((color >> 8) & 0xff) * 1.3);
      const b = Math.min(255, (color & 0xff) * 1.3);
      const particleColor = Phaser.Display.Color.GetColor(r, g, b);

      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: particleColor,
        length: 0.9 + Math.random() * 0.6, // long, varied tails
      });
    }
    this.explosions.push({ particles, elapsed: 0 });
  }

  update(delta, rotAngle) {
    const dt = delta / 1000;

    // Rotate all particles around tunnel center when the angle changes
    const dAngle = rotAngle - this._prevAngle;
    this._prevAngle = rotAngle;
    if (dAngle !== 0) {
      const cos = Math.cos(dAngle);
      const sin = Math.sin(dAngle);
      for (const exp of this.explosions) {
        for (const p of exp.particles) {
          // Rotate position
          const dx = p.x - CX;
          const dy = p.y - CY;
          p.x = CX + dx * cos - dy * sin;
          p.y = CY + dx * sin + dy * cos;
          // Rotate velocity
          const vx = p.vx;
          p.vx = vx * cos - p.vy * sin;
          p.vy = vx * sin + p.vy * cos;
        }
      }
    }

    for (const exp of this.explosions) {
      exp.elapsed += delta;
      for (const p of exp.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Minimal drag for long floating trails
        p.vx *= 0.985;
        p.vy *= 0.985;
      }
    }
    // Remove expired
    this.explosions = this.explosions.filter(e => e.elapsed < PARTICLE_LIFE_MS);
  }

  draw(gfx) {
    for (const exp of this.explosions) {
      const lifeRatio = 1 - exp.elapsed / PARTICLE_LIFE_MS;
      if (lifeRatio <= 0) continue;

      // Exponential fade — bright at start, accelerating decay toward end
      const alpha = lifeRatio * lifeRatio;

      for (const p of exp.particles) {
        // Draw as a sharp trailing line (pure vector streak, no glow)
        const tailLen = TAIL_LENGTH * p.length;
        const tailX = p.x - (p.vx / PARTICLE_SPEED) * tailLen;
        const tailY = p.y - (p.vy / PARTICLE_SPEED) * tailLen;

        gfx.lineStyle(LINE_WIDTH, p.color, alpha);
        gfx.beginPath();
        gfx.moveTo(tailX, tailY);
        gfx.lineTo(p.x, p.y);
        gfx.strokePath();
      }
    }
  }
}
