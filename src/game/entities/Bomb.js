import { Entity } from './Entity.js';

export class Bomb extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'bomb');
  }

  tick() {
    this.prevDepth = this.depth;
    this.depth -= 1;
  }
}
