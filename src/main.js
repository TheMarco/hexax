import { StartGame } from './game/main.js';
import { createShaderOverlay } from './game/shaderOverlay.js';
import { SoundEngine } from './game/audio/SoundEngine.js';

// Wait for fonts (Hyperspace) to load before starting the game
document.fonts.ready.then(() => {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // On mobile, activate cabinet layout before creating the game
  if (isTouchDevice) {
    document.body.classList.add('mobile-mode');
    document.getElementById('mobile-cabinet').style.display = 'block';
    document.getElementById('game-container').style.display = 'none';
    document.getElementById('shader-toggle').style.display = 'none';
  }

  // Create game — on mobile, parent it inside the cabinet screen area
  const containerId = isTouchDevice ? 'cabinet-screen' : 'game-container';
  const game = StartGame(containerId);

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

    // Desktop: wire up shader toggle buttons and set initial active state
    if (!isTouchDevice) {
      const currentName = shaderOverlay.getShaderName();
      document.querySelectorAll('#shader-toggle button').forEach(btn => {
        if (btn.dataset.shader === currentName) btn.classList.add('active');
        btn.addEventListener('click', () => {
          document.querySelector('#shader-toggle .active')?.classList.remove('active');
          btn.classList.add('active');
          shaderOverlay.setShader(btn.dataset.shader);
        });
      });
    }

    // Mobile: wire up cabinet touch zones
    if (isTouchDevice) {
      const sendKey = (keyCode, code, key) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { keyCode, code, key, bubbles: true }));
      };

      document.getElementById('touch-left').addEventListener('touchstart', (e) => {
        e.preventDefault();
        sendKey(37, 'ArrowLeft', 'ArrowLeft');
      });
      document.getElementById('touch-right').addEventListener('touchstart', (e) => {
        e.preventDefault();
        sendKey(39, 'ArrowRight', 'ArrowRight');
      });
      document.getElementById('touch-fire').addEventListener('touchstart', (e) => {
        e.preventDefault();
        sendKey(32, 'Space', ' ');
      });

      // Display mode: toggle between CRT and Vector
      let currentShader = shaderOverlay.getShaderName();
      document.getElementById('touch-display').addEventListener('touchstart', (e) => {
        e.preventDefault();
        currentShader = currentShader === 'crt' ? 'vector' : 'crt';
        shaderOverlay.setShader(currentShader);
      });
    }
  }, 100);
});
