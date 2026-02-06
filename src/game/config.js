export const CONFIG = Object.freeze({
  NUM_LANES: 6,
  NUM_SEGMENTS: 7,
  MAX_DEPTH: 6,
  PLAYER_DEPTH: 0,
  VISUAL_OFFSET: 2,

  TICK_MS: 800,
  BULLET_TICK_MS: 200,
  FIRE_COOLDOWN_BULLET_TICKS: 1.5,

  R0: 249,
  SCALE_MIN: 0.05,
  SCALE_POWER: 0.5,
  ANGLE_OFFSET: -Math.PI / 3,

  WIDTH: 768,
  HEIGHT: 672,
  CENTER_X: 384,
  CENTER_Y: 381,

  COLORS: {
    BG: 0x000000,
    TUNNEL: 0x7cffb2,
    ENEMY: 0xff6644,
    BULLET: 0xaaffdd,
    SHIP: 0xffffff,
    HUD: '#7cffb2',
    WALL: 0xffcc44,
    TANK: 0x4488ff,
    TANK_DAMAGED: 0x88bbff,
    ACTIVE_LANE: 0xbbffdd,
    BOMB: 0xffdd44,
    HEART: 0xff4488,
    PHASE: 0xcc66ff,
    SPIRAL: 0x44ffdd,
  },

  WALL_Z_THICKNESS: 0.15,
  WALL_HEIGHT: 40,
  PHASE_DEPTH: 2,
});
