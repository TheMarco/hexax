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
    this.damageGlowPhase = 0; // For pulsing damaged segments
  }

  shouldDrawTunnelPoint(x, y, tunnelOccluders) {
    for (const o of tunnelOccluders) {
      const dx = x - o.x;
      const dy = y - o.y;
      if (dx * dx + dy * dy < o.r * o.r) return false;
    }
    return true;
  }

  draw(gfx, activeLaneIndex, rotAngle = 0, ringFlash = null, segmentDamage = null, deltaMs = 0, tunnelOccluders = []) {
    const { NUM_SEGMENTS, NUM_LANES } = CONFIG;
    const geo = this.geometry;

    // Pulse damaged segments — fast urgent flashing
    this.damageGlowPhase += deltaMs / 150; // Complete cycle every 0.3 seconds
    const damageAlpha = 0.6 + 0.4 * Math.abs(Math.sin(this.damageGlowPhase));

    // Draw hex ring perimeters
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      for (let k = 0; k < NUM_LANES; k++) {
        const next = (k + 1) % NUM_LANES;
        const v1 = geo.getVertex(i, k, rotAngle);
        const v2 = geo.getVertex(i, next, rotAngle);
        // Outer ring (i===0): pulsing white dashed if damaged (glowing warning!)
        if (i === 0 && segmentDamage && segmentDamage[k]) {
          // Draw with pulsing glow effect — bright red/orange warning
          const glowPasses = [
            { width: 14, alpha: damageAlpha * 0.15, color: 0xff4444 },
            { width: 8, alpha: damageAlpha * 0.4, color: 0xff6644 },
            { width: 2.5, alpha: damageAlpha * 1.0, color: 0xff8866 },
          ];
          for (const pass of glowPasses) {
            gfx.lineStyle(pass.width, pass.color || 0xffffff, pass.alpha);
            // Calculate dashes based on line length for consistent fine appearance
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const lineLength = Math.sqrt(dx * dx + dy * dy);
            const dashLength = 4; // pixels per dash (fine dashing)
            const numDashes = Math.round(lineLength / (dashLength * 2));
            for (let d = 0; d < numDashes; d++) {
              const t0 = d / numDashes;
              const t1 = (d + 0.5) / numDashes;
              gfx.beginPath();
              gfx.moveTo(v1.x + dx * t0, v1.y + dy * t0);
              gfx.lineTo(v1.x + dx * t1, v1.y + dy * t1);
              gfx.strokePath();
            }
          }
        } else {
          // Only draw if not occluded by sphere
          if (this.shouldDrawTunnelPoint(v1.x, v1.y, tunnelOccluders) && this.shouldDrawTunnelPoint(v2.x, v2.y, tunnelOccluders)) {
            drawGlowLine(gfx, v1.x, v1.y, v2.x, v2.y, TUNNEL_DIM);
          }
        }
      }
    }

    // Draw lane lines connecting rings (dashed if segment is damaged)
    for (let k = 0; k < NUM_LANES; k++) {
      for (let i = 0; i < NUM_SEGMENTS - 1; i++) {
        const v1 = geo.getVertex(i, k, rotAngle);
        const v2 = geo.getVertex(i + 1, k, rotAngle);

        // Check if this lane line is part of any damaged segment
        // For segment s (edge from vertex s to s+1), its sides are:
        //   - lane line at vertex s (left side)
        //   - lane line at vertex s+1 (right side)
        // So lane line k should be dashed if segment k OR segment (k-1+6)%6 is damaged
        const leftSegment = k; // segment whose right edge this is
        const rightSegment = (k - 1 + NUM_LANES) % NUM_LANES; // segment whose left edge this is
        const isDamaged = i === 0 && segmentDamage && (segmentDamage[leftSegment] || segmentDamage[rightSegment]);

        if (isDamaged) {
          const glowPasses = [
            { width: 14, alpha: damageAlpha * 0.15, color: 0xff4444 },
            { width: 8, alpha: damageAlpha * 0.4, color: 0xff6644 },
            { width: 2.5, alpha: damageAlpha * 1.0, color: 0xff8866 },
          ];
          for (const pass of glowPasses) {
            gfx.lineStyle(pass.width, pass.color || 0xffffff, pass.alpha);
            // Calculate dashes based on line length for consistent fine appearance
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const lineLength = Math.sqrt(dx * dx + dy * dy);
            const dashLength = 4; // pixels per dash (fine dashing)
            const numDashes = Math.round(lineLength / (dashLength * 2));
            for (let d = 0; d < numDashes; d++) {
              const t0 = d / numDashes;
              const t1 = (d + 0.5) / numDashes;
              gfx.beginPath();
              gfx.moveTo(v1.x + dx * t0, v1.y + dy * t0);
              gfx.lineTo(v1.x + dx * t1, v1.y + dy * t1);
              gfx.strokePath();
            }
          }
        } else {
          // Only draw if not occluded by sphere
          if (this.shouldDrawTunnelPoint(v1.x, v1.y, tunnelOccluders) && this.shouldDrawTunnelPoint(v2.x, v2.y, tunnelOccluders)) {
            drawGlowLine(gfx, v1.x, v1.y, v2.x, v2.y, TUNNEL_DIM);
          }
        }
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
            // Only draw if not occluded by sphere
            if (this.shouldDrawTunnelPoint(v1.x, v1.y, tunnelOccluders) && this.shouldDrawTunnelPoint(v2.x, v2.y, tunnelOccluders)) {
              gfx.lineStyle(3, FLASH_COLOR, alpha * 0.35);
              gfx.beginPath();
              gfx.moveTo(v1.x, v1.y);
              gfx.lineTo(v2.x, v2.y);
              gfx.strokePath();
            }
          }
        }
      }
    }

    // Highlight active lane on ring 0 (bottom face)
    if (activeLaneIndex !== undefined) {
      const next = (activeLaneIndex + 1) % NUM_LANES;
      const v1 = geo.getVertex(0, activeLaneIndex, rotAngle);
      const v2 = geo.getVertex(0, next, rotAngle);
      // Only draw if not occluded by sphere
      if (this.shouldDrawTunnelPoint(v1.x, v1.y, tunnelOccluders) && this.shouldDrawTunnelPoint(v2.x, v2.y, tunnelOccluders)) {
        drawGlowLine(gfx, v1.x, v1.y, v2.x, v2.y, ACTIVE_LANE_DIM);
      }
    }
  }
}
