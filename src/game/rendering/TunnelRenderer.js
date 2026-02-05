import { CONFIG } from '../config.js';
import { drawGlowLine } from './GlowRenderer.js';

const FLASH_COLOR = 0xffffff;

export class TunnelRenderer {
  constructor(geometry) {
    this.geometry = geometry;
  }

  draw(gfx, activeLaneIndex, rotAngle = 0, ringFlash = null) {
    const { NUM_SEGMENTS, NUM_LANES, COLORS } = CONFIG;
    const geo = this.geometry;

    // Draw hex ring perimeters
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      for (let k = 0; k < NUM_LANES; k++) {
        const next = (k + 1) % NUM_LANES;
        const v1 = geo.getVertex(i, k, rotAngle);
        const v2 = geo.getVertex(i, next, rotAngle);
        drawGlowLine(gfx, v1.x, v1.y, v2.x, v2.y, COLORS.TUNNEL);
      }
    }

    // Draw lane lines connecting rings
    for (let k = 0; k < NUM_LANES; k++) {
      for (let i = 0; i < NUM_SEGMENTS - 1; i++) {
        const v1 = geo.getVertex(i, k, rotAngle);
        const v2 = geo.getVertex(i + 1, k, rotAngle);
        drawGlowLine(gfx, v1.x, v1.y, v2.x, v2.y, COLORS.TUNNEL);
      }
    }

    // Ring flash overlay — bright white pulse on rings where entities just arrived
    if (ringFlash) {
      for (let i = 0; i < NUM_SEGMENTS; i++) {
        if (ringFlash[i] > 0) {
          const alpha = ringFlash[i];
          for (let k = 0; k < NUM_LANES; k++) {
            const next = (k + 1) % NUM_LANES;
            const v1 = geo.getVertex(i, k, rotAngle);
            const v2 = geo.getVertex(i, next, rotAngle);
            gfx.lineStyle(3, FLASH_COLOR, alpha * 0.7);
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
      drawGlowLine(gfx, v1.x, v1.y, v2.x, v2.y, COLORS.ACTIVE_LANE);
    }
  }
}
