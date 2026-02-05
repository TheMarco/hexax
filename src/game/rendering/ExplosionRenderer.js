import { CONFIG } from '../config.js';

const PARTICLE_COUNT = 16;
const PARTICLE_SPEED = 200;
const PARTICLE_LIFE_MS = 600;
const TAIL_LENGTH = 14;

const GLOW_PASSES = [
  { width: 8, alpha: 0.15 },
  { width: 4, alpha: 0.4 },
  { width: 1.5, alpha: 1.0 },
];

export class ExplosionRenderer {
  constructor() {
    this.explosions = []; // array of { particles: [...], elapsed: 0 }
  }

  spawn(x, y, color) {
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const speed = PARTICLE_SPEED * (0.5 + Math.random() * 0.8);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
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
        // Slight drag
        p.vx *= 0.96;
        p.vy *= 0.96;
      }
    }
    // Remove expired
    this.explosions = this.explosions.filter(e => e.elapsed < PARTICLE_LIFE_MS);
  }

  draw(gfx) {
    for (const exp of this.explosions) {
      const life = 1 - exp.elapsed / PARTICLE_LIFE_MS;
      for (const p of exp.particles) {
        // Draw as a short trailing line
        const tailX = p.x - (p.vx / PARTICLE_SPEED) * TAIL_LENGTH * life;
        const tailY = p.y - (p.vy / PARTICLE_SPEED) * TAIL_LENGTH * life;

        for (const pass of GLOW_PASSES) {
          gfx.lineStyle(pass.width, p.color, pass.alpha * life);
          gfx.beginPath();
          gfx.moveTo(tailX, tailY);
          gfx.lineTo(p.x, p.y);
          gfx.strokePath();
        }
      }
    }
  }
}
