import { CONFIG } from '../config.js';
import { drawGlowDiamond, drawGlowPolygon, drawGlowLine, drawGlowClaw } from './GlowRenderer.js';

export class EntityRenderer {
  constructor(geometry) {
    this.geometry = geometry;
  }

  draw(gfx, state, entityManager, visualOffset, rotAngle = 0, bulletLerp = 0, enemyLerp = 0) {
    this._drawShip(gfx, visualOffset, rotAngle);

    // Enemies (including tanks): smooth interpolated positions
    for (const enemy of entityManager.enemies) {
      const renderLane = state.getRenderLane(enemy.lane);
      const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;

      let visualDepth;
      if (!enemy.alive) {
        visualDepth = enemy.depth;
      } else {
        visualDepth = enemy.prevDepth + (enemy.depth - enemy.prevDepth) * enemyLerp;
      }

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        const pos = this.geometry.getMidpointLerp(visualDepth, visualLane, rotAngle);
        if (pos) {
          const scale = this.geometry.getScaleLerp(visualDepth);
          const size = 22 * scale;

          if (enemy.type === 'tank') {
            if (enemy.hp >= 2) {
              drawGlowClaw(gfx, pos.x, pos.y, Math.max(size, 5), CONFIG.COLORS.TANK);
            } else {
              this._drawCrackedDiamond(gfx, pos.x, pos.y, Math.max(size, 5), CONFIG.COLORS.TANK_DAMAGED);
            }
          } else {
            drawGlowClaw(gfx, pos.x, pos.y, Math.max(size, 4), CONFIG.COLORS.ENEMY);
          }
        }
      }
    }

    // Bullets: smooth interpolated positions
    for (const bullet of entityManager.bullets) {
      const renderLane = state.getRenderLane(bullet.lane);
      const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;

      let visualDepth;
      if (!bullet.alive) {
        visualDepth = bullet.depth;
      } else {
        visualDepth = bullet.prevDepth + (bullet.depth - bullet.prevDepth) * bulletLerp;
      }

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        const pos = this.geometry.getMidpointLerp(visualDepth, visualLane, rotAngle);
        if (pos) {
          const scale = this.geometry.getScaleLerp(visualDepth);
          const size = 5 * scale;
          drawGlowDiamond(gfx, pos.x, pos.y, Math.max(size, 2), CONFIG.COLORS.BULLET);
        }
      }
    }

    // Walls: smooth interpolated slab
    for (const wall of entityManager.walls) {
      const renderLane = state.getRenderLane(wall.lane);
      const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;

      let visualDepth;
      if (!wall.alive) {
        visualDepth = wall.depth;
      } else {
        visualDepth = wall.prevDepth + (wall.depth - wall.prevDepth) * enemyLerp;
      }

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        this._drawWallSlab(gfx, visualDepth, visualLane, rotAngle);
      }
    }

    // Double walls: smooth interpolated slab spanning two faces
    for (const dw of entityManager.doublewalls) {
      const renderLane1 = state.getRenderLane(dw.lane);
      const visualLane1 = (renderLane1 + visualOffset) % CONFIG.NUM_LANES;
      const renderLane2 = state.getRenderLane(dw.lane2);
      const visualLane2 = (renderLane2 + visualOffset) % CONFIG.NUM_LANES;

      let visualDepth;
      if (!dw.alive) {
        visualDepth = dw.depth;
      } else {
        visualDepth = dw.prevDepth + (dw.depth - dw.prevDepth) * enemyLerp;
      }

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        this._drawDoubleWallSlab(gfx, visualDepth, visualLane1, visualLane2, rotAngle);
      }
    }
  }

  _drawWallSlab(gfx, depth, visualLane, rotAngle) {
    const nextVertex = (visualLane + 1) % CONFIG.NUM_LANES;

    const v1 = this.geometry.getVertexLerp(depth, visualLane, rotAngle);
    const v2 = this.geometry.getVertexLerp(depth, nextVertex, rotAngle);
    if (!v1 || !v2) return;

    const mx = (v1.x + v2.x) / 2;
    const my = (v1.y + v2.y) / 2;
    const dx = CONFIG.CENTER_X - mx;
    const dy = CONFIG.CENTER_Y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const wallHeight = 44 * this.geometry.getScaleLerp(depth);
    const nx = (dx / dist) * wallHeight;
    const ny = (dy / dist) * wallHeight;

    const v1i = { x: v1.x + nx, y: v1.y + ny };
    const v2i = { x: v2.x + nx, y: v2.y + ny };

    // Sides + inner edge
    drawGlowLine(gfx, v1.x, v1.y, v1i.x, v1i.y, CONFIG.COLORS.TUNNEL);
    drawGlowLine(gfx, v1i.x, v1i.y, v2i.x, v2i.y, CONFIG.COLORS.TUNNEL);
    drawGlowLine(gfx, v2i.x, v2i.y, v2.x, v2.y, CONFIG.COLORS.TUNNEL);
    // Diagonal X
    drawGlowLine(gfx, v1.x, v1.y, v2i.x, v2i.y, CONFIG.COLORS.TUNNEL);
    drawGlowLine(gfx, v2.x, v2.y, v1i.x, v1i.y, CONFIG.COLORS.TUNNEL);
  }

  _drawDoubleWallSlab(gfx, depth, visualLane1, visualLane2, rotAngle) {
    const v1 = this.geometry.getVertexLerp(depth, visualLane1, rotAngle);
    const vMid = this.geometry.getVertexLerp(depth, (visualLane1 + 1) % CONFIG.NUM_LANES, rotAngle);
    const v3 = this.geometry.getVertexLerp(depth, (visualLane2 + 1) % CONFIG.NUM_LANES, rotAngle);
    if (!v1 || !vMid || !v3) return;

    const spanMx = (v1.x + v3.x) / 2;
    const spanMy = (v1.y + v3.y) / 2;
    const dx = CONFIG.CENTER_X - spanMx;
    const dy = CONFIG.CENTER_Y - spanMy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const wallHeight = 44 * this.geometry.getScaleLerp(depth);
    const nx = (dx / dist) * wallHeight;
    const ny = (dy / dist) * wallHeight;

    const v1i = { x: v1.x + nx, y: v1.y + ny };
    const vMidI = { x: vMid.x + nx, y: vMid.y + ny };
    const v3i = { x: v3.x + nx, y: v3.y + ny };

    // Outer sides
    drawGlowLine(gfx, v1.x, v1.y, v1i.x, v1i.y, CONFIG.COLORS.TUNNEL);
    drawGlowLine(gfx, v3.x, v3.y, v3i.x, v3i.y, CONFIG.COLORS.TUNNEL);

    // Inner edges
    drawGlowLine(gfx, v1i.x, v1i.y, vMidI.x, vMidI.y, CONFIG.COLORS.TUNNEL);
    drawGlowLine(gfx, vMidI.x, vMidI.y, v3i.x, v3i.y, CONFIG.COLORS.TUNNEL);

    // Center divider (inner)
    drawGlowLine(gfx, vMid.x, vMid.y, vMidI.x, vMidI.y, CONFIG.COLORS.TUNNEL);

    // Diagonal X on each face
    drawGlowLine(gfx, v1.x, v1.y, vMidI.x, vMidI.y, CONFIG.COLORS.TUNNEL);
    drawGlowLine(gfx, vMid.x, vMid.y, v1i.x, v1i.y, CONFIG.COLORS.TUNNEL);
    drawGlowLine(gfx, vMid.x, vMid.y, v3i.x, v3i.y, CONFIG.COLORS.TUNNEL);
    drawGlowLine(gfx, v3.x, v3.y, vMidI.x, vMidI.y, CONFIG.COLORS.TUNNEL);
  }

  _drawCrackedDiamond(gfx, cx, cy, size, color) {
    drawGlowDiamond(gfx, cx, cy, size, color);
    const s = size * 0.6;
    drawGlowLine(gfx, cx - s, cy - s, cx + s, cy + s, color);
    drawGlowLine(gfx, cx + s, cy - s, cx - s, cy + s, color);
  }

  _drawShip(gfx, visualOffset, rotAngle) {
    const visualLane = (0 + visualOffset) % CONFIG.NUM_LANES;
    const pos = this.geometry.getMidpoint(0, visualLane, rotAngle);

    const size = 12;
    const cx = CONFIG.CENTER_X;
    const cy = CONFIG.CENTER_Y;
    const dx = cx - pos.x;
    const dy = cy - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;
    const ny = dy / dist;

    const px = -ny;
    const py = nx;

    const tip = { x: pos.x + nx * size, y: pos.y + ny * size };
    const left = { x: pos.x - px * size * 0.6, y: pos.y - py * size * 0.6 };
    const right = { x: pos.x + px * size * 0.6, y: pos.y + py * size * 0.6 };

    drawGlowPolygon(gfx, [tip, left, right], CONFIG.COLORS.SHIP);
  }
}
