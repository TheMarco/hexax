import { CONFIG } from '../config.js';

export class CollisionSystem {
  constructor(entityManager, state) {
    this.entityManager = entityManager;
    this.state = state;
    this.onHit = null; // callback(lane, depth, prevDepth, color) when a hit occurs
    this.onWallDeflect = null; // callback() when bullet hits a wall
  }

  resolve() {
    const { bullets, enemies, walls, doublewalls } = this.entityManager;

    for (const bullet of bullets) {
      if (!bullet.alive) continue;
      const bulletDepth = Math.floor(bullet.depth);

      // Check walls — bullet is destroyed, wall lights up
      let hitWall = false;
      for (const wall of walls) {
        if (!wall.alive) continue;
        if (bulletDepth === wall.depth && bullet.lane === wall.lane) {
          bullet.kill();
          wall.hitFlash = 1.0;
          if (this.onWallDeflect) this.onWallDeflect();
          hitWall = true;
          break;
        }
      }
      if (hitWall) continue;

      for (const dw of doublewalls) {
        if (!dw.alive) continue;
        if (bulletDepth === dw.depth && (bullet.lane === dw.lane || bullet.lane === dw.lane2)) {
          bullet.kill();
          dw.hitFlash = 1.0;
          if (this.onWallDeflect) this.onWallDeflect();
          hitWall = true;
          break;
        }
      }
      if (hitWall) continue;

      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        if (bulletDepth === enemy.depth && bullet.lane === enemy.lane) {
          bullet.kill();

          // Distance bonus: +50% score for kills at depth >= 4 (far away)
          const distBonus = enemy.depth >= 4 ? 1.5 : 1.0;

          if (enemy.type === 'heart') {
            enemy.kill();
            this.state.health = 100;
            if (this.onHit) this.onHit(enemy.lane, enemy.depth, enemy.prevDepth, CONFIG.COLORS.HEART);
          } else if (enemy.type === 'bomb') {
            // Bomb: explode it and kill ALL alive enemies
            enemy.kill();
            this.state.addScore(Math.round(100 * distBonus));
            if (this.onHit) this.onHit(enemy.lane, enemy.depth, enemy.prevDepth, CONFIG.COLORS.BOMB);

            for (const e of enemies) {
              if (!e.alive || e === enemy) continue;
              const color = e.type === 'tank' ? CONFIG.COLORS.TANK : e.type === 'bomb' ? CONFIG.COLORS.BOMB : e.type === 'heart' ? CONFIG.COLORS.HEART : CONFIG.COLORS.ENEMY;
              e.kill();
              this.state.addScore(100);
              if (this.onHit) this.onHit(e.lane, e.depth, e.prevDepth, color);
            }
            // Bump multiplier for chain kills
            this.state.scoreMultiplier = Math.min(this.state.scoreMultiplier + 0.5, 4);
          } else if (enemy.type === 'tank') {
            const dead = enemy.hit();
            if (dead) {
              this.state.addScore(Math.round(200 * distBonus));
              if (this.onHit) this.onHit(enemy.lane, enemy.depth, enemy.prevDepth, CONFIG.COLORS.TANK);
            } else {
              this.state.addScore(Math.round(50 * distBonus));
              if (this.onHit) this.onHit(enemy.lane, enemy.depth, enemy.prevDepth, CONFIG.COLORS.TANK);
            }
          } else {
            enemy.kill();
            this.state.addScore(Math.round(100 * distBonus));
            if (this.onHit) this.onHit(enemy.lane, enemy.depth, enemy.prevDepth, CONFIG.COLORS.ENEMY);
            // Increment multiplier on consecutive kills
            this.state.scoreMultiplier = Math.min(this.state.scoreMultiplier + 0.1, 4);
          }
          break;
        }
      }
    }
  }
}
