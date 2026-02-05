import { CONFIG } from '../config.js';

const PARTICLE_COUNT = 12; // fewer, chunkier pieces like Vectrex
const PARTICLE_SPEED = 200; // moderate speed
const PARTICLE_LIFE_MS = 2200; // very long persistence
const TAIL_LENGTH = 50; // long vector streaks
const FADE_START = 0.85; // stay full brightness until 85% of lifetime, then snap off

// Single-pass sharp vector lines (no glow/blur)
const LINE_WIDTH = 1.5;

export class ExplosionRenderer {
  constructor() {
    this.explosions = []; // array of { particles: [...], elapsed: 0 }
  }

  spawn(x, y, color) {
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = PARTICLE_SPEED * (0.6 + Math.random() * 0.7);

      // Match the brightness of active lane highlights (full intensity)
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
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

  update(delta) {
    const dt = delta / 1000;
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

      // Stay full brightness until FADE_START, then quick fade/snap off
      let alpha = 1.0;
      if (lifeRatio < (1 - FADE_START)) {
        alpha = lifeRatio / (1 - FADE_START);
      }

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
