import { CONFIG } from '../config.js';

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.worldRot = 0;
    this.score = 0;
    this.gameOver = false;
    this.fireCooldown = 0;
    this.tickCount = 0;
    this.elapsedMs = 0;
  }

  rotateRight() {
    if (this.gameOver) return;
    this.worldRot = (this.worldRot + 5) % CONFIG.NUM_LANES;
  }

  rotateLeft() {
    if (this.gameOver) return;
    this.worldRot = (this.worldRot + 1) % CONFIG.NUM_LANES;
  }

  getRenderLane(logicalLane) {
    return (logicalLane - this.worldRot + CONFIG.NUM_LANES) % CONFIG.NUM_LANES;
  }

  getSpawnInterval() {
    const ramp = CONFIG.SPAWN_RAMP;
    let interval = ramp[0][1];
    for (const [threshold, ticks] of ramp) {
      if (this.elapsedMs >= threshold) {
        interval = ticks;
      }
    }
    return interval;
  }
}
