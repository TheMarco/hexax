import { Entity } from './Entity.js';
import { CONFIG } from '../config.js';

export class Bullet extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'bullet');
    this.prevDepth = depth;
  }

  tick() {
    this.prevDepth = this.depth;
    this.depth += 1;
    if (this.depth > CONFIG.MAX_DEPTH) {
      this.kill();
    }
  }
}
