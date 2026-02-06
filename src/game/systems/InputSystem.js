import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { Bullet } from '../entities/Bullet.js';

const MAX_QUEUE = 4; // cap to prevent input spam buildup

export class InputSystem {
  constructor(scene, state, entityManager) {
    this.scene = scene;
    this.state = state;
    this.entityManager = entityManager;
    this.onFire = null; // callback when bullet is fired

    this._queue = []; // FIFO: 'left', 'right', 'fire'
    this._pendingRestart = false;

    scene.input.keyboard.on('keydown-LEFT', () => {
      if (this._queue.length < MAX_QUEUE) this._queue.push('left');
    });
    scene.input.keyboard.on('keydown-RIGHT', () => {
      if (this._queue.length < MAX_QUEUE) this._queue.push('right');
    });
    scene.input.keyboard.on('keydown-SPACE', () => {
      if (this._queue.length < MAX_QUEUE) this._queue.push('fire');
    });
    scene.input.keyboard.on('keydown-R', () => { this._pendingRestart = true; });
    scene.input.keyboard.on('keydown-SPACE', () => {
      if (this.state.gameOver) this._pendingRestart = true;
    });
  }

  update() {
    if (this.state.gameOver) {
      if (this._pendingRestart) {
        this._pendingRestart = false;
        this.scene.scene.restart();
      }
      this._queue.length = 0;
      return;
    }

    // Process queued actions one at a time; rotations block until animation completes
    while (this._queue.length > 0) {
      // If mid-rotation, wait for it to finish before processing next action
      if (this.scene.isRotating) return;

      const action = this._queue[0];

      if (action === 'left') {
        this._queue.shift();
        this.scene.startRotAnim(-1);
        return; // wait for rotation to finish before next action
      } else if (action === 'right') {
        this._queue.shift();
        this.scene.startRotAnim(1);
        return; // wait for rotation to finish before next action
      } else if (action === 'fire') {
        this._queue.shift();
        this._fire();
        // fire is instant, continue processing queue
      }
    }
  }

  _fire() {
    if (this.state.fireCooldown > 0) return;
    const lane = this.state.worldRot;
    this.entityManager.addBullet(new Bullet(lane, 0.2));
    this.state.fireCooldown = CONFIG.FIRE_COOLDOWN_BULLET_TICKS;
    if (this.onFire) this.onFire();
  }
}
