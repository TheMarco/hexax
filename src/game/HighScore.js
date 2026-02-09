/**
 * High score manager using localStorage
 */

const HIGH_SCORE_KEY = 'hexax_high_score';

export class HighScore {
  static get() {
    const stored = localStorage.getItem(HIGH_SCORE_KEY);
    return stored ? parseInt(stored, 10) : 0;
  }

  static set(score) {
    localStorage.setItem(HIGH_SCORE_KEY, score.toString());
  }

  static check(score) {
    const current = HighScore.get();
    if (score > current) {
      HighScore.set(score);
      return true; // New high score!
    }
    return false;
  }
}
