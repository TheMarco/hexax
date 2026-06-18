// Unified enemy sprite generator (all 6 types get distinct silhouettes).
//   far.bmp   16x16 : cell 0 ship, cell 1 bullet, then 6 cells/type (3 far tiers x
//                     2 orientations) for the 6 enemy types -> VRAM tiles 0..159.
//   near.bmp  32x32 : 2 cells/type (1 near tier x 2 orientations)  -> VRAM tiles 256..447.
//   src/sprgfx.h     : SHIP_GFX, BULLET_GFX, gfxA/gfxB[type*4+tier], bigTier[4].
// Size model: tier 0-2 = 16x16 far (px ~8/12/16), tier 3 = 32x32 near (~28px). Each
// shape is drawn foreshortened + rotated along its lane tangent (theta 0deg / 60deg),
// the 3rd orientation (120deg..) is the 60deg cell H-flipped at runtime.
//   node tools/gen_sprites.cjs
const fs = require('fs');
const path = require('path');

function makeSheet(W, H, draw) {
  const px = new Uint8Array(W * H);
  const plot = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) plot(x, y, c); };
  const line = (x0, y0, x1, y1, c) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) { plot(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  };
  const ellipse = (cx, cy, rx, ry, c) => { const n = Math.max(48, rx * 14); for (let t = 0; t < n; t++) { const a = t / n * 2 * Math.PI; plot(cx + rx * Math.cos(a), cy + ry * Math.sin(a), c); } };
  // Draw a closed polyline of points already transformed to screen space.
  const poly = (pts, c) => { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; line(a[0], a[1], b[0], b[1], c); } };
  // Rotate+foreshorten a unit shape: returns a fn mapping (ux,uy) [-1..1] -> screen.
  const xform = (cx, cy, rx, thetaDeg, fore) => {
    const th = thetaDeg * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
    return (ux, uy) => { const x = ux * rx, y = uy * rx * fore; return [cx + x * ct - y * st, cy + x * st + y * ct]; };
  };

  // ---- the six enemy silhouettes (drawn in colour index c) ----
  // enemy: flat disc (hockey puck) -- two rims + side lines.
  const enemy = (cx, cy, rx, thetaDeg, c) => {
    const th = thetaDeg * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th), ry = Math.max(1, rx * 0.32), h = Math.max(1, rx * 0.18);
    const rim = (ox, oy) => { const n = Math.max(48, rx * 14); for (let t = 0; t < n; t++) { const a = t / n * 2 * Math.PI, ex = rx * Math.cos(a), ey = ry * Math.sin(a); plot(ox + ex * ct - ey * st, oy + ex * st + ey * ct, c); } };
    rim(cx - st * h, cy + ct * h); rim(cx + st * h, cy - ct * h);
    const ex = rx * ct, ey = rx * st;
    line(cx - st * h + ex, cy + ct * h + ey, cx + st * h + ex, cy - ct * h + ey, c);
    line(cx - st * h - ex, cy + ct * h - ey, cx + st * h - ex, cy - ct * h - ey, c);
  };
  // tank: O=O dumbbell along the lane tangent.
  const tank = (cx, cy, rx, thetaDeg, c) => {
    const th = thetaDeg * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th), r = Math.max(2, rx * 0.42), sep = rx * 0.62;
    const ax = cx + sep * ct, ay = cy + sep * st, bx = cx - sep * ct, by = cy - sep * st, pxp = -st, pyp = ct;
    ellipse(ax, ay, r, r, c); ellipse(bx, by, r, r, c);
    line(ax + pxp, ay + pyp, bx + pxp, by + pyp, c); line(ax - pxp, ay - pyp, bx - pxp, by - pyp, c);
  };
  // bomb: round body + radial spikes (rotation-invariant).
  const bomb = (cx, cy, rx, _th, c) => {
    const r = Math.max(2, rx * 0.7); ellipse(cx, cy, r, r, c);
    const n = r >= 5 ? 8 : 6; for (let k = 0; k < n; k++) { const a = k / n * 2 * Math.PI, co = Math.cos(a), si = Math.sin(a); line(cx + r * co, cy + r * si, cx + (r + 2) * co, cy + (r + 2) * si, c); }
  };
  // heart: parametric heart curve, laid flat + rotated.
  const heart = (cx, cy, rx, thetaDeg, c) => {
    const f = xform(cx, cy, rx, thetaDeg, 0.5), n = 40, pts = [];
    for (let i = 0; i < n; i++) { const t = i / n * 2 * Math.PI, ux = Math.pow(Math.sin(t), 3); const uy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16; pts.push(f(ux, uy)); }
    poly(pts, c);
  };
  // phase: a diamond (clearly not a disc), flat + rotated.
  const phase = (cx, cy, rx, thetaDeg, c) => {
    const f = xform(cx, cy, rx, thetaDeg, 0.6); poly([f(0, -1), f(1, 0), f(0, 1), f(-1, 0)], c);
  };
  // spiral: a swirl (two interlocking arcs) -- reads as a spinner, rotated.
  const spiral = (cx, cy, rx, thetaDeg, c) => {
    const f = xform(cx, cy, rx, thetaDeg, 0.6), n = 28, a = [], b = [];
    for (let i = 0; i <= n; i++) { const t = i / n * Math.PI, rr = i / n; a.push(f(rr * Math.cos(t), rr * Math.sin(t))); b.push(f(-rr * Math.cos(t), -rr * Math.sin(t))); }
    for (let i = 0; i < n; i++) { line(a[i][0], a[i][1], a[i + 1][0], a[i + 1][1], c); line(b[i][0], b[i][1], b[i + 1][0], b[i + 1][1], c); }
  };

  const ship = (cx, cy) => { rect(cx - 1, cy - 6, cx, cy - 1, 1); rect(cx - 3, cy, cx + 2, cy + 1, 1); rect(cx - 4, cy + 2, cx + 3, cy + 3, 1); rect(cx - 5, cy + 4, cx + 4, cy + 5, 1); };
  const bullet = (cx, cy) => { for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 6) plot(cx + x, cy + y, 5); };

  draw({ plot, rect, line, ellipse, enemy, tank, bomb, heart, phase, spiral, ship, bullet });
  return px;
}

function writeBMP(outName, px, W, H) {
  const palette = Buffer.alloc(256 * 4, 0);
  const setPal = (i, r, g, b) => { palette[i * 4] = b; palette[i * 4 + 1] = g; palette[i * 4 + 2] = r; };
  setPal(0, 0, 0, 0); setPal(1, 255, 255, 255); setPal(2, 255, 102, 68); setPal(5, 170, 255, 221);
  const DATA_OFF = 14 + 40 + 256 * 4, stride = W + ((4 - (W % 4)) % 4), FILE_SIZE = DATA_OFF + stride * H;
  const buf = Buffer.alloc(FILE_SIZE);
  buf.write('BM', 0, 'ascii'); buf.writeUInt32LE(FILE_SIZE, 2); buf.writeUInt32LE(DATA_OFF, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(8, 28);
  buf.writeUInt32LE(stride * H, 34); buf.writeInt32LE(2835, 38); buf.writeInt32LE(2835, 42); buf.writeUInt32LE(256, 46);
  palette.copy(buf, 54);
  for (let r = 0; r < H; r++) { const y = H - 1 - r; for (let x = 0; x < W; x++) buf[DATA_OFF + r * stride + x] = px[y * W + x]; }
  fs.writeFileSync(path.join(__dirname, '..', outName), buf);
  console.log(`wrote ${outName} (${W}x${H})`);
}

const NTYPE = 6, NFAR = 3;                 // 3 far tiers (16x16) + 1 near (32x32)
const FAR_PX = [4, 6, 8];                   // 16x16 far radii (~8/12/16 px)
const NEAR_PX = 14;                         // 32x32 near radius (~28 px)
const drawers = ['enemy', 'tank', 'bomb', 'heart', 'phase', 'spiral'];

// --- far.bmp : cell 0 ship, cell 1 bullet, then type*6 + tier*2 + orient (40 cells) ---
const farCells = 2 + NTYPE * NFAR * 2;
const farPad = Math.ceil(farCells / 8) * 8;          // pad to full 16x16 bands
const far = makeSheet(16, farPad * 16, (d) => {
  d.ship(8, 8); d.bullet(8, 1 * 16 + 8);
  for (let t = 0; t < NTYPE; t++) for (let i = 0; i < NFAR; i++) for (let o = 0; o < 2; o++) {
    const cell = 2 + t * NFAR * 2 + i * 2 + o;
    d[drawers[t]](8, cell * 16 + 8, FAR_PX[i], o ? 60 : 0, 2);
  }
});
writeBMP('far.bmp', far, 16, farPad * 16);

// --- near.bmp : type*2 + orient (12 cells, 32x32) ---
const nearCells = NTYPE * 2;
const nearPad = Math.ceil(nearCells / 4) * 4;        // pad to full 32x32 bands (4-across)
const near = makeSheet(32, nearPad * 32, (d) => {
  for (let t = 0; t < NTYPE; t++) for (let o = 0; o < 2; o++) {
    const cell = t * 2 + o;
    d[drawers[t]](16, cell * 32 + 16, NEAR_PX, o ? 60 : 0, 2);
  }
});
writeBMP('near.bmp', near, 32, nearPad * 32);

// --- gfxoffsets: 16x16 band map (base tile 0) + 32x32 4-across (base tile 256) ---
const g16 = (cell) => (cell >> 3) * 32 + (cell & 7) * 2;
const g32 = (cell) => 256 + (cell & 3) * 4 + (cell >> 2) * 64;
const SHIP_GFX = g16(0), BULLET_GFX = g16(1);
const A = [], B = [];
for (let t = 0; t < NTYPE; t++) for (let i = 0; i < NFAR; i++) {
  A.push(g16(2 + t * NFAR * 2 + i * 2 + 0)); B.push(g16(2 + t * NFAR * 2 + i * 2 + 1));
}
// append the near tier (tier index 3) per type, interleaved as [t0..t5 far x3][near]
const gA = [], gB = [];
for (let t = 0; t < NTYPE; t++) {
  for (let i = 0; i < NFAR; i++) { gA.push(A[t * NFAR + i]); gB.push(B[t * NFAR + i]); }
  gA.push(g32(t * 2 + 0)); gB.push(g32(t * 2 + 1));     // tier 3 = near
}
let h = '// GENERATED by tools/gen_sprites.cjs - sprite gfxoffsets\n';
h += '#ifndef SPRGFX_H\n#define SPRGFX_H\n#include <snes.h>\n\n';
h += `#define SHIP_GFX   ${SHIP_GFX}\n#define BULLET_GFX ${BULLET_GFX}\n\n`;
h += `const u16 gfxA[${NTYPE * 4}] = { ${gA.join(', ')} };\n\n`;
h += `const u16 gfxB[${NTYPE * 4}] = { ${gB.join(', ')} };\n\n`;
h += `const u8  bigTier[4] = { 0, 0, 0, 1 };\n\n`;
h += '#endif\n';
fs.writeFileSync(path.join(__dirname, '..', 'src', 'sprgfx.h'), h);
console.log(`far ${farCells}/${farPad} cells, near ${nearCells}/${nearPad} cells -> src/sprgfx.h`);
