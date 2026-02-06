import { CONFIG } from '../config.js';

export class TunnelGeometry {
  constructor() {
    // No precomputed arrays — everything is computed on the fly
  }

  // --- Internal helpers ---

  _getScale(depth) {
    const t = depth / CONFIG.MAX_DEPTH;
    return 1.0 - (1.0 - CONFIG.SCALE_MIN) * Math.pow(t, CONFIG.SCALE_POWER);
  }

  _project(x3d, y3d, z) {
    // Perspective projection: screen = center + worldOffset / z
    // Since z = 1/scale, dividing by z is the same as multiplying by scale
    return {
      x: CONFIG.CENTER_X + x3d / z,
      y: CONFIG.CENTER_Y + y3d / z,
    };
  }

  _computeVertex(depth, vertexIndex, rotAngle) {
    const scale = this._getScale(depth);
    const z = 1.0 / scale;
    const angle = vertexIndex * (Math.PI / 3) + CONFIG.ANGLE_OFFSET + rotAngle;
    const x3d = CONFIG.R0 * Math.cos(angle);
    const y3d = CONFIG.R0 * Math.sin(angle);
    return this._project(x3d, y3d, z);
  }

  _computeMidpoint(depth, laneIndex, rotAngle) {
    const scale = this._getScale(depth);
    const z = 1.0 / scale;
    const a1 = laneIndex * (Math.PI / 3) + CONFIG.ANGLE_OFFSET + rotAngle;
    const a2 = ((laneIndex + 1) % CONFIG.NUM_LANES) * (Math.PI / 3) + CONFIG.ANGLE_OFFSET + rotAngle;
    const x3d = CONFIG.R0 * (Math.cos(a1) + Math.cos(a2)) / 2;
    const y3d = CONFIG.R0 * (Math.sin(a1) + Math.sin(a2)) / 2;
    return this._project(x3d, y3d, z);
  }

  _computeVertexAtRadius(depth, vertexIndex, rotAngle, radiusFraction) {
    const scale = this._getScale(depth);
    const z = 1.0 / scale;
    const angle = vertexIndex * (Math.PI / 3) + CONFIG.ANGLE_OFFSET + rotAngle;
    const r = CONFIG.R0 * radiusFraction;
    const x3d = r * Math.cos(angle);
    const y3d = r * Math.sin(angle);
    return this._project(x3d, y3d, z);
  }

  // --- Public API (signatures unchanged) ---

  getVertex(depth, vertexIndex, rotAngle = 0) {
    return this._computeVertex(depth, vertexIndex, rotAngle);
  }

  getVertexLerp(depth, vertexIndex, rotAngle = 0) {
    if (depth < 0 || depth > CONFIG.MAX_DEPTH) return null;
    return this._computeVertex(depth, vertexIndex, rotAngle);
  }

  getMidpoint(depth, laneIndex, rotAngle = 0) {
    return this._computeMidpoint(depth, laneIndex, rotAngle);
  }

  getMidpointLerp(depth, laneIndex, rotAngle = 0) {
    if (depth < 0 || depth > CONFIG.MAX_DEPTH) return null;
    return this._computeMidpoint(depth, laneIndex, rotAngle);
  }

  getScaleLerp(depth) {
    if (depth < 0 || depth > CONFIG.MAX_DEPTH) return 0;
    return this._getScale(depth);
  }

  getVertexAtRadius(depth, vertexIndex, rotAngle, radiusFraction) {
    return this._computeVertexAtRadius(depth, vertexIndex, rotAngle, radiusFraction);
  }
}
