/**
 * Handheld runtime bootstrap for Hexax.
 *
 * Same pattern as cubed/Deadfall: polls gamepad + keyboard via HandheldInput,
 * publishes to window.mobileInput, game scenes read it directly.
 */

import { applyHandheldDisplay, applyPixelCSS } from './display.js';
import { HandheldInput } from './input.js';
import { isNativePlatform, initPlatform } from './platform.js';

export { isNativePlatform } from './platform.js';
export { HandheldInput } from './input.js';

export function initHandheld(phaserConfig, opts) {
  const isNative = isNativePlatform();
  const input = new HandheldInput();
  input.loadCalibration();

  if (isNative) {
    applyHandheldDisplay(phaserConfig, opts.logicalWidth, opts.logicalHeight, opts.scale);
    applyPixelCSS();
    initPlatform();
  }

  return {
    input,
    isNative,

    /**
     * Bridge gamepad/keyboard input into window.mobileInput
     * so game scenes can consume it directly.
     */
    startInputBridge(game) {
      let prevMoveX = 0;
      let prevMoveY = 0;

      game.events.on('prestep', () => {
        const s = input.poll();
        const sx = Math.sign(s.moveX);
        const sy = Math.sign(s.moveY);

        window.mobileInput = {
          direction: { x: sx, y: sy },
          actionPressed: s.action,
          actionJustPressed: s.actionPressed,
          actionJustReleased: s.actionReleased,
          directionJustChanged: s.directionChanged,
          leftJustPressed: sx === -1 && prevMoveX !== -1,
          rightJustPressed: sx === 1 && prevMoveX !== 1,
        };

        prevMoveX = sx;
        prevMoveY = sy;
      });
    },
  };
}
