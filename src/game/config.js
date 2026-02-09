export const CONFIG = Object.freeze({
  NUM_LANES: 6,
  NUM_SEGMENTS: 7,
  MAX_DEPTH: 6,
  PLAYER_DEPTH: 0,
  VISUAL_OFFSET: 2,

  TICK_MS: 800,
  BULLET_TICK_MS: 200,
  FIRE_COOLDOWN_BULLET_TICKS: 1.5,

  R0: 300,
  SCALE_MIN: 0.05,
  SCALE_POWER: 0.5,
  ANGLE_OFFSET: -Math.PI / 3,

  WIDTH: 768,
  HEIGHT: 672,
  CENTER_X: 384,
  CENTER_Y: 355,

  COLORS: {
    BG: 0x000000,
    TUNNEL: 0x7cffb2,
    ENEMY: 0xff6644,
    BULLET: 0xaaffdd,
    SHIP: 0x7cffb2,    // Match tunnel wireframe brightness
    HUD: '#7cffb2',
    WALL: 0xff4444,        // Red
    TANK: 0xffc688,        // Peachy orange (G=198 ensures overlap with tunnel stays under green-dominant threshold)
    TANK_DAMAGED: 0xffc688, // Peachy orange
    ACTIVE_LANE: 0xbbffdd,
    BOMB: 0xffdd44,
    HEART: 0xff4488,
    PHASE: 0xcc66ff,
    SPIRAL: 0xff66ff,      // Light magenta (former tank color)
  },

  WALL_Z_THICKNESS: 0.15,
  WALL_HEIGHT: 48,
  PHASE_DEPTH: 2,
  SPIRAL_LANE_SPEED: 3,
});
