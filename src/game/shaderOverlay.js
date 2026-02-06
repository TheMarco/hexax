// ── Shared vertex shader ──
const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// ── CRT raster display shader ──
// Full-resolution sampling with scanlines and bloom
const crtFragmentSource = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;

varying vec2 v_texCoord;

#define PI 3.14159265359
#define BLOOM_STRENGTH 0.65
#define SCANLINE_STRENGTH 0.7
#define MASK_STRENGTH 0.08
#define NOISE_STRENGTH 0.025
#define FLICKER_STRENGTH 0.08
#define ABERRATION_STRENGTH 0.0
#define CURVATURE_STRENGTH 0.04
#define CORNER_RADIUS 0.15

// Fast gamma approximation
vec3 toLinear(vec3 color) {
  return color * color;
}

vec3 toGamma(vec3 color) {
  return sqrt(color);
}

// RGB noise function
vec3 noise(vec2 co, float time) {
  float r = fract(sin(dot(co.xy + time, vec2(12.9898, 78.233))) * 43758.5453);
  float g = fract(sin(dot(co.xy + time, vec2(93.9898, 67.345))) * 43758.5453);
  float b = fract(sin(dot(co.xy + time, vec2(41.9898, 29.876))) * 43758.5453);
  return vec3(r, g, b) * 2.0 - 1.0;
}

// Apply barrel distortion (CRT curvature)
vec2 curveUV(vec2 uv) {
  vec2 centered = uv * 2.0 - 1.0;
  float r2 = dot(centered, centered);
  float distortion = 1.0 + r2 * CURVATURE_STRENGTH;
  centered *= distortion;
  return centered * 0.5 + 0.5;
}

// Rounded rectangle SDF
float roundedRectSDF(vec2 uv, vec2 size, float radius) {
  vec2 d = abs(uv - 0.5) * 2.0 - size + radius;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - radius;
}

// 5-tap blur at low-res texture scale (256x224)
vec3 getBlur(sampler2D tex, vec2 uv) {
  const vec2 texel = vec2(1.0 / 256.0, 1.0 / 224.0);
  vec3 result = vec3(0.0);
  result += toLinear(texture2D(tex, uv).rgb) * 0.4;
  result += toLinear(texture2D(tex, uv + vec2(-texel.x, 0.0)).rgb) * 0.15;
  result += toLinear(texture2D(tex, uv + vec2( texel.x, 0.0)).rgb) * 0.15;
  result += toLinear(texture2D(tex, uv + vec2(0.0, -texel.y)).rgb) * 0.15;
  result += toLinear(texture2D(tex, uv + vec2(0.0,  texel.y)).rgb) * 0.15;
  return result;
}

void main() {
  vec2 uv = v_texCoord;

  // Check rounded corners first
  float cornerDist = roundedRectSDF(uv, vec2(1.0, 1.0), CORNER_RADIUS);
  if (cornerDist > 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Apply CRT curvature
  vec2 curvedUV = curveUV(uv);

  // Check bounds
  const float margin = 0.001;
  if (curvedUV.x < -margin || curvedUV.x > 1.0 + margin ||
      curvedUV.y < -margin || curvedUV.y > 1.0 + margin) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  curvedUV = clamp(curvedUV, 0.0, 1.0);

  // Snap to 256x224 virtual pixel grid
  const vec2 virtualRes = vec2(256.0, 224.0);
  vec2 pixelUV = (floor(curvedUV * virtualRes) + 0.5) / virtualRes;

  // Max-sample: cross pattern (5 taps) within each virtual pixel, take brightest.
  // Vertical taps catch thin horizontal lines, horizontal taps catch thin vertical strokes (text).
  vec2 vStep = vec2(0.0, 0.4 / virtualRes.y);
  vec2 hStep = vec2(0.4 / virtualRes.x, 0.0);
  vec3 s0 = toLinear(texture2D(u_texture, pixelUV).rgb);
  vec3 s1 = toLinear(texture2D(u_texture, pixelUV - vStep).rgb);
  vec3 s2 = toLinear(texture2D(u_texture, pixelUV + vStep).rgb);
  vec3 s3 = toLinear(texture2D(u_texture, pixelUV - hStep).rgb);
  vec3 s4 = toLinear(texture2D(u_texture, pixelUV + hStep).rgb);
  vec3 color = max(max(max(s0, s1), max(s2, s3)), s4);

  // Bloom at virtual-pixel scale
  vec3 blur = getBlur(u_texture, pixelUV);
  vec3 bloom = max(blur - 0.6, 0.0) * 2.5;
  color += bloom * BLOOM_STRENGTH;

  // Scanlines aligned to virtual pixel rows (224 rows).
  // Dark gaps sit at boundaries BETWEEN rows, not through content.
  float virtualY = curvedUV.y * 224.0;
  float scanline = mix(1.0 - SCANLINE_STRENGTH, 1.0, sin(fract(virtualY) * PI));
  color *= scanline;

  // Very subtle phosphor mask
  float x = mod(gl_FragCoord.x, 3.0);
  vec3 mask = vec3(1.0);
  if (x < 1.0) {
    mask = vec3(1.0 + MASK_STRENGTH, 1.0 - MASK_STRENGTH * 0.3, 1.0 - MASK_STRENGTH * 0.3);
  } else if (x < 2.0) {
    mask = vec3(1.0 - MASK_STRENGTH * 0.3, 1.0 + MASK_STRENGTH, 1.0 - MASK_STRENGTH * 0.3);
  } else {
    mask = vec3(1.0 - MASK_STRENGTH * 0.3, 1.0 - MASK_STRENGTH * 0.3, 1.0 + MASK_STRENGTH);
  }
  color *= mask;

  // Subtle vignette (use curved UV for proper effect)
  vec2 centered = curvedUV * 2.0 - 1.0;
  float vignette = 1.0 - dot(centered, centered) * 0.12;
  color *= vignette;

  // Add subtle RGB static noise
  vec3 noiseValue = noise(gl_FragCoord.xy, u_time);
  color += noiseValue * NOISE_STRENGTH;

  // Brightness flicker (simulates CRT power fluctuation)
  float flicker = sin(u_time * 13.7) * 0.5 + sin(u_time * 7.3) * 0.3 + sin(u_time * 23.1) * 0.2;
  float colorBrightness = max(max(color.r, color.g), color.b);
  flicker = flicker * FLICKER_STRENGTH * (1.0 + colorBrightness * 0.5);
  color *= (1.0 + flicker);

  // Convert back to gamma space
  color = toGamma(color);

  // Clamp to valid range
  color = clamp(color, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
`;

// ── Vector / oscilloscope display shader ──
// Simulates a P31 green phosphor vector CRT (Vectrex / oscilloscope style).
// The game canvas already has multi-pass glow baked in, so this shader does
// minimal bloom — mostly just maps luminance to green phosphor, adds edge
// beam defocus, phosphor grain, and glass surface characteristics.
const vectorFragmentSource = `
precision mediump float;

uniform sampler2D u_texture;
uniform sampler2D u_prevFrame;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_phosphorDecay;

varying vec2 v_texCoord;

// Full-resolution texel size (768x672)
const vec2 texel = vec2(1.0 / 768.0, 1.0 / 672.0);

#define CURVATURE 0.04
#define CORNER_RADIUS 0.08
#define PHOSPHOR_DECAY_DEFAULT 0.78

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash(vec2 co, float t) {
  return fract(sin(dot(co + t, vec2(12.9898, 78.233))) * 43758.5453);
}

// 2D hash for phosphor grain
float hash2(vec2 co) {
  return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 curveUV(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + dot(c, c) * CURVATURE;
  return c * 0.5 + 0.5;
}

float roundedRectSDF(vec2 uv, vec2 s, float r) {
  vec2 d = abs(uv - 0.5) * 2.0 - s + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

// Cyan/blue phosphor (like the reference image)
// Bright cyan-blue with white cores at peak brightness
vec3 phosphor(float i) {
  // Smooth intensity curve
  float e = pow(i, 1.1);

  // Cyan-blue color: low red, high green and blue
  float r = e * 0.3;        // low red for cyan
  float g = e * 0.85;       // high green
  float b = e * 1.0;        // max blue

  // Add white core at peak brightness only
  if (e > 0.8) {
    float hotness = (e - 0.8) / 0.2;
    r += hotness * 0.5;
    g += hotness * 0.1;
  }

  return vec3(r, g, b);
}

// Lightweight bloom — just a 5-tap cross, 1px radius.
// Only purpose: very subtle softening to simulate beam spot size.
// The game canvas already has the heavy glow baked in.
float softGlow(vec2 uv) {
  float center = luma(texture2D(u_texture, uv).rgb);
  float sum = center * 0.6;
  sum += luma(texture2D(u_texture, clamp(uv + vec2(-texel.x, 0.0), 0.0, 1.0)).rgb) * 0.1;
  sum += luma(texture2D(u_texture, clamp(uv + vec2( texel.x, 0.0), 0.0, 1.0)).rgb) * 0.1;
  sum += luma(texture2D(u_texture, clamp(uv + vec2(0.0, -texel.y), 0.0, 1.0)).rgb) * 0.1;
  sum += luma(texture2D(u_texture, clamp(uv + vec2(0.0,  texel.y), 0.0, 1.0)).rgb) * 0.1;
  return sum;
}

// Edge beam defocus: on real vector displays the beam loses focus near
// screen edges because the deflection angle increases and the beam
// travels further to reach the phosphor. We simulate this by sampling
// a slightly wider area near the edges.
float defocusedSample(vec2 uv) {
  // Distance from center (0 at center, ~0.7 at corners)
  vec2 fromCenter = uv - 0.5;
  float edgeDist = dot(fromCenter, fromCenter) * 2.0;
  float defocusRadius = edgeDist * 3.0; // max ~2px blur at extreme edges

  if (defocusRadius < 0.3) {
    // Center of screen — sharp, no defocus
    return luma(texture2D(u_texture, uv).rgb);
  }

  // Weighted average over small area simulating defocused beam spot
  float r = defocusRadius;
  float sum = luma(texture2D(u_texture, uv).rgb) * 0.40;
  sum += luma(texture2D(u_texture, clamp(uv + vec2(-texel.x * r, 0.0), 0.0, 1.0)).rgb) * 0.10;
  sum += luma(texture2D(u_texture, clamp(uv + vec2( texel.x * r, 0.0), 0.0, 1.0)).rgb) * 0.10;
  sum += luma(texture2D(u_texture, clamp(uv + vec2(0.0, -texel.y * r), 0.0, 1.0)).rgb) * 0.10;
  sum += luma(texture2D(u_texture, clamp(uv + vec2(0.0,  texel.y * r), 0.0, 1.0)).rgb) * 0.10;
  // Diagonals for rounder spot shape
  sum += luma(texture2D(u_texture, clamp(uv + vec2(-texel.x * r, -texel.y * r) * 0.7, 0.0, 1.0)).rgb) * 0.05;
  sum += luma(texture2D(u_texture, clamp(uv + vec2( texel.x * r, -texel.y * r) * 0.7, 0.0, 1.0)).rgb) * 0.05;
  sum += luma(texture2D(u_texture, clamp(uv + vec2(-texel.x * r,  texel.y * r) * 0.7, 0.0, 1.0)).rgb) * 0.05;
  sum += luma(texture2D(u_texture, clamp(uv + vec2( texel.x * r,  texel.y * r) * 0.7, 0.0, 1.0)).rgb) * 0.05;
  return sum;
}

void main() {
  vec2 uv = v_texCoord;

  // Rounded corners
  if (roundedRectSDF(uv, vec2(1.0, 1.0), CORNER_RADIUS) > 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Barrel distortion
  vec2 curved = curveUV(uv);
  if (curved.x < 0.0 || curved.x > 1.0 || curved.y < 0.0 || curved.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Core sample with edge defocus
  float core = defocusedSample(curved);

  // Very subtle bloom halo (beam spot softness)
  float glow = softGlow(curved);

  // Combine: moderate boost for bright but not blown-out lines
  // The source canvas already has glow passes baked in.
  float intensity = core * 0.95 + glow * 0.12;

  // Map through phosphor color curve
  vec3 color = phosphor(min(intensity, 1.0));

  // ── Phosphor grain texture ──
  // Real phosphor screens have a fine granular structure visible
  // when the beam excites individual phosphor crystals.
  vec2 grainCoord = gl_FragCoord.xy;
  float grain = hash2(grainCoord) * 0.08 - 0.04;
  // Grain is only visible where there's light (phosphor is excited)
  color += grain * intensity;

  // ── Glass surface reflection ──
  // Very subtle blue-tinted ambient (matches the bright blue-white aesthetic)
  vec2 glassCoord = curved * 2.0 - 1.0;
  float glassHighlight = 1.0 - dot(glassCoord, glassCoord) * 0.5;
  glassHighlight = max(glassHighlight, 0.0);
  color += vec3(0.002, 0.003, 0.006) * glassHighlight;

  // ── Subtle analog noise ──
  float n = (hash(gl_FragCoord.xy, u_time) - 0.5) * 0.01;
  color += n;

  // ── Gentle beam flicker ──
  // Real oscilloscope displays have slight intensity wobble from
  // power supply ripple.
  float flicker = sin(u_time * 8.3) * 0.008 + sin(u_time * 17.1) * 0.004;
  color *= 1.0 + flicker;

  // ── Phosphor persistence / temporal decay ──
  // Vector displays redraw continuously; phosphor glows and fades
  // between refreshes. Moving lines leave decaying green trails.
  // Flip Y when reading the FBO — our texcoords have v=0 at top
  // (for HTML canvas), but FBO textures have v=0 at bottom (OpenGL).
  vec3 prev = texture2D(u_prevFrame, vec2(uv.x, 1.0 - uv.y)).rgb;
  color = max(color, prev * u_phosphorDecay);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

// ── Passthrough shader (blit FBO to screen) ──
const passthroughFragmentSource = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texCoord;
void main() {
  gl_FragColor = texture2D(u_texture, vec2(v_texCoord.x, 1.0 - v_texCoord.y));
}
`;

// ── Overlay factory ──

function compileGL(gl, src, type) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function buildProgram(gl, vertSrc, fragSrc) {
  const vs = compileGL(gl, vertSrc, gl.VERTEX_SHADER);
  const fs = compileGL(gl, fragSrc, gl.FRAGMENT_SHADER);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return null;
  }
  return {
    program: prog,
    aPosition: gl.getAttribLocation(prog, 'a_position'),
    aTexCoord: gl.getAttribLocation(prog, 'a_texCoord'),
    uResolution: gl.getUniformLocation(prog, 'u_resolution'),
    uTime: gl.getUniformLocation(prog, 'u_time'),
  };
}

export function createShaderOverlay(gameCanvas) {
  const overlay = document.createElement('canvas');
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '1000';
  overlay.id = 'scanline-overlay';

  const updateOverlayPosition = () => {
    const rect = gameCanvas.getBoundingClientRect();
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.width = rect.width;
    overlay.height = rect.height;
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  };

  document.body.appendChild(overlay);
  setTimeout(updateOverlayPosition, 0);
  window.addEventListener('resize', updateOverlayPosition);
  window.addEventListener('scroll', updateOverlayPosition);

  const gl = overlay.getContext('webgl') || overlay.getContext('experimental-webgl');
  if (!gl) { console.error('WebGL not supported'); return null; }

  // Build all programs
  const programs = {
    crt: buildProgram(gl, vertexShaderSource, crtFragmentSource),
    vector: buildProgram(gl, vertexShaderSource, vectorFragmentSource),
    passthrough: buildProgram(gl, vertexShaderSource, passthroughFragmentSource),
  };

  // Cached uniform locations for vector's phosphor persistence
  const vectorUPrevFrame = gl.getUniformLocation(programs.vector.program, 'u_prevFrame');
  const vectorUTexture = gl.getUniformLocation(programs.vector.program, 'u_texture');
  const vectorUPhosphorDecay = gl.getUniformLocation(programs.vector.program, 'u_phosphorDecay');
  let currentPhosphorDecay = 0.78;

  // ── Framebuffer objects for phosphor persistence (ping-pong) ──
  let fboA = null, fboB = null;
  let fboW = 0, fboH = 0;
  let pingPong = 0;

  function makeFBO(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  function ensureFBOs(w, h) {
    if (fboW === w && fboH === h) return;
    if (fboA) { gl.deleteFramebuffer(fboA.fb); gl.deleteTexture(fboA.tex); }
    if (fboB) { gl.deleteFramebuffer(fboB.fb); gl.deleteTexture(fboB.tex); }
    fboA = makeFBO(w, h);
    fboB = makeFBO(w, h);
    fboW = w;
    fboH = h;
    pingPong = 0;
  }

  // Shared full-screen quad
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  0, 1,
     1, -1,  1, 1,
    -1,  1,  0, 0,
     1,  1,  1, 0,
  ]), gl.STATIC_DRAW);

  // Shared texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.clearColor(0, 0, 0, 0);

  let active = programs.crt;

  function activateProgram(prog) {
    active = prog;
    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(prog.aPosition);
    gl.vertexAttribPointer(prog.aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(prog.aTexCoord);
    gl.vertexAttribPointer(prog.aTexCoord, 2, gl.FLOAT, false, 16, 8);
  }

  activateProgram(active);

  function render() {
    updateOverlayPosition();
    if (overlay.width <= 0 || overlay.height <= 0 ||
        !gameCanvas || gameCanvas.width <= 0 || gameCanvas.height <= 0) {
      requestAnimationFrame(render);
      return;
    }

    // Upload full-res game canvas (both pipelines use the same source;
    // CRT shader handles pixelation internally via max-sample)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gameCanvas);

    if (active === programs.vector) {
      // ── Vector mode: two-pass with phosphor persistence ──
      ensureFBOs(overlay.width, overlay.height);
      const writeFBO = pingPong === 0 ? fboA : fboB;
      const readFBO  = pingPong === 0 ? fboB : fboA;

      // Pass 1: render vector shader → FBO, feeding previous frame
      activateProgram(programs.vector);
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO.fb);
      gl.viewport(0, 0, fboW, fboH);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Game canvas on unit 0
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(vectorUTexture, 0);

      // Previous frame on unit 1
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, readFBO.tex);
      gl.uniform1i(vectorUPrevFrame, 1);

      gl.uniform2f(programs.vector.uResolution, overlay.width, overlay.height);
      gl.uniform1f(programs.vector.uTime, performance.now() / 1000);
      gl.uniform1f(vectorUPhosphorDecay, currentPhosphorDecay);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 2: blit FBO → screen
      activateProgram(programs.passthrough);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, overlay.width, overlay.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, writeFBO.tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Restore vector as active for tracking
      active = programs.vector;
      pingPong = 1 - pingPong;
    } else {
      // ── CRT mode: single-pass, no persistence ──
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, overlay.width, overlay.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform2f(active.uResolution, overlay.width, overlay.height);
      gl.uniform1f(active.uTime, performance.now() / 1000);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    requestAnimationFrame(render);
  }

  setTimeout(render, 50);

  return {
    overlay,
    setShader(name) {
      if (programs[name]) activateProgram(programs[name]);
    },
    setPhosphorDecay(value) {
      currentPhosphorDecay = value;
    },
  };
}
