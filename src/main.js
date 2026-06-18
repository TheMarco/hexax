import { StartGame } from './game/main.js';
import { createShaderOverlay } from './game/shaderOverlay.js';
import { SoundEngine } from './game/audio/SoundEngine.js';
import { initPlayFun } from './game/playfun.js';
import { initHandheld, isNativePlatform } from './handheld/index.js';

// Wait for fonts (Hyperspace) to load before starting the game
document.fonts.ready.then(() => {
  const isNative = isNativePlatform();
  const isTouchDevice = !isNative && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // On mobile (not handheld), activate cabinet layout before creating the game
  if (isTouchDevice) {
    document.body.classList.add('mobile-mode');
    document.getElementById('mobile-cabinet').style.display = 'block';
    document.getElementById('game-container').style.display = 'none';
    document.getElementById('shader-toggle').style.display = 'none';
  }

  // On native handheld, hide desktop UI elements if they exist
  if (isNative) {
    const shaderToggle = document.getElementById('shader-toggle');
    if (shaderToggle) shaderToggle.style.display = 'none';
    const mobileCabinet = document.getElementById('mobile-cabinet');
    if (mobileCabinet) mobileCabinet.style.display = 'none';
  }

  // Determine container — handheld and desktop use game-container, mobile uses cabinet-screen
  const containerId = isTouchDevice ? 'cabinet-screen' : 'game-container';

  // Initialize handheld runtime (modifies Phaser config on native, no-op on desktop)
  const game = StartGame(containerId, isNative);

  // Start handheld input bridge (gamepad → synthetic keyboard events)
  if (isNative) {
    const handheld = initHandheld({}, {
      logicalWidth: 768,
      logicalHeight: 672,
      scale: 1,
    });
    handheld.startInputBridge(game);
  }

  // Initialize Play.fun SDK (only loads when embedded on play.fun)
  initPlayFun();

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

  // On native handheld, auto-init audio (no user gesture needed on Android WebView)
  if (isNative) {
    soundEngine.init();
  }

  // Apply shader overlay after canvas is ready
  setTimeout(() => {
    const shaderOverlay = createShaderOverlay(game.canvas);
    game.registry.set('shaderOverlay', shaderOverlay);

    // Desktop: wire up shader toggle buttons and set initial active state
    if (!isTouchDevice && !isNative) {
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

    // Gamepad select button (button 8) toggles display mode
    {
      let prevSelect = false;
      const pollSelect = () => {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < gamepads.length; i++) {
          const gp = gamepads[i];
          if (!gp) continue;
          const select = gp.buttons[8]?.pressed || false;
          if (select && !prevSelect && shaderOverlay) {
            const next = shaderOverlay.getShaderName() === 'vector' ? 'crt' : 'vector';
            shaderOverlay.setShader(next);
          }
          prevSelect = select;
          break;
        }
        requestAnimationFrame(pollSelect);
      };
      requestAnimationFrame(pollSelect);
    }

    // Mobile: wire up cabinet touch zones
    if (isTouchDevice) {
      const sendKey = (keyCode, code, key) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { keyCode, code, key, bubbles: true }));
      };

      // Button flash effect
      const flashButton = (el) => {
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 150);
      };

      document.getElementById('touch-left').addEventListener('touchstart', (e) => {
        e.preventDefault();
        flashButton(e.currentTarget);
        sendKey(37, 'ArrowLeft', 'ArrowLeft');
      });
      document.getElementById('touch-right').addEventListener('touchstart', (e) => {
        e.preventDefault();
        flashButton(e.currentTarget);
        sendKey(39, 'ArrowRight', 'ArrowRight');
      });
      document.getElementById('touch-fire').addEventListener('touchstart', (e) => {
        e.preventDefault();
        flashButton(e.currentTarget);
        sendKey(32, 'Space', ' ');
      });

      // Display mode: toggle between CRT and Vector
      let currentShader = shaderOverlay.getShaderName();
      document.getElementById('touch-display').addEventListener('touchstart', (e) => {
        e.preventDefault();
        flashButton(e.currentTarget);
        currentShader = currentShader === 'crt' ? 'vector' : 'crt';
        shaderOverlay.setShader(currentShader);
      });

      // Pause: send Escape key
      document.getElementById('touch-pause').addEventListener('touchstart', (e) => {
        e.preventDefault();
        flashButton(e.currentTarget);
        sendKey(27, 'Escape', 'Escape');
      });
    }
  }, 100);
});
