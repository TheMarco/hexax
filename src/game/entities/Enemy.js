import { Entity } from './Entity.js';

export class Enemy extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'enemy');
  }

  tick() {
    this.depth -= 1;
  }
}
