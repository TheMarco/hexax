/**
 * Multi-pass glow line/polygon drawing for vector aesthetic.
 * All functions operate on a Phaser Graphics object.
 */

const GLOW_PASSES = [
  { width: 16, alpha: 0.08 },  // very wide outer glow, subtle
  { width: 8, alpha: 0.22 },   // wide mid-glow
  { width: 2.5, alpha: 1.0 },  // sharp core
];

export function drawGlowLine(gfx, x1, y1, x2, y2, color) {
  for (const pass of GLOW_PASSES) {
    gfx.lineStyle(pass.width, color, pass.alpha);
    gfx.beginPath();
    gfx.moveTo(x1, y1);
    gfx.lineTo(x2, y2);
    gfx.strokePath();
  }
}

export function drawGlowPolygon(gfx, points, color) {
  for (const pass of GLOW_PASSES) {
    gfx.lineStyle(pass.width, color, pass.alpha);
    gfx.beginPath();
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      gfx.lineTo(points[i].x, points[i].y);
    }
    gfx.closePath();
    gfx.strokePath();
  }
}

export function drawGlowDiamond(gfx, cx, cy, size, color) {
  const pts = [
    { x: cx, y: cy - size },
    { x: cx + size, y: cy },
    { x: cx, y: cy + size },
    { x: cx - size, y: cy },
  ];
  drawGlowPolygon(gfx, pts, color);
}

export function drawGlowCircle(gfx, cx, cy, radius, color, segments = 16) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  drawGlowPolygon(gfx, points, color);
}

export function drawGlowEllipse(gfx, cx, cy, rx, ry, color, rotation = 0, segments = 16) {
  const points = [];
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const lx = rx * Math.cos(angle);
    const ly = ry * Math.sin(angle);
    points.push({
      x: cx + lx * cosR - ly * sinR,
      y: cy + lx * sinR + ly * cosR,
    });
  }
  drawGlowPolygon(gfx, points, color);
}

export function drawGlowArc(gfx, cx, cy, rx, ry, color, rotation = 0, startAngle = 0, endAngle = Math.PI * 2, segments = 16) {
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const range = endAngle - startAngle;
  const numPts = Math.max(2, Math.round(segments * Math.abs(range) / (Math.PI * 2)));

  const points = [];
  for (let i = 0; i <= numPts; i++) {
    const angle = startAngle + (i / numPts) * range;
    const lx = rx * Math.cos(angle);
    const ly = ry * Math.sin(angle);
    points.push({
      x: cx + lx * cosR - ly * sinR,
      y: cy + lx * sinR + ly * cosR,
    });
  }

  for (const pass of GLOW_PASSES) {
    gfx.lineStyle(pass.width, color, pass.alpha);
    gfx.beginPath();
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      gfx.lineTo(points[i].x, points[i].y);
    }
    gfx.strokePath();
  }
}

export function drawGlowDashedEllipse(gfx, cx, cy, rx, ry, color, rotation = 0, numDashes = 6, segments = 16) {
  const dashArc = Math.PI * 2 / numDashes * 0.5; // half dash, half gap
  for (let i = 0; i < numDashes; i++) {
    const startAngle = (i / numDashes) * Math.PI * 2;
    drawGlowArc(gfx, cx, cy, rx, ry, color, rotation, startAngle, startAngle + dashArc, segments);
  }
}

export function drawGlowDashedLine(gfx, x1, y1, x2, y2, color, numDashes = 4) {
  for (let i = 0; i < numDashes; i++) {
    const t0 = i / numDashes;
    const t1 = (i + 0.5) / numDashes;
    drawGlowLine(gfx,
      x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0,
      x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1, color);
  }
}

export function drawGlowClaw(gfx, cx, cy, size, color) {
  const ARMS = 3;
  const armLen = size * 1.1;
  const barbLen = size * 0.45;
  const barbAngle = 2.2; // radians offset for barb sweep

  for (let i = 0; i < ARMS; i++) {
    const angle = (i / ARMS) * Math.PI * 2 - Math.PI / 2;

    // Arm: center to tip
    const tipX = cx + Math.cos(angle) * armLen;
    const tipY = cy + Math.sin(angle) * armLen;
    drawGlowLine(gfx, cx, cy, tipX, tipY, color);

    // Barb at tip (curved hook)
    const barbAng = angle + barbAngle;
    const barbX = tipX + Math.cos(barbAng) * barbLen;
    const barbY = tipY + Math.sin(barbAng) * barbLen;
    drawGlowLine(gfx, tipX, tipY, barbX, barbY, color);

    // Second barb for symmetry
    const barbAng2 = angle - barbAngle;
    const barbX2 = tipX + Math.cos(barbAng2) * barbLen;
    const barbY2 = tipY + Math.sin(barbAng2) * barbLen;
    drawGlowLine(gfx, tipX, tipY, barbX2, barbY2, color);
  }
}
