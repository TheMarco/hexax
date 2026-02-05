export const CONFIG = Object.freeze({
  NUM_LANES: 6,
  NUM_SEGMENTS: 7,
  MAX_DEPTH: 6, // NUM_SEGMENTS - 1
  PLAYER_DEPTH: 0,

  TICK_MS: 800,

  R0: 260,
  SCALE_MIN: 0.05,
  SCALE_POWER: 0.5,
  ANGLE_OFFSET: -Math.PI / 3, // flat-bottom hex (30° from pointy-top)

  WIDTH: 800,
  HEIGHT: 600,
  CENTER_X: 400,
  CENTER_Y: 340, // slightly below center

  BULLET_TICK_MS: 200, // bullets move 1 segment per this interval
  FIRE_COOLDOWN_BULLET_TICKS: 2, // cooldown in bullet ticks (400ms)

  // Spawn ramp: [elapsed_ms_threshold, ticks_between_spawns]
  SPAWN_RAMP: [
    [0, 4],
    [20000, 3],
    [45000, 2],
    [90000, 1],
  ],

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
  },
});
