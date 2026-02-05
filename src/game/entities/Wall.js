import { Entity } from './Entity.js';

export class Wall extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'wall');
  }

  tick() {
    this.prevDepth = this.depth;
    this.depth -= 1;
  }
}
