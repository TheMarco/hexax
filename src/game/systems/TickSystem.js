import { CONFIG } from '../config.js';

export class TickSystem {
  constructor(scene, state, entityManager, collisionSystem, spawnSystem) {
    this.scene = scene;
    this.state = state;
    this.entityManager = entityManager;
    this.collisionSystem = collisionSystem;
    this.spawnSystem = spawnSystem;
    this.onEnemyMove = null;    // callback(depthSet) after entities move
    this.onGameOver = null;     // callback() when player dies
    this.onPlayerHit = null;    // callback(lane, color) when player takes damage
    this.onWallHit = null;      // callback(tier) when wall hits player (1, 2, or 3)
    this.onSegmentDamage = null; // callback(result) when segment integrity changes

    // Slow timer: enemies move, spawn, game-over check
    // Delay adjusts dynamically each tick via getTickMs()
    this.enemyTimer = scene.time.addEvent({
      delay: CONFIG.TICK_MS,
      callback: this._onEnemyTick,
      callbackScope: this,
      loop: true,
    });
    this._currentTickMs = CONFIG.TICK_MS;

    // Fast timer: bullets move 1 segment per interval
    this.bulletTimer = scene.time.addEvent({
      delay: CONFIG.BULLET_TICK_MS,
      callback: this._onBulletTick,
      callbackScope: this,
      loop: true,
    });
  }

  _onEnemyTick() {
    if (this.state.gameOver) return;

    // Cleanup from previous enemy tick (lets dead enemies/walls render one full cycle)
    this.entityManager.removeDeadEnemiesAndWalls();

    // Spawn before movement so new entities move immediately
    this.spawnSystem.maybeSpawn();

    // Move enemies and walls (skip dying spirals — pendingKill enemies keep ticking for smooth visuals)
    for (const e of this.entityManager.enemies) {
      if (e.alive && !e.dying) e.tick();
    }
    for (const w of this.entityManager.walls) {
      if (w.alive) w.tick();
    }
    for (const dw of this.entityManager.doublewalls) {
      if (dw.alive) dw.tick();
    }

    // Notify ring flash — use prevDepth because the lerp hasn't started yet,
    // so entities still render at their previous position visually
    if (this.onEnemyMove) {
      const depths = new Set();
      for (const e of this.entityManager.enemies) {
        if (e.alive && e.prevDepth >= 0) depths.add(e.prevDepth);
      }
      for (const w of this.entityManager.walls) {
        if (w.alive && w.prevDepth >= 0) depths.add(w.prevDepth);
      }
      for (const dw of this.entityManager.doublewalls) {
        if (dw.alive && dw.prevDepth >= 0) depths.add(dw.prevDepth);
      }
      this.onEnemyMove(depths);
    }

    // Collisions (player can shoot enemies that just reached depth 0)
    // Enemy timer just fired: enemyLerp = 0 (entities just moved to new positions)
    // bulletLerp = wherever the bullet timer is in its cycle
    this.collisionSystem.resolve(this.bulletTimer.getProgress(), 0);

    // Remove dead enemies immediately so damage check doesn't see them
    this.entityManager.removeDeadEnemies();

    // Damage checks — enemies that reached the player (skip pendingKill — already scored)
    for (const enemy of this.entityManager.enemies) {
      if (enemy.alive && !enemy.dying && !enemy.pendingKill && enemy.depth < 0) {
        let dmg = 10;
        let color = CONFIG.COLORS.ENEMY;
        if (enemy.type === 'tank') { dmg = enemy.hp >= 2 ? 20 : 10; color = CONFIG.COLORS.TANK; }
        else if (enemy.type === 'bomb') { dmg = 20; color = CONFIG.COLORS.BOMB; }
        else if (enemy.type === 'heart') { color = CONFIG.COLORS.HEART; }
        else if (enemy.type === 'phase') { color = CONFIG.COLORS.PHASE; }
        else if (enemy.type === 'spiral') { color = CONFIG.COLORS.SPIRAL; }
        enemy.kill();
        this.state.scoreMultiplier = 1; // reset multiplier on any player hit
        if (this.onPlayerHit) this.onPlayerHit(enemy.lane, color);

        // Segment integrity damage (not for hearts — they just pass through)
        if (enemy.type !== 'heart') {
          const segResult = this.state.damageSegment(enemy.lane);
          if (this.onSegmentDamage) this.onSegmentDamage(segResult);
          if (segResult.fatal) {
            if (this.onGameOver) this.onGameOver();
            return;
          }
        }

        if (this.state.takeDamage(dmg)) {
          if (this.onGameOver) this.onGameOver();
          return;
        }
      }
    }

    // Wall escalation — 3-tier system
    for (const wall of this.entityManager.walls) {
      if (wall.alive && wall.depth < 0) {
        const renderLane = this.state.getRenderLane(wall.lane);
        if (renderLane === 0) {
          wall.kill();
          const result = this.state.takeWallHit();
          if (this.onPlayerHit) this.onPlayerHit(wall.lane, CONFIG.COLORS.TUNNEL);
          if (this.onWallHit) this.onWallHit(result.tier);
          if (result.fatal) {
            if (this.onGameOver) this.onGameOver();
            return;
          }
        } else {
          wall.kill();
        }
      }
    }

    for (const dw of this.entityManager.doublewalls) {
      if (dw.alive && dw.depth < 0) {
        const renderLane1 = this.state.getRenderLane(dw.lane);
        const renderLane2 = this.state.getRenderLane(dw.lane2);
        if (renderLane1 === 0 || renderLane2 === 0) {
          dw.kill();
          const result = this.state.takeWallHit();
          if (this.onPlayerHit) this.onPlayerHit(dw.lane, CONFIG.COLORS.TUNNEL);
          if (this.onWallHit) this.onWallHit(result.tier);
          if (result.fatal) {
            if (this.onGameOver) this.onGameOver();
            return;
          }
        } else {
          dw.kill();
        }
      }
    }

    // Counters
    this.state.tickCount++;
    this.state.elapsedMs += this._currentTickMs;

    // Gradually speed up enemy tick rate
    const newTickMs = Math.round(this.state.getTickMs());
    if (newTickMs !== this._currentTickMs) {
      this._currentTickMs = newTickMs;
      this.enemyTimer.delay = newTickMs;
    }
  }

  _onBulletTick() {
    if (this.state.gameOver) return;

    // Only clean bullets here — enemies/walls cleaned on their own timer
    this.entityManager.removeDeadBullets();

    // enemyLerp is wherever the enemy timer is in its cycle
    const enemyLerp = this.enemyTimer.getProgress();

    // Check collisions BEFORE moving (catch enemies at depth 0 where bullet spawned)
    // Bullet timer just fired: bullet was visually at its current depth (lerp=1.0)
    this.collisionSystem.resolve(1.0, enemyLerp);
    this.entityManager.removeDeadEnemies();

    // Move bullets
    for (const b of this.entityManager.bullets) {
      if (b.alive) b.tick();
    }

    // Check collisions AFTER moving (bullet may have moved into an enemy)
    // Bullet just moved: visual starts at prevDepth (lerp=0.0)
    this.collisionSystem.resolve(0.0, enemyLerp);

    // Remove dead enemies immediately so they vanish on hit (explosion already spawned)
    this.entityManager.removeDeadEnemies();

    // Fire cooldown
    if (this.state.fireCooldown > 0) {
      this.state.fireCooldown--;
    }
  }
}
