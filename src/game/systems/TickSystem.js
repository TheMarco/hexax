import { CONFIG } from '../config.js';

export class TickSystem {
  constructor(scene, state, entityManager, collisionSystem, spawnSystem) {
    this.scene = scene;
    this.state = state;
    this.entityManager = entityManager;
    this.collisionSystem = collisionSystem;
    this.spawnSystem = spawnSystem;
    this.onEnemyMove = null; // callback(depthSet) after entities move
    this.onGameOver = null;  // callback() when player dies

    // Slow timer: enemies move, spawn, game-over check
    this.enemyTimer = scene.time.addEvent({
      delay: CONFIG.TICK_MS,
      callback: this._onEnemyTick,
      callbackScope: this,
      loop: true,
    });

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

    // Move enemies and walls
    for (const e of this.entityManager.enemies) {
      if (e.alive) e.tick();
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
    this.collisionSystem.resolve();

    // Remove dead enemies immediately so game-over check doesn't see them
    this.entityManager.removeDeadEnemies();

    // Game-over checks — enemy went past player depth (depth < 0)
    for (const enemy of this.entityManager.enemies) {
      if (enemy.alive && enemy.depth < 0) {
        this.state.gameOver = true;
        if (this.onGameOver) this.onGameOver();
        return;
      }
    }

    for (const wall of this.entityManager.walls) {
      if (wall.alive && wall.depth < 0) {
        const renderLane = this.state.getRenderLane(wall.lane);
        if (renderLane === 0) {
          this.state.gameOver = true;
          if (this.onGameOver) this.onGameOver();
          return;
        }
        // Dodged — remove it
        wall.kill();
      }
    }

    for (const dw of this.entityManager.doublewalls) {
      if (dw.alive && dw.depth < 0) {
        const renderLane1 = this.state.getRenderLane(dw.lane);
        const renderLane2 = this.state.getRenderLane(dw.lane2);
        if (renderLane1 === 0 || renderLane2 === 0) {
          this.state.gameOver = true;
          if (this.onGameOver) this.onGameOver();
          return;
        }
        // Dodged — remove it
        dw.kill();
      }
    }

    // Spawn
    this.spawnSystem.maybeSpawn();

    // Counters
    this.state.tickCount++;
    this.state.elapsedMs += CONFIG.TICK_MS;
  }

  _onBulletTick() {
    if (this.state.gameOver) return;

    // Only clean bullets here — enemies/walls cleaned on their own timer
    this.entityManager.removeDeadBullets();

    // Check collisions BEFORE moving (catch enemies at depth 0 where bullet spawned)
    this.collisionSystem.resolve();
    this.entityManager.removeDeadEnemies();

    // Move bullets
    for (const b of this.entityManager.bullets) {
      if (b.alive) b.tick();
    }

    // Check collisions AFTER moving (bullet may have moved into an enemy)
    this.collisionSystem.resolve();

    // Remove dead enemies immediately so they vanish on hit (explosion already spawned)
    this.entityManager.removeDeadEnemies();

    // Fire cooldown
    if (this.state.fireCooldown > 0) {
      this.state.fireCooldown--;
    }
  }
}
