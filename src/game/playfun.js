const GAME_ID = 'd8ff06b7-76f6-4577-9eb7-2560fea24c69';

let sdk = null;
let lastScore = 0;

export async function initPlayFun() {
  if (typeof OpenGameSDK === 'undefined') return;
  sdk = new OpenGameSDK({ ui: { usePointsWidget: true } });
  await sdk.init({ gameId: GAME_ID });
}

export function resetPlayFunScore() {
  lastScore = 0;
}

export function syncPlayFunScore(currentScore) {
  if (!sdk) return;
  const delta = currentScore - lastScore;
  if (delta > 0) {
    sdk.addPoints(delta);
    lastScore = currentScore;
  }
}

export async function endPlayFunGame() {
  if (!sdk) return;
  try {
    await sdk.endGame();
  } catch (_) { /* ignore save failures */ }
}
