import { CONFIG } from '../config.js';
import { drawGlowDiamond, drawGlowPolygon, drawGlowLine, drawGlowClaw, drawGlowCircle, drawGlowEllipse } from './GlowRenderer.js';

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
          const size = 44 * scale;

          if (enemy.type === 'tank') {
            const tankColor = enemy.hp >= 2 ? CONFIG.COLORS.TANK : CONFIG.COLORS.TANK_DAMAGED;
            this._drawTank(gfx, pos.x, pos.y, Math.max(size, 5), tankColor, enemy.hp, enemy.hitSide);
          } else {
            this._drawPuck(gfx, pos.x, pos.y, Math.max(size, 4), CONFIG.COLORS.ENEMY);
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

    // Walls: smooth interpolated slab (always lerp — killed walls stay in
    // the array until next tick cleanup so the final step stays smooth)
    for (const wall of entityManager.walls) {
      const renderLane = state.getRenderLane(wall.lane);
      const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;

      const visualDepth = wall.prevDepth + (wall.depth - wall.prevDepth) * enemyLerp;

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        this._drawWallSlab(gfx, visualDepth, visualLane, rotAngle);
      }
    }

    // Double walls: smooth interpolated slab spanning two faces (always lerp)
    for (const dw of entityManager.doublewalls) {
      const renderLane1 = state.getRenderLane(dw.lane);
      const visualLane1 = (renderLane1 + visualOffset) % CONFIG.NUM_LANES;
      const renderLane2 = state.getRenderLane(dw.lane2);
      const visualLane2 = (renderLane2 + visualOffset) % CONFIG.NUM_LANES;

      const visualDepth = dw.prevDepth + (dw.depth - dw.prevDepth) * enemyLerp;

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        this._drawDoubleWallSlab(gfx, visualDepth, visualLane1, visualLane2, rotAngle);
      }
    }
  }

  _wallPerp(v1, v2, height) {
    const ex = v2.x - v1.x;
    const ey = v2.y - v1.y;
    let px = -ey;
    let py = ex;
    const mx = (v1.x + v2.x) / 2;
    const my = (v1.y + v2.y) / 2;
    // Point inward (toward center, into the lane)
    if (px * (CONFIG.CENTER_X - mx) + py * (CONFIG.CENTER_Y - my) < 0) {
      px = -px;
      py = -py;
    }
    const len = Math.sqrt(px * px + py * py);
    return { x: (px / len) * height, y: (py / len) * height };
  }

  _drawWallSlab(gfx, depth, visualLane, rotAngle) {
    const nextVertex = (visualLane + 1) % CONFIG.NUM_LANES;
    const backDepth = depth + CONFIG.WALL_Z_THICKNESS;

    // Front face outer vertices
    const fO1 = this.geometry.getVertexLerp(depth, visualLane, rotAngle);
    const fO2 = this.geometry.getVertexLerp(depth, nextVertex, rotAngle);
    if (!fO1 || !fO2) return;

    // Straight perpendicular offset for wall height
    const fScale = this.geometry.getScaleLerp(depth);
    const fH = CONFIG.WALL_HEIGHT * fScale;
    const fP = this._wallPerp(fO1, fO2, fH);
    const fI1 = { x: fO1.x + fP.x, y: fO1.y + fP.y };
    const fI2 = { x: fO2.x + fP.x, y: fO2.y + fP.y };

    // Back face outer vertices
    const bO1 = this.geometry.getVertexAtRadius(backDepth, visualLane, rotAngle, 1.0);
    const bO2 = this.geometry.getVertexAtRadius(backDepth, nextVertex, rotAngle, 1.0);

    const bScale = this.geometry.getScaleLerp(backDepth);
    const bH = CONFIG.WALL_HEIGHT * bScale;
    const bP = this._wallPerp(bO1, bO2, bH);
    const bI1 = { x: bO1.x + bP.x, y: bO1.y + bP.y };
    const bI2 = { x: bO2.x + bP.x, y: bO2.y + bP.y };

    const c = CONFIG.COLORS.TUNNEL;

    // Front face rectangle
    drawGlowLine(gfx, fO1.x, fO1.y, fO2.x, fO2.y, c);
    drawGlowLine(gfx, fO2.x, fO2.y, fI2.x, fI2.y, c);
    drawGlowLine(gfx, fI2.x, fI2.y, fI1.x, fI1.y, c);
    drawGlowLine(gfx, fI1.x, fI1.y, fO1.x, fO1.y, c);

    // Back face rectangle
    drawGlowLine(gfx, bO1.x, bO1.y, bO2.x, bO2.y, c);
    drawGlowLine(gfx, bO2.x, bO2.y, bI2.x, bI2.y, c);
    drawGlowLine(gfx, bI2.x, bI2.y, bI1.x, bI1.y, c);
    drawGlowLine(gfx, bI1.x, bI1.y, bO1.x, bO1.y, c);

    // Connecting edges (4 corners)
    drawGlowLine(gfx, fO1.x, fO1.y, bO1.x, bO1.y, c);
    drawGlowLine(gfx, fO2.x, fO2.y, bO2.x, bO2.y, c);
    drawGlowLine(gfx, fI1.x, fI1.y, bI1.x, bI1.y, c);
    drawGlowLine(gfx, fI2.x, fI2.y, bI2.x, bI2.y, c);
  }

  _drawDoubleWallSlab(gfx, depth, visualLane1, visualLane2, rotAngle) {
    const midVertex = (visualLane1 + 1) % CONFIG.NUM_LANES;
    const endVertex = (visualLane2 + 1) % CONFIG.NUM_LANES;
    const backDepth = depth + CONFIG.WALL_Z_THICKNESS;

    // Front face: 3 outer vertices
    const fO1 = this.geometry.getVertexLerp(depth, visualLane1, rotAngle);
    const fOM = this.geometry.getVertexLerp(depth, midVertex, rotAngle);
    const fO3 = this.geometry.getVertexLerp(depth, endVertex, rotAngle);
    if (!fO1 || !fOM || !fO3) return;

    // Per-face perpendicular offsets (straight sides)
    const fScale = this.geometry.getScaleLerp(depth);
    const fH = CONFIG.WALL_HEIGHT * fScale;
    const fP1 = this._wallPerp(fO1, fOM, fH);
    const fP2 = this._wallPerp(fOM, fO3, fH);

    const fI1 = { x: fO1.x + fP1.x, y: fO1.y + fP1.y };
    const fIM1 = { x: fOM.x + fP1.x, y: fOM.y + fP1.y };
    const fIM2 = { x: fOM.x + fP2.x, y: fOM.y + fP2.y };
    const fI3 = { x: fO3.x + fP2.x, y: fO3.y + fP2.y };

    // Back face: 3 outer vertices
    const bO1 = this.geometry.getVertexAtRadius(backDepth, visualLane1, rotAngle, 1.0);
    const bOM = this.geometry.getVertexAtRadius(backDepth, midVertex, rotAngle, 1.0);
    const bO3 = this.geometry.getVertexAtRadius(backDepth, endVertex, rotAngle, 1.0);

    const bScale = this.geometry.getScaleLerp(backDepth);
    const bH = CONFIG.WALL_HEIGHT * bScale;
    const bP1 = this._wallPerp(bO1, bOM, bH);
    const bP2 = this._wallPerp(bOM, bO3, bH);

    const bI1 = { x: bO1.x + bP1.x, y: bO1.y + bP1.y };
    const bIM1 = { x: bOM.x + bP1.x, y: bOM.y + bP1.y };
    const bIM2 = { x: bOM.x + bP2.x, y: bOM.y + bP2.y };
    const bI3 = { x: bO3.x + bP2.x, y: bO3.y + bP2.y };

    const c = CONFIG.COLORS.TUNNEL;

    // Front face: two rectangles sharing outer middle vertex
    drawGlowLine(gfx, fO1.x, fO1.y, fOM.x, fOM.y, c);
    drawGlowLine(gfx, fOM.x, fOM.y, fIM1.x, fIM1.y, c);
    drawGlowLine(gfx, fIM1.x, fIM1.y, fI1.x, fI1.y, c);
    drawGlowLine(gfx, fI1.x, fI1.y, fO1.x, fO1.y, c);

    drawGlowLine(gfx, fOM.x, fOM.y, fO3.x, fO3.y, c);
    drawGlowLine(gfx, fO3.x, fO3.y, fI3.x, fI3.y, c);
    drawGlowLine(gfx, fI3.x, fI3.y, fIM2.x, fIM2.y, c);
    drawGlowLine(gfx, fIM2.x, fIM2.y, fOM.x, fOM.y, c);

    // Back face: two rectangles
    drawGlowLine(gfx, bO1.x, bO1.y, bOM.x, bOM.y, c);
    drawGlowLine(gfx, bOM.x, bOM.y, bIM1.x, bIM1.y, c);
    drawGlowLine(gfx, bIM1.x, bIM1.y, bI1.x, bI1.y, c);
    drawGlowLine(gfx, bI1.x, bI1.y, bO1.x, bO1.y, c);

    drawGlowLine(gfx, bOM.x, bOM.y, bO3.x, bO3.y, c);
    drawGlowLine(gfx, bO3.x, bO3.y, bI3.x, bI3.y, c);
    drawGlowLine(gfx, bI3.x, bI3.y, bIM2.x, bIM2.y, c);
    drawGlowLine(gfx, bIM2.x, bIM2.y, bOM.x, bOM.y, c);

    // Connecting edges (6 corners)
    drawGlowLine(gfx, fO1.x, fO1.y, bO1.x, bO1.y, c);
    drawGlowLine(gfx, fOM.x, fOM.y, bOM.x, bOM.y, c);
    drawGlowLine(gfx, fO3.x, fO3.y, bO3.x, bO3.y, c);
    drawGlowLine(gfx, fI1.x, fI1.y, bI1.x, bI1.y, c);
    drawGlowLine(gfx, fIM1.x, fIM1.y, bIM1.x, bIM1.y, c);
    drawGlowLine(gfx, fIM2.x, fIM2.y, bIM2.x, bIM2.y, c);
    drawGlowLine(gfx, fI3.x, fI3.y, bI3.x, bI3.y, c);
  }

  _drawPuck(gfx, cx, cy, size, color) {
    // Horizontally flying hockey puck: flat disc perpendicular to outward direction
    const dx = CONFIG.CENTER_X - cx;
    const dy = CONFIG.CENTER_Y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;  // toward center
    const ny = dy / dist;
    const px = -ny;  // perpendicular (along face edge)
    const py = nx;

    const r = size * 0.5;
    const tilt = 0.35;          // foreshortening of the disc face
    const thickness = size * 0.2;
    const rotation = Math.atan2(py, px);

    // Inner face (toward center, behind)
    const ix = cx + nx * thickness * 0.5;
    const iy = cy + ny * thickness * 0.5;

    // Outer face (away from center, in front)
    const ox = cx - nx * thickness * 0.5;
    const oy = cy - ny * thickness * 0.5;

    // Inner disc face (behind)
    drawGlowEllipse(gfx, ix, iy, r, r * tilt, color, rotation);

    // Side connecting lines at left/right extremes
    drawGlowLine(gfx,
      ix + px * r, iy + py * r,
      ox + px * r, oy + py * r, color);
    drawGlowLine(gfx,
      ix - px * r, iy - py * r,
      ox - px * r, oy - py * r, color);

    // Outer disc face (in front)
    drawGlowEllipse(gfx, ox, oy, r, r * tilt, color, rotation);
  }

  _drawTank(gfx, cx, cy, size, color, hp, hitSide) {
    // O=O (full) or O= / =O (damaged)
    const dx = CONFIG.CENTER_X - cx;
    const dy = CONFIG.CENTER_Y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;  // toward center
    const ny = dy / dist;
    const px = -ny;  // perpendicular (along face edge)
    const py = nx;

    const ballR = size * 0.32;
    const spacing = size * 0.55;
    const barGap = ballR * 0.3;

    // Ball positions (left and right along the face edge)
    const lx = cx - px * spacing;
    const ly = cy - py * spacing;
    const rx = cx + px * spacing;
    const ry = cy + py * spacing;

    const drawLeft = hp >= 2 || hitSide === 'right';
    const drawRight = hp >= 2 || hitSide === 'left';

    // Draw 3D spheres (circle + meridian ellipse)
    if (drawLeft) {
      const va = Math.atan2(ly - CONFIG.CENTER_Y, lx - CONFIG.CENTER_X);
      drawGlowCircle(gfx, lx, ly, ballR, color);
      drawGlowEllipse(gfx, lx, ly, ballR * 0.3, ballR, color, va);
    }
    if (drawRight) {
      const va = Math.atan2(ry - CONFIG.CENTER_Y, rx - CONFIG.CENTER_X);
      drawGlowCircle(gfx, rx, ry, ballR, color);
      drawGlowEllipse(gfx, rx, ry, ballR * 0.3, ballR, color, va);
    }

    // Double bar connecting the two positions (= sign)
    const blx = lx + px * ballR;
    const bly = ly + py * ballR;
    const brx = rx - px * ballR;
    const bry = ry - py * ballR;

    drawGlowLine(gfx,
      blx + nx * barGap, bly + ny * barGap,
      brx + nx * barGap, bry + ny * barGap, color);
    drawGlowLine(gfx,
      blx - nx * barGap, bly - ny * barGap,
      brx - nx * barGap, bry - ny * barGap, color);
  }

  _drawShip(gfx, visualOffset, rotAngle) {
    const visualLane = (0 + visualOffset) % CONFIG.NUM_LANES;
    const pos = this.geometry.getMidpoint(0, visualLane, rotAngle);

    const cx = CONFIG.CENTER_X;
    const cy = CONFIG.CENTER_Y;
    const dx = cx - pos.x;
    const dy = cy - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;  // normal toward center
    const ny = dy / dist;

    const px = -ny;  // perpendicular
    const py = nx;

    // Gun turret design (Vectrex style)
    const baseWidth = 14;
    const baseDepth = 8;
    const barrelLength = 20;
    const barrelBaseWidth = 6;
    const barrelTipWidth = 2;

    // Base platform (rectangle sitting ON the rim line, extending inward)
    const baseLeft = { x: pos.x - px * baseWidth, y: pos.y - py * baseWidth };
    const baseRight = { x: pos.x + px * baseWidth, y: pos.y + py * baseWidth };
    const baseBackLeft = { x: baseLeft.x + nx * baseDepth, y: baseLeft.y + ny * baseDepth };
    const baseBackRight = { x: baseRight.x + nx * baseDepth, y: baseRight.y + ny * baseDepth };

    // Barrel (trapezoid taper from base to tip)
    const barrelBase = { x: pos.x + nx * baseDepth, y: pos.y + ny * baseDepth };
    const barrelLeft = { x: barrelBase.x - px * barrelBaseWidth, y: barrelBase.y - py * barrelBaseWidth };
    const barrelRight = { x: barrelBase.x + px * barrelBaseWidth, y: barrelBase.y + py * barrelBaseWidth };

    const barrelTipCenter = { x: pos.x + nx * (baseDepth + barrelLength), y: pos.y + ny * (baseDepth + barrelLength) };
    const barrelTipLeft = { x: barrelTipCenter.x - px * barrelTipWidth, y: barrelTipCenter.y - py * barrelTipWidth };
    const barrelTipRight = { x: barrelTipCenter.x + px * barrelTipWidth, y: barrelTipCenter.y + py * barrelTipWidth };

    // Draw base platform
    drawGlowPolygon(gfx, [baseLeft, baseRight, baseBackRight, baseBackLeft], CONFIG.COLORS.SHIP);

    // Draw barrel (trapezoid)
    drawGlowPolygon(gfx, [barrelLeft, barrelRight, barrelTipRight, barrelTipLeft], CONFIG.COLORS.SHIP);
  }
}
