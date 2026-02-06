# Hexax — Vector Tunnel Shooter

80s arcade vector-aesthetic tunnel shooter inspired by Tempest. Phaser 3 + Vite, real 3D wireframe projection.

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
    ├── main.js                      # Phaser.Game factory (CANVAS mode, 768×672)
    ├── config.js                    # All constants (frozen object)
    ├── state/
    │   └── GameState.js             # worldRot, score, health, gameOver, fireCooldown, elapsedMs
    ├── entities/
    │   ├── Entity.js                # Base: lane, depth, type, alive, kill()
    │   ├── Enemy.js                 # type:'enemy', tick() → depth -= 1
    │   ├── Wall.js                  # type:'wall', tick() → depth -= 1
    │   ├── DoubleWall.js            # type:'doublewall', lane2 = (lane+1)%6, tick() → depth -= 1
    │   ├── Tank.js                  # type:'tank', hp=2, hit() decrements hp, hitSide for visual, tick() → depth -= 1
    │   ├── Bomb.js                  # type:'bomb', tick() → depth -= 1
    │   ├── Heart.js                 # type:'heart', tick() → depth -= 1
    │   ├── Bullet.js                # type:'bullet', prevDepth for lerp, tick() → depth += 1
    │   └── EntityManager.js         # Arrays: enemies[], bullets[], walls[], doublewalls[]
    ├── systems/
    │   ├── InputSystem.js           # Keyboard events → pending flags, consumed in update()
    │   ├── TickSystem.js            # Two Phaser timers: enemyTimer (800ms), bulletTimer (200ms)
    │   ├── CollisionSystem.js       # bullet×enemy grid check, tank HP, bomb chain, heart heal, onHit callback
    │   └── SpawnSystem.js           # Weighted random spawn with ramp
    ├── rendering/
    │   ├── GlowRenderer.js          # drawGlowLine, drawGlowPolygon, drawGlowDiamond, drawGlowClaw, drawGlowCircle, drawGlowEllipse, drawGlowArc
    │   ├── TunnelGeometry.js        # Real-time 3D projection: _computeVertex, _computeMidpoint, getVertexAtRadius
    │   ├── TunnelRenderer.js        # Wireframe hex rings + lane lines + active lane highlight
    │   ├── EntityRenderer.js        # Draws all entities: puck, tank dumbbell, bomb sphere, heart, walls, ship
    │   ├── ExplosionRenderer.js     # 16-particle burst with trailing lines, per-particle color
    │   └── TunnelExplosionRenderer.js # Death tunnel explosion effect
    ├── hud/
    │   └── HUD.js                   # Score text, health bar (10 segments), game over message
    ├── audio/
    │   └── SoundEngine.js           # Sound effects
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
- **Enemy timer** (`TICK_MS = 800ms`): moves enemies/walls/doublewalls, checks damage, spawns
- **Bullet timer** (`BULLET_TICK_MS = 200ms`): moves bullets, resolves collisions, decrements fire cooldown
- Both timers independently run collision checks (enemy may move into bullet, or vice versa)

### Smooth Visuals on Discrete Grid
- Rotation: 150ms linear interpolation via `_rotAngle`, applied to all geometry lookups
- Bullets: `prevDepth` + lerp using `bulletTimer.getProgress()` for smooth travel between rings
- Enemies: lerp using `enemyTimer.getProgress()` for smooth travel between rings

### Health System
- Player starts with **100 HP**
- Damage on entity reaching depth 0:
  - Regular enemy: **-10 HP**
  - Tank (full HP): **-20 HP**
  - Tank (damaged): **-10 HP**
  - Bomb: **-20 HP**
  - Heart: **-10 HP**
  - Wall on player lane: **-30 HP**
  - DoubleWall on player lane: **-30 HP**
- Game over when health reaches **0**
- An explosion spawns at the player position on each hit
- Walls/doublewalls on non-player lanes are dodged and removed (no damage)

---

## Entity Types

### Enemy (orange, `0xff6644`)
- Standard enemy, 1 HP, destroyed on any bullet hit
- Rendered as a 3D hockey puck (horizontal disc with foreshortened ellipses), base size 44 × scale
- Score: **+100**

### Wall (tunnel-colored, `0x7cffb2`)
- Indestructible, cannot be shot
- Rendered as 3D slab on one hex face with perpendicular height, front + back face + connecting edges
- Damage only if player is on that lane when it reaches depth 0; otherwise dodged and removed
- Score: none

### DoubleWall (tunnel-colored)
- Same as wall but spans 2 adjacent lanes (`lane` and `lane2 = (lane+1)%6`)
- Rendered as single continuous piece (one perpendicular for whole span, no middle divider lines)
- Damage if player is on either lane when it reaches depth 0
- Stored in separate `doublewalls[]` array in EntityManager

### Tank (blue, `0x4488ff`)
- 2 HP enemy — requires 2 bullet hits to destroy
- **HP 2**: rendered as O=O dumbbell — two 3D spheres (circle + meridian ellipse) connected by double bar
- **HP 1** (damaged): rendered as O= or =O (randomly chosen via `hitSide`), lighter blue (`0x88bbff`)
- Stored in `enemies[]` array, distinguished by `type === 'tank'`
- Score: **+50** per hit, **+200** on kill
- Explosions are blue for both hits

### Bomb (yellow, `0xffdd44`)
- Shooting it triggers chain explosion killing ALL alive enemies on screen (+100 per kill)
- Rendered as 3D sphere (circle + meridian ellipse) with 8 radiating spikes
- Stored in `enemies[]` array, distinguished by `type === 'bomb'`
- If it reaches player: **-20 HP damage**

### Heart (pink, `0xff4488`)
- Shooting it restores health to **100%** (full heal)
- Rendered as a wireframe heart shape laid flat (like the hockey puck, with perspective foreshortening)
- Stored in `enemies[]` array, distinguished by `type === 'heart'`
- If it reaches player without being shot: **-10 HP damage** (must shoot to get the heal)
- Spawn rate: **5%** (rare)

### Bullet (light green, `0xaaffdd`)
- Fires from player position (depth 0) down the current lane (`lane = worldRot`)
- Rate limited: `FIRE_COOLDOWN_BULLET_TICKS = 1.5` (300ms between shots)
- Additional limit: only one bullet per lane at a time
- Auto-killed when `depth > MAX_DEPTH`
- Rendered as small diamond with smooth depth interpolation

---

## Collision System

Grid-based only — if `bullet.depth === enemy.depth && bullet.lane === enemy.lane`:
- **Regular enemy**: kill both, +100, orange explosion
- **Tank (not dead)**: kill bullet only, call `tank.hit()`, +50, blue explosion, tank persists
- **Tank (killed)**: kill both, +200, blue explosion
- **Bomb**: kill bomb, +100, yellow explosion, then chain-kill ALL other alive enemies (+100 each, entity-colored explosions)
- **Heart**: kill heart, restore health to 100%, pink explosion
- `onHit(lane, depth, prevDepth, color)` callback triggers `ExplosionRenderer.spawn()` with entity-specific color

Walls and doublewalls are **not** in the collision check — they cannot be destroyed by bullets.

---

## Spawn System

Weighted random roll each spawn interval:
| Roll        | Entity     | Chance |
|-------------|------------|--------|
| 0.00–0.52   | Enemy      | 52%    |
| 0.52–0.65   | Wall       | 13%    |
| 0.65–0.74   | DoubleWall | 9%     |
| 0.74–0.84   | Tank       | 10%    |
| 0.84–0.95   | Bomb       | 11%    |
| 0.95–1.00   | Heart      | 5%     |

Spawn interval ramps with elapsed time (`SPAWN_RAMP`):
| Elapsed    | Ticks Between Spawns |
|------------|---------------------|
| 0s         | 4                   |
| 20s        | 3                   |
| 45s        | 2                   |
| 90s        | 1                   |

---

## Rendering

### 3D Projection
All geometry uses real 3D perspective projection. The `TunnelGeometry` class computes 3D hex vertices and projects them to screen coordinates in real-time:
- `_getScale(depth)` — perspective scale: `1.0 - (1.0 - SCALE_MIN) * (depth/MAX_DEPTH)^SCALE_POWER`
- `_project(x3d, y3d, z)` — perspective divide: `screen = center + world3D / z`
- `_computeVertex(depth, vertexIndex, rotAngle)` — hex vertex in 3D, projected to screen
- `_computeMidpoint(depth, laneIndex, rotAngle)` — midpoint between adjacent vertices
- `getVertexAtRadius(depth, vertexIndex, rotAngle, radiusFraction)` — vertex at arbitrary hex radius (for wall inner faces)

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
- `drawGlowClaw(gfx, cx, cy, size, color)` — 3-arm pinwheel with barbs at tips
- `drawGlowCircle(gfx, cx, cy, radius, color)` — circle outline
- `drawGlowEllipse(gfx, cx, cy, rx, ry, color, rotation)` — rotated ellipse outline
- `drawGlowArc(gfx, cx, cy, rx, ry, color, rotation, startAngle, endAngle)` — partial ellipse arc

### Entity Visuals
- **Enemy (puck)**: two full ellipses (front/back disc faces) + side connecting lines, tilt=0.35 foreshortening
- **Tank (dumbbell)**: two 3D spheres (circle + meridian ellipse) connected by double bar (= sign)
- **Bomb (spiked sphere)**: circle + meridian ellipse + 8 radial spike lines
- **Heart**: parametric heart curve laid flat with foreshortening, front + back face outlines + 3 connecting side lines
- **Walls**: 3D slabs with perpendicular height (`_wallPerp`), front face + back face + 4 connecting corner edges
- **DoubleWalls**: single continuous 3D slab spanning 2 faces, one perpendicular for whole span, 5 connecting edges
- **Ship**: gun turret design — base platform rectangle + tapered barrel trapezoid

### Wall Rendering Details
- `_wallPerp(v1, v2, height)` computes perpendicular offset pointing inward (toward tunnel center)
- Wall height scales with perspective: `CONFIG.WALL_HEIGHT * scale`
- Wall depth thickness: `CONFIG.WALL_Z_THICKNESS = 0.15`
- Both front and back faces are drawn (no hidden line removal for walls)

### HUD
- **Score**: top-left, "SCORE: N" in Hyperspace font, green (`0x7cffb2`)
- **Health bar**: top-right, "HEALTH" label + segmented bar
  - Outer stroked rectangle border
  - 10 segments with vertical divider lines (each = 10 HP)
  - Inner stroked rectangle (vector style, not filled) snaps to segment boundaries
  - Segments and divider lines disappear as health drops
  - Turns red when health ≤ 30
- **Game over**: centered "GAME OVER / Press R to Restart"

### Explosion Particles
- 16 particles per explosion, radial burst with random spread
- Each particle has its own color (matches entity type)
- Trailing line rendering, 600ms lifetime, drag decay
- Player-hit explosions spawn at player position (depth 0, bottom lane)

---

## Config Constants (`config.js`)

| Constant              | Value            | Notes                              |
|-----------------------|------------------|------------------------------------|
| `NUM_LANES`           | 6                |                                    |
| `NUM_SEGMENTS`        | 7                |                                    |
| `MAX_DEPTH`           | 6                | `NUM_SEGMENTS - 1`                 |
| `TICK_MS`             | 800              | Enemy/wall movement interval       |
| `BULLET_TICK_MS`      | 200              | Bullet movement interval           |
| `FIRE_COOLDOWN_BULLET_TICKS` | 1.5       | In bullet ticks (300ms)            |
| `R0`                  | 249              | Base hex radius                    |
| `SCALE_MIN`           | 0.05             | Smallest ring scale (far end)      |
| `SCALE_POWER`         | 0.5              | Perspective curve exponent         |
| `ANGLE_OFFSET`        | `-PI/3`          | Flat-bottom hex orientation        |
| `WIDTH × HEIGHT`      | 768 × 672        |                                    |
| `CENTER_X, CENTER_Y`  | 384, 381         | Tunnel vanishing point             |
| `WALL_Z_THICKNESS`    | 0.15             | Depth extent of wall blocks        |
| `WALL_HEIGHT`         | 40               | Pixel height of wall perpendicular |

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
| `BOMB`         | `0xffdd44` | Bomb (yellow)               |
| `HEART`        | `0xff4488` | Heart (pink)                |
| `HUD`          | `'#7cffb2'`| Score/health text (CSS string) |

---

## Gotchas & Pitfalls

- **Bullet initial depth = 0** (player position), not 1. The tick moves it to 1 before collision check.
- **Dead entities must be filtered** in tick loops (`if (e.alive)`) to avoid ticking killed entities.
- **`scene.restart()` creates all new instances** — no manual reset needed on subsystems.
- **Tank is stored in `enemies[]`**, not a separate array. Distinguished by `entity.type === 'tank'` and presence of `hp` / `hit()` method.
- **Bomb is stored in `enemies[]`**. Distinguished by `entity.type === 'bomb'`. Chain-kills all other enemies when shot.
- **Heart is stored in `enemies[]`**. Distinguished by `entity.type === 'heart'`. Must be shot to heal; damages player if it reaches depth 0.
- **DoubleWall has its own array** (`doublewalls[]`) separate from `walls[]`.
- **Walls/doublewalls cannot be shot** — CollisionSystem only checks `enemies[]` vs `bullets[]`.
- **`WALL` color constant exists but is unused** — wall rendering uses `TUNNEL` color for consistency with the tunnel wireframe.
- **Rotation direction mapping**: `rotateRight()` uses `+5` (mod 6), `rotateLeft()` uses `+1`. This is because visual direction is inverted from world rotation.
- **`InputSystem` uses `keydown` events** (not Phaser's `JustDown` polling), stored as pending flags consumed each frame.
- **Health bar uses stroked rectangles** (not filled) — consistent with vector screen aesthetic.
- **`onPlayerHit` callback** fires when entities deal damage to the player, triggering explosions at the player position.

---

## Game Loop Order

### Enemy Tick (every 800ms)
1. Remove dead enemies, walls, doublewalls from previous tick
2. Tick all alive enemies (depth -= 1)
3. Tick all alive walls (depth -= 1)
4. Tick all alive doublewalls (depth -= 1)
5. Notify ring flash (onEnemyMove callback)
6. Resolve collisions
7. Remove dead enemies (shot ones)
8. Damage checks: enemies at depth < 0 → apply type-specific damage, kill entity
9. Damage checks: walls at depth < 0 on player lane → -30 HP (else dodge/remove)
10. Damage checks: doublewalls at depth < 0 on player lane → -30 HP (else dodge/remove)
11. If health ≤ 0 → game over (onGameOver callback)
12. Maybe spawn new entity
13. Increment tickCount and elapsedMs

### Bullet Tick (every 200ms)
1. Remove dead bullets
2. Resolve collisions BEFORE moving (catch enemies at depth 0)
3. Remove dead enemies
4. Tick all alive bullets (depth += 1)
5. Resolve collisions AFTER moving (bullet moved into enemy)
6. Remove dead enemies immediately
7. Decrement fire cooldown

### Per-Frame Update
1. Process input (pending flags → rotation animation / fire)
2. Advance smooth rotation animation (150ms lerp)
3. Decay ring flash
4. Clear graphics
5. Update explosion particles
6. Draw tunnel → entities → explosions (skip if game over)
7. Draw explosion particles + tunnel explosion
8. Update HUD (score, health bar, game over text)

---

## Test Plan

1. **Rotate left/right**: tunnel + all entities rotate together smoothly
2. **Fire**: bullet travels straight down the current bottom lane
3. **Spawn**: enemies appear at far ring, approach at consistent cadence
4. **Collisions**: shooting regular enemies destroys both, +100 score
5. **Tank first hit**: tank changes from O=O to O= or =O, +50, blue explosion, tank persists
6. **Tank second hit**: tank destroyed, +200, blue explosion
7. **Wall dodge**: wall on non-player lane passes through harmlessly
8. **Wall hit**: wall on player lane at depth 0 deals 30 damage
9. **DoubleWall**: spans 2 adjacent lanes, must dodge to one of 4 free lanes
10. **Bomb shot**: chain explosion kills all enemies on screen, yellow + entity-colored explosions
11. **Bomb hit player**: -20 HP damage
12. **Heart shot**: health restores to 100%, pink explosion
13. **Heart hit player**: -10 HP damage (must shoot to heal)
14. **Health bar**: 10 segments, segments disappear on damage, turns red at ≤ 30 HP
15. **Game over**: health reaches 0, "GAME OVER" + R to restart, tunnel explosion
16. **Ramp**: spawn cadence increases over time (4→3→2→1 ticks)
17. **Explosion colors**: orange (enemy), blue (tank), yellow (bomb), pink (heart), green (wall)
