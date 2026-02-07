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

// ── Bloom downsample shader ──
// 4-tap bilinear downsample with color grading and soft brightness threshold
const bloomDownsampleFragSrc = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;

varying vec2 v_texCoord;

void main() {
  // 4-tap bilinear downsample (box filter at half res)
  vec2 texelSize = 1.0 / u_resolution;
  vec2 halfTexel = texelSize * 0.5;

  vec3 a = texture2D(u_texture, v_texCoord + vec2(-halfTexel.x, -halfTexel.y)).rgb;
  vec3 b = texture2D(u_texture, v_texCoord + vec2( halfTexel.x, -halfTexel.y)).rgb;
  vec3 c = texture2D(u_texture, v_texCoord + vec2(-halfTexel.x,  halfTexel.y)).rgb;
  vec3 d = texture2D(u_texture, v_texCoord + vec2( halfTexel.x,  halfTexel.y)).rgb;

  vec3 color = (a + b + c + d) * 0.25;

  // Soft knee brightness threshold for bloom extraction
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float knee = 0.25;
  float threshold = 0.15;
  float soft = luma - threshold + knee;
  soft = clamp(soft / (2.0 * knee), 0.0, 1.0);
  soft = soft * soft;
  float contribution = max(soft, step(threshold + knee, luma));

  gl_FragColor = vec4(color * contribution, 1.0);
}
`;

// ── Separable Gaussian blur shader ──
// 9-tap Gaussian with u_direction uniform (shared for horizontal and vertical passes)
const blurFragSrc = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_direction;
uniform vec2 u_resolution;

varying vec2 v_texCoord;

void main() {
  vec2 texelSize = u_direction / u_resolution;

  // 9-tap Gaussian kernel (sigma ~2.5)
  vec3 result = vec3(0.0);
  result += texture2D(u_texture, v_texCoord + texelSize * -4.0).rgb * 0.0162;
  result += texture2D(u_texture, v_texCoord + texelSize * -3.0).rgb * 0.0540;
  result += texture2D(u_texture, v_texCoord + texelSize * -2.0).rgb * 0.1216;
  result += texture2D(u_texture, v_texCoord + texelSize * -1.0).rgb * 0.1945;
  result += texture2D(u_texture, v_texCoord).rgb * 0.2270;
  result += texture2D(u_texture, v_texCoord + texelSize *  1.0).rgb * 0.1945;
  result += texture2D(u_texture, v_texCoord + texelSize *  2.0).rgb * 0.1216;
  result += texture2D(u_texture, v_texCoord + texelSize *  3.0).rgb * 0.0540;
  result += texture2D(u_texture, v_texCoord + texelSize *  4.0).rgb * 0.0162;

  gl_FragColor = vec4(result, 1.0);
}
`;

// ── Vector composite shader (replaces old vectorFragmentSource) ──
// Full RGB pipeline: color grade → add bloom → chromatic aberration →
// grain/noise/flicker → per-channel persistence → output
const vectorCompositeFragSrc = `
precision mediump float;

uniform sampler2D u_texture;
uniform sampler2D u_bloom;
uniform sampler2D u_prevFrame;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_phosphorDecay;

varying vec2 v_texCoord;

// Full-resolution texel size (768x672)
const vec2 texel = vec2(1.0 / 768.0, 1.0 / 672.0);

#define CURVATURE 0.04
#define CORNER_RADIUS 0.08

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash(vec2 co, float t) {
  return fract(sin(dot(co + t, vec2(12.9898, 78.233))) * 43758.5453);
}

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

// RGB to HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Color grading: decide what stays blue phosphor vs what keeps its color
vec3 vectorColorGrade(vec3 src) {
  float l = luma(src);
  if (l < 0.01) return vec3(0.0);

  vec3 hsv = rgb2hsv(src);
  float sat = hsv.y;

  // Unsaturated content (ship white, flashes) → blue phosphor with white-hot core
  if (sat < 0.12) {
    float e = pow(l, 1.1);
    float r = e * 0.3;
    float g = e * 0.85;
    float b = e * 1.0;
    if (e > 0.8) {
      float hotness = (e - 0.8) / 0.2;
      r += hotness * 0.5;
      g += hotness * 0.1;
    }
    return vec3(r, g, b);
  }

  // Green-dominant content (tunnel, walls, HUD, bullets) → blue phosphor
  // Tunnel green is 0x7cffb2 → R=0.486, G=1.0, B=0.698
  // Dimmed tunnel is roughly half that
  // Bullet is 0xaaffdd → R=0.667, G=1.0, B=0.867
  // Active lane is 0xbbffdd → R=0.733, G=1.0, B=0.867
  bool greenDominant = src.g > src.r * 1.15 && src.g > src.b;

  if (greenDominant) {
    float e = pow(l, 1.1);
    float r = e * 0.3;
    float g = e * 0.85;
    float b = e * 1.0;
    if (e > 0.8) {
      float hotness = (e - 0.8) / 0.2;
      r += hotness * 0.5;
      g += hotness * 0.1;
    }
    return vec3(r, g, b);
  }

  // Cyan with high B/G ratio (spirals 0x44ffdd → R=0.267, G=1.0, B=0.867)
  // Spirals have very high G AND high B, distinguish from tunnel by B/G ratio
  if (src.g > src.r * 1.5 && src.b > src.r * 1.5 && src.b / (src.g + 0.001) > 0.78) {
    // Slight blue tint shift but mostly preserve the cyan
    vec3 tinted = src;
    tinted.r *= 0.85;
    tinted.b = mix(tinted.b, tinted.b * 1.1, 0.3);
    return tinted * 1.1;
  }

  // Everything else: enemies, tanks, bombs, hearts, phase, explosions
  // Preserve color with subtle blue tint to integrate with phosphor aesthetic
  vec3 result = src;
  // Gentle blue shift — blend 12% toward blue-tinted version
  vec3 blueTinted = src * vec3(0.85, 0.9, 1.15);
  result = mix(src, blueTinted, 0.12);
  // Boost saturation slightly to compensate for the blue tint
  float gray = luma(result);
  result = mix(vec3(gray), result, 1.15);
  return result;
}

// Edge beam defocus (now in RGB)
vec3 defocusedSample(vec2 uv) {
  vec2 fromCenter = uv - 0.5;
  float edgeDist = dot(fromCenter, fromCenter) * 2.0;
  float defocusRadius = edgeDist * 3.0;

  if (defocusRadius < 0.3) {
    return texture2D(u_texture, uv).rgb;
  }

  float r = defocusRadius;
  vec3 sum = texture2D(u_texture, uv).rgb * 0.40;
  sum += texture2D(u_texture, clamp(uv + vec2(-texel.x * r, 0.0), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2( texel.x * r, 0.0), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2(0.0, -texel.y * r), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2(0.0,  texel.y * r), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2(-texel.x * r, -texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  sum += texture2D(u_texture, clamp(uv + vec2( texel.x * r, -texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  sum += texture2D(u_texture, clamp(uv + vec2(-texel.x * r,  texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  sum += texture2D(u_texture, clamp(uv + vec2( texel.x * r,  texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
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

  // Core RGB sample with edge defocus
  vec3 core = defocusedSample(curved);

  // Color grade the core sample
  vec3 color = vectorColorGrade(core);

  // Sample bloom texture (half-res, already blurred) and color grade it too
  // Flip Y: bloom is in an FBO (GL convention Y=0 at bottom) while curved
  // coords are set up for HTML canvas textures (Y=0 at top via quad flip)
  vec3 bloomSample = texture2D(u_bloom, vec2(curved.x, 1.0 - curved.y)).rgb;
  vec3 bloomGraded = vectorColorGrade(bloomSample);

  // Add bloom — per-channel colored bloom
  color += bloomGraded * 0.55;

  // Chromatic aberration — subtle RGB split on bright areas, proportional to edge distance
  vec2 fromCenter = curved - 0.5;
  float caStrength = dot(fromCenter, fromCenter) * 0.008;
  if (caStrength > 0.0005) {
    vec2 caOffset = fromCenter * caStrength;
    float rShift = luma(vectorColorGrade(texture2D(u_texture, clamp(curved + caOffset, 0.0, 1.0)).rgb));
    float bShift = luma(vectorColorGrade(texture2D(u_texture, clamp(curved - caOffset, 0.0, 1.0)).rgb));
    // Blend shifted channels
    color.r = mix(color.r, color.r * (1.0 + (rShift - luma(color)) * 0.3), 0.5);
    color.b = mix(color.b, color.b * (1.0 + (bShift - luma(color)) * 0.3), 0.5);
  }

  // Phosphor grain texture
  vec2 grainCoord = gl_FragCoord.xy;
  float grain = hash2(grainCoord) * 0.08 - 0.04;
  float intensity = luma(color);
  color += grain * max(intensity, 0.02);

  // Glass surface reflection
  vec2 glassCoord = curved * 2.0 - 1.0;
  float glassHighlight = 1.0 - dot(glassCoord, glassCoord) * 0.5;
  glassHighlight = max(glassHighlight, 0.0);
  color += vec3(0.002, 0.003, 0.006) * glassHighlight;

  // Faint blue hue — vector CRT phosphor glass tint
  float blueVar = 0.7 + 0.3 * sin(u_time * 0.4 + curved.y * 4.0 + curved.x * 2.5);
  float blueNoise = hash2(floor(gl_FragCoord.xy * 0.5)) * 0.15;
  vec3 blueTint = vec3(0.02, 0.03, 0.08) * (blueVar + blueNoise);
  color += blueTint;

  // Subtle analog noise
  float n = (hash(gl_FragCoord.xy, u_time) - 0.5) * 0.01;
  color += n;

  // Gentle beam flicker
  float flicker = sin(u_time * 8.3) * 0.008 + sin(u_time * 17.1) * 0.004;
  color *= 1.0 + flicker;

  // Per-channel phosphor persistence (colored trails)
  // Flip Y when reading the FBO
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
  if (!vs || !fs) return null;
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
    bloomDownsample: buildProgram(gl, vertexShaderSource, bloomDownsampleFragSrc),
    blur: buildProgram(gl, vertexShaderSource, blurFragSrc),
    vectorComposite: buildProgram(gl, vertexShaderSource, vectorCompositeFragSrc),
    passthrough: buildProgram(gl, vertexShaderSource, passthroughFragmentSource),
  };

  // Cache uniform locations for blur shader
  const blurUDirection = gl.getUniformLocation(programs.blur.program, 'u_direction');

  // Cache uniform locations for vector composite shader
  const compositeUTexture = gl.getUniformLocation(programs.vectorComposite.program, 'u_texture');
  const compositeUBloom = gl.getUniformLocation(programs.vectorComposite.program, 'u_bloom');
  const compositeUPrevFrame = gl.getUniformLocation(programs.vectorComposite.program, 'u_prevFrame');
  const compositeUPhosphorDecay = gl.getUniformLocation(programs.vectorComposite.program, 'u_phosphorDecay');

  let currentPhosphorDecay = 0.78;

  // ── Persist FBOs for phosphor persistence (ping-pong, full-res) ──
  let persistA = null, persistB = null;
  let persistW = 0, persistH = 0;
  let pingPong = 0;

  // ── Bloom FBOs (half-res) ──
  let bloomA = null, bloomB = null;
  let bloomW = 0, bloomH = 0;

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

  function ensurePersistFBOs(w, h) {
    if (persistW === w && persistH === h) return;
    if (persistA) { gl.deleteFramebuffer(persistA.fb); gl.deleteTexture(persistA.tex); }
    if (persistB) { gl.deleteFramebuffer(persistB.fb); gl.deleteTexture(persistB.tex); }
    persistA = makeFBO(w, h);
    persistB = makeFBO(w, h);
    persistW = w;
    persistH = h;
    pingPong = 0;
  }

  function ensureBloomFBOs(w, h) {
    const halfW = Math.max(1, Math.floor(w / 2));
    const halfH = Math.max(1, Math.floor(h / 2));
    if (bloomW === halfW && bloomH === halfH) return;
    if (bloomA) { gl.deleteFramebuffer(bloomA.fb); gl.deleteTexture(bloomA.tex); }
    if (bloomB) { gl.deleteFramebuffer(bloomB.fb); gl.deleteTexture(bloomB.tex); }
    bloomA = makeFBO(halfW, halfH);
    bloomB = makeFBO(halfW, halfH);
    bloomW = halfW;
    bloomH = halfH;
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

  // Shared texture for game canvas upload
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.clearColor(0, 0, 0, 0);

  let savedShader = 'vector';
  try { savedShader = localStorage.getItem('hexax-display-mode') || 'vector'; } catch (e) {}
  // Map legacy 'vector' to the new composite pipeline
  let activeShaderName = (savedShader === 'crt') ? 'crt' : 'vector';

  function activateProgram(prog) {
    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(prog.aPosition);
    gl.vertexAttribPointer(prog.aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(prog.aTexCoord);
    gl.vertexAttribPointer(prog.aTexCoord, 2, gl.FLOAT, false, 16, 8);
  }

  function render() {
    updateOverlayPosition();
    if (overlay.width <= 0 || overlay.height <= 0 ||
        !gameCanvas || gameCanvas.width <= 0 || gameCanvas.height <= 0) {
      requestAnimationFrame(render);
      return;
    }

    const now = performance.now() / 1000;

    // Upload full-res game canvas
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gameCanvas);

    if (activeShaderName === 'vector') {
      // ── Vector mode: 5-pass pipeline ──
      ensurePersistFBOs(overlay.width, overlay.height);
      ensureBloomFBOs(overlay.width, overlay.height);

      // ── Pass 1: Bloom downsample + threshold → bloomA ──
      activateProgram(programs.bloomDownsample);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(programs.bloomDownsample.program, 'u_texture'), 0);
      gl.uniform2f(programs.bloomDownsample.uResolution, gameCanvas.width, gameCanvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ── Pass 2: Horizontal Gaussian blur → bloomB ──
      activateProgram(programs.blur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fb);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform1i(gl.getUniformLocation(programs.blur.program, 'u_texture'), 0);
      gl.uniform2f(blurUDirection, 1.0, 0.0);
      gl.uniform2f(programs.blur.uResolution, bloomW, bloomH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ── Pass 3: Vertical Gaussian blur → bloomA ──
      activateProgram(programs.blur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
      gl.uniform1i(gl.getUniformLocation(programs.blur.program, 'u_texture'), 0);
      gl.uniform2f(blurUDirection, 0.0, 1.0);
      gl.uniform2f(programs.blur.uResolution, bloomW, bloomH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ── Pass 4: Vector composite → persistFBO ──
      const writeFBO = pingPong === 0 ? persistA : persistB;
      const readFBO  = pingPong === 0 ? persistB : persistA;

      activateProgram(programs.vectorComposite);
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO.fb);
      gl.viewport(0, 0, persistW, persistH);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Game canvas on unit 0
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(compositeUTexture, 0);

      // Bloom texture on unit 1
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform1i(compositeUBloom, 1);

      // Previous frame on unit 2
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, readFBO.tex);
      gl.uniform1i(compositeUPrevFrame, 2);

      gl.uniform2f(programs.vectorComposite.uResolution, overlay.width, overlay.height);
      gl.uniform1f(programs.vectorComposite.uTime, now);
      gl.uniform1f(compositeUPhosphorDecay, currentPhosphorDecay);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ── Pass 5: Blit persistFBO → screen ──
      activateProgram(programs.passthrough);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, overlay.width, overlay.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, writeFBO.tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      pingPong = 1 - pingPong;
    } else {
      // ── CRT mode: single-pass, no persistence ──
      activateProgram(programs.crt);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, overlay.width, overlay.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform2f(programs.crt.uResolution, overlay.width, overlay.height);
      gl.uniform1f(programs.crt.uTime, now);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    requestAnimationFrame(render);
  }

  setTimeout(render, 50);

  return {
    overlay,
    setShader(name) {
      if (name === 'crt' || name === 'vector') {
        activeShaderName = name;
        try { localStorage.setItem('hexax-display-mode', name); } catch (e) {}
      }
    },
    setPhosphorDecay(value) {
      currentPhosphorDecay = value;
    },
    getShaderName() {
      return activeShaderName;
    },
  };
}
