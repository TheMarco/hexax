import { Entity } from './Entity.js';
import { CONFIG } from '../config.js';

export class DoubleWall extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'doublewall');
    this.lane2 = (lane + 1) % CONFIG.NUM_LANES;
    this.hitFlash = 0;
  }

  tick() {
    this.prevDepth = this.depth;
    this.depth -= 1;
  }
}
