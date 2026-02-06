import { Entity } from './Entity.js';
import { CONFIG } from '../config.js';

export class PhaseEnemy extends Entity {
  constructor(lane, depth) {
    super(lane, depth, 'phase');
    this.phase = 'shielded';
    this.hitFlash = 0;
    this.transitionFlash = 0;
  }

  tick() {
    this.prevDepth = this.depth;
    this.depth -= 1;
    if (this.phase === 'shielded' && this.depth <= CONFIG.PHASE_DEPTH) {
      this.phase = 'vulnerable';
      this.transitionFlash = 1.0;
    }
  }
}
