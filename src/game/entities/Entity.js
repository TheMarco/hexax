export class Entity {
  constructor(lane, depth, type) {
    this.lane = lane;
    this.depth = depth;
    this.prevDepth = depth;
    this.type = type;
    this.alive = true;
  }

  tick() {
    // Override in subclass
  }

  kill() {
    this.alive = false;
  }
}
