import { Entity } from './Entity.js';
import { CONFIG } from '../config.js';

export class Bullet extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'bullet');
    // Set prevDepth behind spawn point so bullet moves immediately via lerp
    // This prevents the 200ms delay waiting for first tick
    this.prevDepth = depth - 0.5;
    this.depth = depth;
  }

  tick() {
    this.prevDepth = this.depth;
    this.depth += 1;
    if (this.depth > CONFIG.MAX_DEPTH) {
      this.kill();
    }
  }
}
