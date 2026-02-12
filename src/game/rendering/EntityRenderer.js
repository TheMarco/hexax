import { CONFIG } from '../config.js';
import { drawGlowDiamond, drawGlowPolygon, drawGlowLine, drawGlowClaw, drawGlowCircle, drawGlowEllipse, drawGlowArc, drawGlowDashedEllipse, drawGlowDashedLine, fillMaskEllipse, fillMaskCircle, fillMaskRect } from './GlowRenderer.js';

// Individual brightness per enemy type (adjustable)
const dimColor = (c, brightness) => {
  const r = Math.floor(((c >> 16) & 0xff) * brightness);
  const g = Math.floor(((c >> 8) & 0xff) * brightness);
  const b = Math.floor((c & 0xff) * brightness);
  return (r << 16) | (g << 8) | b;
};

const ENEMY_DIM = dimColor(CONFIG.COLORS.ENEMY, 0.8);         // Regular enemy (orange) - brighter
const TANK_DIM = dimColor(CONFIG.COLORS.TANK, 0.4);           // Tank (peachy orange)
const TANK_DAMAGED_DIM = dimColor(CONFIG.COLORS.TANK_DAMAGED, 0.4); // Tank damaged
const BOMB_DIM = dimColor(CONFIG.COLORS.BOMB, 0.5);           // Bomb (yellow)
const HEART_DIM = dimColor(CONFIG.COLORS.HEART, 0.8);         // Heart (pink) - brighter
const PHASE_DIM = dimColor(CONFIG.COLORS.PHASE, 0.85);        // Phase enemy (purple) - brighter
const SPIRAL_DIM = dimColor(CONFIG.COLORS.SPIRAL, 0.5);       // Spiral enemy (magenta)
const BULLET_DIM = dimColor(CONFIG.COLORS.BULLET, 0.5);       // Bullet (cyan)
const EXHAUST_DIM = dimColor(CONFIG.COLORS.BULLET, 0.2);     // Exhaust trail (very faint)
const WALL_DIM = dimColor(CONFIG.COLORS.WALL, 0.9);           // Walls (red) - brighter

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

  _makeShieldBolts(numBolts) {
    // Lightning bolts constrained to outward-facing semicircle (shield surface sparks)
    // Angles are in [0, PI] range — offset by outward direction at render time
    const bolts = [];
    for (let i = 0; i < numBolts; i++) {
      const angle = (i / (numBolts - 1)) * Math.PI + (Math.random() - 0.5) * 0.3;
      const numSegs = 2 + Math.floor(Math.random() * 2);
      const points = [];
      for (let j = 0; j <= numSegs; j++) {
        const frac = j / numSegs;
        const jitterAngle = angle + (Math.random() - 0.5) * 0.4 * frac;
        // Start near surface (0.65) and spark outward (1.15)
        points.push({ dist: 0.65 + frac * 0.5, angle: jitterAngle });
      }
      bolts.push(points);
    }
    return bolts;
  }

  spawnDeflect(entity, hitDepth) {
    // hitDepth = bullet's visual depth at collision time (lerp-exact)
    const type = entity.type;
    if (type === 'doublewall') {
      this.deflectEffects.push({
        entity, hitDepth,
        elapsed: 0, lifetime: 350,
        boltsA: this._makeEdgeBolts(4 + Math.floor(Math.random() * 2)),
        boltsB: this._makeEdgeBolts(4 + Math.floor(Math.random() * 2)),
      });
    } else if (type === 'phase') {
      this.deflectEffects.push({
        entity, hitDepth,
        elapsed: 0, lifetime: 300,
        bolts: this._makeShieldBolts(10 + Math.floor(Math.random() * 4)),
      });
    } else {
      this.deflectEffects.push({
        entity, hitDepth,
        elapsed: 0, lifetime: 350,
        bolts: this._makeEdgeBolts(5 + Math.floor(Math.random() * 3)),
      });
    }
  }


  draw(gfx, maskGfx, state, entityManager, visualOffset, rotAngle = 0, bulletLerp = 0, enemyLerp = 0, dt = 0, muzzleFlash = 0) {
    // Build render list with all entities and their visual depths
    const renderList = [];

    // Add enemies
    for (const enemy of entityManager.enemies) {
      if (!enemy.alive) continue;
      const renderLane = state.getRenderLane(enemy.lane);
      const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;
      const visualDepth = enemy.prevDepth + (enemy.depth - enemy.prevDepth) * enemyLerp;

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        let pos = this.geometry.getMidpointLerp(visualDepth, visualLane, rotAngle);

        // Spiral enemies: interpolate lane position
        if (enemy.type === 'spiral' && enemy.prevLane !== enemy.lane) {
          const laneLerp = Math.min(1, enemyLerp * CONFIG.SPIRAL_LANE_SPEED);
          const prevRenderLane = state.getRenderLane(enemy.prevLane);
          const prevVisualLane = (prevRenderLane + visualOffset) % CONFIG.NUM_LANES;
          const prevPos = this.geometry.getMidpointLerp(visualDepth, prevVisualLane, rotAngle);
          if (pos && prevPos) {
            pos = { x: prevPos.x + (pos.x - prevPos.x) * laneLerp, y: prevPos.y + (pos.y - prevPos.y) * laneLerp };
          }
        }

        if (pos) {
          const scale = this.geometry.getScaleLerp(visualDepth);
          const size = 137 * scale;
          renderList.push({
            type: 'enemy',
            depth: visualDepth,
            enemy, pos, size, dt,
          });
        }
      }
    }

    // Add bullets
    for (const bullet of entityManager.bullets) {
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
          // Compute trail end position (0.7 segments behind bullet)
          const trailDepth = Math.max(0, visualDepth - 0.7);
          const trailPos = this.geometry.getMidpointLerp(trailDepth, visualLane, rotAngle);
          renderList.push({
            type: 'bullet',
            depth: visualDepth,
            pos, size, trailPos,
          });
        }
      }
    }

    // Add ghost bullets
    for (const gb of this.ghostBullets) {
      const gbRenderLane = state.getRenderLane(gb.lane);
      const gbVisualLane = (gbRenderLane + visualOffset) % CONFIG.NUM_LANES;
      if (gb.depth >= 0 && gb.depth <= CONFIG.MAX_DEPTH) {
        const gbPos = this.geometry.getMidpointLerp(gb.depth, gbVisualLane, rotAngle);
        if (gbPos) {
          const gbScale = this.geometry.getScaleLerp(gb.depth);
          const gbSize = 6 * gbScale;
          renderList.push({
            type: 'bullet',
            depth: gb.depth,
            pos: gbPos,
            size: gbSize,
          });
        }
      }
    }

    // Add walls
    for (const wall of entityManager.walls) {
      const renderLane = state.getRenderLane(wall.lane);
      const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;
      const visualDepth = wall.prevDepth + (wall.depth - wall.prevDepth) * enemyLerp;

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        const color = wall.hitFlash > 0 ? CONFIG.COLORS.TUNNEL : WALL_DIM;
        renderList.push({
          type: 'wall',
          depth: visualDepth,
          visualLane, rotAngle, color, wall,
        });
      }
      // Decay hit flash
      if (wall.hitFlash > 0) {
        wall.hitFlash = Math.max(0, wall.hitFlash - dt * 4);
      }
    }

    // Add double walls
    for (const dw of entityManager.doublewalls) {
      const renderLane1 = state.getRenderLane(dw.lane);
      const visualLane1 = (renderLane1 + visualOffset) % CONFIG.NUM_LANES;
      const renderLane2 = state.getRenderLane(dw.lane2);
      const visualLane2 = (renderLane2 + visualOffset) % CONFIG.NUM_LANES;
      const visualDepth = dw.prevDepth + (dw.depth - dw.prevDepth) * enemyLerp;

      if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
        const color = dw.hitFlash > 0 ? CONFIG.COLORS.TUNNEL : WALL_DIM;
        renderList.push({
          type: 'doublewall',
          depth: visualDepth,
          visualLane1, visualLane2, rotAngle, color, dw,
        });
      }
      // Decay hit flash
      if (dw.hitFlash > 0) {
        dw.hitFlash = Math.max(0, dw.hitFlash - dt * 4);
      }
    }

    // Add deflect effects (lightning) to be depth-sorted
    for (const effect of this.deflectEffects) {
      const entity = effect.entity;
      if (entity) {
        // Use bullet's visual hit depth (lerp-exact) for positioning
        const visualDepth = effect.hitDepth != null
          ? effect.hitDepth
          : (entity.alive ? entity.prevDepth + (entity.depth - entity.prevDepth) * enemyLerp : entity.depth);
        if (visualDepth >= 0 && visualDepth <= CONFIG.MAX_DEPTH) {
          renderList.push({
            type: 'deflect',
            depth: visualDepth,
            effect, visualOffset, rotAngle, state, enemyLerp, dt,
          });
        }
      }
      effect.elapsed += dt * 1000;
    }
    this.deflectEffects = this.deflectEffects.filter(e => e.elapsed < e.lifetime);

    // Sort by depth: farthest first (highest depth value first)
    renderList.sort((a, b) => b.depth - a.depth);

    // First pass: draw all masks on layer 1
    for (const item of renderList) {
      if (item.type === 'enemy') {
        this._drawEnemyMask(maskGfx, item);
      } else if (item.type === 'wall') {
        this._drawWallMask(maskGfx, item.depth, item.visualLane, item.rotAngle);
      } else if (item.type === 'doublewall') {
        this._drawDoubleWallMask(maskGfx, item.depth, item.visualLane1, item.visualLane2, item.rotAngle);
      }
      // Bullets don't have masks
    }

    // Second pass: draw in depth order on layer 2 (farthest to nearest)
    for (const item of renderList) {
      if (item.type === 'enemy') {
        this._drawEnemyWireframe(gfx, item);
      } else if (item.type === 'bullet') {
        // Tiny wireframe missile pointing toward tunnel center
        const bx = item.pos.x;
        const by = item.pos.y;
        // Forward direction: toward tunnel center
        const fdx = CONFIG.CENTER_X - bx;
        const fdy = CONFIG.CENTER_Y - by;
        const flen = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
        const fx = fdx / flen; // forward unit vector
        const fy = fdy / flen;
        const px = -fy; // perpendicular unit vector
        const py = fx;
        const s = Math.max(item.size, 2.5); // scale factor

        // Nose tip (pointed front)
        const nose = { x: bx + fx * s * 1.6, y: by + fy * s * 1.6 };
        // Body corners (behind nose)
        const bodyFL = { x: bx + fx * s * 0.3 - px * s * 0.4, y: by + fy * s * 0.3 - py * s * 0.4 };
        const bodyFR = { x: bx + fx * s * 0.3 + px * s * 0.4, y: by + fy * s * 0.3 + py * s * 0.4 };
        const bodyBL = { x: bx - fx * s * 1.0 - px * s * 0.4, y: by - fy * s * 1.0 - py * s * 0.4 };
        const bodyBR = { x: bx - fx * s * 1.0 + px * s * 0.4, y: by - fy * s * 1.0 + py * s * 0.4 };
        // Tail fins (flared out at back)
        const finL = { x: bx - fx * s * 1.0 - px * s * 0.9, y: by - fy * s * 1.0 - py * s * 0.9 };
        const finR = { x: bx - fx * s * 1.0 + px * s * 0.9, y: by - fy * s * 1.0 + py * s * 0.9 };

        // Draw nose cone
        drawGlowLine(gfx, nose.x, nose.y, bodyFL.x, bodyFL.y, CONFIG.COLORS.BULLET);
        drawGlowLine(gfx, nose.x, nose.y, bodyFR.x, bodyFR.y, CONFIG.COLORS.BULLET);
        // Body sides
        drawGlowLine(gfx, bodyFL.x, bodyFL.y, bodyBL.x, bodyBL.y, CONFIG.COLORS.BULLET);
        drawGlowLine(gfx, bodyFR.x, bodyFR.y, bodyBR.x, bodyBR.y, CONFIG.COLORS.BULLET);
        // Tail base
        drawGlowLine(gfx, bodyBL.x, bodyBL.y, bodyBR.x, bodyBR.y, BULLET_DIM);
        // Fins
        drawGlowLine(gfx, bodyBL.x, bodyBL.y, finL.x, finL.y, BULLET_DIM);
        drawGlowLine(gfx, bodyBR.x, bodyBR.y, finR.x, finR.y, BULLET_DIM);

        // Exhaust trail (faint converging lines behind missile)
        if (item.trailPos) {
          drawGlowLine(gfx, bodyBL.x, bodyBL.y, item.trailPos.x, item.trailPos.y, EXHAUST_DIM);
          drawGlowLine(gfx, bodyBR.x, bodyBR.y, item.trailPos.x, item.trailPos.y, EXHAUST_DIM);
        }
      } else if (item.type === 'wall') {
        // Draw wireframe only (no blocker - it was hiding tunnel lines)
        this._drawWallWireframe(gfx, item.depth, item.visualLane, item.rotAngle, item.color);
      } else if (item.type === 'doublewall') {
        // Draw wireframe only (no blocker - it was hiding tunnel lines)
        this._drawDoubleWallWireframe(gfx, item.depth, item.visualLane1, item.visualLane2, item.rotAngle, item.color);
      } else if (item.type === 'deflect') {
        // Lightning effects are now depth-sorted
        this._drawDeflectEffect(gfx, item.effect, item.visualOffset, item.rotAngle, item.state, item.enemyLerp);
      }
    }

    // Draw ship (always in front)
    this._drawShip(gfx, maskGfx, visualOffset, rotAngle, muzzleFlash);
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

  _drawWallSlab(gfx, maskGfx, depth, visualLane, rotAngle, color) {
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

    const c = color || CONFIG.COLORS.WALL;

    // Fill the complete wall volume to block tunnel (6-sided polygon including inner face)
    maskGfx.fillStyle(0x000000, 1.0);
    maskGfx.beginPath();
    maskGfx.moveTo(fO1.x, fO1.y);    // Front outer left
    maskGfx.lineTo(fO2.x, fO2.y);    // Front outer right
    maskGfx.lineTo(fI2.x, fI2.y);    // Front inner right
    maskGfx.lineTo(bI2.x, bI2.y);    // Back inner right
    maskGfx.lineTo(bI1.x, bI1.y);    // Back inner left
    maskGfx.lineTo(fI1.x, fI1.y);    // Front inner left
    maskGfx.closePath();
    maskGfx.fillPath();

    // Visible surface: front rectangle, depth lines on top, back edge
    // Front face rectangle (closed shape)
    drawGlowLine(gfx, fO1.x, fO1.y, fO2.x, fO2.y, c);  // Bottom (outer edge on tunnel rim)
    drawGlowLine(gfx, fO2.x, fO2.y, fI2.x, fI2.y, c);  // Right side
    drawGlowLine(gfx, fI2.x, fI2.y, fI1.x, fI1.y, c);  // Top (inner edge)
    drawGlowLine(gfx, fI1.x, fI1.y, fO1.x, fO1.y, c);  // Left side
    // Depth lines from front inner corners to back inner corners
    drawGlowLine(gfx, fI1.x, fI1.y, bI1.x, bI1.y, c);  // Left depth line
    drawGlowLine(gfx, fI2.x, fI2.y, bI2.x, bI2.y, c);  // Right depth line
    // Back inner edge (shorter line farther away)
    drawGlowLine(gfx, bI1.x, bI1.y, bI2.x, bI2.y, c);
  }

  _drawDoubleWallSlab(gfx, maskGfx, depth, visualLane1, visualLane2, rotAngle, color) {
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

    const c = color || CONFIG.COLORS.WALL;

    // Fill the complete double wall volume to block tunnel (8-sided polygon including inner face)
    maskGfx.fillStyle(0x000000, 1.0);
    maskGfx.beginPath();
    maskGfx.moveTo(fO1.x, fO1.y);    // Front outer left
    maskGfx.lineTo(fOM.x, fOM.y);    // Front outer middle
    maskGfx.lineTo(fO3.x, fO3.y);    // Front outer right
    maskGfx.lineTo(fI3.x, fI3.y);    // Front inner right
    maskGfx.lineTo(bI3.x, bI3.y);    // Back inner right
    maskGfx.lineTo(bI1.x, bI1.y);    // Back inner left
    maskGfx.lineTo(fI1.x, fI1.y);    // Front inner left
    maskGfx.closePath();
    maskGfx.fillPath();

    // Front 5-sided polygon (visible front face):
    // Bottom edge (tunnel rim, 2 segments)
    drawGlowLine(gfx, fO1.x, fO1.y, fOM.x, fOM.y, c);
    drawGlowLine(gfx, fOM.x, fOM.y, fO3.x, fO3.y, c);
    // Right side (outer to inner)
    drawGlowLine(gfx, fO3.x, fO3.y, fI3.x, fI3.y, c);
    // Top edge (inner ridge)
    drawGlowLine(gfx, fI3.x, fI3.y, fI1.x, fI1.y, c);
    // Left side (inner to outer)
    drawGlowLine(gfx, fI1.x, fI1.y, fO1.x, fO1.y, c);

    // Two short perspective depth lines from top corners
    drawGlowLine(gfx, fI1.x, fI1.y, bI1.x, bI1.y, c);
    drawGlowLine(gfx, fI3.x, fI3.y, bI3.x, bI3.y, c);

    // Back top edge (shorter, connecting the depth lines)
    drawGlowLine(gfx, bI1.x, bI1.y, bI3.x, bI3.y, c);
  }

  _drawPuck(gfx, maskGfx, cx, cy, size, color) {
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

    // Draw opaque mask to block tunnel - fill the entire puck area
    // Back ellipse
    fillMaskEllipse(maskGfx, ix, iy, r, r * tilt, rotation);
    // Front ellipse
    fillMaskEllipse(maskGfx, ox, oy, r, r * tilt, rotation);
    // Rectangle connecting them
    const p1x = ix + px * r;
    const p1y = iy + py * r;
    const p2x = ix - px * r;
    const p2y = iy - py * r;
    const p3x = ox - px * r;
    const p3y = oy - py * r;
    const p4x = ox + px * r;
    const p4y = oy + py * r;

    maskGfx.fillStyle(0x000000, 1.0);
    maskGfx.beginPath();
    maskGfx.moveTo(p1x, p1y);
    maskGfx.lineTo(p2x, p2y);
    maskGfx.lineTo(p3x, p3y);
    maskGfx.lineTo(p4x, p4y);
    maskGfx.closePath();
    maskGfx.fillPath();

    // Back disc face: full ellipse (farther from camera, fully visible)
    drawGlowEllipse(gfx, ix, iy, r, r * tilt, color, rotation, 16, false);

    // Side connecting lines at left/right extremes (visible edges)
    drawGlowLine(gfx,
      ix + px * r, iy + py * r,
      ox + px * r, oy + py * r, color, false);
    drawGlowLine(gfx,
      ix - px * r, iy - py * r,
      ox - px * r, oy - py * r, color, false);

    // Front disc face: only the front-facing arc (closer to camera)
    // Arc from -PI/2 to +PI/2 in rotated space (bottom half facing player)
    const outwardAngle = Math.atan2(cy - CONFIG.CENTER_Y, cx - CONFIG.CENTER_X);
    drawGlowArc(gfx, ox, oy, r, r * tilt, color, rotation,
      outwardAngle - rotation - Math.PI / 2,
      outwardAngle - rotation + Math.PI / 2, 16);
  }

_drawTank(gfx, maskGfx, lx, ly, rx, ry, size, hp, hitSide) {
  const color = hp === 1 ? TANK_DAMAGED_DIM : TANK_DIM;
  const ballR = size * 0.28;

  // Direction from sphere to tunnel center
  const dx = CONFIG.CENTER_X - lx;
  const dy = CONFIG.CENTER_Y - ly;
  const dist = Math.hypot(dx, dy) || 1;

  // Tangent for connector
  const px = -dy / dist;
  const py = dx / dist;

  const drawLeft = hp >= 2 || hitSide === 'right';
  const drawRight = hp >= 2 || hitSide === 'left';

  // ----------------------------
  // DRAW BODY FIRST
  // ----------------------------

  if (drawLeft) {
    drawGlowCircle(gfx, lx, ly, ballR, color);
  }

  if (drawRight) {
    drawGlowCircle(gfx, rx, ry, ballR, color);
  }

  if (drawLeft && drawRight) {
    drawGlowLine(
      gfx,
      lx + px * ballR, ly + py * ballR,
      rx - px * ballR, ry - py * ballR,
      color
    );
  }

  // ----------------------------
  // MASK INTERIOR (CRITICAL)
  // ----------------------------

  if (drawLeft) {
    fillMaskCircle(maskGfx, lx, ly, ballR * 0.92);
  }

  if (drawRight) {
    fillMaskCircle(maskGfx, rx, ry, ballR * 0.92);
  }

  // ----------------------------
  // DRAW MERIDIANS ON TOP
  // ----------------------------

  if (drawLeft) {
    const radial = Math.atan2(ly - CONFIG.CENTER_Y, lx - CONFIG.CENTER_X);
    const tangent = radial + Math.PI / 2;

    // Horizontal meridian
    drawGlowEllipse(
      gfx,
      lx, ly,
      ballR, ballR * 0.3,
      tangent,
      color
    );

    // Vertical meridian
    drawGlowEllipse(
      gfx,
      lx, ly,
      ballR * 0.3, ballR,
      radial,
      color
    );
  }

  if (drawRight) {
    const radial = Math.atan2(ry - CONFIG.CENTER_Y, rx - CONFIG.CENTER_X);
    const tangent = radial + Math.PI / 2;

    drawGlowEllipse(
      gfx,
      rx, ry,
      ballR, ballR * 0.3,
      tangent,
      color
    );

    drawGlowEllipse(
      gfx,
      rx, ry,
      ballR * 0.3, ballR,
      radial,
      color
    );
  }
}


  _drawBomb(gfx, maskGfx, cx, cy, size, color) {
    // 3D sphere with spikes
    const r = size * 0.4;

    // Draw mask to block tunnel (just the sphere, not the spikes)
    fillMaskCircle(maskGfx, cx, cy, r + 3); // sphere + small glow margin

    const outwardAngle = Math.atan2(cy - CONFIG.CENTER_Y, cx - CONFIG.CENTER_X);
    const radialAngle = Math.atan2(cy - CONFIG.CENTER_Y, cx - CONFIG.CENTER_X);

    // Sphere: circle + two full meridians + one front arc
    drawGlowCircle(gfx, cx, cy, r, color);
    // Horizontal meridian (full ellipse, perpendicular to radial)
    const tangentAngle = radialAngle + Math.PI / 2;
    drawGlowEllipse(gfx, cx, cy, r, r * 0.3, color, tangentAngle);
    // Cross meridian (full ellipse, 90° from horizontal)
    drawGlowEllipse(gfx, cx, cy, r * 0.3, r, color, tangentAngle);
    // Vertical meridian (front arc only, along radial)
    drawGlowArc(gfx, cx, cy, r * 0.3, r, color, radialAngle,
      outwardAngle - radialAngle - Math.PI / 2,
      outwardAngle - radialAngle + Math.PI / 2, 16);

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

  _drawHeart(gfx, maskGfx, cx, cy, size, color) {
    // Heart shape laying flat like the hockey puck
    const dx = CONFIG.CENTER_X - cx;
    const dy = CONFIG.CENTER_Y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;  // toward center
    const ny = dy / dist;
    const px = -ny;  // perpendicular (along face edge)
    const py = nx;

    const r = size * 0.5;

    // Draw simple circle mask (heart is roughly circular)
    fillMaskCircle(maskGfx, cx, cy, r);
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

    // Back face (farther from camera) - full heart outline
    const ix = cx + nx * thickness * 0.5;
    const iy = cy + ny * thickness * 0.5;

    for (let i = 0; i < numPts; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % numPts];
      const x1 = ix + px * a.u + nx * a.v;
      const y1 = iy + py * a.u + ny * a.v;
      const x2 = ix + px * b.u + nx * b.v;
      const y2 = iy + py * b.u + ny * b.v;
      drawGlowLine(gfx, x1, y1, x2, y2, color);
    }

    // Front face (closer to camera)
    const ox = cx - nx * thickness * 0.5;
    const oy = cy - ny * thickness * 0.5;

    // Key points: left widest, right widest, bottom tip
    const leftIdx = Math.round(numPts * 0.25);
    const bottomIdx = Math.round(numPts * 0.5);
    const rightIdx = Math.round(numPts * 0.75);

    // Three depth lines connecting back to front
    const backLeft = { x: ix + px * pts[leftIdx].u + nx * pts[leftIdx].v, y: iy + py * pts[leftIdx].u + ny * pts[leftIdx].v };
    const backBottom = { x: ix + px * pts[bottomIdx].u + nx * pts[bottomIdx].v, y: iy + py * pts[bottomIdx].u + ny * pts[bottomIdx].v };
    const backRight = { x: ix + px * pts[rightIdx].u + nx * pts[rightIdx].v, y: iy + py * pts[rightIdx].u + ny * pts[rightIdx].v };

    const frontLeft = { x: ox + px * pts[leftIdx].u + nx * pts[leftIdx].v, y: oy + py * pts[leftIdx].u + ny * pts[leftIdx].v };
    const frontBottom = { x: ox + px * pts[bottomIdx].u + nx * pts[bottomIdx].v, y: oy + py * pts[bottomIdx].u + ny * pts[bottomIdx].v };
    const frontRight = { x: ox + px * pts[rightIdx].u + nx * pts[rightIdx].v, y: oy + py * pts[rightIdx].u + ny * pts[rightIdx].v };

    drawGlowLine(gfx, backLeft.x, backLeft.y, frontLeft.x, frontLeft.y, color);
    drawGlowLine(gfx, backBottom.x, backBottom.y, frontBottom.x, frontBottom.y, color);
    drawGlowLine(gfx, backRight.x, backRight.y, frontRight.x, frontRight.y, color);

    // Front visible edges: left side → bottom → right side
    drawGlowLine(gfx, frontLeft.x, frontLeft.y, frontBottom.x, frontBottom.y, color);
    drawGlowLine(gfx, frontBottom.x, frontBottom.y, frontRight.x, frontRight.y, color);
  }

  _drawSpiralEnemy(gfx, maskGfx, cx, cy, size, enemy, dt) {
  const color = SPIRAL_DIM;
  const r = size * 0.35;

  const radial = Math.atan2(cy - CONFIG.CENTER_Y, cx - CONFIG.CENTER_X);
  const tangent = radial + Math.PI / 2;

  // ----------------------------
  // BODY
  // ----------------------------

  drawGlowCircle(gfx, cx, cy, r, color);

  // ----------------------------
  // MASK INTERIOR
  // ----------------------------

  fillMaskCircle(maskGfx, cx, cy, r * 0.92);

  // ----------------------------
  // MERIDIANS (FULL, STABLE)
  // ----------------------------

  drawGlowEllipse(
    gfx,
    cx, cy,
    r, r * 0.35,
    tangent,
    color
  );

  drawGlowEllipse(
    gfx,
    cx, cy,
    r * 0.35, r,
    radial,
    color
  );
}


  _drawPhaseEnemy(gfx, maskGfx, cx, cy, size, enemy, dt) {
    const color = enemy.hitFlash > 0 ? 0xffffff : PHASE_DIM;

    // Decay flashes
    if (enemy.hitFlash > 0) {
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);
    }
    if (enemy.transitionFlash > 0) {
      enemy.transitionFlash = Math.max(0, enemy.transitionFlash - dt * 3);
    }

    if (enemy.phase === 'vulnerable') {
      // Solid puck — same as regular enemy puck but purple
      this._drawPuck(gfx, maskGfx, cx, cy, size, color);
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

    const entity = effect.entity;
    if (!entity) return;

    // Use bullet's visual hit depth for positioning (lerp-exact)
    const visualDepth = effect.hitDepth != null
      ? effect.hitDepth
      : (entity.alive ? entity.prevDepth + (entity.depth - entity.prevDepth) * enemyLerp : entity.depth);
    if (visualDepth < 0 || visualDepth > CONFIG.MAX_DEPTH) return;

    const color = this._deflectColor(lifeRatio);

    if (entity.type === 'phase') {
      this._drawPhaseDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color);
    } else if (entity.type === 'doublewall') {
      this._drawDoubleWallDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color);
    } else {
      this._drawWallDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color);
    }
  }

  // Single wall: lightning along the face edge with perpendicular offsets
  _drawWallDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color) {
    const renderLane = state.getRenderLane(effect.entity.lane);
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
    const renderLane1 = state.getRenderLane(effect.entity.lane);
    const visualLane1 = (renderLane1 + visualOffset) % CONFIG.NUM_LANES;
    const renderLane2 = state.getRenderLane(effect.entity.lane2);
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

  // Phase shield: sparks on the outward-facing surface of the puck
  _drawPhaseDeflect(gfx, effect, visualOffset, rotAngle, state, visualDepth, lifeRatio, color) {
    const renderLane = state.getRenderLane(effect.entity.lane);
    const visualLane = (renderLane + visualOffset) % CONFIG.NUM_LANES;

    const pos = this.geometry.getMidpointLerp(visualDepth, visualLane, rotAngle);
    if (!pos) return;

    const scale = this.geometry.getScaleLerp(visualDepth);
    const radius = 137 * scale * 0.55;

    // Purple-tinted lightning for phase shield
    const pi = lifeRatio * lifeRatio;
    const pr = Math.min(255, Math.floor(200 * pi + 55 * pi));
    const pg = Math.min(255, Math.floor(140 * pi));
    const pb = Math.min(255, Math.floor(255 * pi));
    const phaseColor = (pr << 16) | (pg << 8) | pb;

    // Outward direction (away from tunnel center) — bolts face the player
    const outwardAngle = Math.atan2(pos.y - CONFIG.CENTER_Y, pos.x - CONFIG.CENTER_X);
    // Bolt angles are in [0, PI] — rotate to center on outward direction
    const angleOffset = outwardAngle - Math.PI / 2;

    // Draw shield surface bolts
    for (const bolt of effect.bolts) {
      for (let j = 0; j < bolt.length - 1; j++) {
        const a = bolt[j];
        const b = bolt[j + 1];
        const jitter = (Math.random() - 0.5) * 0.12 * lifeRatio;
        const ax = pos.x + Math.cos(a.angle + angleOffset + jitter) * radius * a.dist;
        const ay = pos.y + Math.sin(a.angle + angleOffset + jitter) * radius * a.dist;
        const bx = pos.x + Math.cos(b.angle + angleOffset + jitter) * radius * b.dist;
        const by = pos.y + Math.sin(b.angle + angleOffset + jitter) * radius * b.dist;
        drawGlowLine(gfx, ax, ay, bx, by, phaseColor);
      }
    }

    // Shield arc flash (outward-facing semicircle, not full circle)
    if (lifeRatio > 0.4) {
      const fi = (lifeRatio - 0.4) / 0.6;
      const ringR = radius * (0.7 + 0.3 * fi);
      drawGlowArc(gfx, pos.x, pos.y, ringR, ringR, phaseColor, 0,
        outwardAngle - Math.PI * 0.6, outwardAngle + Math.PI * 0.6);
    }
  }

  // Helper methods for depth-sorted rendering

  _drawEnemyMask(maskGfx, item) {
    const { enemy, pos, size } = item;
    if (enemy.type === 'tank') {
      // Mask visible spheres based on HP
      const dx = CONFIG.CENTER_X - pos.x;
      const dy = CONFIG.CENTER_Y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const px = -dy / dist;
      const py = dx / dist;
      const nx = dx / dist;
      const ny = dy / dist;
      const ballR = size * 0.32;
      const spacing = size * 0.55;
      const lx = pos.x - px * spacing;
      const ly = pos.y - py * spacing;
      const rx = pos.x + px * spacing;
      const ry = pos.y + py * spacing;

      const drawLeft = enemy.hp >= 2 || enemy.hitSide === 'right';
      const drawRight = enemy.hp >= 2 || enemy.hitSide === 'left';

      // Mask only visible spheres
      if (drawLeft) fillMaskCircle(maskGfx, lx, ly, ballR);
      if (drawRight) fillMaskCircle(maskGfx, rx, ry, ballR);

      // Connector mask - always covers full bar area regardless of HP
      const barGap = ballR * 0.3;
      const extend = barGap + 2;  // Just slightly beyond bars to cover glow
      const blx = lx + px * ballR;  // left inner edge
      const bly = ly + py * ballR;
      const brx = rx - px * ballR;  // right inner edge
      const bry = ry - py * ballR;

      maskGfx.fillStyle(0x000000, 1.0);
      maskGfx.beginPath();
      maskGfx.moveTo(blx + nx * extend, bly + ny * extend);
      maskGfx.lineTo(brx + nx * extend, bry + ny * extend);
      maskGfx.lineTo(brx - nx * extend, bry - ny * extend);
      maskGfx.lineTo(blx - nx * extend, bly - ny * extend);
      maskGfx.closePath();
      maskGfx.fillPath();
    } else if (enemy.type === 'bomb') {
      const r = size * 0.4;
      fillMaskCircle(maskGfx, pos.x, pos.y, r + 3);
    } else if (enemy.type === 'heart') {
      // Heart-shaped mask matching the wireframe
      const dx = CONFIG.CENTER_X - pos.x;
      const dy = CONFIG.CENTER_Y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / dist;
      const ny = dy / dist;
      const px = -ny;
      const py = nx;
      const r = size * 0.5;
      const tilt = 0.35;
      const thickness = size * 0.15;
      const numPts = 32;
      const pts = [];
      for (let i = 0; i < numPts; i++) {
        const t = (i / numPts) * Math.PI * 2;
        const u = Math.pow(Math.sin(t), 3);
        const v = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
        pts.push({ u: u * r, v: v * r * tilt });
      }
      // Fill both front and back face outlines as a combined mask
      const ix = pos.x + nx * thickness * 0.5;
      const iy = pos.y + ny * thickness * 0.5;
      const ox = pos.x - nx * thickness * 0.5;
      const oy = pos.y - ny * thickness * 0.5;
      maskGfx.fillStyle(0x000000, 1.0);
      // Back face
      maskGfx.beginPath();
      for (let i = 0; i < numPts; i++) {
        const p = pts[i];
        const x = ix + px * p.u + nx * p.v;
        const y = iy + py * p.u + ny * p.v;
        if (i === 0) maskGfx.moveTo(x, y);
        else maskGfx.lineTo(x, y);
      }
      maskGfx.closePath();
      maskGfx.fillPath();
      // Front face
      maskGfx.beginPath();
      for (let i = 0; i < numPts; i++) {
        const p = pts[i];
        const x = ox + px * p.u + nx * p.v;
        const y = oy + py * p.u + ny * p.v;
        if (i === 0) maskGfx.moveTo(x, y);
        else maskGfx.lineTo(x, y);
      }
      maskGfx.closePath();
      maskGfx.fillPath();
      // Connecting shape between front and back
      const leftIdx = Math.round(numPts * 0.25);
      const bottomIdx = Math.round(numPts * 0.5);
      const rightIdx = Math.round(numPts * 0.75);
      const backLeft = { x: ix + px * pts[leftIdx].u + nx * pts[leftIdx].v, y: iy + py * pts[leftIdx].u + ny * pts[leftIdx].v };
      const backBottom = { x: ix + px * pts[bottomIdx].u + nx * pts[bottomIdx].v, y: iy + py * pts[bottomIdx].u + ny * pts[bottomIdx].v };
      const backRight = { x: ix + px * pts[rightIdx].u + nx * pts[rightIdx].v, y: iy + py * pts[rightIdx].u + ny * pts[rightIdx].v };
      const frontLeft = { x: ox + px * pts[leftIdx].u + nx * pts[leftIdx].v, y: oy + py * pts[leftIdx].u + ny * pts[leftIdx].v };
      const frontBottom = { x: ox + px * pts[bottomIdx].u + nx * pts[bottomIdx].v, y: oy + py * pts[bottomIdx].u + ny * pts[bottomIdx].v };
      const frontRight = { x: ox + px * pts[rightIdx].u + nx * pts[rightIdx].v, y: oy + py * pts[rightIdx].u + ny * pts[rightIdx].v };
      maskGfx.beginPath();
      maskGfx.moveTo(backLeft.x, backLeft.y);
      maskGfx.lineTo(frontLeft.x, frontLeft.y);
      maskGfx.lineTo(frontBottom.x, frontBottom.y);
      maskGfx.lineTo(backBottom.x, backBottom.y);
      maskGfx.closePath();
      maskGfx.fillPath();
      maskGfx.beginPath();
      maskGfx.moveTo(backBottom.x, backBottom.y);
      maskGfx.lineTo(frontBottom.x, frontBottom.y);
      maskGfx.lineTo(frontRight.x, frontRight.y);
      maskGfx.lineTo(backRight.x, backRight.y);
      maskGfx.closePath();
      maskGfx.fillPath();
    } else if (enemy.type === 'spiral') {
      const r = size * 0.3;
      fillMaskCircle(maskGfx, pos.x, pos.y, r + 3);
    } else if (enemy.type === 'phase') {
      if (enemy.phase === 'vulnerable') {
        // Solid puck mask
        const dx = CONFIG.CENTER_X - pos.x;
        const dy = CONFIG.CENTER_Y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nx = dx / dist;
        const ny = dy / dist;
        const r = size * 0.5;
        const tilt = 0.35;
        const thickness = size * 0.2;
        const rotation = Math.atan2(nx, -ny);
        const px = -ny;
        const py = nx;
        const ix = pos.x + nx * thickness * 0.5;
        const iy = pos.y + ny * thickness * 0.5;
        const ox = pos.x - nx * thickness * 0.5;
        const oy = pos.y - ny * thickness * 0.5;
        fillMaskEllipse(maskGfx, ix, iy, r, r * tilt, rotation);
        fillMaskEllipse(maskGfx, ox, oy, r, r * tilt, rotation);
        const p1x = ix + px * r, p1y = iy + py * r;
        const p2x = ix - px * r, p2y = iy - py * r;
        const p3x = ox - px * r, p3y = oy - py * r;
        const p4x = ox + px * r, p4y = oy + py * r;
        maskGfx.fillStyle(0x000000, 1.0);
        maskGfx.beginPath();
        maskGfx.moveTo(p1x, p1y);
        maskGfx.lineTo(p2x, p2y);
        maskGfx.lineTo(p3x, p3y);
        maskGfx.lineTo(p4x, p4y);
        maskGfx.closePath();
        maskGfx.fillPath();
      }
      // Shielded phase has no mask (dashed wireframe, transparent)
    } else {
      // Regular enemy puck
      const dx = CONFIG.CENTER_X - pos.x;
      const dy = CONFIG.CENTER_Y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / dist;
      const ny = dy / dist;
      const px = -ny;
      const py = nx;
      const r = size * 0.5;
      const tilt = 0.35;
      const thickness = size * 0.2;
      const rotation = Math.atan2(py, px);
      const ix = pos.x + nx * thickness * 0.5;
      const iy = pos.y + ny * thickness * 0.5;
      const ox = pos.x - nx * thickness * 0.5;
      const oy = pos.y - ny * thickness * 0.5;
      fillMaskEllipse(maskGfx, ix, iy, r, r * tilt, rotation);
      fillMaskEllipse(maskGfx, ox, oy, r, r * tilt, rotation);
      const p1x = ix + px * r, p1y = iy + py * r;
      const p2x = ix - px * r, p2y = iy - py * r;
      const p3x = ox - px * r, p3y = oy - py * r;
      const p4x = ox + px * r, p4y = oy + py * r;
      maskGfx.fillStyle(0x000000, 1.0);
      maskGfx.beginPath();
      maskGfx.moveTo(p1x, p1y);
      maskGfx.lineTo(p2x, p2y);
      maskGfx.lineTo(p3x, p3y);
      maskGfx.lineTo(p4x, p4y);
      maskGfx.closePath();
      maskGfx.fillPath();
    }
  }

  _drawEnemyWireframe(gfx, item) {
    const { enemy, pos, size, dt } = item;
    if (enemy.type === 'tank') {
      // Always use damaged color for consistent appearance
      this._drawTankWireframe(gfx, pos.x, pos.y, Math.max(size, 5), TANK_DAMAGED_DIM, enemy.hp, enemy.hitSide);
    } else if (enemy.type === 'bomb') {
      this._drawBombWireframe(gfx, pos.x, pos.y, Math.max(size, 5), BOMB_DIM);
    } else if (enemy.type === 'heart') {
      this._drawHeartWireframe(gfx, pos.x, pos.y, Math.max(size, 5), HEART_DIM);
    } else if (enemy.type === 'phase') {
      this._drawPhaseEnemyWireframe(gfx, pos.x, pos.y, Math.max(size, 4), enemy, dt);
    } else if (enemy.type === 'spiral') {
      this._drawSpiralEnemyWireframe(gfx, pos.x, pos.y, Math.max(size, 4), SPIRAL_DIM, enemy.spinDir);
    } else {
      this._drawPuckWireframe(gfx, pos.x, pos.y, Math.max(size, 4), ENEMY_DIM);
    }
  }

  _drawWallMask(maskGfx, depth, visualLane, rotAngle) {
    const nextVertex = (visualLane + 1) % CONFIG.NUM_LANES;
    const backDepth = depth + CONFIG.WALL_Z_THICKNESS;

    // Front face vertices
    const fO1 = this.geometry.getVertexLerp(depth, visualLane, rotAngle);
    const fO2 = this.geometry.getVertexLerp(depth, nextVertex, rotAngle);
    if (!fO1 || !fO2) return;
    const fScale = this.geometry.getScaleLerp(depth);
    const fH = CONFIG.WALL_HEIGHT * fScale * 0.98; // Slightly smaller than wireframe
    const fP = this._wallPerp(fO1, fO2, fH);
    const fI1 = { x: fO1.x + fP.x, y: fO1.y + fP.y };
    const fI2 = { x: fO2.x + fP.x, y: fO2.y + fP.y };

    // Back face vertices
    const bO1 = this.geometry.getVertexAtRadius(backDepth, visualLane, rotAngle, 1.0);
    const bO2 = this.geometry.getVertexAtRadius(backDepth, nextVertex, rotAngle, 1.0);
    const bScale = this.geometry.getScaleLerp(backDepth);
    const bH = CONFIG.WALL_HEIGHT * bScale * 0.98; // Slightly smaller than wireframe
    const bP = this._wallPerp(bO1, bO2, bH);
    const bI1 = { x: bO1.x + bP.x, y: bO1.y + bP.y };
    const bI2 = { x: bO2.x + bP.x, y: bO2.y + bP.y };

    // Mask the full 3D volume as a 6-sided polygon (extended to cover glow)
    maskGfx.fillStyle(0x000000, 1.0);
    maskGfx.beginPath();
    maskGfx.moveTo(fO1.x, fO1.y);
    maskGfx.lineTo(fO2.x, fO2.y);
    maskGfx.lineTo(fI2.x, fI2.y);
    maskGfx.lineTo(bI2.x, bI2.y);
    maskGfx.lineTo(bI1.x, bI1.y);
    maskGfx.lineTo(fI1.x, fI1.y);
    maskGfx.closePath();
    maskGfx.fillPath();
  }

  _drawWallBlocker(gfx, depth, visualLane, rotAngle) {
    const nextVertex = (visualLane + 1) % CONFIG.NUM_LANES;
    const backDepth = depth + CONFIG.WALL_Z_THICKNESS;
    const fO1 = this.geometry.getVertexLerp(depth, visualLane, rotAngle);
    const fO2 = this.geometry.getVertexLerp(depth, nextVertex, rotAngle);
    if (!fO1 || !fO2) return;
    const fScale = this.geometry.getScaleLerp(depth);
    // No expansion - exact wireframe dimensions
    const fH = CONFIG.WALL_HEIGHT * fScale;
    const fP = this._wallPerp(fO1, fO2, fH);
    const fI1 = { x: fO1.x + fP.x, y: fO1.y + fP.y };
    const fI2 = { x: fO2.x + fP.x, y: fO2.y + fP.y };
    const bO1 = this.geometry.getVertexAtRadius(backDepth, visualLane, rotAngle, 1.0);
    const bO2 = this.geometry.getVertexAtRadius(backDepth, nextVertex, rotAngle, 1.0);
    const bScale = this.geometry.getScaleLerp(backDepth);
    const bH = CONFIG.WALL_HEIGHT * bScale;
    const bP = this._wallPerp(bO1, bO2, bH);
    const bI1 = { x: bO1.x + bP.x, y: bO1.y + bP.y };
    const bI2 = { x: bO2.x + bP.x, y: bO2.y + bP.y };
    // Draw fully opaque black fill (normal blend) to exactly block entities behind wall
    gfx.setBlendMode(Phaser.BlendModes.NORMAL);
    gfx.fillStyle(0x000000, 1.0);
    gfx.beginPath();
    gfx.moveTo(fO1.x, fO1.y);
    gfx.lineTo(fO2.x, fO2.y);
    gfx.lineTo(fI2.x, fI2.y);
    gfx.lineTo(bI2.x, bI2.y);
    gfx.lineTo(bI1.x, bI1.y);
    gfx.lineTo(fI1.x, fI1.y);
    gfx.closePath();
    gfx.fillPath();
    gfx.setBlendMode(Phaser.BlendModes.ADD);
  }

  _drawWallWireframe(gfx, depth, visualLane, rotAngle, color) {
    const nextVertex = (visualLane + 1) % CONFIG.NUM_LANES;
    const backDepth = depth + CONFIG.WALL_Z_THICKNESS;
    const fO1 = this.geometry.getVertexLerp(depth, visualLane, rotAngle);
    const fO2 = this.geometry.getVertexLerp(depth, nextVertex, rotAngle);
    if (!fO1 || !fO2) return;
    const fScale = this.geometry.getScaleLerp(depth);
    const fH = CONFIG.WALL_HEIGHT * fScale;
    const fP = this._wallPerp(fO1, fO2, fH);
    const fI1 = { x: fO1.x + fP.x, y: fO1.y + fP.y };
    const fI2 = { x: fO2.x + fP.x, y: fO2.y + fP.y };
    const bO1 = this.geometry.getVertexAtRadius(backDepth, visualLane, rotAngle, 1.0);
    const bO2 = this.geometry.getVertexAtRadius(backDepth, nextVertex, rotAngle, 1.0);
    const bScale = this.geometry.getScaleLerp(backDepth);
    const bH = CONFIG.WALL_HEIGHT * bScale;
    const bP = this._wallPerp(bO1, bO2, bH);
    const bI1 = { x: bO1.x + bP.x, y: bO1.y + bP.y };
    const bI2 = { x: bO2.x + bP.x, y: bO2.y + bP.y };
    const c = color || CONFIG.COLORS.WALL;

    // All edges at full brightness
    drawGlowLine(gfx, fO1.x, fO1.y, fO2.x, fO2.y, c);
    drawGlowLine(gfx, fO2.x, fO2.y, fI2.x, fI2.y, c);
    drawGlowLine(gfx, fI2.x, fI2.y, fI1.x, fI1.y, c);
    drawGlowLine(gfx, fI1.x, fI1.y, fO1.x, fO1.y, c);
    drawGlowLine(gfx, fI1.x, fI1.y, bI1.x, bI1.y, c);
    drawGlowLine(gfx, fI2.x, fI2.y, bI2.x, bI2.y, c);
    drawGlowLine(gfx, bI1.x, bI1.y, bI2.x, bI2.y, c);
  }

  _drawDoubleWallMask(maskGfx, depth, visualLane1, visualLane2, rotAngle) {
    // Draw as two separate single walls
    this._drawWallMask(maskGfx, depth, visualLane1, rotAngle);
    this._drawWallMask(maskGfx, depth, visualLane2, rotAngle);
  }

  _drawDoubleWallBlocker(gfx, depth, visualLane1, visualLane2, rotAngle) {
    // Draw as two separate single walls
    this._drawWallBlocker(gfx, depth, visualLane1, rotAngle);
    this._drawWallBlocker(gfx, depth, visualLane2, rotAngle);
  }

  _drawDoubleWallWireframe(gfx, depth, visualLane1, visualLane2, rotAngle, color) {
    // Draw as two separate walls with a single shared perpendicular
    const midVertex = (visualLane1 + 1) % CONFIG.NUM_LANES;
    const endVertex = (visualLane2 + 1) % CONFIG.NUM_LANES;
    const backDepth = depth + CONFIG.WALL_Z_THICKNESS;

    // Get all vertices
    const fO1 = this.geometry.getVertexLerp(depth, visualLane1, rotAngle);
    const fOM = this.geometry.getVertexLerp(depth, midVertex, rotAngle);
    const fO3 = this.geometry.getVertexLerp(depth, endVertex, rotAngle);
    if (!fO1 || !fOM || !fO3) return;

    const fScale = this.geometry.getScaleLerp(depth);
    const fH = CONFIG.WALL_HEIGHT * fScale;

    // Use single perpendicular for entire double wall span
    const fP = this._wallPerp(fO1, fO3, fH);
    const fI1 = { x: fO1.x + fP.x, y: fO1.y + fP.y };
    const fIM = { x: fOM.x + fP.x, y: fOM.y + fP.y };
    const fI3 = { x: fO3.x + fP.x, y: fO3.y + fP.y };

    const bO1 = this.geometry.getVertexAtRadius(backDepth, visualLane1, rotAngle, 1.0);
    const bOM = this.geometry.getVertexAtRadius(backDepth, midVertex, rotAngle, 1.0);
    const bO3 = this.geometry.getVertexAtRadius(backDepth, endVertex, rotAngle, 1.0);

    const bScale = this.geometry.getScaleLerp(backDepth);
    const bH = CONFIG.WALL_HEIGHT * bScale;

    const bP = this._wallPerp(bO1, bO3, bH);
    const bI1 = { x: bO1.x + bP.x, y: bO1.y + bP.y };
    const bIM = { x: bOM.x + bP.x, y: bOM.y + bP.y };
    const bI3 = { x: bO3.x + bP.x, y: bO3.y + bP.y };

    const c = color || CONFIG.COLORS.WALL;
    // Dim the color by 50% for back edges
    const r = (c >> 16) & 0xff;
    const g = (c >> 8) & 0xff;
    const b = c & 0xff;
    const dimC = ((r >> 1) << 16) | ((g >> 1) << 8) | (b >> 1);

    // Wall 1: front rectangle (skip right edge) + left depth line + dimmed back edge
    drawGlowLine(gfx, fO1.x, fO1.y, fOM.x, fOM.y, c);    // Bottom
    drawGlowLine(gfx, fIM.x, fIM.y, fI1.x, fI1.y, c);    // Top
    drawGlowLine(gfx, fI1.x, fI1.y, fO1.x, fO1.y, c);    // Left side
    drawGlowLine(gfx, fI1.x, fI1.y, bI1.x, bI1.y, c);    // Left depth line
    drawGlowLine(gfx, bI1.x, bI1.y, bIM.x, bIM.y, dimC); // Back edge (dimmed)

    // Wall 2: front rectangle (skip left edge) + right depth line + dimmed back edge
    drawGlowLine(gfx, fOM.x, fOM.y, fO3.x, fO3.y, c);    // Bottom
    drawGlowLine(gfx, fI3.x, fI3.y, fIM.x, fIM.y, c);    // Top (using same fIM)
    drawGlowLine(gfx, fO3.x, fO3.y, fI3.x, fI3.y, c);    // Right side
    drawGlowLine(gfx, fI3.x, fI3.y, bI3.x, bI3.y, c);    // Right depth line
    drawGlowLine(gfx, bIM.x, bIM.y, bI3.x, bI3.y, dimC); // Back edge (dimmed)
  }

  // Wireframe-only drawing methods (no masks)

  _drawPuckWireframe(gfx, cx, cy, size, color) {
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
    drawGlowEllipse(gfx, ix, iy, r, r * tilt, color, rotation, 16, false);
    drawGlowLine(gfx, ix + px * r, iy + py * r, ox + px * r, oy + py * r, color, false);
    drawGlowLine(gfx, ix - px * r, iy - py * r, ox - px * r, oy - py * r, color, false);
    const outwardAngle = Math.atan2(cy - CONFIG.CENTER_Y, cx - CONFIG.CENTER_X);
    drawGlowArc(gfx, ox, oy, r, r * tilt, color, rotation,
      outwardAngle - rotation - Math.PI / 2,
      outwardAngle - rotation + Math.PI / 2, 16);
  }

  _drawTankWireframe(gfx, cx, cy, size, color, hp, hitSide) {
    const dx = CONFIG.CENTER_X - cx;
    const dy = CONFIG.CENTER_Y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;
    const ny = dy / dist;
    const px = -ny;
    const py = nx;
    const ballR = size * 0.32;
    const spacing = size * 0.55;
    const barGap = ballR * 0.3;
    const lx = cx - px * spacing;
    const ly = cy - py * spacing;
    const rx = cx + px * spacing;
    const ry = cy + py * spacing;

    // Draw spheres based on HP (but always use damaged color)
    const drawLeft = hp >= 2 || hitSide === 'right';
    const drawRight = hp >= 2 || hitSide === 'left';

    if (drawLeft) {
      const lOutwardAngle = Math.atan2(ly - CONFIG.CENTER_Y, lx - CONFIG.CENTER_X);
      const lRadialAngle = Math.atan2(ly - CONFIG.CENTER_Y, lx - CONFIG.CENTER_X);
      drawGlowCircle(gfx, lx, ly, ballR, color);
      const lTangentAngle = lRadialAngle + Math.PI / 2;
      drawGlowEllipse(gfx, lx, ly, ballR, ballR * 0.3, color, lTangentAngle);
      drawGlowEllipse(gfx, lx, ly, ballR * 0.3, ballR, color, lTangentAngle);
      drawGlowArc(gfx, lx, ly, ballR * 0.3, ballR, color, lRadialAngle,
        lOutwardAngle - lRadialAngle - Math.PI / 2,
        lOutwardAngle - lRadialAngle + Math.PI / 2, 16);
    }

    if (drawRight) {
      const rOutwardAngle = Math.atan2(ry - CONFIG.CENTER_Y, rx - CONFIG.CENTER_X);
      const rRadialAngle = Math.atan2(ry - CONFIG.CENTER_Y, rx - CONFIG.CENTER_X);
      drawGlowCircle(gfx, rx, ry, ballR, color);
      const rTangentAngle = rRadialAngle + Math.PI / 2;
      drawGlowEllipse(gfx, rx, ry, ballR, ballR * 0.3, color, rTangentAngle);
      drawGlowEllipse(gfx, rx, ry, ballR * 0.3, ballR, color, rTangentAngle);
      drawGlowArc(gfx, rx, ry, ballR * 0.3, ballR, color, rRadialAngle,
        rOutwardAngle - rRadialAngle - Math.PI / 2,
        rOutwardAngle - rRadialAngle + Math.PI / 2, 16);
    }

    // Connector bars between spheres
    const blx = lx + px * ballR;
    const bly = ly + py * ballR;
    const brx = rx - px * ballR;
    const bry = ry - py * ballR;
    drawGlowLine(gfx, blx + nx * barGap, bly + ny * barGap, brx + nx * barGap, bry + ny * barGap, color);
    drawGlowLine(gfx, blx - nx * barGap, bly - ny * barGap, brx - nx * barGap, bry - ny * barGap, color);
  }

  _drawBombWireframe(gfx, cx, cy, size, color) {
    const r = size * 0.4;
    const outwardAngle = Math.atan2(cy - CONFIG.CENTER_Y, cx - CONFIG.CENTER_X);
    const radialAngle = Math.atan2(cy - CONFIG.CENTER_Y, cx - CONFIG.CENTER_X);
    drawGlowCircle(gfx, cx, cy, r, color);
    const tangentAngle = radialAngle + Math.PI / 2;
    drawGlowEllipse(gfx, cx, cy, r, r * 0.3, color, tangentAngle);
    drawGlowEllipse(gfx, cx, cy, r * 0.3, r, color, tangentAngle);
    drawGlowArc(gfx, cx, cy, r * 0.3, r, color, radialAngle,
      outwardAngle - radialAngle - Math.PI / 2,
      outwardAngle - radialAngle + Math.PI / 2, 16);
    const NUM_SPIKES = 8;
    const spikeLen = size * 0.18;  // 40% shorter (0.3 * 0.6)
    for (let i = 0; i < NUM_SPIKES; i++) {
      const angle = (i / NUM_SPIKES) * Math.PI * 2;
      const sx = cx + Math.cos(angle) * r;
      const sy = cy + Math.sin(angle) * r;
      const tx = cx + Math.cos(angle) * (r + spikeLen);
      const ty = cy + Math.sin(angle) * (r + spikeLen);
      drawGlowLine(gfx, sx, sy, tx, ty, color);
    }
  }

  _drawHeartWireframe(gfx, cx, cy, size, color) {
    const dx = CONFIG.CENTER_X - cx;
    const dy = CONFIG.CENTER_Y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;
    const ny = dy / dist;
    const px = -ny;
    const py = nx;
    const r = size * 0.5;
    const tilt = 0.35;
    const thickness = size * 0.15;
    const numPts = 32;
    const pts = [];
    for (let i = 0; i < numPts; i++) {
      const t = (i / numPts) * Math.PI * 2;
      const u = Math.pow(Math.sin(t), 3);
      const v = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
      pts.push({ u: u * r, v: v * r * tilt });
    }
    const ix = cx + nx * thickness * 0.5;
    const iy = cy + ny * thickness * 0.5;
    for (let i = 0; i < numPts; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % numPts];
      const x1 = ix + px * a.u + nx * a.v;
      const y1 = iy + py * a.u + ny * a.v;
      const x2 = ix + px * b.u + nx * b.v;
      const y2 = iy + py * b.u + ny * b.v;
      drawGlowLine(gfx, x1, y1, x2, y2, color);
    }
    const ox = cx - nx * thickness * 0.5;
    const oy = cy - ny * thickness * 0.5;
    const leftIdx = Math.round(numPts * 0.25);
    const bottomIdx = Math.round(numPts * 0.5);
    const rightIdx = Math.round(numPts * 0.75);
    const backLeft = { x: ix + px * pts[leftIdx].u + nx * pts[leftIdx].v, y: iy + py * pts[leftIdx].u + ny * pts[leftIdx].v };
    const backBottom = { x: ix + px * pts[bottomIdx].u + nx * pts[bottomIdx].v, y: iy + py * pts[bottomIdx].u + ny * pts[bottomIdx].v };
    const backRight = { x: ix + px * pts[rightIdx].u + nx * pts[rightIdx].v, y: iy + py * pts[rightIdx].u + ny * pts[rightIdx].v };
    const frontLeft = { x: ox + px * pts[leftIdx].u + nx * pts[leftIdx].v, y: oy + py * pts[leftIdx].u + ny * pts[leftIdx].v };
    const frontBottom = { x: ox + px * pts[bottomIdx].u + nx * pts[bottomIdx].v, y: oy + py * pts[bottomIdx].u + ny * pts[bottomIdx].v };
    const frontRight = { x: ox + px * pts[rightIdx].u + nx * pts[rightIdx].v, y: oy + py * pts[rightIdx].u + ny * pts[rightIdx].v };
    drawGlowLine(gfx, backLeft.x, backLeft.y, frontLeft.x, frontLeft.y, color);
    drawGlowLine(gfx, backBottom.x, backBottom.y, frontBottom.x, frontBottom.y, color);
    drawGlowLine(gfx, backRight.x, backRight.y, frontRight.x, frontRight.y, color);
    drawGlowLine(gfx, frontLeft.x, frontLeft.y, frontBottom.x, frontBottom.y, color);
    drawGlowLine(gfx, frontBottom.x, frontBottom.y, frontRight.x, frontRight.y, color);
  }

  _drawSpiralEnemyWireframe(gfx, cx, cy, size, color, spinDir) {
    const r = size * 0.3;
    const outwardAngle = Math.atan2(cy - CONFIG.CENTER_Y, cx - CONFIG.CENTER_X);
    const radialAngle = Math.atan2(cy - CONFIG.CENTER_Y, cx - CONFIG.CENTER_X);
    drawGlowCircle(gfx, cx, cy, r, color);
    const tangentAngle = radialAngle + Math.PI / 2;
    drawGlowEllipse(gfx, cx, cy, r, r * 0.3, color, tangentAngle);
    drawGlowEllipse(gfx, cx, cy, r * 0.3, r, color, tangentAngle);
    drawGlowArc(gfx, cx, cy, r * 0.3, r, color, radialAngle,
      outwardAngle - radialAngle - Math.PI / 2,
      outwardAngle - radialAngle + Math.PI / 2, 16);
    const rx = cx - CONFIG.CENTER_X;
    const ry = cy - CONFIG.CENTER_Y;
    const dist = Math.sqrt(rx * rx + ry * ry) || 1;
    const tx = (-ry / dist) * spinDir;
    const ty = (rx / dist) * spinDir;
    const arrowAngle = Math.atan2(ty, tx);
    const stemX = cx + tx * r;
    const stemY = cy + ty * r;
    const tipX = cx + tx * (r + size * 0.28);
    const tipY = cy + ty * (r + size * 0.28);
    drawGlowLine(gfx, stemX, stemY, tipX, tipY, color);
    const barbLen = size * 0.16;
    const barbAngle = Math.PI * 0.75;
    drawGlowLine(gfx, tipX, tipY,
      tipX + Math.cos(arrowAngle + barbAngle) * barbLen,
      tipY + Math.sin(arrowAngle + barbAngle) * barbLen, color);
    drawGlowLine(gfx, tipX, tipY,
      tipX + Math.cos(arrowAngle - barbAngle) * barbLen,
      tipY + Math.sin(arrowAngle - barbAngle) * barbLen, color);
  }

  _drawPhaseEnemyWireframe(gfx, cx, cy, size, enemy, dt) {
    const color = enemy.hitFlash > 0 ? 0xffffff : PHASE_DIM;
    if (enemy.hitFlash > 0) {
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 4);
    }
    if (enemy.transitionFlash > 0) {
      enemy.transitionFlash = Math.max(0, enemy.transitionFlash - dt * 3);
    }
    if (enemy.phase === 'vulnerable') {
      this._drawPuckWireframe(gfx, cx, cy, size, color);
      return;
    }
    // Shielded: dashed puck
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
    drawGlowDashedEllipse(gfx, ix, iy, r, r * tilt, color, rotation);
    drawGlowDashedLine(gfx, ix + px * r, iy + py * r, ox + px * r, oy + py * r, color, 3);
    drawGlowDashedLine(gfx, ix - px * r, iy - py * r, ox - px * r, oy - py * r, color, 3);
    drawGlowDashedEllipse(gfx, ox, oy, r, r * tilt, color, rotation);
  }

  _drawShip(gfx, maskGfx, visualOffset, rotAngle, muzzleFlash = 0) {
    const visualLane = (0 + visualOffset) % CONFIG.NUM_LANES;
    // Ship stays fixed - tunnel rotates around it (pass 0 for rotAngle)
    const pos = this.geometry.getMidpoint(0, visualLane, 0);

    const cx = CONFIG.CENTER_X;
    const cy = CONFIG.CENTER_Y;
    const dx = cx - pos.x;
    const dy = cy - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / dist;  // normal toward center
    const ny = dy / dist;

    const px = -ny;  // perpendicular
    const py = nx;

    // Simplified Tempest-style ship (50% smaller than before)
    const baseWidth = 16;        // wide base on rim
    const baseTopWidth = 12;     // narrower at top of base
    const baseDepth = 9;         // depth of main base

    const panelWidth = 14;       // inner panel width at front
    const panelTopWidth = 10;    // inner panel width at back
    const panelInset = 2;        // start distance from rim
    const panelDepth = 6;        // panel depth

    const midWidth = 9;          // mid tier width
    const midTopWidth = 6.5;     // mid tier top
    const midDepth = 4;          // mid tier depth

    const barrelWidth = 4.5;     // barrel base width
    const barrelTopWidth = 3.5;  // barrel top width
    const barrelLength = 14;     // tall barrel

    // OUTER BASE (large trapezoid on rim)
    const baseFrontLeft = { x: pos.x - px * baseWidth, y: pos.y - py * baseWidth };
    const baseFrontRight = { x: pos.x + px * baseWidth, y: pos.y + py * baseWidth };
    const baseBackCenter = { x: pos.x + nx * baseDepth, y: pos.y + ny * baseDepth };
    const baseBackLeft = { x: baseBackCenter.x - px * baseTopWidth, y: baseBackCenter.y - py * baseTopWidth };
    const baseBackRight = { x: baseBackCenter.x + px * baseTopWidth, y: baseBackCenter.y + py * baseTopWidth };

    // INNER PANEL (single large trapezoid inside base)
    const panelFront = { x: pos.x + nx * panelInset, y: pos.y + ny * panelInset };
    const panelFrontLeft = { x: panelFront.x - px * panelWidth, y: panelFront.y - py * panelWidth };
    const panelFrontRight = { x: panelFront.x + px * panelWidth, y: panelFront.y + py * panelWidth };
    const panelBack = { x: panelFront.x + nx * panelDepth, y: panelFront.y + ny * panelDepth };
    const panelBackLeft = { x: panelBack.x - px * panelTopWidth, y: panelBack.y - py * panelTopWidth };
    const panelBackRight = { x: panelBack.x + px * panelTopWidth, y: panelBack.y + py * panelTopWidth };

    // MID TIER (trapezoid on top of base)
    const midBase = { x: baseBackCenter.x, y: baseBackCenter.y };
    const midFrontLeft = { x: midBase.x - px * midWidth, y: midBase.y - py * midWidth };
    const midFrontRight = { x: midBase.x + px * midWidth, y: midBase.y + py * midWidth };
    const midBackCenter = { x: midBase.x + nx * midDepth, y: midBase.y + ny * midDepth };
    const midBackLeft = { x: midBackCenter.x - px * midTopWidth, y: midBackCenter.y - py * midTopWidth };
    const midBackRight = { x: midBackCenter.x + px * midTopWidth, y: midBackCenter.y + py * midTopWidth };

    // BARREL (tall narrow trapezoid)
    const barrelBase = { x: midBackCenter.x, y: midBackCenter.y };
    const barrelFrontLeft = { x: barrelBase.x - px * barrelWidth, y: barrelBase.y - py * barrelWidth };
    const barrelFrontRight = { x: barrelBase.x + px * barrelWidth, y: barrelBase.y + py * barrelWidth };
    const barrelTipCenter = { x: barrelBase.x + nx * barrelLength, y: barrelBase.y + ny * barrelLength };
    const barrelTipLeft = { x: barrelTipCenter.x - px * barrelTopWidth, y: barrelTipCenter.y - py * barrelTopWidth };
    const barrelTipRight = { x: barrelTipCenter.x + px * barrelTopWidth, y: barrelTipCenter.y + py * barrelTopWidth };

    // MASK: Draw on same layer as wireframes to ensure proper z-ordering
    // Temporarily switch to normal blend mode for mask
    gfx.setBlendMode(0); // NORMAL

    gfx.fillStyle(0x000000, 1.0);
    gfx.beginPath();
    gfx.moveTo(baseFrontLeft.x, baseFrontLeft.y);
    gfx.lineTo(baseFrontRight.x, baseFrontRight.y);
    gfx.lineTo(baseBackRight.x, baseBackRight.y);
    gfx.lineTo(midFrontRight.x, midFrontRight.y);
    gfx.lineTo(midBackRight.x, midBackRight.y);
    gfx.lineTo(barrelTipRight.x, barrelTipRight.y);
    gfx.lineTo(barrelTipLeft.x, barrelTipLeft.y);
    gfx.lineTo(midBackLeft.x, midBackLeft.y);
    gfx.lineTo(midFrontLeft.x, midFrontLeft.y);
    gfx.lineTo(baseBackLeft.x, baseBackLeft.y);
    gfx.closePath();
    gfx.fillPath();

    // Restore additive blend mode (1 = Phaser.BlendModes.ADD)
    gfx.setBlendMode(1);

    // WIREFRAMES: Draw outlines on top
    drawGlowPolygon(gfx, [baseFrontLeft, baseFrontRight, baseBackRight, baseBackLeft], CONFIG.COLORS.SHIP);
    drawGlowPolygon(gfx, [panelFrontLeft, panelFrontRight, panelBackRight, panelBackLeft], CONFIG.COLORS.SHIP);
    drawGlowPolygon(gfx, [midFrontLeft, midFrontRight, midBackRight, midBackLeft], CONFIG.COLORS.SHIP);
    drawGlowPolygon(gfx, [barrelFrontLeft, barrelFrontRight, barrelTipRight, barrelTipLeft], CONFIG.COLORS.SHIP);

    // Muzzle flash: radial starburst at barrel tip when firing
    if (muzzleFlash > 0) {
      const flashX = barrelTipCenter.x + nx * 6;
      const flashY = barrelTipCenter.y + ny * 6;
      const numRays = 6;
      const rayLen = (8 + 16 * muzzleFlash);
      for (let i = 0; i < numRays; i++) {
        const angle = (i / numRays) * Math.PI * 2;
        const rx = Math.cos(angle);
        const ry = Math.sin(angle);
        drawGlowLine(gfx, flashX, flashY,
                           flashX + rx * rayLen, flashY + ry * rayLen, 0xffffff);
      }
    }
  }
}
