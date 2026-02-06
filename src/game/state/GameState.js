import { CONFIG } from '../config.js';

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.worldRot = 0;
    this.score = 0;
    this.health = 100;
    this.wallHits = 0;
    this.scoreMultiplier = 1;
    this.gameOver = false;
    this.fireCooldown = 0;
    this.tickCount = 0;
    this.elapsedMs = 0;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.gameOver = true;
      return true; // dead
    }
    return false;
  }

  /**
   * Wall escalation: returns { damage, tier, fatal }
   * Tier 1: -30 HP, Tier 2: -60 HP, Tier 3: instant death
   */
  takeWallHit() {
    this.wallHits++;
    this.scoreMultiplier = 1; // reset multiplier on wall hit

    if (this.wallHits >= 3) {
      this.health = 0;
      this.gameOver = true;
      return { damage: 0, tier: 3, fatal: true };
    } else if (this.wallHits === 2) {
      const fatal = this.takeDamage(60);
      return { damage: 60, tier: 2, fatal };
    } else {
      const fatal = this.takeDamage(30);
      return { damage: 30, tier: 1, fatal };
    }
  }

  addScore(base) {
    this.score += Math.round(base * this.scoreMultiplier);
  }

  rotateRight() {
    if (this.gameOver) return;
    this.worldRot = (this.worldRot + 5) % CONFIG.NUM_LANES;
  }

  rotateLeft() {
    if (this.gameOver) return;
    this.worldRot = (this.worldRot + 1) % CONFIG.NUM_LANES;
  }

  getRenderLane(logicalLane) {
    return (logicalLane - this.worldRot + CONFIG.NUM_LANES) % CONFIG.NUM_LANES;
  }

  getElapsedSeconds() {
    return this.elapsedMs / 1000;
  }

  getSpawnInterval() {
    const secs = this.getElapsedSeconds();
    return Math.max(1, Math.min(4, Math.round(3.8 - Math.sqrt(secs / 18))));
  }

  /** Enemy tick speed — starts at TICK_MS, gradually drops to 500ms by ~2.5 min */
  getTickMs() {
    const secs = this.getElapsedSeconds();
    const minTick = 500;
    const decay = Math.min(1, secs / 150); // 0→1 over 2.5 minutes
    return CONFIG.TICK_MS - (CONFIG.TICK_MS - minTick) * decay * decay;
  }
}
