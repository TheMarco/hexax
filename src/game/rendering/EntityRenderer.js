import { CONFIG } from '../config.js';
import { drawGlowDiamond, drawGlowPolygon, drawGlowLine, drawGlowClaw, drawGlowCircle, drawGlowEllipse, drawGlowArc, drawGlowDashedEllipse, drawGlowDashedLine } from './GlowRenderer.js';

// Dimmed tunnel color for walls (matches tunnel renderer)
const WALL_COLOR = (() => {
  const t = CONFIG.COLORS.TUNNEL;
  const r = ((t >> 16) & 0xff) >> 1;
  const g = ((t >> 8) & 0xff) >> 1;
  const b = (t & 0xff) >> 1;
  return (r << 16) | (g << 8) | b;
})();

export class EntityRenderer {
  constructor(geometry) {
    this.geometry = geometry;
    this.deflectEffects = [];
    this.ghostBullets = []; // { lane, depth } — deferred collision ghost bullets
  }

  _makeEdgeBolts(numBolts) {
    // Lightning bolts that zigzag along a face edge with perpendicular offsets
    const bolts = [];
    for (let i = 0; i < numBolts; i++) {
      const numSegs = 4 + Math.floor(Math.random() * 3);
      const baseOffset = (Math.random() - 0.5) * 0.3;
      const points = [];
      for (let j = 0; j <= numSegs; j++) {
        points.push({ t: j / numSegs, offset: baseOffset + (Math.random() - 0.5) * 0.8 });
      }
      bolts.push(points);
    }
    return bolts;
  }

  _makeRadialBolts(numBolts) {
    // Lightning bolts radiating outward from center (for phase shield)
    const bolts = [];
    for (let i = 0; i < numBolts; i++) {
      const angle = (i / numBolts) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const numSegs = 2 + Math.floor(Math.random() * 2);
      const points = [];
      for (let j = 0; j <= numSegs; j++) {
        const frac = j / numSegs;
        const jitterAngle = angle + (Math.random() - 0.5) * 0.8 * frac;
        points.push({ dist: 0.15 + frac * 0.85, angle: jitterAngle });
      }
      bolts.push(points);
    }
    return bolts;
  }

  spawnDeflect(type, lane, depth, prevDepth, lane2) {
    if (type === 'doublewall') {
      // Two sets of bolts — one per face segment
      this.deflectEffects.push({
        type, lane, depth, prevDepth, lane2,
        elapsed: 0, lifetime: 350,
        boltsA: this._makeEdgeBolts(4 + Math.floor(Math.random() * 2)),
        boltsB: this._makeEdgeBolts(4 + Math.floor(Math.random() * 2)),
      });
    } else if (type === 'phase') {
      // Radial burst from enemy center
      this.deflectEffects.push({
        type, lane, depth, prevDepth,
        elapsed: 0, lifetime: 300,
        bolts: this._makeRadialBolts(8 + Math.floor(Math.random() * 4)),
      });
    } else {
      // Single wall — bolts along one face edge
      this.deflectEffects.push({
        type, lane, depth, prevDepth,
        elapsed: 0, lifetime: 350,
        bolts: this._makeEdgeBolts(5 + Math.floor(Math.random() * 3)),
      });
    }
  }

  draw(gfx, state, entityManager, visualOffset, rotAngle = 0, bulletLerp = 0, enemyLerp = 0, dt = 0) {
    this._drawShip(gfx, visualOffset, rotAngle);

    // Enemies (including tanks): smooth interpolated positions
    for (const enemy of entityManager.enemies) {
      if (!enemy.alive) continue;

      const renderLane = state.getRenderLane(enemy.lane);
      const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;

      const visualDepth = enemy.prevDepth + (enemy.depth - enemy.prevDepth) * enemyLerp;

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        let pos = this.geometry.getMidpointLerp(visualDepth, visualLane, rotAngle);

        // Spiral enemies: interpolate lane position for smooth lateral movement (accelerated)
        if (enemy.type === 'spiral' && enemy.alive && enemy.prevLane !== enemy.lane) {
          const laneLerp = Math.min(1, enemyLerp * CONFIG.SPIRAL_LANE_SPEED);
          const prevRenderLane = state.getRenderLane(enemy.prevLane);
          const prevVisualLane = (prevRenderLane + visualOffset) % CONFIG.NUM_LANES;
          const prevPos = this.geometry.getMidpointLerp(visualDepth, prevVisualLane, rotAngle);
          if (pos && prevPos) {
            pos = {
              x: prevPos.x + (pos.x - prevPos.x) * laneLerp,
              y: prevPos.y + (pos.y - prevPos.y) * laneLerp,
            };
          }
        }

        if (pos) {
          const scale = this.geometry.getScaleLerp(visualDepth);
          const size = 137 * scale;

          if (enemy.type === 'tank') {
            const tankColor = enemy.hp >= 2 ? CONFIG.COLORS.TANK : CONFIG.COLORS.TANK_DAMAGED;
            this._drawTank(gfx, pos.x, pos.y, Math.max(size, 5), tankColor, enemy.hp, enemy.hitSide);
          } else if (enemy.type === 'bomb') {
            this._drawBomb(gfx, pos.x, pos.y, Math.max(size, 5), CONFIG.COLORS.BOMB);
          } else if (enemy.type === 'heart') {
            this._drawHeart(gfx, pos.x, pos.y, Math.max(size, 5), CONFIG.COLORS.HEART);
          } else if (enemy.type === 'phase') {
            this._drawPhaseEnemy(gfx, pos.x, pos.y, Math.max(size, 4), enemy, dt);
          } else if (enemy.type === 'spiral') {
            this._drawSpiralEnemy(gfx, pos.x, pos.y, Math.max(size, 4), CONFIG.COLORS.SPIRAL, enemy.spinDir);
          } else {
            this._drawPuck(gfx, pos.x, pos.y, Math.max(size, 4), CONFIG.COLORS.ENEMY);
          }
        }
      }
    }

    // Bullets: smooth interpolated positions
    for (const bullet of entityManager.bullets) {
      // Don't render dead bullets that hit something — explosion/lightning covers it
      if (!bullet.alive && bullet.hitDepth !== undefined) continue;
      if (!bullet.alive) continue;

      const renderLane = state.getRenderLane(bullet.lane);
      const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;

      const visualDepth = bullet.prevDepth + (bullet.depth - bullet.prevDepth) * bulletLerp;

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        const pos = this.geometry.getMidpointLerp(visualDepth, visualLane, rotAngle);
        if (pos) {
          const scale = this.geometry.getScaleLerp(visualDepth);
          const size = 6 * scale;
          drawGlowDiamond(gfx, pos.x, pos.y, Math.max(size, 2), CONFIG.COLORS.BULLET);
        }
      }
    }

    // Ghost bullets (deferred collision — bullet visually advancing to target)
    for (const gb of this.ghostBullets) {
      const gbRenderLane = state.getRenderLane(gb.lane);
      const gbVisualLane = (gbRenderLane + visualOffset) % CONFIG.NUM_LANES;
      if (gb.depth >= 0 && gb.depth <= CONFIG.MAX_DEPTH) {
        const gbPos = this.geometry.getMidpointLerp(gb.depth, gbVisualLane, rotAngle);
        if (gbPos) {
          const gbScale = this.geometry.getScaleLerp(gb.depth);
          const gbSize = 6 * gbScale;
          drawGlowDiamond(gfx, gbPos.x, gbPos.y, Math.max(gbSize, 2), CONFIG.COLORS.BULLET);
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
        const color = wall.hitFlash > 0 ? CONFIG.COLORS.TUNNEL : WALL_COLOR;
        this._drawWallSlab(gfx, visualDepth, visualLane, rotAngle, color);
      }
      // Decay hit flash
      if (wall.hitFlash > 0) {
        wall.hitFlash = Math.max(0, wall.hitFlash - dt * 4);
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
        const color = dw.hitFlash > 0 ? CONFIG.COLORS.TUNNEL : WALL_COLOR;
        this._drawDoubleWallSlab(gfx, visualDepth, visualLane1, visualLane2, rotAngle, color);
      }
      // Decay hit flash
      if (dw.hitFlash > 0) {
        dw.hitFlash = Math.max(0, dw.hitFlash - dt * 4);
      }
    }

    // Wall deflect lightning effects
    for (const effect of this.deflectEffects) {
      this._drawDeflectEffect(gfx, effect, visualOffset, rotAngle, state, enemyLerp);
      effect.elapsed += dt * 1000;
    }
    this.deflectEffects = this.deflectEffects.filter(e => e.elapsed < e.lifetime);
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

  _drawWallSlab(gfx, depth, visualLane, rotAngle, color) {
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

    const c = color || WALL_COLOR;

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

  _drawDoubleWallSlab(gfx, depth, visualLane1, visualLane2, rotAngle, color) {
    const midVertex = (visualLane1 + 1) % CONFIG.NUM_LANES;
    const endVertex = (visualLane2 + 1) % CONFIG.NUM_LANES;
    const backDepth = depth + CONFIG.WALL_Z_THICKNESS;

    // Front face: 3 outer vertices on hex rim
    const fO1 = this.geometry.getVertexLerp(depth, visualLane1, rotAngle);
    const fOM = this.geometry.getVertexLerp(depth, midVertex, rotAngle);
    const fO3 = this.geometry.getVertexLerp(depth, endVertex, rotAngle);
    if (!fO1 || !fOM || !fO3) return;

    // Single perpendicular for the whole span (one solid piece)
    const fScale = this.geometry.getScaleLerp(depth);
    const fH = CONFIG.WALL_HEIGHT * fScale;
    const fP = this._wallPerp(fO1, fO3, fH);
    const fI1 = { x: fO1.x + fP.x, y: fO1.y + fP.y };
    const fI3 = { x: fO3.x + fP.x, y: fO3.y + fP.y };

    // Back face: 3 outer vertices
    const bO1 = this.geometry.getVertexAtRadius(backDepth, visualLane1, rotAngle, 1.0);
    const bOM = this.geometry.getVertexAtRadius(backDepth, midVertex, rotAngle, 1.0);
    const bO3 = this.geometry.getVertexAtRadius(backDepth, endVertex, rotAngle, 1.0);

    const bScale = this.geometry.getScaleLerp(backDepth);
    const bH = CONFIG.WALL_HEIGHT * bScale;
    const bP = this._wallPerp(bO1, bO3, bH);
    const bI1 = { x: bO1.x + bP.x, y: bO1.y + bP.y };
    const bI3 = { x: bO3.x + bP.x, y: bO3.y + bP.y };

    const c = color || WALL_COLOR;

    // Front face outline (one continuous piece)
    drawGlowLine(gfx, fO1.x, fO1.y, fOM.x, fOM.y, c);
    drawGlowLine(gfx, fOM.x, fOM.y, fO3.x, fO3.y, c);
    drawGlowLine(gfx, fO3.x, fO3.y, fI3.x, fI3.y, c);
    drawGlowLine(gfx, fI3.x, fI3.y, fI1.x, fI1.y, c);
    drawGlowLine(gfx, fI1.x, fI1.y, fO1.x, fO1.y, c);

    // Back face outline
    drawGlowLine(gfx, bO1.x, bO1.y, bOM.x, bOM.y, c);
    drawGlowLine(gfx, bOM.x, bOM.y, bO3.x, bO3.y, c);
    drawGlowLine(gfx, bO3.x, bO3.y, bI3.x, bI3.y, c);
    drawGlowLine(gfx, bI3.x, bI3.y, bI1.x, bI1.y, c);
    drawGlowLine(gfx, bI1.x, bI1.y, bO1.x, bO1.y, c);

    // Connecting edges (5 corners)
    drawGlowLine(gfx, fO1.x, fO1.y, bO1.x, bO1.y, c);
    drawGlowLine(gfx, fOM.x, fOM.y, bOM.x, bOM.y, c);
    drawGlowLine(gfx, fO3.x, fO3.y, bO3.x, bO3.y, c);
    drawGlowLine(gfx, fI1.x, fI1.y, bI1.x, bI1.y, c);
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

    // Back disc face (full ellipse — thin puck body barely occludes)
    drawGlowEllipse(gfx, ix, iy, r, r * tilt, color, rotation);

    // Side connecting lines at left/right extremes
    drawGlowLine(gfx,
      ix + px * r, iy + py * r,
      ox + px * r, oy + py * r, color);
    drawGlowLine(gfx,
      ix - px * r, iy - py * r,
      ox - px * r, oy - py * r, color);

    // Front disc face: full ellipse (always visible)
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

  _drawBomb(gfx, cx, cy, size, color) {
    // 3D sphere with spikes
    const r = size * 0.4;
    const va = Math.atan2(cy - CONFIG.CENTER_Y, cx - CONFIG.CENTER_X);

    // Sphere: circle + meridian ellipse
    drawGlowCircle(gfx, cx, cy, r, color);
    drawGlowEllipse(gfx, cx, cy, r * 0.3, r, color, va);

    // Spikes radiating outward from the sphere surface
    const NUM_SPIKES = 8;
    const spikeLen = size * 0.3;
    for (let i = 0; i < NUM_SPIKES; i++) {
      const angle = (i / NUM_SPIKES) * Math.PI * 2;
      const sx = cx + Math.cos(angle) * r;
      const sy = cy + Math.sin(angle) * r;
      const tx = cx + Math.cos(angle) * (r + spikeLen);
      const ty = cy + Math.sin(angle) * (r + spikeLen);
      drawGlowLine(gfx, sx, sy, tx, ty, color);
    }
  }

  _drawHeart(gfx, cx, cy, size, color) {
    // Heart shape laying flat like the hockey puck
    const dx = CONFIG.CENTER_X - cx;
    const dy = CONFIG.CENTER_Y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;  // toward center
    const ny = dy / dist;
    const px = -ny;  // perpendicular (along face edge)
    const py = nx;

    const r = size * 0.5;
    const tilt = 0.35;  // foreshortening
    const thickness = size * 0.15;

    // Build heart shape points in local 2D (u = perpendicular, v = toward/away center)
    // then project with foreshortening on the v-axis
    const numPts = 32;
    const pts = [];
    for (let i = 0; i < numPts; i++) {
      const t = (i / numPts) * Math.PI * 2;
      // Heart parametric: x = 16 sin^3(t), y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
      const u = Math.pow(Math.sin(t), 3);
      const v = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
      pts.push({ u: u * r, v: v * r * tilt });
    }

    // Draw front and back face + connecting sides
    const ox = cx - nx * thickness * 0.5;
    const oy = cy - ny * thickness * 0.5;
    const ix = cx + nx * thickness * 0.5;
    const iy = cy + ny * thickness * 0.5;

    // Draw outline for both faces
    for (const center of [{ x: ox, y: oy }, { x: ix, y: iy }]) {
      for (let i = 0; i < numPts; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % numPts];
        const x1 = center.x + px * a.u + nx * a.v;
        const y1 = center.y + py * a.u + ny * a.v;
        const x2 = center.x + px * b.u + nx * b.v;
        const y2 = center.y + py * b.u + ny * b.v;
        drawGlowLine(gfx, x1, y1, x2, y2, color);
      }
    }

    // Side connecting lines at widest points (left, right, bottom tip)
    const widest = Math.round(numPts * 0.25);  // ~quarter turn = widest left
    const widest2 = Math.round(numPts * 0.75); // widest right
    const bottom = Math.round(numPts * 0.5);   // bottom tip
    for (const idx of [widest, widest2, bottom]) {
      const p = pts[idx % numPts];
      drawGlowLine(gfx,
        ox + px * p.u + nx * p.v, oy + py * p.u + ny * p.v,
        ix + px * p.u + nx * p.v, iy + py * p.u + ny * p.v, color);
    }
  }

  _drawSpiralEnemy(gfx, cx, cy, size, color, spinDir) {
    const r = size * 0.3;

    // Orb (small circle)
    drawGlowCircle(gfx, cx, cy, r, color);

    // Tangent direction for the arrow (perpendicular to radial)
    const rx = cx - CONFIG.CENTER_X;
    const ry = cy - CONFIG.CENTER_Y;
    const dist = Math.sqrt(rx * rx + ry * ry) || 1;
    const tx = (-ry / dist) * spinDir;
    const ty = (rx / dist) * spinDir;
    const arrowAngle = Math.atan2(ty, tx);

    // Arrow stem from orb edge outward
    const stemX = cx + tx * r;
    const stemY = cy + ty * r;
    const tipX = cx + tx * (r + size * 0.28);
    const tipY = cy + ty * (r + size * 0.28);
    drawGlowLine(gfx, stemX, stemY, tipX, tipY, color);

    // Arrowhead barbs
    const barbLen = size * 0.16;
    const barbAngle = Math.PI * 0.75;
    drawGlowLine(gfx, tipX, tipY,
      tipX + Math.cos(arrowAngle + barbAngle) * barbLen,
      tipY + Math.sin(arrowAngle + barbAngle) * barbLen, color);
    drawGlowLine(gfx, tipX, tipY,
      tipX + Math.cos(arrowAngle - barbAngle) * barbLen,
      tipY + Math.sin(arrowAngle - barbAngle) * barbLen, color);
  }

  _drawPhaseEnemy(gfx, cx, cy, size, enemy, dt) {
    const color = enemy.hitFlash > 0 ? 0xffffff :
                  enemy.transitionFlash > 0 ? 0xffffff : CONFIG.COLORS.PHASE;

    // Decay flashes
    if (enemy.hitFlash > 0) {
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);
    }
    if (enemy.transitionFlash > 0) {
      enemy.transitionFlash = Math.max(0, enemy.transitionFlash - dt * 3);
    }

    if (enemy.phase === 'vulnerable') {
      // Solid puck — same as regular enemy puck but purple
      this._drawPuck(gfx, cx, cy, size, color);
      return;
    }

    // Shielded: dashed puck (dashed ellipses + dashed connecting lines)
    const dx = CONFIG.CENTER_X - cx;
    const dy = CONFIG.CENTER_Y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;
    const ny = dy / dist;
    const px = -ny;
    const py = nx;

    const r = size * 0.5;
    const tilt = 0.35;
    const thickness = size * 0.2;
    const rotation = Math.atan2(py, px);

    const ix = cx + nx * thickness * 0.5;
    const iy = cy + ny * thickness * 0.5;
    const ox = cx - nx * thickness * 0.5;
    const oy = cy - ny * thickness * 0.5;

    // Back disc face (dashed ellipse)
    drawGlowDashedEllipse(gfx, ix, iy, r, r * tilt, color, rotation);

    // Dashed side connecting lines
    drawGlowDashedLine(gfx,
      ix + px * r, iy + py * r,
      ox + px * r, oy + py * r, color, 3);
    drawGlowDashedLine(gfx,
      ix - px * r, iy - py * r,
      ox - px * r, oy - py * r, color, 3);

    // Front disc face (dashed ellipse)
    drawGlowDashedEllipse(gfx, ox, oy, r, r * tilt, color, rotation);
  }

  _deflectColor(lifeRatio) {
    const i = lifeRatio * lifeRatio;
    const r = Math.min(255, Math.floor(200 * i + 55 * i * i));
    const g = Math.min(255, Math.floor(230 * i + 25 * i * i));
    const b = Math.min(255, Math.floor(255 * i));
    return (r << 16) | (g << 8) | b;
  }

  _drawEdgeBolts(gfx, bolts, v1, v2, perp, lifeRatio, color) {
    for (const bolt of bolts) {
      for (let j = 0; j < bolt.length - 1; j++) {
        const a = bolt[j];
        const b = bolt[j + 1];
        const jitter = (Math.random() - 0.5) * 0.12 * lifeRatio;
        const ax = v1.x + (v2.x - v1.x) * a.t + perp.x * (a.offset + jitter);
        const ay = v1.y + (v2.y - v1.y) * a.t + perp.y * (a.offset + jitter);
        const bx = v1.x + (v2.x - v1.x) * b.t + perp.x * (b.offset + jitter);
        const by = v1.y + (v2.y - v1.y) * b.t + perp.y * (b.offset + jitter);
        drawGlowLine(gfx, ax, ay, bx, by, color);
      }
    }
  }

  _drawDeflectEffect(gfx, effect, visualOffset, rotAngle, state, enemyLerp) {
    const lifeRatio = 1.0 - effect.elapsed / effect.lifetime;
    if (lifeRatio <= 0) return;

    const visualDepth = effect.prevDepth + (effect.depth - effect.prevDepth) * enemyLerp;
    if (visualDepth < 0 || visualDepth > CONFIG.MAX_DEPTH) return;

    const color = this._deflectColor(lifeRatio);

    if (effect.type === 'phase') {
      this._drawPhaseDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color);
    } else if (effect.type === 'doublewall') {
      this._drawDoubleWallDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color);
    } else {
      this._drawWallDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color);
    }
  }

  // Single wall: lightning along the face edge with perpendicular offsets
  _drawWallDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color) {
    const renderLane = state.getRenderLane(effect.lane);
    const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;
    const nextVertex = (visualLane + 1) % CONFIG.NUM_LANES;

    const v1 = this.geometry.getVertexLerp(visualDepth, visualLane, rotAngle);
    const v2 = this.geometry.getVertexLerp(visualDepth, nextVertex, rotAngle);
    if (!v1 || !v2) return;

    const scale = this.geometry.getScaleLerp(visualDepth);
    const perpHeight = CONFIG.WALL_HEIGHT * scale * 0.8;
    const perp = this._wallPerp(v1, v2, perpHeight);

    this._drawEdgeBolts(gfx, effect.bolts, v1, v2, perp, lifeRatio, color);

    // Impact flash at center
    if (lifeRatio > 0.55) {
      const fi = (lifeRatio - 0.55) / 0.45;
      const cx = (v1.x + v2.x) / 2;
      const cy = (v1.y + v2.y) / 2;
      const flashR = perpHeight * 0.35 * fi;
      if (flashR > 1) drawGlowCircle(gfx, cx, cy, flashR, 0xffffff);
    }
  }

  // Double wall: two sets of bolts, one per face segment, following each angled edge
  _drawDoubleWallDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color) {
    const renderLane1 = state.getRenderLane(effect.lane);
    const visualLane1 = (renderLane1 + visualOffset) % CONFIG.NUM_LANES;
    const renderLane2 = state.getRenderLane(effect.lane2);
    const visualLane2 = (renderLane2 + visualOffset) % CONFIG.NUM_LANES;
    const midVertex = (visualLane1 + 1) % CONFIG.NUM_LANES;
    const endVertex = (visualLane2 + 1) % CONFIG.NUM_LANES;

    const vStart = this.geometry.getVertexLerp(visualDepth, visualLane1, rotAngle);
    const vMid = this.geometry.getVertexLerp(visualDepth, midVertex, rotAngle);
    const vEnd = this.geometry.getVertexLerp(visualDepth, endVertex, rotAngle);
    if (!vStart || !vMid || !vEnd) return;

    const scale = this.geometry.getScaleLerp(visualDepth);
    const perpHeight = CONFIG.WALL_HEIGHT * scale * 0.8;

    // Face A: start → mid
    const perpA = this._wallPerp(vStart, vMid, perpHeight);
    this._drawEdgeBolts(gfx, effect.boltsA, vStart, vMid, perpA, lifeRatio, color);

    // Face B: mid → end
    const perpB = this._wallPerp(vMid, vEnd, perpHeight);
    this._drawEdgeBolts(gfx, effect.boltsB, vMid, vEnd, perpB, lifeRatio, color);

    // Impact flash at the shared mid vertex
    if (lifeRatio > 0.55) {
      const fi = (lifeRatio - 0.55) / 0.45;
      const flashR = perpHeight * 0.35 * fi;
      if (flashR > 1) drawGlowCircle(gfx, vMid.x, vMid.y, flashR, 0xffffff);
    }
  }

  // Phase shield: radial burst of short lightning bolts from the enemy center
  _drawPhaseDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color) {
    const renderLane = state.getRenderLane(effect.lane);
    const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;

    const pos = this.geometry.getMidpointLerp(visualDepth, visualLane, rotAngle);
    if (!pos) return;

    const scale = this.geometry.getScaleLerp(visualDepth);
    const radius = 137 * scale * 0.55; // slightly larger than the puck

    // Purple-tinted lightning for phase shield
    const pi = lifeRatio * lifeRatio;
    const pr = Math.min(255, Math.floor(200 * pi + 55 * pi));
    const pg = Math.min(255, Math.floor(140 * pi));
    const pb = Math.min(255, Math.floor(255 * pi));
    const phaseColor = (pr << 16) | (pg << 8) | pb;

    // Draw radial bolts
    for (const bolt of effect.bolts) {
      for (let j = 0; j < bolt.length - 1; j++) {
        const a = bolt[j];
        const b = bolt[j + 1];
        const jitter = (Math.random() - 0.5) * 0.15 * lifeRatio;
        const ax = pos.x + Math.cos(a.angle + jitter) * radius * a.dist;
        const ay = pos.y + Math.sin(a.angle + jitter) * radius * a.dist;
        const bx = pos.x + Math.cos(b.angle + jitter) * radius * b.dist;
        const by = pos.y + Math.sin(b.angle + jitter) * radius * b.dist;
        drawGlowLine(gfx, ax, ay, bx, by, phaseColor);
      }
    }

    // Shield ring flash
    if (lifeRatio > 0.4) {
      const fi = (lifeRatio - 0.4) / 0.6;
      const ringR = radius * (0.7 + 0.3 * fi);
      drawGlowCircle(gfx, pos.x, pos.y, ringR, phaseColor);
    }
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
    const baseWidth = 17;
    const baseDepth = 10;
    const barrelLength = 24;
    const barrelBaseWidth = 7;
    const barrelTipWidth = 2.5;

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
