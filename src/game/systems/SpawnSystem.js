import { CONFIG } from '../config.js';
import { Enemy } from '../entities/Enemy.js';
import { Wall } from '../entities/Wall.js';
import { Tank } from '../entities/Tank.js';
import { DoubleWall } from '../entities/DoubleWall.js';
import { Bomb } from '../entities/Bomb.js';
import { Heart } from '../entities/Heart.js';

// Base spawn weights (relative, will be normalized after gating)
const WEIGHTS = {
  enemy:      55,
  wall:       14,
  doublewall: 9,
  tank:       11,
  bomb:       9,
  heart:      2,
};

// Entity unlock times (seconds)
const UNLOCK_TIMES = {
  enemy:      0,
  wall:       20,
  tank:       40,
  doublewall: 70,
  bomb:       100,
  heart:      100,
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
    this.ticksSinceSpawn = 0;

    // Pattern moment state
    this._patternTimer = 0;       // ticks until next pattern
    this._patternDuration = 0;    // ticks remaining in current pattern
    this._activePattern = null;   // current pattern object or null
    this._spiralLane = 0;         // for spiral pattern
    this._gapLane = 0;            // for gap pattern
    this._nextPatternIn();        // schedule first pattern
  }

  reset() {
    this.ticksSinceSpawn = 0;
    this._patternTimer = 0;
    this._patternDuration = 0;
    this._activePattern = null;
    this._spiralLane = 0;
    this._gapLane = 0;
    this._nextPatternIn();
  }

  _nextPatternIn() {
    // 30-45 seconds / TICK_MS = ticks until next pattern
    const secs = 30 + Math.random() * 15;
    this._patternTimer = Math.round(secs * 1000 / CONFIG.TICK_MS);
  }

  _startPattern() {
    // Pick random pattern
    const idx = Math.floor(Math.random() * PATTERNS.length);
    this._activePattern = PATTERNS[idx];
    // 6-10 seconds duration in ticks
    const secs = 6 + Math.random() * 4;
    this._patternDuration = Math.round(secs * 1000 / CONFIG.TICK_MS);
    this._spiralLane = Math.floor(Math.random() * CONFIG.NUM_LANES);
    this._gapLane = Math.floor(Math.random() * CONFIG.NUM_LANES);
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

  _pickType(unlocked, wallCapped) {
    // Build weighted pool from unlocked types, excluding walls if capped
    let total = 0;
    const pool = [];
    for (const type of unlocked) {
      if (wallCapped && (type === 'wall' || type === 'doublewall')) continue;
      const w = WEIGHTS[type];
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
    // Update pattern timing
    if (this._activePattern) {
      this._patternDuration--;
      if (this._patternDuration <= 0) {
        this._activePattern = null;
        this._nextPatternIn();
      }
    } else {
      this._patternTimer--;
      if (this._patternTimer <= 0) {
        this._startPattern();
      }
    }

    this.ticksSinceSpawn++;
    const interval = this.state.getSpawnInterval();

    if (this.ticksSinceSpawn >= interval) {
      this.ticksSinceSpawn = 0;

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
    }
  }

  // --- Pattern implementations ---

  _patternAdjacent() {
    // Walls prefer adjacent lanes
    const unlocked = this._getUnlockedTypes();
    const wallCapped = this._getActiveWallCount() >= this._getMaxActiveWalls();
    const hasWalls = unlocked.includes('wall') && !wallCapped;

    if (hasWalls && Math.random() < 0.6) {
      const lane = Math.floor(Math.random() * CONFIG.NUM_LANES);
      this._spawnType('wall', lane);
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
