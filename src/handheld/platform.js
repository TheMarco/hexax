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
