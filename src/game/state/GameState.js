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
    this.segmentDamage = new Array(CONFIG.NUM_LANES).fill(false);
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

  /**
   * Mark a segment as damaged when an enemy gets through.
   * Returns { fatal, firstDamage, critical }
   */
  damageSegment(logicalLane) {
    if (this.segmentDamage[logicalLane]) {
      // Already damaged — tunnel explodes
      this.health = 0;
      this.gameOver = true;
      return { fatal: true, firstDamage: false, critical: false };
    }
    this.segmentDamage[logicalLane] = true;
    const count = this.getDamagedSegmentCount();
    return {
      fatal: false,
      firstDamage: count === 1,
      critical: count >= 4,
    };
  }

  repairAllSegments() {
    this.segmentDamage.fill(false);
  }

  getDamagedSegmentCount() {
    return this.segmentDamage.filter(Boolean).length;
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

  /**
   * Returns fractional spawn interval in ticks (not rounded).
   * 0s=3.5, 30s=3, 90s=2, 180s=1.25, 300s=1 (floor)
   * Smooth curve: no sudden jumps.
   */
  getSpawnInterval() {
    const secs = this.getElapsedSeconds();
    const t = Math.min(1, secs / 300); // 0→1 over 5 minutes
    return 3.5 - 2.5 * t;             // 3.5 → 1.0
  }

  /** Enemy tick speed — starts at TICK_MS, gradually drops to 500ms over 4 min */
  getTickMs() {
    const secs = this.getElapsedSeconds();
    const minTick = 500;
    const decay = Math.min(1, secs / 240); // 0→1 over 4 minutes
    return CONFIG.TICK_MS - (CONFIG.TICK_MS - minTick) * decay;
  }
}
