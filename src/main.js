import { StartGame } from './game/main.js';
import { createShaderOverlay } from './game/shaderOverlay.js';
import { SoundEngine } from './game/audio/SoundEngine.js';

// Wait for fonts (Hyperspace) to load before starting the game
document.fonts.ready.then(() => {
  const game = StartGame('game-container');

  // Initialize audio on first user gesture (required by iOS)
  const soundEngine = new SoundEngine();
  game.registry.set('soundEngine', soundEngine);
  const initAudio = () => {
    soundEngine.init();
    document.removeEventListener('touchstart', initAudio);
    document.removeEventListener('touchend', initAudio);
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('touchstart', initAudio);
  document.addEventListener('touchend', initAudio);
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);

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

  // Mobile controls — show on touch devices
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) {
    const controls = document.getElementById('mobile-controls');
    controls.style.display = 'flex';

    const sendKey = (keyCode, code, key) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { keyCode, code, key, bubbles: true }));
    };

    document.getElementById('btn-left').addEventListener('touchstart', (e) => {
      e.preventDefault();
      sendKey(37, 'ArrowLeft', 'ArrowLeft');
    });
    document.getElementById('btn-right').addEventListener('touchstart', (e) => {
      e.preventDefault();
      sendKey(39, 'ArrowRight', 'ArrowRight');
    });
    document.getElementById('btn-fire').addEventListener('touchstart', (e) => {
      e.preventDefault();
      sendKey(32, 'Space', ' ');
    });
  }
});
