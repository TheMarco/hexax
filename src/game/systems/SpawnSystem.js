import { CONFIG } from '../config.js';
import { Enemy } from '../entities/Enemy.js';
import { Wall } from '../entities/Wall.js';
import { Tank } from '../entities/Tank.js';
import { DoubleWall } from '../entities/DoubleWall.js';
import { Bomb } from '../entities/Bomb.js';
import { Heart } from '../entities/Heart.js';
import { PhaseEnemy } from '../entities/PhaseEnemy.js';
import { SpiralEnemy } from '../entities/SpiralEnemy.js';

// Base spawn weights (relative, will be normalized after gating)
const WEIGHTS = {
  enemy:      55,
  wall:       14,
  doublewall: 9,
  tank:       11,
  bomb:       9,
  heart:      2,
  phase:      10,
  spiral:     16,
};

// Entity unlock times (seconds)
const UNLOCK_TIMES = {
  enemy:      0,
  wall:       20,
  tank:       15,
  doublewall: 70,
  bomb:       100,
  heart:      100,
  phase:      15,
  spiral:     70,
};

// Pattern definitions
const PATTERNS = [
  { name: 'adjacent',   apply: (sys) => sys._patternAdjacent() },
  { name: 'spiral',     apply: (sys) => sys._patternSpiral() },
  { name: 'gap',        apply: (sys) => sys._patternGap() },
  { name: 'enemyRush',  apply: (sys) => sys._patternEnemyRush() },
];

export class SpawnSystem {
  constructor(entityManager, state) {
    this.entityManager = entityManager;
    this.state = state;
    this.spawnBudget = 0;

    // Pattern moment state (ms-based to avoid drift as tick speed changes)
    this._nextPatternAt = 0;      // elapsedMs when next pattern starts
    this._patternEndAt = 0;       // elapsedMs when current pattern ends
    this._activePattern = null;   // current pattern object or null
    this._spiralLane = 0;         // for spiral pattern
    this._gapLane = 0;            // for gap pattern
    this._adjacentLane = 0;       // for adjacent pattern
    this._nextPatternIn();        // schedule first pattern

    // Test mode: cycle through all enemy types (?test flag)
    this._testMode = window.location.search.includes('test');
    this._testSequence = ['enemy', 'tank', 'bomb', 'heart', 'phase', 'spiral', 'wall', 'doublewall'];
    this._testIndex = 0;
  }

  reset() {
    this.spawnBudget = 0;
    this._nextPatternAt = 0;
    this._patternEndAt = 0;
    this._activePattern = null;
    this._spiralLane = 0;
    this._gapLane = 0;
    this._adjacentLane = 0;
    this._nextPatternIn();
  }

  _nextPatternIn() {
    // 30-45 seconds from now (in elapsed game time)
    const secs = 30 + Math.random() * 15;
    this._nextPatternAt = this.state.elapsedMs + secs * 1000;
  }

  _startPattern() {
    // Pick random pattern
    const idx = Math.floor(Math.random() * PATTERNS.length);
    this._activePattern = PATTERNS[idx];
    // 6-10 seconds duration (in elapsed game time)
    const secs = 6 + Math.random() * 4;
    this._patternEndAt = this.state.elapsedMs + secs * 1000;
    this._spiralLane = Math.floor(Math.random() * CONFIG.NUM_LANES);
    this._gapLane = Math.floor(Math.random() * CONFIG.NUM_LANES);
    this._adjacentLane = Math.floor(Math.random() * CONFIG.NUM_LANES);
  }

  _getUnlockedTypes() {
    const secs = this.state.getElapsedSeconds();
    const types = [];
    for (const [type, time] of Object.entries(UNLOCK_TIMES)) {
      if (secs >= time) types.push(type);
    }
    return types;
  }

  _getActiveWallCount() {
    let count = 0;
    for (const w of this.entityManager.walls) {
      if (w.alive) count++;
    }
    for (const dw of this.entityManager.doublewalls) {
      if (dw.alive) count++;
    }
    return count;
  }

  _getMaxActiveWalls() {
    const secs = this.state.getElapsedSeconds();
    return Math.min(1 + Math.floor(secs / 35), 4);
  }

  _getDynamicWeight(type) {
    const secs = this.state.getElapsedSeconds();
    if (type === 'heart') {
      // 2 at unlock (100s) → 12 at 300s (~10% of full pool)
      const t = Math.min(Math.max((secs - 100) / 200, 0), 1);
      return 2 + t * 10;
    }
    if (type === 'spiral') {
      // 16 at unlock (70s) → 55 at 250s (~1 in 3 spawns)
      const t = Math.min(Math.max((secs - 70) / 180, 0), 1);
      return 16 + t * 39;
    }
    return WEIGHTS[type];
  }

  _pickType(unlocked, wallCapped) {
    // Build weighted pool from unlocked types, excluding walls if capped
    let total = 0;
    const pool = [];
    for (const type of unlocked) {
      if (wallCapped && (type === 'wall' || type === 'doublewall')) continue;
      if (type === 'heart' && this.state.health >= 80) continue;
      const w = this._getDynamicWeight(type);
      pool.push({ type, weight: w });
      total += w;
    }
    if (pool.length === 0) return 'enemy'; // fallback

    let roll = Math.random() * total;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) return entry.type;
    }
    return pool[pool.length - 1].type;
  }

  maybeSpawn() {
    // Test mode: cycle through all enemy types
    if (this._testMode) {
      const interval = 2; // spawn every 2 ticks in test mode
      this.spawnBudget = (this.spawnBudget || 0) + (1 / interval);

      if (this.spawnBudget >= 1) {
        this.spawnBudget -= 1;
        const type = this._testSequence[this._testIndex];
        this._testIndex = (this._testIndex + 1) % this._testSequence.length;
        const lane = Math.floor(Math.random() * CONFIG.NUM_LANES);
        this._spawnType(type, lane);
      }
      return;
    }

    // Update pattern timing (ms-based, immune to tick speed changes)
    if (this._activePattern) {
      if (this.state.elapsedMs >= this._patternEndAt) {
        this._activePattern = null;
        this._nextPatternIn();
      }
    } else {
      if (this.state.elapsedMs >= this._nextPatternAt) {
        this._startPattern();
      }
    }

    const interval = this.state.getSpawnInterval();
    this.spawnBudget = (this.spawnBudget || 0) + (1 / interval);

    if (this.spawnBudget >= 1) {
      this.spawnBudget -= 1;

      // Apply active pattern if any
      if (this._activePattern) {
        this._activePattern.apply(this);
        return;
      }

      // Normal spawn
      this._spawnNormal();
    }
  }

  _spawnNormal(forceLane) {
    const lane = forceLane !== undefined ? forceLane : Math.floor(Math.random() * CONFIG.NUM_LANES);
    const unlocked = this._getUnlockedTypes();
    const wallCapped = this._getActiveWallCount() >= this._getMaxActiveWalls();
    const type = this._pickType(unlocked, wallCapped);

    this._spawnType(type, lane);
  }

  _spawnType(type, lane) {
    switch (type) {
      case 'enemy':
        this.entityManager.addEnemy(new Enemy(lane, CONFIG.MAX_DEPTH));
        break;
      case 'wall':
        this.entityManager.addWall(new Wall(lane, CONFIG.MAX_DEPTH));
        break;
      case 'doublewall':
        this.entityManager.addDoubleWall(new DoubleWall(lane, CONFIG.MAX_DEPTH));
        break;
      case 'tank':
        this.entityManager.addEnemy(new Tank(lane, CONFIG.MAX_DEPTH));
        break;
      case 'bomb':
        this.entityManager.addEnemy(new Bomb(lane, CONFIG.MAX_DEPTH));
        break;
      case 'heart':
        this.entityManager.addEnemy(new Heart(lane, CONFIG.MAX_DEPTH));
        break;
      case 'phase':
        this.entityManager.addEnemy(new PhaseEnemy(lane, CONFIG.MAX_DEPTH));
        break;
      case 'spiral':
        this.entityManager.addEnemy(new SpiralEnemy(lane, CONFIG.MAX_DEPTH));
        break;
    }
  }

  // --- Pattern implementations ---

  _patternAdjacent() {
    // Walls on successive adjacent lanes, forming a wall formation
    const unlocked = this._getUnlockedTypes();
    const wallCapped = this._getActiveWallCount() >= this._getMaxActiveWalls();
    const hasWalls = unlocked.includes('wall') && !wallCapped;

    if (hasWalls && Math.random() < 0.6) {
      this._adjacentLane = (this._adjacentLane + 1) % CONFIG.NUM_LANES;
      this._spawnType('wall', this._adjacentLane);
    } else {
      this._spawnNormal();
    }
  }

  _patternSpiral() {
    // Spawn lanes increment modulo 6
    const lane = this._spiralLane % CONFIG.NUM_LANES;
    this._spiralLane = (this._spiralLane + 1) % CONFIG.NUM_LANES;

    const unlocked = this._getUnlockedTypes();
    const wallCapped = this._getActiveWallCount() >= this._getMaxActiveWalls();
    const type = this._pickType(unlocked, wallCapped);
    this._spawnType(type, lane);
  }

  _patternGap() {
    // One lane is guaranteed empty
    let lane = Math.floor(Math.random() * CONFIG.NUM_LANES);
    if (lane === this._gapLane) lane = (lane + 1) % CONFIG.NUM_LANES;

    const unlocked = this._getUnlockedTypes();
    const wallCapped = this._getActiveWallCount() >= this._getMaxActiveWalls();
    const type = this._pickType(unlocked, wallCapped);
    this._spawnType(type, lane);
  }

  _patternEnemyRush() {
    // Enemies only
    const lane = Math.floor(Math.random() * CONFIG.NUM_LANES);
    this._spawnType('enemy', lane);
  }
}
