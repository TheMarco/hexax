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
    this.newHighScore = false;
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
   * Spawn interval with steep early ramp + plateaus for mastery.
   * 0s=3.5 → 60s=2.3 (steep early ramp)
   * 70-100s: plateau for spiral mastery (2.2)
   * 100-420s: final ramp to 1.5
   */
  getSpawnInterval() {
    const secs = this.getElapsedSeconds();
    if (secs < 60) {
      // Steep initial ramp: 3.5 → 2.3
      return 3.5 - 1.2 * Math.min(1, secs / 60);
    } else if (secs < 70) {
      // Gentle approach to plateau: 2.3 → 2.2
      const t = (secs - 60) / 10;
      return 2.3 - 0.1 * t;
    } else if (secs < 100) {
      // PLATEAU 1: Spiral mastery
      return 2.2;
    } else {
      // Final ramp: 2.2 → 1.5 over 320s
      const t = Math.min(1, (secs - 100) / 320);
      return 2.2 - 0.7 * t;
    }
  }

  /**
   * Tick speed with steep early ramp + plateaus for mastery.
   * 0s=800ms → 60s=700ms (steep early ramp)
   * 70-100s: plateau for spiral mastery (690ms)
   * 100-150s: plateau for bomb/heart mastery (680ms)
   * 150-480s: final ramp to 600ms
   */
  getTickMs() {
    const secs = this.getElapsedSeconds();
    if (secs < 60) {
      // Steep initial ramp: 800 → 700
      return 800 - 100 * Math.min(1, secs / 60);
    } else if (secs < 70) {
      // Gentle approach: 700 → 690
      const t = (secs - 60) / 10;
      return 700 - 10 * t;
    } else if (secs < 100) {
      // PLATEAU 1: Spiral mastery
      return 690;
    } else if (secs < 150) {
      // PLATEAU 2: Bomb/heart mastery
      return 680;
    } else {
      // Final ramp: 680 → 600 over 330s
      const t = Math.min(1, (secs - 150) / 330);
      return 680 - 80 * t;
    }
  }
}
