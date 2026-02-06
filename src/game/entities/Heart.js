import { Entity } from './Entity.js';

export class Heart extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'heart');
  }

  tick() {
    this.prevDepth = this.depth;
    this.depth -= 1;
  }
}
