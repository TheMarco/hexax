import { CONFIG } from '../config.js';

export class CollisionSystem {
  constructor(entityManager, state) {
    this.entityManager = entityManager;
    this.state = state;
    this.onHit = null; // callback(lane, depth, prevDepth, color) when a hit occurs
  }

  resolve() {
    const { bullets, enemies } = this.entityManager;

    for (const bullet of bullets) {
      if (!bullet.alive) continue;
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        if (bullet.depth === enemy.depth && bullet.lane === enemy.lane) {
          bullet.kill();

          if (enemy.type === 'tank') {
            const dead = enemy.hit();
            if (dead) {
              this.state.score += 200;
              if (this.onHit) this.onHit(enemy.lane, enemy.depth, enemy.prevDepth, CONFIG.COLORS.TANK);
            } else {
              this.state.score += 50;
              if (this.onHit) this.onHit(enemy.lane, enemy.depth, enemy.prevDepth, CONFIG.COLORS.TANK);
            }
          } else {
            enemy.kill();
            this.state.score += 100;
            if (this.onHit) this.onHit(enemy.lane, enemy.depth, enemy.prevDepth, CONFIG.COLORS.ENEMY);
          }
          break;
        }
      }
    }
  }
}
