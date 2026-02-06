import { Entity } from './Entity.js';

export class Wall extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'wall');
    this.hitFlash = 0;
  }

  tick() {
    this.prevDepth = this.depth;
    this.depth -= 1;
  }
}
