import { StartGame } from './game/main.js';
import { createShaderOverlay } from './game/shaderOverlay.js';

// Wait for fonts (Hyperspace) to load before starting the game
document.fonts.ready.then(() => {
  const game = StartGame('game-container');

  // Apply shader overlay after canvas is ready
  setTimeout(() => {
    const shaderOverlay = createShaderOverlay(game.canvas);
    game.registry.set('shaderOverlay', shaderOverlay);

    // Wire up shader toggle buttons
    document.querySelectorAll('#shader-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelector('#shader-toggle .active').classList.remove('active');
        btn.classList.add('active');
        shaderOverlay.setShader(btn.dataset.shader);
      });
    });
  }, 100);
});
