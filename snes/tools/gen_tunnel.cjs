// Generates the Hexax Mode 7 tunnel texture as a 1024x1024 256-color BMP.
// The tunnel viewed down its axis is radially symmetric about the vanishing
// point, so Mode 7's hardware 2D rotation about center reproduces the game's
// world-rotation. Geometry mirrors src/game/config.js + TunnelGeometry.js.
//
//   node tools/gen_tunnel.cjs   ->   tunnel.bmp
const fs = require('fs');
const path = require('path');

const W = 1024, H = 1024;
// PVSnesLib's setMode7 fixes the Mode 7 rotation center (M7X/M7Y) at texture
// (128,128). Drawing the tunnel's vanishing point there makes it spin in place;
// main.c sets M7VOFS so (128,128) maps to screen center.
const CX = 128, CY = 128;

// --- geometry (from the original config) ---
const OUTER_R = 110;                    // mouth hex radius in texture px (fits the 224-line view)
const SCALE_MIN = 0.05, SCALE_POWER = 0.5, MAXD = 6;
const ANGLE_OFFSET = -Math.PI / 3;      // flat-bottom hex
const scaleAt = (d) => 1 - (1 - SCALE_MIN) * Math.pow(d / MAXD, SCALE_POWER);
const vert = (d, k) => {
  const R = OUTER_R * scaleAt(d);
  const a = ANGLE_OFFSET + k * Math.PI / 3;
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
};

// --- raster ---
const px = new Uint8Array(W * H);       // palette indices; 0 = black backdrop
const plot = (x, y, c) => { x = (((x | 0) % W) + W) % W; y = (((y | 0) % H) + H) % H; px[y * W + x] = c; };  // wrap around origin
function line(x0, y0, x1, y1, c) {       // Bresenham, no anti-aliasing (keeps tile count low)
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
  for (;;) {
    plot(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const GREEN = 1;
// concentric hex rings (depth 0 = mouth ... depth 6 = far)
for (let d = 0; d <= MAXD; d++)
  for (let k = 0; k < 6; k++) {
    const [x0, y0] = vert(d, k), [x1, y1] = vert(d, (k + 1) % 6);
    line(x0, y0, x1, y1, GREEN);
  }
// radial spokes (outer vertex -> far vertex)
for (let k = 0; k < 6; k++) {
  const [x0, y0] = vert(0, k), [x1, y1] = vert(MAXD, k);
  line(x0, y0, x1, y1, GREEN);
}

// --- diagnostic mode (node gen_tunnel.cjs --diag): full-texture locator pattern ---
// Green grid across the WHOLE texture (so the Mode 7 view sees content wherever it
// samples), a RED block at the texture origin (0,0) and a YELLOW block at center
// (512,512). The colors reveal where the view looks and at what scale.
if (process.argv.includes('--diag')) {
  px.fill(0);
  for (let g = 0; g < W; g += 64)
    for (let i = 0; i < H; i++) { plot(g, i, 1); plot(i, g, 1); }
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) px[y * W + x] = 3;          // origin
  for (let y = 480; y < 544; y++) for (let x = 480; x < 544; x++) px[y * W + x] = 4;    // center
}

let lit = 0; for (let i = 0; i < px.length; i++) if (px[i]) lit++;

// --- 8bpp BMP (bottom-up), palette B,G,R,0 ---
const palette = Buffer.alloc(256 * 4, 0);
const setPal = (i, r, g, b) => { palette[i * 4] = b; palette[i * 4 + 1] = g; palette[i * 4 + 2] = r; };
setPal(0, 0, 0, 0);          // black
setPal(1, 124, 255, 178);    // tunnel green 0x7cffb2
setPal(2, 62, 128, 89);      // dim green (future: active lane)
setPal(3, 255, 0, 0);        // diag: red (origin marker)
setPal(4, 255, 255, 0);      // diag: yellow (center marker)

const DATA_OFF = 14 + 40 + 256 * 4;          // 1078
const FILE_SIZE = DATA_OFF + W * H;
const buf = Buffer.alloc(FILE_SIZE);
buf.write('BM', 0, 'ascii');
buf.writeUInt32LE(FILE_SIZE, 2);
buf.writeUInt32LE(DATA_OFF, 10);
buf.writeUInt32LE(40, 14);
buf.writeInt32LE(W, 18);
buf.writeInt32LE(H, 22);
buf.writeUInt16LE(1, 26);
buf.writeUInt16LE(8, 28);
buf.writeUInt32LE(W * H, 34);
buf.writeInt32LE(2835, 38);
buf.writeInt32LE(2835, 42);
buf.writeUInt32LE(256, 46);
palette.copy(buf, 54);
for (let r = 0; r < H; r++) {                 // file row 0 = image bottom
  const y = H - 1 - r;
  buf.set(px.subarray(y * W, y * W + W), DATA_OFF + r * W);
}

const out = path.join(__dirname, '..', 'tunnel.bmp');
fs.writeFileSync(out, buf);
console.log(`wrote ${out} (${FILE_SIZE} bytes, ${lit} lit px, OUTER_R=${OUTER_R})`);
