import { CONFIG } from '../config.js';
import { drawGlowLine, drawGlowDashedLine } from './GlowRenderer.js';

const FLASH_COLOR = 0xffffff;

// Tunnel/lane colors at 50% brightness for vector mode
const TUNNEL_DIM = (() => {
  const c = CONFIG.COLORS.TUNNEL;
  const r = ((c >> 16) & 0xff) >> 1;
  const g = ((c >> 8) & 0xff) >> 1;
  const b = (c & 0xff) >> 1;
  return (r << 16) | (g << 8) | b;
})();
const ACTIVE_LANE_DIM = (() => {
  const c = CONFIG.COLORS.ACTIVE_LANE;
  const r = ((c >> 16) & 0xff) >> 1;
  const g = ((c >> 8) & 0xff) >> 1;
  const b = (c & 0xff) >> 1;
  return (r << 16) | (g << 8) | b;
})();

export class TunnelRenderer {
  constructor(geometry) {
    this.geometry = geometry;
  }

  draw(gfx, activeLaneIndex, rotAngle = 0, ringFlash = null, segmentDamage = null) {
    const { NUM_SEGMENTS, NUM_LANES } = CONFIG;
    const geo = this.geometry;

    // Draw hex ring perimeters
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      for (let k = 0; k < NUM_LANES; k++) {
        const next = (k + 1) % NUM_LANES;
        const v1 = geo.getVertex(i, k, rotAngle);
        const v2 = geo.getVertex(i, next, rotAngle);
        // Outer ring (i===0): dashed if that segment is damaged
        if (i === 0 && segmentDamage && segmentDamage[k]) {
          drawGlowDashedLine(gfx, v1.x, v1.y, v2.x, v2.y, 0xff4444, 4);
        } else {
          drawGlowLine(gfx, v1.x, v1.y, v2.x, v2.y, TUNNEL_DIM);
        }
      }
    }

    // Draw lane lines connecting rings
    for (let k = 0; k < NUM_LANES; k++) {
      for (let i = 0; i < NUM_SEGMENTS - 1; i++) {
        const v1 = geo.getVertex(i, k, rotAngle);
        const v2 = geo.getVertex(i + 1, k, rotAngle);
        drawGlowLine(gfx, v1.x, v1.y, v2.x, v2.y, TUNNEL_DIM);
      }
    }

    // Ring flash overlay
    if (ringFlash) {
      for (let i = 0; i < NUM_SEGMENTS; i++) {
        if (ringFlash[i] > 0) {
          const alpha = ringFlash[i];
          for (let k = 0; k < NUM_LANES; k++) {
            const next = (k + 1) % NUM_LANES;
            const v1 = geo.getVertex(i, k, rotAngle);
            const v2 = geo.getVertex(i, next, rotAngle);
            gfx.lineStyle(3, FLASH_COLOR, alpha * 0.35);
            gfx.beginPath();
            gfx.moveTo(v1.x, v1.y);
            gfx.lineTo(v2.x, v2.y);
            gfx.strokePath();
          }
        }
      }
    }

    // Highlight active lane on ring 0 (bottom face)
    if (activeLaneIndex !== undefined) {
      const next = (activeLaneIndex + 1) % NUM_LANES;
      const v1 = geo.getVertex(0, activeLaneIndex, rotAngle);
      const v2 = geo.getVertex(0, next, rotAngle);
      drawGlowLine(gfx, v1.x, v1.y, v2.x, v2.y, ACTIVE_LANE_DIM);
    }
  }
}
