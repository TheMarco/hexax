import { CONFIG } from '../config.js';

export class TickSystem {
  constructor(scene, state, entityManager, collisionSystem, spawnSystem) {
    this.scene = scene;
    this.state = state;
    this.entityManager = entityManager;
    this.collisionSystem = collisionSystem;
    this.spawnSystem = spawnSystem;
    this.onEnemyMove = null; // callback(depthSet) after entities move

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

    // Notify ring flash — entities just arrived at new depths
    if (this.onEnemyMove) {
      const depths = new Set();
      for (const e of this.entityManager.enemies) {
        if (e.alive && e.depth >= 0) depths.add(e.depth);
      }
      for (const w of this.entityManager.walls) {
        if (w.alive && w.depth >= 0) depths.add(w.depth);
      }
      for (const dw of this.entityManager.doublewalls) {
        if (dw.alive && dw.depth >= 0) depths.add(dw.depth);
      }
      this.onEnemyMove(depths);
    }

    // Collisions (enemy may have moved into a bullet)
    this.collisionSystem.resolve();

    // Game over: enemy reaches depth 0
    for (const enemy of this.entityManager.enemies) {
      if (enemy.alive && enemy.depth <= 0) {
        this.state.gameOver = true;
        return;
      }
    }

    // Game over: wall reaches depth 0 on the player's current lane
    for (const wall of this.entityManager.walls) {
      if (wall.alive && wall.depth <= 0) {
        const renderLane = this.state.getRenderLane(wall.lane);
        if (renderLane === 0) {
          // Player is on this lane — game over
          this.state.gameOver = true;
          return;
        }
        // Dodged — remove it
        wall.kill();
      }
    }

    // Game over: double wall reaches depth 0 — check both lanes
    for (const dw of this.entityManager.doublewalls) {
      if (dw.alive && dw.depth <= 0) {
        const renderLane1 = this.state.getRenderLane(dw.lane);
        const renderLane2 = this.state.getRenderLane(dw.lane2);
        if (renderLane1 === 0 || renderLane2 === 0) {
          this.state.gameOver = true;
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

    // Move bullets
    for (const b of this.entityManager.bullets) {
      if (b.alive) b.tick();
    }

    // Collisions (bullet may have moved into an enemy)
    this.collisionSystem.resolve();

    // Remove dead enemies immediately so they vanish on hit (explosion already spawned)
    this.entityManager.removeDeadEnemies();

    // Fire cooldown
    if (this.state.fireCooldown > 0) {
      this.state.fireCooldown--;
    }
  }
}
