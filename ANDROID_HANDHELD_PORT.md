# Porting a Phaser Game to Android for the Anbernic RG406H

Step-by-step guide for porting an HTML5/Phaser game to run as a sideloaded APK on the Anbernic RG406H (or similar Android-based gaming handhelds) using Capacitor.

This guide was built while porting **Deadfall** and is designed to be reused across multiple games.

---

## Prerequisites

- Node.js 18+
- Android Studio (with SDK 36+ installed)
- An existing Phaser game with Vite as the build tool
- Your game must have a 1024x1024 `icon.png` in `public/`

---

## Overview

The port adds three layers:

| Layer | Files | Purpose |
|---|---|---|
| **Display** | `src/handheld/display.js` | Pixel-perfect scaling, crisp rendering CSS |
| **Input** | `src/handheld/input.js` | Gamepad API + keyboard fallback, deadzone, D-pad |
| **Platform** | `src/handheld/platform.js` | Fullscreen, orientation lock, wake lock |
| **Bootstrap** | `src/handheld/index.js` | Ties modules together, bridges input to game |

Plus: an Android-specific HTML entry point, Capacitor config, native Android patches, and npm scripts.

---

## Step 1: Install Dependencies

Add `@capacitor/android` to your project (you should already have `@capacitor/core` and `@capacitor/cli`):

```bash
npm install @capacitor/android@^8.0.0
```

If you don't have Capacitor at all:

```bash
npm install @capacitor/core@^8.0.0 @capacitor/cli@^8.0.0 @capacitor/android@^8.0.0
```

---

## Step 2: Create the Handheld Runtime Modules

Create the directory `src/handheld/` and add these four files.

### `src/handheld/display.js`

```js
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
```

### `src/handheld/input.js`

```js
/**
 * Handheld input module.
 * Gamepad + keyboard input with deadzone, D-pad, and multi-button action mapping.
 *
 * Gameplay code consumes abstract actions only:
 *   moveX  (-1..1)  — horizontal movement
 *   moveY  (-1..1)  — vertical movement
 *   action (bool)   — action button held
 *   actionPressed (bool) — action button just pressed this frame
 *
 * Call poll() exactly once per game frame.
 */

const DEFAULT_CONFIG = {
  deadzone: 0.25,
  // Standard gamepad: A=0, B=1, X=2, Y=3
  actionButtons: [0, 1, 2, 3],
  stickAxisX: 0,
  stickAxisY: 1,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
};

export class HandheldInput {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._prevAction = false;
    this._prevMoveX = 0;
    this._prevMoveY = 0;
    this._keys = {};
    this._gamepadConnected = false;

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => { this._keys[e.code] = true; });
      window.addEventListener('keyup', (e) => { this._keys[e.code] = false; });
      window.addEventListener('gamepadconnected', () => { this._gamepadConnected = true; });
      window.addEventListener('gamepaddisconnected', () => { this._gamepadConnected = false; });
    }
  }

  /**
   * Poll current input state. Call once per game frame.
   */
  poll() {
    let moveX = 0;
    let moveY = 0;
    let action = false;

    // --- Gamepad ---
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp) continue;

      // Left stick
      let sx = gp.axes[this.config.stickAxisX] || 0;
      let sy = gp.axes[this.config.stickAxisY] || 0;
      sx = this._applyDeadzone(sx);
      sy = this._applyDeadzone(sy);

      // D-pad
      const dpadX =
        (gp.buttons[this.config.dpadLeft]?.pressed ? -1 : 0) +
        (gp.buttons[this.config.dpadRight]?.pressed ? 1 : 0);
      const dpadY =
        (gp.buttons[this.config.dpadUp]?.pressed ? -1 : 0) +
        (gp.buttons[this.config.dpadDown]?.pressed ? 1 : 0);

      // Prefer whichever has larger magnitude
      moveX = Math.abs(dpadX) > Math.abs(sx) ? dpadX : sx;
      moveY = Math.abs(dpadY) > Math.abs(sy) ? dpadY : sy;

      // Action buttons
      for (const bi of this.config.actionButtons) {
        if (bi < gp.buttons.length && gp.buttons[bi]?.pressed) {
          action = true;
          break;
        }
      }

      break; // use first connected gamepad
    }

    // --- Keyboard fallback ---
    const k = this._keys;
    const kx = (k.ArrowLeft || k.KeyA ? -1 : 0) + (k.ArrowRight || k.KeyD ? 1 : 0);
    const ky = (k.ArrowUp || k.KeyW ? -1 : 0) + (k.ArrowDown || k.KeyS ? 1 : 0);
    if (Math.abs(kx) > Math.abs(moveX)) moveX = kx;
    if (Math.abs(ky) > Math.abs(moveY)) moveY = ky;
    if (k.Space || k.KeyZ || k.KeyX || k.Enter) action = true;

    // Clamp
    moveX = Math.max(-1, Math.min(1, moveX));
    moveY = Math.max(-1, Math.min(1, moveY));

    // Edge detection
    const actionPressed = action && !this._prevAction;
    const actionReleased = !action && this._prevAction;
    const directionChanged =
      Math.sign(moveX) !== Math.sign(this._prevMoveX) ||
      Math.sign(moveY) !== Math.sign(this._prevMoveY);

    this._prevAction = action;
    this._prevMoveX = moveX;
    this._prevMoveY = moveY;

    return { moveX, moveY, action, actionPressed, actionReleased, directionChanged };
  }

  _applyDeadzone(value) {
    const dz = this.config.deadzone;
    if (Math.abs(value) < dz) return 0;
    const sign = Math.sign(value);
    return sign * (Math.abs(value) - dz) / (1 - dz);
  }

  configure(overrides) {
    Object.assign(this.config, overrides);
  }

  loadCalibration() {
    try {
      const raw = localStorage.getItem('handheld-input-config');
      if (raw) {
        this.configure(JSON.parse(raw));
        return true;
      }
    } catch (_) {}
    return false;
  }

  saveCalibration() {
    try {
      localStorage.setItem('handheld-input-config', JSON.stringify(this.config));
    } catch (_) {}
  }
}
```

### `src/handheld/platform.js`

```js
/**
 * Handheld platform module.
 * Fullscreen, orientation lock, and screen wake lock via web APIs.
 *
 * Android-native behaviour is also set via AndroidManifest.xml / styles.xml
 * and MainActivity.java for maximum reliability.
 */

let wakeLock = null;

export function isNativePlatform() {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform);
  } catch (_) {
    return false;
  }
}

export async function initPlatform() {
  await requestFullscreen();
  await lockLandscape();
  await requestWakeLock();

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      await requestWakeLock();
      await requestFullscreen();
    }
  });
}

async function requestFullscreen() {
  try {
    const el = document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch (_) {}
}

async function lockLandscape() {
  try {
    if (screen.orientation?.lock) await screen.orientation.lock('landscape');
  } catch (_) {}
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) {}
}
```

### `src/handheld/index.js`

```js
/**
 * Handheld runtime bootstrap.
 *
 * Usage:
 *   import { initHandheld } from './handheld/index.js';
 *   const handheld = initHandheld(phaserConfig, { logicalWidth: 256, logicalHeight: 224, scale: 3 });
 *   const game = new Phaser.Game(phaserConfig);
 *   handheld.startInputBridge(game);
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
     * so existing Phaser scenes can consume it unchanged.
     */
    startInputBridge(game) {
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
          upJustPressed: sy === -1 && prevMoveY !== -1,
          downJustPressed: sy === 1 && prevMoveY !== 1,
        };

        prevMoveY = sy;
      });
    },
  };
}
```

---

## Step 3: Create the Android HTML Entry Point

Create `android.html` in your project root. This is the page Capacitor loads in the APK.

Replace the `<title>` and the `<script src>` to match your game.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>YOUR GAME NAME</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            margin: 0; padding: 0;
            background: #000000;
            overflow: hidden;
            width: 100%; height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            touch-action: none;
            -webkit-tap-highlight-color: transparent;
            user-select: none;
            -webkit-user-select: none;
        }
        ::-webkit-scrollbar { display: none; }
        #game-container {
            display: flex;
            justify-content: center;
            align-items: center;
        }
        #game-container canvas {
            display: block;
            image-rendering: pixelated;
            image-rendering: crisp-edges;
            image-rendering: -moz-crisp-edges;
            image-rendering: -webkit-crisp-edges;
        }
    </style>
</head>
<body>
    <div id="game-container"></div>
    <!-- Point this at your game's main entry (full game, not demo) -->
    <script type="module" src="/src/main.js"></script>
</body>
</html>
```

---

## Step 4: Integrate into Your Game's Main Entry

In your `main.js` (or equivalent), add the handheld bootstrap **before** creating the Phaser game:

```js
import { initHandheld } from './handheld/index.js';

// ... your existing config setup ...

// Initialize handheld runtime (modifies config on native, no-op on desktop)
const handheld = initHandheld(config, {
    logicalWidth: GAME_WIDTH,   // e.g. 256
    logicalHeight: GAME_HEIGHT, // e.g. 224
    scale: GAME_SCALE           // e.g. 3
});

// Create game instance
const game = new Phaser.Game(config);

// Bridge gamepad/controller input into window.mobileInput for all scenes
handheld.startInputBridge(game);
```

Your game scenes must read `window.mobileInput` for controller input. The shape is:

```js
window.mobileInput = {
  direction: { x: -1|0|1, y: -1|0|1 },
  actionPressed: boolean,       // held
  actionJustPressed: boolean,   // edge: just pressed this frame
  actionJustReleased: boolean,  // edge: just released this frame
  directionJustChanged: boolean,
  upJustPressed: boolean,       // for menu navigation
  downJustPressed: boolean,     // for menu navigation
};
```

---

## Step 5: Add Vite Build Entry

In `vite.config.js`, add `android.html` to the rollup inputs:

```js
rollupOptions: {
  input: {
    // ... your existing entries ...
    android: resolve(__dirname, 'android.html')
  },
}
```

---

## Step 6: Add Capacitor Config

Create or update `capacitor.config.json`:

```json
{
  "appId": "com.marco.YOUR_GAME_NAME",
  "appName": "Your Game Name",
  "webDir": "dist",
  "android": {
    "backgroundColor": "#000000"
  }
}
```

---

## Step 7: Add npm Scripts

Add these to `package.json` scripts:

```json
"android:init": "npx cap add android && node scripts/setup-android.js",
"android:build": "vite build && cp dist/android.html dist/index.html && npx cap sync android",
"android:open": "npx cap open android",
"android:dev": "npm run android:build && npx cap open android"
```

---

## Step 8: Create the Android Setup Script

Create `scripts/setup-android.js`. This patches the Android project for landscape, fullscreen, and keep-screen-on. Run it once after `npx cap add android`.

```js
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const STYLES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');

function patchManifest() {
  if (!fs.existsSync(MANIFEST)) {
    console.error('AndroidManifest.xml not found. Run "npx cap add android" first.');
    process.exit(1);
  }
  let m = fs.readFileSync(MANIFEST, 'utf8');
  if (!m.includes('android:screenOrientation')) {
    m = m.replace(
      /(<activity[\s\S]*?)(>)/m,
      (match, before, close) =>
        before +
        '\n            android:screenOrientation="landscape"' +
        '\n            android:keepScreenOn="true"' +
        close
    );
    console.log('  + Added landscape + keepScreenOn to AndroidManifest.xml');
  } else {
    console.log('  = AndroidManifest.xml already patched');
  }
  fs.writeFileSync(MANIFEST, m, 'utf8');
}

function patchStyles() {
  if (!fs.existsSync(STYLES)) {
    console.error('styles.xml not found. Run "npx cap add android" first.');
    process.exit(1);
  }
  let s = fs.readFileSync(STYLES, 'utf8');
  if (!s.includes('android:windowFullscreen')) {
    s = s.replace(
      /(<style\s+name="AppTheme\.NoActionBar"[^>]*>)/,
      (match) =>
        match +
        '\n        <item name="android:windowFullscreen">true</item>' +
        '\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>'
    );
    console.log('  + Added fullscreen theme to styles.xml');
  } else {
    console.log('  = styles.xml already patched');
  }
  fs.writeFileSync(STYLES, s, 'utf8');
}

console.log('Configuring Android project for handheld gaming...');
patchManifest();
patchStyles();
console.log('Done.');
```

---

## Step 9: Initialize and Patch the Android Project

```bash
# Creates android/ directory AND patches manifest/styles
npm run android:init
```

---

## Step 10: Patch `MainActivity.java` for Immersive Fullscreen

The setup script handles manifest and styles, but true immersive mode requires Java code. Replace the generated `MainActivity.java`:

**File:** `android/app/src/main/java/com/marco/YOUR_PACKAGE/MainActivity.java`

```java
package com.marco.YOUR_PACKAGE;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUI();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemUI();
    }

    private void hideSystemUI() {
        Window window = getWindow();

        // Draw behind system bars
        WindowCompat.setDecorFitsSystemWindows(window, false);

        // Hide status bar + nav bar with immersive sticky
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }

        // Legacy fallback
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            );
        }

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
```

**Important:** Change `package com.marco.YOUR_PACKAGE` to match your `appId` in `capacitor.config.json` (dots become the Java package path).

---

## Step 11: Fix AGP Version (if needed)

If Android Studio says "incompatible AGP version", open `android/build.gradle` and change the version:

```groovy
classpath 'com.android.tools.build:gradle:8.11.0'
```

Use whatever version your Android Studio supports.

---

## Step 12: Generate App Icons

From your project root, with a 1024x1024 `public/icon.png`:

```bash
SRC="public/icon.png"
RES="android/app/src/main/res"

for size_dir in "mdpi:48:108" "hdpi:72:162" "xhdpi:96:216" "xxhdpi:144:324" "xxxhdpi:192:432"; do
  IFS=: read dir launcher fg <<< "$size_dir"
  sips -z $launcher $launcher "$SRC" --out "$RES/mipmap-$dir/ic_launcher.png" 2>/dev/null
  cp "$RES/mipmap-$dir/ic_launcher.png" "$RES/mipmap-$dir/ic_launcher_round.png"
  sips -z $fg $fg "$SRC" --out "$RES/mipmap-$dir/ic_launcher_foreground.png" 2>/dev/null
done
```

Set the adaptive icon background color (edit `android/app/src/main/res/values/ic_launcher_background.xml`):

```xml
<color name="ic_launcher_background">#000000</color>
```

---

## Step 13: Build and Test

```bash
# Build web assets, copy android entry to index.html, sync to Android project
npm run android:build

# Open in Android Studio
npm run android:open
```

In Android Studio:

1. **Debug APK:** Build > Build Bundle(s) / APK(s) > Build APK(s)
   - Output: `android/app/build/outputs/apk/debug/app-debug.apk`

2. **Signed release APK:** Build > Generate Signed Bundle / APK > APK > select/create keystore > release
   - Output: `android/app/build/outputs/apk/release/app-release.apk`

---

## Testing on the RG406H

1. Copy the APK to the device via USB or SD card
2. Open a file manager on the device, tap the APK to install
3. Enable "Install from unknown sources" if prompted
4. Launch from the app drawer
5. Verify:
   - Game fills the screen (no status bar, no nav bar)
   - Landscape orientation is locked
   - D-pad controls movement
   - Left analog stick controls movement
   - Face buttons trigger the action
   - Screen doesn't dim/sleep during gameplay

---

## Per-Game Checklist

When porting a new game, you need to:

- [ ] Copy `src/handheld/` folder (unchanged)
- [ ] Create `android.html` (change `<title>` and `<script src>`)
- [ ] Copy `scripts/setup-android.js` (unchanged)
- [ ] Add `@capacitor/android` dependency
- [ ] Create `capacitor.config.json` (change `appId` and `appName`)
- [ ] Add the 4 npm scripts to `package.json`
- [ ] Add `android.html` to vite rollup inputs
- [ ] Add `initHandheld()` + `startInputBridge()` to your game's main entry
- [ ] Ensure your game scenes read `window.mobileInput` for controller input
- [ ] Run `npm run android:init`
- [ ] Replace `MainActivity.java` with immersive fullscreen version (change package name)
- [ ] Fix AGP version in `android/build.gradle` if needed
- [ ] Generate icons from your `public/icon.png`
- [ ] Set icon background color
- [ ] Run `npm run android:build`
- [ ] Build APK in Android Studio

---

## Known Risks / Fallback Plan

| Risk | Fallback |
|---|---|
| Gamepad API not detected in WebView | The input module includes keyboard fallback. Some handhelds map D-pad to arrow keys at the OS level, which works automatically. If the Gamepad API completely fails, a small native Capacitor plugin (~50 lines of Java) can forward Android `InputEvent` to JS. |
| Button indices don't match | Use `HandheldInput.configure({ actionButtons: [0, 2] })` to remap. Use `saveCalibration()` / `loadCalibration()` to persist. |
| WebView performance issues | Disable shader overlays. Phaser + WebGL should handle retro-resolution games fine. |
| `cap sync` overwrites native files | `cap sync` only touches web assets in `android/app/src/main/assets/public/`. It does NOT overwrite `MainActivity.java`, `AndroidManifest.xml`, or `styles.xml`. Your patches are safe. |
| AGP version mismatch after Capacitor update | Edit `android/build.gradle` to match your Android Studio's supported AGP version. |

---

## Architecture Summary

```
src/handheld/
  display.js    — Phaser config for pixel-perfect scaling + crisp CSS
  input.js      — Gamepad + keyboard polling, deadzone, D-pad, action mapping
  platform.js   — Fullscreen, orientation lock, wake lock (web APIs)
  index.js      — Bootstrap: init + input bridge to window.mobileInput

android.html    — Clean game entry point for the APK
scripts/setup-android.js — Patches Android manifest + styles (run once)

android/app/src/main/java/.../MainActivity.java — Immersive fullscreen (manual edit)
```

Desktop development is unaffected. The handheld modules detect Capacitor's native platform and only activate on Android. Keyboard input continues to work on desktop through Phaser's built-in keyboard system AND the input module's keyboard fallback.
