import { Entity } from './Entity.js';
import { CONFIG } from '../config.js';

export class SpiralEnemy extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'spiral');
    this.spinDir = Math.random() < 0.5 ? 1 : -1;
    this.prevLane = lane;
    this.spinTick = 0;
  }

  tick() {
    this.prevDepth = this.depth;
    this.prevLane = this.lane;
    this.depth -= 1;
    this.spinTick++;
    if (this.spinTick % 2 === 0) {
      this.lane = (this.lane + this.spinDir + CONFIG.NUM_LANES) % CONFIG.NUM_LANES;
    }
  }
}
