/**
 * Handheld display module.
 * Pixel-perfect rendering for handheld devices.
 */

// Phaser.Scale enum values (avoids importing Phaser in this module)
const SCALE_FIT = 3;
const CENTER_BOTH = 1;

/**
 * Apply handheld display settings to a Phaser config object.
 * Mutates and returns the config.
 *
 * Uses FIT mode (scales to fill viewport, maintains aspect ratio)
 * with CENTER_BOTH so the game is centered with black borders.
 */
export function applyHandheldDisplay(phaserConfig, logicalWidth, logicalHeight, scale) {
  phaserConfig.width = logicalWidth;
  phaserConfig.height = logicalHeight;
  phaserConfig.pixelArt = true;
  phaserConfig.roundPixels = true;
  phaserConfig.antialias = false;

  phaserConfig.render = {
    ...(phaserConfig.render || {}),
    antialias: false,
    pixelArt: true,
    roundPixels: true,
    antialiasGL: false,
  };

  phaserConfig.scale = {
    mode: SCALE_FIT,
    autoCenter: CENTER_BOTH,
    zoom: scale,
    width: logicalWidth,
    height: logicalHeight,
  };

  return phaserConfig;
}

/**
 * Apply CSS to the document for crisp pixel rendering.
 * Call once at startup.
 */
export function applyPixelCSS() {
  const style = document.createElement('style');
  style.textContent = `
    html, body {
      margin: 0;
      padding: 0;
      background: #000;
      overflow: hidden;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
    }
    canvas {
      image-rendering: pixelated !important;
      image-rendering: crisp-edges !important;
      image-rendering: -moz-crisp-edges !important;
    }
  `;
  document.head.appendChild(style);
}
