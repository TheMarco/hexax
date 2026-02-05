import { Entity } from './Entity.js';

export class Tank extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'tank');
    this.hp = 2;
  }

  tick() {
    this.prevDepth = this.depth;
    this.depth -= 1;
  }

  hit() {
    this.hp--;
    if (this.hp <= 0) this.kill();
    return this.hp <= 0;
  }
}
