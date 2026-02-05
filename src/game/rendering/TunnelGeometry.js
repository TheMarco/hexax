import { CONFIG } from '../config.js';

export class TunnelGeometry {
  constructor() {
    this.rings = []; // rings[depth][vertexIndex] = {x, y}
    this.midpoints = []; // midpoints[depth][laneIndex] = {x, y}
    this.scales = [];
    this._compute();
  }

  _compute() {
    const { NUM_SEGMENTS, NUM_LANES, R0, SCALE_MIN, SCALE_POWER, ANGLE_OFFSET, CENTER_X, CENTER_Y } = CONFIG;

    for (let i = 0; i < NUM_SEGMENTS; i++) {
      const t = i / (NUM_SEGMENTS - 1);
      const scale = 1.0 - (1.0 - SCALE_MIN) * Math.pow(t, SCALE_POWER);
      this.scales.push(scale);

      const radius = R0 * scale;
      const vertices = [];

      for (let k = 0; k < NUM_LANES; k++) {
        const angle = k * (Math.PI / 3) + ANGLE_OFFSET;
        vertices.push({
          x: CENTER_X + radius * Math.cos(angle),
          y: CENTER_Y + radius * Math.sin(angle),
        });
      }

      this.rings.push(vertices);

      // Midpoints: center of each edge (lane face)
      const mids = [];
      for (let k = 0; k < NUM_LANES; k++) {
        const next = (k + 1) % NUM_LANES;
        mids.push({
          x: (vertices[k].x + vertices[next].x) / 2,
          y: (vertices[k].y + vertices[next].y) / 2,
        });
      }
      this.midpoints.push(mids);
    }
  }

  getVertex(depth, vertexIndex, rotAngle = 0) {
    const pt = this.rings[depth][vertexIndex];
    return rotAngle === 0 ? pt : this._rotate(pt, rotAngle);
  }

  getMidpoint(depth, laneIndex, rotAngle = 0) {
    const pt = this.midpoints[depth][laneIndex];
    return rotAngle === 0 ? pt : this._rotate(pt, rotAngle);
  }

  // Interpolated midpoint for fractional depth (e.g. 2.5 = halfway between ring 2 and 3)
  getMidpointLerp(depth, laneIndex, rotAngle = 0) {
    const d0 = Math.floor(depth);
    const d1 = Math.ceil(depth);
    const frac = depth - d0;

    if (d0 < 0 || d1 > CONFIG.MAX_DEPTH) return null;
    if (d0 === d1) return this.getMidpoint(d0, laneIndex, rotAngle);

    const p0 = this.midpoints[d0][laneIndex];
    const p1 = this.midpoints[d1][laneIndex];
    const pt = {
      x: p0.x + (p1.x - p0.x) * frac,
      y: p0.y + (p1.y - p0.y) * frac,
    };
    return rotAngle === 0 ? pt : this._rotate(pt, rotAngle);
  }

  getVertexLerp(depth, vertexIndex, rotAngle = 0) {
    const d0 = Math.floor(depth);
    const d1 = Math.ceil(depth);
    const frac = depth - d0;

    if (d0 < 0 || d1 > CONFIG.MAX_DEPTH) return null;
    if (d0 === d1) return this.getVertex(d0, vertexIndex, rotAngle);

    const p0 = this.rings[d0][vertexIndex];
    const p1 = this.rings[d1][vertexIndex];
    const pt = {
      x: p0.x + (p1.x - p0.x) * frac,
      y: p0.y + (p1.y - p0.y) * frac,
    };
    return rotAngle === 0 ? pt : this._rotate(pt, rotAngle);
  }

  getScaleLerp(depth) {
    const d0 = Math.floor(depth);
    const d1 = Math.ceil(depth);
    if (d0 < 0 || d1 > CONFIG.MAX_DEPTH) return 0;
    if (d0 === d1) return this.scales[d0];
    const frac = depth - d0;
    return this.scales[d0] + (this.scales[d1] - this.scales[d0]) * frac;
  }

  _rotate(pt, angle) {
    const cx = CONFIG.CENTER_X, cy = CONFIG.CENTER_Y;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dx = pt.x - cx, dy = pt.y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  }
}
