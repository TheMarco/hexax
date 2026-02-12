import { CONFIG } from '../config.js';

export class CollisionSystem {
  constructor(entityManager, state) {
    this.entityManager = entityManager;
    this.state = state;
    this.onHit = null; // callback(lane, visualDepth, color, opts?) when a hit occurs (instant kills)
    this.onWallDeflect = null; // callback(entity, hitDepth) when bullet hits a wall
    this.onHeartCollect = null; // callback() when bullet hits a heart
    this.pendingKills = []; // deferred visual kills: ghost bullet advances to enemy, then explosion
  }

  resolve(bulletLerp = 0, enemyLerp = 0) {
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
          bullet.hitDepth = wall.depth;
          bullet.hitPrevDepth = wall.prevDepth;
          wall.hitFlash = 1.0;
          // Capture wall's visual depth at collision time (frozen, won't jump on next tick)
          const wallVisualDepth = wall.prevDepth + (wall.depth - wall.prevDepth) * enemyLerp;
          if (this.onWallDeflect) this.onWallDeflect(wall, wallVisualDepth);
          hitWall = true;
          break;
        }
      }
      if (hitWall) continue;

      for (const dw of doublewalls) {
        if (!dw.alive) continue;
        if (bulletDepth === dw.depth && (bullet.lane === dw.lane || bullet.lane === dw.lane2)) {
          bullet.kill();
          bullet.hitDepth = dw.depth;
          bullet.hitPrevDepth = dw.prevDepth;
          dw.hitFlash = 1.0;
          const dwVisualDepth = dw.prevDepth + (dw.depth - dw.prevDepth) * enemyLerp;
          if (this.onWallDeflect) this.onWallDeflect(dw, dwVisualDepth);
          hitWall = true;
          break;
        }
      }
      if (hitWall) continue;

      for (const enemy of enemies) {
        if (!enemy.alive || enemy.dying || enemy.pendingKill) continue;
        if (bulletDepth === enemy.depth && bullet.lane === enemy.lane) {
          // Phase enemy in shielded state — deflect like a wall (instant)
          if (enemy.type === 'phase' && enemy.phase === 'shielded') {
            bullet.kill();
            bullet.hitDepth = enemy.depth;
            bullet.hitPrevDepth = enemy.prevDepth;
            enemy.hitFlash = 1.0;
            const phaseVisualDepth = enemy.prevDepth + (enemy.depth - enemy.prevDepth) * enemyLerp;
            if (this.onWallDeflect) this.onWallDeflect(enemy, phaseVisualDepth);
            break;
          }

          bullet.kill();
          bullet.hitDepth = enemy.depth;
          bullet.hitPrevDepth = enemy.prevDepth;

          // Distance bonus: +50% score for kills at depth >= 4 (far away)
          const distBonus = enemy.depth >= 4 ? 1.5 : 1.0;

          // Compute bullet's visual position at collision time for ghost bullet start
          const bulletVisualDepth = bullet.prevDepth + (bullet.depth - bullet.prevDepth) * bulletLerp;

          if (enemy.type === 'heart') {
            // Instant — healing needs immediate feedback
            const enemyVisualDepth = enemy.prevDepth + (enemy.depth - enemy.prevDepth) * enemyLerp;
            enemy.kill();
            this.state.health = 100;
            this.state.repairAllSegments();
            if (this.onHeartCollect) this.onHeartCollect();
            if (this.onHit) this.onHit(enemy.lane, enemyVisualDepth, CONFIG.COLORS.HEART, { entityType: 'heart' });
          } else if (enemy.type === 'bomb') {
            // Instant — chain kills are a visual spectacle
            const enemyVisualDepth = enemy.prevDepth + (enemy.depth - enemy.prevDepth) * enemyLerp;
            enemy.kill();
            this.state.addScore(Math.round(100 * distBonus));
            if (this.onHit) this.onHit(enemy.lane, enemyVisualDepth, CONFIG.COLORS.BOMB, { entityType: 'bomb' });

            for (const e of enemies) {
              if (!e.alive || e === enemy || e.dying) continue;
              const color = e.type === 'tank' ? CONFIG.COLORS.TANK : e.type === 'bomb' ? CONFIG.COLORS.BOMB : e.type === 'heart' ? CONFIG.COLORS.HEART : e.type === 'phase' ? CONFIG.COLORS.PHASE : e.type === 'spiral' ? CONFIG.COLORS.SPIRAL : CONFIG.COLORS.ENEMY;
              const eVisual = e.prevDepth + (e.depth - e.prevDepth) * enemyLerp;
              // Cancel any pending kill for this enemy
              if (e.pendingKill) {
                this.pendingKills = this.pendingKills.filter(pk => pk.enemy !== e);
              }
              e.kill();
              this.state.addScore(100);
              if (this.onHit) this.onHit(e.lane, eVisual, color, { entityType: e.type });
            }
            // Bump multiplier for chain kills
            this.state.scoreMultiplier = Math.min(this.state.scoreMultiplier + 0.5, 4);
          } else if (enemy.type === 'tank') {
            const dead = enemy.hit();
            if (dead) {
              // hit() called kill() — resurrect for deferred rendering
              enemy.alive = true;
              enemy.pendingKill = true;
              this.state.addScore(Math.round(200 * distBonus));
              // Explode at the surviving ball (opposite of hitSide)
              const tankSide = enemy.hitSide === 'left' ? 'right' : 'left';
              this.pendingKills.push({
                enemy, color: CONFIG.COLORS.TANK, lane: enemy.lane,
                ghostDepth: bulletVisualDepth, elapsed: 0, tankSide,
                entityType: 'tank_kill',
              });
            } else {
              // Tank survives — instant explosion at the destroyed ball (hitSide)
              const enemyVisualDepth = enemy.prevDepth + (enemy.depth - enemy.prevDepth) * enemyLerp;
              this.state.addScore(Math.round(50 * distBonus));
              if (this.onHit) this.onHit(enemy.lane, enemyVisualDepth, CONFIG.COLORS.TANK, { tankSide: enemy.hitSide, entityType: 'tank_hit' });
            }
            this.state.scoreMultiplier = Math.min(this.state.scoreMultiplier + 0.1, 4);
          } else if (enemy.type === 'spiral' && enemy.prevLane !== enemy.lane) {
            // Spiral mid-lane-change: defer explosion until animation completes
            enemy.dying = true;
            enemy.dyingColor = CONFIG.COLORS.SPIRAL;
            this.state.addScore(Math.round(100 * distBonus));
            this.state.scoreMultiplier = Math.min(this.state.scoreMultiplier + 0.1, 4);
          } else {
            // Regular enemy / phase vulnerable / spiral same lane — DEFERRED kill
            const hitColor = enemy.type === 'phase' ? CONFIG.COLORS.PHASE : enemy.type === 'spiral' ? CONFIG.COLORS.SPIRAL : CONFIG.COLORS.ENEMY;
            this.state.addScore(Math.round(100 * distBonus));
            this.state.scoreMultiplier = Math.min(this.state.scoreMultiplier + 0.1, 4);

            enemy.pendingKill = true;
            this.pendingKills.push({
              enemy, color: hitColor, lane: enemy.lane,
              ghostDepth: bulletVisualDepth, elapsed: 0,
              entityType: enemy.type,
            });
          }
          break;
        }
      }
    }
  }
}
