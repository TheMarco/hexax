const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const fragmentShaderSource = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;

varying vec2 v_texCoord;

#define PI 3.14159265359
#define BLOOM_STRENGTH 0.5
#define SCANLINE_STRENGTH 0.5
#define MASK_STRENGTH 0.08
#define NOISE_STRENGTH 0.025
#define FLICKER_STRENGTH 0.08
#define ABERRATION_STRENGTH 0.0
#define CURVATURE_STRENGTH 0.02
#define CORNER_RADIUS 0.15
#define GAMMA_IN 2.4
#define GAMMA_OUT 2.2

// Optimized for 256x224 resolution
const vec2 sourceSize = vec2(256.0, 224.0);
const vec2 texelSize = vec2(1.0 / 256.0, 1.0 / 224.0);

// Fast gamma approximation
vec3 toLinear(vec3 color) {
  return color * color;
}

vec3 toGamma(vec3 color) {
  return sqrt(color);
}

// RGB noise function - separate noise for each channel
vec3 noise(vec2 co, float time) {
  float r = fract(sin(dot(co.xy + time, vec2(12.9898, 78.233))) * 43758.5453);
  float g = fract(sin(dot(co.xy + time, vec2(93.9898, 67.345))) * 43758.5453);
  float b = fract(sin(dot(co.xy + time, vec2(41.9898, 29.876))) * 43758.5453);
  // Center around 0 for better contrast (range -1 to 1)
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

// Rounded rectangle SDF (signed distance field)
float roundedRectSDF(vec2 uv, vec2 size, float radius) {
  vec2 d = abs(uv - 0.5) * 2.0 - size + radius;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - radius;
}

// Optimized 5-tap blur for low-res source
vec3 getBlur(sampler2D tex, vec2 uv) {
  vec3 result = vec3(0.0);

  // Horizontal + vertical cross pattern (5 taps instead of 9)
  result += toLinear(texture2D(tex, uv).rgb) * 0.4;
  result += toLinear(texture2D(tex, uv + vec2(-texelSize.x, 0.0)).rgb) * 0.15;
  result += toLinear(texture2D(tex, uv + vec2( texelSize.x, 0.0)).rgb) * 0.15;
  result += toLinear(texture2D(tex, uv + vec2(0.0, -texelSize.y)).rgb) * 0.15;
  result += toLinear(texture2D(tex, uv + vec2(0.0,  texelSize.y)).rgb) * 0.15;

  return result;
}

void main() {
  vec2 uv = v_texCoord;

  // Check rounded corners first (before curvature)
  float cornerDist = roundedRectSDF(uv, vec2(1.0, 1.0), CORNER_RADIUS);
  if (cornerDist > 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Apply CRT curvature
  vec2 curvedUV = curveUV(uv);

  // Check if we're outside the curved screen bounds with a small margin
  const float margin = 0.001;
  if (curvedUV.x < -margin || curvedUV.x > 1.0 + margin ||
      curvedUV.y < -margin || curvedUV.y > 1.0 + margin) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Clamp curvedUV to valid texture coordinates
  curvedUV = clamp(curvedUV, 0.0, 1.0);

  // Chromatic aberration - RGB channels shift based on distance from center
  vec2 fromCenter = curvedUV - 0.5;
  float dist = length(fromCenter);
  vec2 offset = fromCenter * dist * ABERRATION_STRENGTH;

  // Sample each color channel with slight offset
  float r = toLinear(texture2D(u_texture, curvedUV - offset).rgb).r;
  float g = toLinear(texture2D(u_texture, curvedUV).rgb).g;
  float b = toLinear(texture2D(u_texture, curvedUV + offset).rgb).b;

  vec3 color = vec3(r, g, b);

  // Calculate glow/bloom - optimized for pixel art
  vec3 blur = getBlur(u_texture, curvedUV);
  float brightness = max(max(blur.r, blur.g), blur.b);

  // Bloom only on bright pixels (threshold)
  vec3 bloom = max(blur - 0.6, 0.0) * 2.5;
  color += bloom * BLOOM_STRENGTH;

  // Bold horizontal scanlines - every other line
  float scanlineY = floor(gl_FragCoord.y * 0.5);
  float scanline = mod(scanlineY, 2.0);
  // Make dark lines really dark
  scanline = scanline < 0.5 ? (1.0 - SCANLINE_STRENGTH) : 1.0;
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

  // Brightness flicker (simulates CRT power fluctuation) - more intense on brighter areas
  float flicker = sin(u_time * 13.7) * 0.5 + sin(u_time * 7.3) * 0.3 + sin(u_time * 23.1) * 0.2;
  float colorBrightness = max(max(color.r, color.g), color.b);
  flicker = flicker * FLICKER_STRENGTH * (1.0 + colorBrightness * 0.5); // Brighter areas flicker more
  color *= (1.0 + flicker);

  // Convert back to gamma space
  color = toGamma(color);

  // Clamp to valid range
  color = clamp(color, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
`;

export function createShaderOverlay(gameCanvas) {
  // Create overlay canvas positioned absolutely over game canvas
  const overlay = document.createElement('canvas');
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '1000';
  overlay.id = 'scanline-overlay';

  // Function to sync overlay position/size with game canvas
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

  // Initialize WebGL context
  const gl = overlay.getContext('webgl') || overlay.getContext('experimental-webgl');
  if (!gl) {
    console.error('WebGL not supported');
    return null;
  }

  // Compile shaders
  function compileShader(source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

  // Link program
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }

  gl.useProgram(program);

  // Setup vertex buffer (full-screen quad)
  const positions = new Float32Array([
    -1, -1,  0, 1,
     1, -1,  1, 1,
    -1,  1,  0, 0,
     1,  1,  1, 0
  ]);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const positionLoc = gl.getAttribLocation(program, 'a_position');
  const texCoordLoc = gl.getAttribLocation(program, 'a_texCoord');

  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);

  gl.enableVertexAttribArray(texCoordLoc);
  gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);

  // Setup texture for game canvas
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
  const timeLoc = gl.getUniformLocation(program, 'u_time');

  gl.clearColor(0, 0, 0, 0);

  // Animation loop
  function render() {
    updateOverlayPosition();

    // Skip rendering if canvas has no dimensions
    if (overlay.width <= 0 || overlay.height <= 0) {
      requestAnimationFrame(render);
      return;
    }

    // Skip if game canvas isn't ready
    if (!gameCanvas || gameCanvas.width <= 0 || gameCanvas.height <= 0) {
      requestAnimationFrame(render);
      return;
    }

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Copy game canvas to texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gameCanvas);

    gl.uniform2f(resolutionLoc, overlay.width, overlay.height);
    gl.uniform1f(timeLoc, performance.now() / 1000);

    gl.viewport(0, 0, overlay.width, overlay.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(render);
  }

  setTimeout(render, 50);

  return overlay;
}
