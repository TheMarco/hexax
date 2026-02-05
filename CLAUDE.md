# Hexax — Vector Tunnel Shooter

80s arcade vector-aesthetic tunnel shooter inspired by Tempest. Phaser 3 + Vite, pure 2D math, no 3D.

## Quick Start

```bash
npm install
npm run dev    # http://localhost:8080
npm run build  # production build to dist/
```

## Controls

| Key         | Action                        |
|-------------|-------------------------------|
| Left Arrow  | Rotate world left (60°)       |
| Right Arrow | Rotate world right (60°)      |
| Space       | Fire bullet                   |
| R           | Restart (game over screen)    |

---

## Architecture

### Tech Stack
- **Phaser 3.87** (Canvas renderer, additive blend mode)
- **Vite 6** dev server on port 8080
- ES modules, no TypeScript, no bundler plugins

### Entry Point
`index.html` → `src/main.js` → `src/game/main.js` (creates Phaser.Game) → `GameScene`

### File Structure

```
src/
├── main.js                          # Bootstrap: calls StartGame()
└── game/
    ├── main.js                      # Phaser.Game factory (CANVAS mode, 800×600)
    ├── config.js                    # All constants (frozen object)
    ├── state/
    │   └── GameState.js             # worldRot, score, gameOver, fireCooldown, elapsedMs
    ├── entities/
    │   ├── Entity.js                # Base: lane, depth, type, alive, kill()
    │   ├── Enemy.js                 # type:'enemy', tick() → depth -= 1
    │   ├── Wall.js                  # type:'wall', tick() → depth -= 1
    │   ├── DoubleWall.js            # type:'doublewall', lane2 = (lane+1)%6, tick() → depth -= 1
    │   ├── Tank.js                  # type:'tank', hp=2, hit() decrements hp, tick() → depth -= 1
    │   ├── Bullet.js                # type:'bullet', prevDepth for lerp, tick() → depth += 1
    │   └── EntityManager.js         # Arrays: enemies[], bullets[], walls[], doublewalls[]
    ├── systems/
    │   ├── InputSystem.js           # Keyboard events → pending flags, consumed in update()
    │   ├── TickSystem.js            # Two Phaser timers: enemyTimer (800ms), bulletTimer (200ms)
    │   ├── CollisionSystem.js       # bullet×enemy grid check, tank HP logic, score, onHit callback
    │   └── SpawnSystem.js           # Weighted random: 65% enemy, 15% wall, 10% doublewall, 10% tank
    ├── rendering/
    │   ├── GlowRenderer.js          # drawGlowLine, drawGlowPolygon, drawGlowDiamond, drawGlowClaw
    │   ├── TunnelGeometry.js        # Precomputed rings[], midpoints[], scales[] for hex tunnel
    │   ├── TunnelRenderer.js        # Wireframe hex rings + lane lines + active lane highlight
    │   ├── EntityRenderer.js        # Draws enemies, tanks, bullets, walls, doublewalls, ship
    │   └── ExplosionRenderer.js     # 16-particle burst with trailing lines, per-particle color
    ├── hud/
    │   └── HUD.js                   # Score text (top-left), game over message (centered)
    └── scenes/
        └── GameScene.js             # Single scene: create() wires everything, update() renders per-frame
```

---

## Core Mechanics

### Lanes & Rotation
- **6 lanes** (hex faces) indexed `0..5`
- Player ship is always visually at **render lane 0** (bottom of screen) — the ship never moves
- `worldRot` (0..5) tracks which logical lane aligns with the bottom
  - Right: `worldRot = (worldRot + 5) % 6`
  - Left: `worldRot = (worldRot + 1) % 6`
- Logical → visual: `renderLane = (logicalLane - worldRot + 6) % 6`

### Visual Offset
- `VISUAL_OFFSET = 2` maps renderLane 0 to the bottom of screen
- With `ANGLE_OFFSET = -PI/3` (flat-bottom hex), vertex index 2 is at bottom
- All rendering uses: `visualLane = (renderLane + VISUAL_OFFSET) % 6`

### Discrete Segments
- `NUM_SEGMENTS = 7` rings, `MAX_DEPTH = 6` (far end), `PLAYER_DEPTH = 0` (mouth)
- Enemies/walls spawn at `depth = MAX_DEPTH`, tick toward 0
- Bullets spawn at `depth = 0`, tick toward `MAX_DEPTH`
- All movement is discrete: 1 segment per tick

### Two-Timer System
- **Enemy timer** (`TICK_MS = 800ms`): moves enemies/walls/doublewalls, checks game-over, spawns
- **Bullet timer** (`BULLET_TICK_MS = 200ms`): moves bullets, resolves collisions, decrements fire cooldown
- Both timers independently run collision checks (enemy may move into bullet, or vice versa)

### Smooth Visuals on Discrete Grid
- Rotation: 150ms linear interpolation via `_rotAngle`, applied to all geometry lookups
- Bullets: `prevDepth` + lerp using `bulletTimer.getProgress()` for smooth travel between rings
- Enemies: no lerp (discrete jumps match the slow tick)

---

## Entity Types

### Enemy (orange, `0xff6644`)
- Standard enemy, 1 HP, destroyed on any bullet hit
- Rendered as 3-arm claw shape (`drawGlowClaw`), size 22 × scale
- Game over if reaches depth ≤ 0
- Score: **+100**

### Wall (tunnel-colored, `0x7cffb2`)
- Indestructible, cannot be shot
- Rendered as slab on one hex face: sides + inner edge + X diagonals
- Game over only if player is on that lane when it reaches depth 0; otherwise dodged and removed
- Score: none

### DoubleWall (tunnel-colored)
- Same as wall but spans 2 adjacent lanes (`lane` and `lane2 = (lane+1)%6`)
- Game over if player is on either lane when it reaches depth 0
- Stored in separate `doublewalls[]` array in EntityManager

### Tank (blue, `0x4488ff`)
- 2 HP enemy — requires 2 bullet hits to destroy
- **HP 2**: rendered as blue claw (`drawGlowClaw`)
- **HP 1** (damaged): rendered as cracked diamond with inner X lines, lighter blue (`0x88bbff`)
- Stored in `enemies[]` array (same as regular enemies), distinguished by `type === 'tank'`
- Game over if reaches depth ≤ 0 (same check as regular enemies)
- Score: **+50** per hit, **+200** on kill
- Explosions are blue for both hits

### Bullet (light green, `0xaaffdd`)
- Fires from player position (depth 0) down the current lane (`lane = worldRot`)
- Rate limited: `FIRE_COOLDOWN_BULLET_TICKS = 2` (400ms between shots)
- Additional limit: only one bullet per lane at a time
- Auto-killed when `depth > MAX_DEPTH`
- Rendered as small diamond with smooth depth interpolation

---

## Collision System

Grid-based only — if `bullet.depth === enemy.depth && bullet.lane === enemy.lane`:
- **Regular enemy**: kill both, +100, orange explosion
- **Tank (not dead)**: kill bullet only, call `tank.hit()`, +50, blue explosion, tank persists
- **Tank (killed)**: kill both, +200, blue explosion
- `onHit(lane, depth, color)` callback triggers `ExplosionRenderer.spawn()` with entity-specific color

Walls and doublewalls are **not** in the collision check — they cannot be destroyed by bullets.

---

## Spawn System

Weighted random roll each spawn interval:
| Roll        | Entity     | Chance |
|-------------|------------|--------|
| 0.00–0.65   | Enemy      | 65%    |
| 0.65–0.80   | Wall       | 15%    |
| 0.80–0.90   | DoubleWall | 10%    |
| 0.90–1.00   | Tank       | 10%    |

Spawn interval ramps with elapsed time (`SPAWN_RAMP`):
| Elapsed    | Ticks Between Spawns |
|------------|---------------------|
| 0s         | 4                   |
| 20s        | 3                   |
| 45s        | 2                   |
| 90s        | 1                   |

---

## Rendering

### Glow Effect (Vectrex-style)
All drawing uses 3-pass glow via `GLOW_PASSES`:
1. Width 6, alpha 0.15 (wide soft glow)
2. Width 3, alpha 0.4 (medium)
3. Width 1.2, alpha 1.0 (sharp core)

Additive blend mode (`Phaser.BlendModes.ADD`) on the single Graphics object.

### Drawing Functions (`GlowRenderer.js`)
- `drawGlowLine(gfx, x1, y1, x2, y2, color)` — single glowing line
- `drawGlowPolygon(gfx, points, color)` — closed polygon outline
- `drawGlowDiamond(gfx, cx, cy, size, color)` — 4-point diamond shape
- `drawGlowClaw(gfx, cx, cy, size, color)` — 3-arm pinwheel with barbs at tips (used for enemies/tanks)

### Tunnel Geometry (`TunnelGeometry.js`)
- Precomputes `scales[]` using power curve: `scale = 1.0 - (1.0 - SCALE_MIN) * t^SCALE_POWER`
- `rings[depth][vertex]` — 6 vertices per ring at `R0 * scale`
- `midpoints[depth][lane]` — edge midpoints (entity anchor positions)
- `getVertex()`, `getMidpoint()`, `getMidpointLerp()` all accept `rotAngle` for smooth rotation
- `_rotate(pt, angle)` rotates around `(CENTER_X, CENTER_Y)`

### Explosion Particles
- 16 particles per explosion, radial burst with random spread
- Each particle has its own color (matches entity type)
- Trailing line rendering, 600ms lifetime, drag decay

---

## Config Constants (`config.js`)

| Constant              | Value            | Notes                              |
|-----------------------|------------------|------------------------------------|
| `NUM_LANES`           | 6                |                                    |
| `NUM_SEGMENTS`        | 7                |                                    |
| `MAX_DEPTH`           | 6                | `NUM_SEGMENTS - 1`                 |
| `TICK_MS`             | 800              | Enemy/wall movement interval       |
| `BULLET_TICK_MS`      | 200              | Bullet movement interval           |
| `FIRE_COOLDOWN_BULLET_TICKS` | 2         | In bullet ticks (400ms)            |
| `R0`                  | 260              | Base hex radius                    |
| `SCALE_MIN`           | 0.05             | Smallest ring scale (far end)      |
| `SCALE_POWER`         | 0.5              | Perspective curve exponent         |
| `ANGLE_OFFSET`        | `-PI/3`          | Flat-bottom hex orientation        |
| `WIDTH × HEIGHT`      | 800 × 600        |                                    |
| `CENTER_X, CENTER_Y`  | 400, 340         | Tunnel vanishing point             |

### Colors (hex integers, except HUD)
| Key            | Value      | Used For                    |
|----------------|------------|-----------------------------|
| `BG`           | `0x000000` | Background                  |
| `TUNNEL`       | `0x7cffb2` | Tunnel lines, walls         |
| `ENEMY`        | `0xff6644` | Regular enemies (orange)    |
| `TANK`         | `0x4488ff` | Tank full HP (blue)         |
| `TANK_DAMAGED` | `0x88bbff` | Tank damaged HP (light blue)|
| `BULLET`       | `0xaaffdd` | Bullets                     |
| `SHIP`         | `0xffffff` | Player ship                 |
| `WALL`         | `0xffcc44` | (defined but walls use TUNNEL color in rendering) |
| `ACTIVE_LANE`  | `0xbbffdd` | Highlighted bottom face     |
| `HUD`          | `'#7cffb2'`| Score text (CSS string)     |

---

## Gotchas & Pitfalls

- **Bullet initial depth = 0** (player position), not 1. The tick moves it to 1 before collision check.
- **Dead entities must be filtered** in tick loops (`if (e.alive)`) to avoid ticking killed entities.
- **`scene.restart()` creates all new instances** — no manual reset needed on subsystems.
- **Tank is stored in `enemies[]`**, not a separate array. Distinguished by `entity.type === 'tank'` and presence of `hp` / `hit()` method.
- **DoubleWall has its own array** (`doublewalls[]`) separate from `walls[]`.
- **Walls/doublewalls cannot be shot** — CollisionSystem only checks `enemies[]` vs `bullets[]`.
- **`WALL` color constant exists but is unused** — wall rendering uses `TUNNEL` color for consistency with the tunnel wireframe.
- **Rotation direction mapping**: `rotateRight()` uses `+5` (mod 6), `rotateLeft()` uses `+1`. This is because visual direction is inverted from world rotation.
- **`InputSystem` uses `keydown` events** (not Phaser's `JustDown` polling), stored as pending flags consumed each frame.

---

## Game Loop Order

### Enemy Tick (every 800ms)
1. Remove dead enemies, walls, doublewalls from previous tick
2. Tick all alive enemies (depth -= 1)
3. Tick all alive walls (depth -= 1)
4. Tick all alive doublewalls (depth -= 1)
5. Resolve collisions
6. Check game-over: enemy at depth ≤ 0
7. Check game-over: wall at depth ≤ 0 on player's lane (else kill/dodge)
8. Check game-over: doublewall at depth ≤ 0 on either of its lanes (else kill/dodge)
9. Maybe spawn new entity
10. Increment tickCount and elapsedMs

### Bullet Tick (every 200ms)
1. Remove dead bullets
2. Tick all alive bullets (depth += 1)
3. Resolve collisions
4. Remove dead enemies immediately (explosion already spawned)
5. Decrement fire cooldown

### Per-Frame Update
1. Process input (pending flags → rotation animation / fire)
2. Advance smooth rotation animation (150ms lerp)
3. Clear graphics
4. Update explosion particles
5. Draw tunnel → entities → explosions
6. Update HUD text

---

## Test Plan

1. **Rotate left/right**: tunnel + all entities rotate together smoothly
2. **Fire**: bullet travels straight down the current bottom lane
3. **Spawn**: enemies appear at far ring, approach at consistent cadence
4. **Collisions**: shooting regular enemies destroys both, +100 score
5. **Tank first hit**: tank changes from blue claw to cracked diamond, +50, blue explosion, tank persists
6. **Tank second hit**: tank destroyed, +200, blue explosion
7. **Wall dodge**: wall on non-player lane passes through harmlessly
8. **Wall hit**: wall on player lane at depth 0 triggers game over
9. **DoubleWall**: spans 2 adjacent lanes, must dodge to one of 4 free lanes
10. **Ramp**: spawn cadence increases over time (4→3→2→1 ticks)
11. **Game over**: enemy/wall reaches depth 0 appropriately, "GAME OVER" + R to restart
12. **Explosion colors**: orange for enemies, blue for tanks
