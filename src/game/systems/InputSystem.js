import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { Bullet } from '../entities/Bullet.js';

export class InputSystem {
  constructor(scene, state, entityManager) {
    this.scene = scene;
    this.state = state;
    this.entityManager = entityManager;

    this._pendingLeft = false;
    this._pendingRight = false;
    this._pendingFire = false;
    this._pendingRestart = false;

    scene.input.keyboard.on('keydown-LEFT', () => { this._pendingLeft = true; });
    scene.input.keyboard.on('keydown-RIGHT', () => { this._pendingRight = true; });
    scene.input.keyboard.on('keydown-SPACE', () => { this._pendingFire = true; });
    scene.input.keyboard.on('keydown-R', () => { this._pendingRestart = true; });
  }

  update() {
    if (this.state.gameOver) {
      if (this._pendingRestart) {
        this._pendingRestart = false;
        this.scene.scene.restart();
      }
      this._clearPending();
      return;
    }

    if (this._pendingLeft) {
      this.scene.startRotAnim(-1);
    }
    if (this._pendingRight) {
      this.scene.startRotAnim(1);
    }
    if (this._pendingFire) {
      this._fire();
    }

    this._clearPending();
  }

  _fire() {
    if (this.state.fireCooldown > 0) return;
    const lane = this.state.worldRot;
    // Only one bullet per lane at a time
    const alreadyOnLane = this.entityManager.bullets.some(
      b => b.alive && b.lane === lane
    );
    if (alreadyOnLane) return;
    this.entityManager.addBullet(new Bullet(lane, 0));
    this.state.fireCooldown = CONFIG.FIRE_COOLDOWN_BULLET_TICKS;
  }

  _clearPending() {
    this._pendingLeft = false;
    this._pendingRight = false;
    this._pendingFire = false;
    this._pendingRestart = false;
  }
}
