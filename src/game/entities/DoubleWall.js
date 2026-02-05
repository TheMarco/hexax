import { Entity } from './Entity.js';
import { CONFIG } from '../config.js';

export class DoubleWall extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'doublewall');
    this.lane2 = (lane + 1) % CONFIG.NUM_LANES;
  }

  tick() {
    this.depth -= 1;
  }
}
