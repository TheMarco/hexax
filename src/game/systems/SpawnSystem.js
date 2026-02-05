import { CONFIG } from '../config.js';
import { Enemy } from '../entities/Enemy.js';
import { Wall } from '../entities/Wall.js';
import { Tank } from '../entities/Tank.js';
import { DoubleWall } from '../entities/DoubleWall.js';

// Spawn distribution: 65% enemy, 15% wall, 10% double wall, 10% tank
const SPAWN_THRESHOLDS = {
  ENEMY: 0.65,
  WALL: 0.80,    // 0.65 + 0.15
  DOUBLEWALL: 0.90, // 0.80 + 0.10
  // remaining 10% = tank
};

export class SpawnSystem {
  constructor(entityManager, state) {
    this.entityManager = entityManager;
    this.state = state;
    this.ticksSinceSpawn = 0;
  }

  reset() {
    this.ticksSinceSpawn = 0;
  }

  maybeSpawn() {
    this.ticksSinceSpawn++;
    const interval = this.state.getSpawnInterval();

    if (this.ticksSinceSpawn >= interval) {
      this.ticksSinceSpawn = 0;
      const lane = Math.floor(Math.random() * CONFIG.NUM_LANES);
      const roll = Math.random();

      if (roll < SPAWN_THRESHOLDS.ENEMY) {
        this.entityManager.addEnemy(new Enemy(lane, CONFIG.MAX_DEPTH));
      } else if (roll < SPAWN_THRESHOLDS.WALL) {
        this.entityManager.addWall(new Wall(lane, CONFIG.MAX_DEPTH));
      } else if (roll < SPAWN_THRESHOLDS.DOUBLEWALL) {
        this.entityManager.addDoubleWall(new DoubleWall(lane, CONFIG.MAX_DEPTH));
      } else {
        // Tank — stored in enemies array (behaves like enemy for collision/game-over)
        this.entityManager.addEnemy(new Tank(lane, CONFIG.MAX_DEPTH));
      }
    }
  }
}
