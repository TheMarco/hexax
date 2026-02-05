import { CONFIG } from '../config.js';

// Tunnel disintegration: hex faces and edge segments fly apart
export class TunnelExplosionRenderer {
  constructor(geometry) {
    this.geometry = geometry;
    this.active = false;
    this.pieces = [];
    this.duration = 3000; // 3 seconds
    this.elapsed = 0;
  }

  trigger() {
    this.active = true;
    this.elapsed = 0;
    this.pieces = [];

    // Each hex face (trapezoid) becomes a rigid piece that spins and flies out
    for (let depth = 0; depth < CONFIG.NUM_SEGMENTS - 1; depth++) {
      for (let lane = 0; lane < CONFIG.NUM_LANES; lane++) {
        // 4 vertices of this face (trapezoid)
        const v1 = this.geometry.getVertex(depth, lane, 0);
        const v2 = this.geometry.getVertex(depth, (lane + 1) % CONFIG.NUM_LANES, 0);
        const v3 = this.geometry.getVertex(depth + 1, (lane + 1) % CONFIG.NUM_LANES, 0);
        const v4 = this.geometry.getVertex(depth + 1, lane, 0);

        // Center of face
        const cx = (v1.x + v2.x + v3.x + v4.x) / 4;
        const cy = (v1.y + v2.y + v3.y + v4.y) / 4;

        // Velocity: radial from screen center, with some randomness
        const fromCenter = { x: cx - CONFIG.CENTER_X, y: cy - CONFIG.CENTER_Y };
        const dist = Math.sqrt(fromCenter.x * fromCenter.x + fromCenter.y * fromCenter.y);
        const baseSpeed = 150 + Math.random() * 200;
        const vx = (fromCenter.x / dist) * baseSpeed + (Math.random() - 0.5) * 100;
        const vy = (fromCenter.y / dist) * baseSpeed + (Math.random() - 0.5) * 100;

        // Store vertices relative to center for rotation
        this.pieces.push({
          cx, cy, vx, vy,
          spin: (Math.random() - 0.5) * 4, // rad/sec
          angle: 0,
          age: 0,
          maxAge: this.duration / 1000,
          vertices: [
            { x: v1.x - cx, y: v1.y - cy },
            { x: v2.x - cx, y: v2.y - cy },
            { x: v3.x - cx, y: v3.y - cy },
            { x: v4.x - cx, y: v4.y - cy },
          ],
          color: CONFIG.COLORS.TUNNEL,
          isFace: true,
        });
      }
    }

    // Add hex ring edges as separate flying line segments
    for (let depth = 0; depth < CONFIG.NUM_SEGMENTS; depth++) {
      for (let lane = 0; lane < CONFIG.NUM_LANES; lane++) {
        const v1 = this.geometry.getVertex(depth, lane, 0);
        const v2 = this.geometry.getVertex(depth, (lane + 1) % CONFIG.NUM_LANES, 0);

        const cx = (v1.x + v2.x) / 2;
        const cy = (v1.y + v2.y) / 2;

        const fromCenter = { x: cx - CONFIG.CENTER_X, y: cy - CONFIG.CENTER_Y };
        const dist = Math.sqrt(fromCenter.x * fromCenter.x + fromCenter.y * fromCenter.y);
        const baseSpeed = 180 + Math.random() * 220;
        const vx = (fromCenter.x / dist) * baseSpeed + (Math.random() - 0.5) * 120;
        const vy = (fromCenter.y / dist) * baseSpeed + (Math.random() - 0.5) * 120;

        this.pieces.push({
          cx, cy, vx, vy,
          spin: (Math.random() - 0.5) * 6,
          angle: 0,
          age: 0,
          maxAge: this.duration / 1000,
          vertices: [
            { x: v1.x - cx, y: v1.y - cy },
            { x: v2.x - cx, y: v2.y - cy },
          ],
          color: CONFIG.COLORS.TUNNEL,
          isEdge: true,
        });
      }
    }

    // Add radial lane lines as flying segments
    for (let depth = 0; depth < CONFIG.NUM_SEGMENTS - 1; depth++) {
      for (let lane = 0; lane < CONFIG.NUM_LANES; lane++) {
        const v1 = this.geometry.getVertex(depth, lane, 0);
        const v2 = this.geometry.getVertex(depth + 1, lane, 0);

        const cx = (v1.x + v2.x) / 2;
        const cy = (v1.y + v2.y) / 2;

        const fromCenter = { x: cx - CONFIG.CENTER_X, y: cy - CONFIG.CENTER_Y };
        const dist = Math.sqrt(fromCenter.x * fromCenter.x + fromCenter.y * fromCenter.y);
        const baseSpeed = 160 + Math.random() * 200;
        const vx = (fromCenter.x / dist) * baseSpeed + (Math.random() - 0.5) * 100;
        const vy = (fromCenter.y / dist) * baseSpeed + (Math.random() - 0.5) * 100;

        this.pieces.push({
          cx, cy, vx, vy,
          spin: (Math.random() - 0.5) * 5,
          angle: 0,
          age: 0,
          maxAge: this.duration / 1000,
          vertices: [
            { x: v1.x - cx, y: v1.y - cy },
            { x: v2.x - cx, y: v2.y - cy },
          ],
          color: CONFIG.COLORS.TUNNEL,
          isEdge: true,
        });
      }
    }
  }

  update(delta) {
    if (!this.active) return;

    this.elapsed += delta;
    const dt = delta / 1000;

    // Update all pieces (translate + rotate)
    for (const piece of this.pieces) {
      piece.age += dt;
      piece.cx += piece.vx * dt;
      piece.cy += piece.vy * dt;
      piece.angle += piece.spin * dt;

      // Very gentle drag
      piece.vx *= 0.995;
      piece.vy *= 0.995;
    }

    // Check if done
    if (this.elapsed >= this.duration) {
      this.active = false;
      this.pieces = [];
    }
  }

  draw(gfx) {
    if (!this.active) return;

    for (const piece of this.pieces) {
      const lifeRatio = 1.0 - piece.age / piece.maxAge;
      if (lifeRatio <= 0) continue;

      // Rotate vertices around piece center
      const cos = Math.cos(piece.angle);
      const sin = Math.sin(piece.angle);
      const worldVerts = piece.vertices.map(v => ({
        x: piece.cx + v.x * cos - v.y * sin,
        y: piece.cy + v.x * sin + v.y * cos,
      }));

      const alpha = lifeRatio;
      const color = Phaser.Display.Color.GetColor(
        Math.floor(((CONFIG.COLORS.TUNNEL >> 16) & 0xff) * alpha),
        Math.floor(((CONFIG.COLORS.TUNNEL >> 8) & 0xff) * alpha),
        Math.floor((CONFIG.COLORS.TUNNEL & 0xff) * alpha)
      );

      gfx.lineStyle(1.5, color, 1.0);

      if (piece.isFace) {
        // Draw quad outline (4 edges)
        for (let i = 0; i < 4; i++) {
          const v1 = worldVerts[i];
          const v2 = worldVerts[(i + 1) % 4];
          gfx.lineBetween(v1.x, v1.y, v2.x, v2.y);
        }
      } else if (piece.isEdge) {
        // Draw single line
        gfx.lineBetween(worldVerts[0].x, worldVerts[0].y, worldVerts[1].x, worldVerts[1].y);
      }
    }
  }

  get isDone() {
    return !this.active;
  }
}
