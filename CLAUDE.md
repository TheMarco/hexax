# Hexax — Vector Tunnel Shooter

80s arcade vector-aesthetic tunnel shooter inspired by Tempest. Phaser 3 + Vite, real 3D wireframe projection.

## Quick Start

```bash
npm install
npm run dev    # http://localhost:8080
npm run build  # production build to dist/
```

## Controls

### Desktop
| Key         | Action                        |
|-------------|-------------------------------|
| Left Arrow  | Rotate world left (60°)       |
| Right Arrow | Rotate world right (60°)      |
| Space       | Fire bullet / Restart         |

### Mobile
Touch controls via backdrop cabinet (`backdropnew.png`):
- **LEFT / RIGHT** buttons: rotate
- **FIRE** button: fire / start game / restart on game over
- **DISPLAY MODE** button: toggle CRT ↔ Vector shader

---

## Architecture

### Tech Stack
- **Phaser 3.87** (Canvas renderer, additive blend mode)
- **Vite 6** dev server on port 8080
- ES modules, no TypeScript, no bundler plugins

### Entry Point
`index.html` → `src/main.js` → `src/game/main.js` (creates Phaser.Game) → `TitleScene` → `GameScene`

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
    │   ├── PhaseEnemy.js            # type:'phase', shielded→vulnerable at depth ≤ 2, tick() → depth -= 1
    │   ├── SpiralEnemy.js           # type:'spiral', changes lane every 2 ticks, tick() → depth -= 1
    │   ├── Bullet.js                # type:'bullet', prevDepth for lerp, tick() → depth += 1
    │   └── EntityManager.js         # Arrays: enemies[], bullets[], walls[], doublewalls[]
    ├── systems/
    │   ├── InputSystem.js           # FIFO input queue (max 4), rotations block until animation completes
    │   ├── TickSystem.js            # Two Phaser timers: enemyTimer (dynamic), bulletTimer (200ms)
    │   ├── CollisionSystem.js       # bullet×wall deflect, bullet×enemy grid check, tank HP, bomb chain, heart heal
    │   └── SpawnSystem.js           # Weighted spawn with entity gating, wall density cap, pattern moments
    ├── rendering/
    │   ├── GlowRenderer.js          # drawGlowLine, drawGlowPolygon, drawGlowDiamond, drawGlowClaw, drawGlowCircle, drawGlowEllipse, drawGlowArc
    │   ├── TunnelGeometry.js        # Real-time 3D projection: _computeVertex, _computeMidpoint, getVertexAtRadius
    │   ├── TunnelRenderer.js        # Wireframe hex rings + lane lines + active lane highlight
    │   ├── EntityRenderer.js        # Draws all entities: puck, tank dumbbell, bomb sphere, heart, walls, ship
    │   ├── ExplosionRenderer.js     # 16-particle burst with trailing lines, per-particle color
    │   └── TunnelExplosionRenderer.js # Death tunnel explosion effect
    ├── hud/
    │   └── HUD.js                   # Score text, multiplier, health bar (10 segments), warnings, game over
    ├── audio/
    │   └── SoundEngine.js           # Web Audio API: SFX + looping music, iOS AudioContext resume
    └── scenes/
        ├── TitleScene.js            # Title screen: animated hex grid, press space/fire to start
        └── GameScene.js             # Main scene: create() wires everything, update() renders per-frame
```

### Other Key Files
```
src/game/shaderOverlay.js            # WebGL post-processing: CRT + Vector display shaders, phosphor persistence
index.html                           # Desktop + mobile cabinet layout, touch zones
public/backdropnew.png               # Mobile arcade cabinet backdrop image
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

### Input Queue
- FIFO queue (max 4 deep) — `left`, `right`, `fire` actions queued from keyboard/touch
- Rotations block queue processing until animation completes (ensures left→space fires in the new lane)
- Fire is instant and doesn't block — queue continues draining after fire
- On mobile: synthetic keyboard events dispatched from touch zones via `window.dispatchEvent()`

### Two-Timer System
- **Enemy timer** (starts `TICK_MS = 800ms`, speeds up to `500ms` over ~2.5 min): moves enemies/walls/doublewalls, checks damage, spawns
- **Bullet timer** (`BULLET_TICK_MS = 200ms`): moves bullets, resolves collisions, decrements fire cooldown
- Both timers independently run collision checks (enemy may move into bullet, or vice versa)
- Enemy tick speed: `TICK_MS - (TICK_MS - 500) * min(1, secs/240)` (linear decay over 4 minutes)

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
  - Phase/Spiral: **-10 HP**
- Game over when health reaches **0**
- An explosion spawns at the player position on each hit
- Walls/doublewalls on non-player lanes are dodged and removed (no damage)

### Segment Damage (Tunnel Integrity)
- Each of the 6 tunnel segments tracks damage separately
- When an enemy (not a heart) reaches the player, that lane's segment is marked as damaged
- **First hit on a segment**: visual damage indicator on tunnel
- **Second hit on same segment**: **instant death** regardless of remaining HP
- Hearts repair ALL damaged segments when collected (shot)
- HUD warnings: "HEXAX INTEGRITY COMPROMISED!" on first damage, "HEXAX INTEGRITY CRITICAL!" at 4+ damaged segments

### Wall Escalation (3-tier)
Walls on the player lane use a cumulative `wallHits` counter:
- **Tier 1** (1st hit): **-30 HP**, HUD shows "WARNING", tunnel flash + wobble
- **Tier 2** (2nd hit): **-60 HP**, HUD shows "STRUCTURE CRITICAL", bigger flash + wobble + health bar pulse
- **Tier 3** (3rd hit): **instant death** regardless of remaining HP
- Resets score multiplier to 1.0 (also resets on any enemy reaching player)

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
- Shooting it restores health to **100%** (full heal) and repairs all damaged tunnel segments
- Rendered as a wireframe heart shape laid flat (like the hockey puck, with perspective foreshortening)
- Stored in `enemies[]` array, distinguished by `type === 'heart'`
- If it reaches player without being shot: **-10 HP damage** (must shoot to get the heal)

### Phase Enemy (purple, `0xcc66ff`)
- **Shielded state** at depths > `PHASE_DEPTH` (2) — bullets deflect off like walls (plays wall deflect sound)
- **Vulnerable state** at depth ≤ 2 — can be shot like a regular enemy
- Rendered as dashed puck when shielded, solid puck when vulnerable
- White flash on shield deflect and on phase transition
- Stored in `enemies[]` array, distinguished by `type === 'phase'`
- Score: **+100** (when vulnerable)

### Spiral Enemy (cyan, `0x44ffdd`)
- Moves diagonally — advances 1 depth per tick AND changes lane every 2 ticks
- Random spin direction (clockwise or counter-clockwise) set at spawn
- Rendered as orb with directional arrow indicating spin direction
- Tracks `prevLane` for smooth visual lane interpolation
- Stored in `enemies[]` array, distinguished by `type === 'spiral'`
- Score: **+100**

### Bullet (light green, `0xaaffdd`)
- Fires from player position (depth 0) down the current lane (`lane = worldRot`)
- Rate limited: `FIRE_COOLDOWN_BULLET_TICKS = 1.5` (effectively 400ms — 2 bullet ticks due to integer decrement)
- Auto-killed when `depth > MAX_DEPTH`
- Rendered as small diamond with smooth depth interpolation

---

## Collision System

Collision checks happen in order: walls → doublewalls → enemies.

### Bullet vs Wall/DoubleWall
- Bullet is destroyed, wall/doublewall is unharmed
- `hitFlash` set to 1.0 on the wall, decays at rate 4/s — wall renders at full brightness TUNNEL color briefly
- `onWallDeflect` callback plays `hitwall.mp3`

### Bullet vs Enemy
Grid-based — if `floor(bullet.depth) === enemy.depth && bullet.lane === enemy.lane`:
- **Regular enemy**: kill both, +100 × multiplier, orange explosion
- **Tank (not dead)**: kill bullet only, call `tank.hit()`, +50 × multiplier, blue explosion, tank persists
- **Tank (killed)**: kill both, +200 × multiplier, blue explosion
- **Phase (shielded)**: bullet deflected like a wall (hitFlash, wall deflect sound), phase enemy unharmed
- **Phase (vulnerable)**: kill both, +100 × multiplier, purple explosion
- **Spiral**: kill both, +100 × multiplier, cyan explosion
- **Bomb**: kill bomb, +100 × multiplier, yellow explosion, then chain-kill ALL other alive enemies (+100 each). Multiplier bumps +0.5
- **Heart**: kill heart, restore health to 100%, repair all segments, pink explosion, plays `heart.mp3`
- **Distance bonus**: kills at depth ≥ 4 get **+50%** score
- `onHit(lane, depth, prevDepth, color)` callback triggers `ExplosionRenderer.spawn()` at the enemy's current lane position

### Score Multiplier
- Starts at 1.0, max 4.0
- +0.1 per enemy kill (regular, tank, phase, spiral), +0.5 per bomb chain
- **Resets to 1.0** on any player hit (wall or enemy reaching depth 0)
- Displayed in HUD when > 1.0

---

## Spawn System

### Weighted Spawn Pool
| Entity     | Weight   | Notes                                          |
|------------|----------|-------------------------------------------------|
| Enemy      | 55       | Available from start                            |
| Wall       | 14       | Unlocks at 20s                                  |
| Tank       | 11       | Unlocks at 15s                                  |
| DoubleWall | 9        | Unlocks at 70s                                  |
| Bomb       | 9        | Unlocks at 100s                                 |
| Heart      | 2→12     | Unlocks at 100s, weight ramps up over time      |
| Phase      | 10       | Unlocks at 15s                                  |
| Spiral     | 16→55    | Unlocks at 70s, weight ramps up over time       |

Weights are normalized among unlocked types only. Hearts are excluded when health ≥ 80.

### Spawn Interval
Formula: `3.5 - 2.5 * min(1, secs / 300)` — fractional ticks between spawns (budget accumulator).
| Elapsed    | Ticks Between Spawns |
|------------|---------------------|
| 0s         | 3.5                 |
| 60s        | 3.0                 |
| 150s       | 2.25                |
| 300s       | 1.0                 |

### Wall Density Cap
Max active walls (wall + doublewall): `min(1 + floor(secs / 35), 4)`. If capped, walls/doublewalls excluded from spawn pool.

### Pattern Moments
Every 30-45 seconds (real time, ms-based), a pattern activates for 6-10 seconds:
- **Adjacent**: 60% chance to spawn walls on successive adjacent lanes (forming wall formations)
- **Spiral**: lanes increment mod 6 each spawn
- **Gap**: one guaranteed safe lane
- **Enemy Rush**: enemies only (no walls/tanks/bombs)

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
- **Phase (puck/dashed puck)**: dashed ellipses when shielded, solid puck when vulnerable, white flash on transition
- **Spiral (orb + arrow)**: circle with tangent arrow showing spin direction
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
- **Game over**: centered "GAME OVER / Press Fire to Restart"

### Tunnel Dimming (Vector mode)
- Tunnel lines render at 50% brightness (`TUNNEL_DIM`, `ACTIVE_LANE_DIM` constants)
- Walls also render dimmed (`WALL_COLOR` = 50% TUNNEL) unless hit-flashing
- Ring flash alpha at 0.35 (reduced from full)

### Explosion Particles
- 16 particles per explosion, radial burst with random spread
- Each particle has its own color (matches entity type)
- Trailing line rendering, 600ms lifetime, drag decay
- Player-hit explosions spawn at player position (depth 0, bottom lane)

### Wobble Effect
- Triggered on wall hits — brief rotational shake (150ms)
- `wobbleOffset` added to `effectiveRotAngle` for all rendering
- Tier 2+ wall hits get double amplitude

---

## Display Shaders (`shaderOverlay.js`)

WebGL post-processing overlay canvas, positioned over the Phaser game canvas via `getBoundingClientRect()`.

### CRT Mode
- Barrel distortion (curvature)
- Scanlines aligned to 224 virtual pixel rows
- 5-tap max-sample within virtual pixels (catches thin lines)
- Bloom at virtual-pixel scale
- RGB phosphor mask, vignette, noise, brightness flicker
- Rounded corners

### Vector Mode
- P31 cyan-blue phosphor color mapping (`phosphor()` function)
- White hot cores at peak brightness
- Edge beam defocus (wider sampling near screen edges)
- Phosphor grain texture
- Faint blue background hue with subtle brightness variation (simulates phosphor glass tint)
- Glass surface reflection highlight
- **Phosphor persistence**: ping-pong FBO with configurable decay
  - Normal: `u_phosphorDecay = 0.78` (visible ghosting trails)
  - During rotation: `u_phosphorDecay = 0.1` (near-instant decay to prevent smearing)
  - Controlled dynamically from `GameScene` via `game.registry.get('shaderOverlay').setPhosphorDecay()`

---

## Audio System (`SoundEngine.js`)

Web Audio API with separate gain nodes:
- **Master gain**: 0.5 → destination
- **SFX gain**: 0.3 → master (for one-shot sounds)
- **Music gain**: 1.0 → master (for looping soundtrack)

### Sound Effects
| Sound       | File                | Trigger                    |
|-------------|---------------------|----------------------------|
| getready    | `/sounds/getready.mp3`  | Game start (500ms delay)   |
| twist       | `/sounds/twist.mp3`    | Rotation                   |
| shoot       | `/sounds/shoot.mp3`    | Bullet fired               |
| explosion   | `/sounds/explode.mp3`  | Enemy/entity killed        |
| death       | `/sounds/death.mp3`    | Game over tunnel explosion |
| hitwall     | `/sounds/hitwall.mp3`  | Bullet hits wall           |
| heart       | `/sounds/heart.mp3`    | Heart collected (shot)     |
| soundtrack  | `/sounds/soundtrack.mp3` | Looping background music |

### Music
- Starts 2 seconds into GameScene (after "get ready" sound)
- Loops continuously during gameplay
- Stops on game over
- `stopMusic()` also called on scene restart to clean up

### iOS Audio
- `AudioContext` created on first user gesture (touchstart/touchend/click/keydown) via listener in `main.js`
- SoundEngine stored in `game.registry` — shared across scene restarts
- `ctx.resume()` called defensively before every `playSound()` and `startMusic()`

---

## Config Constants (`config.js`)

| Constant              | Value            | Notes                              |
|-----------------------|------------------|------------------------------------|
| `NUM_LANES`           | 6                |                                    |
| `NUM_SEGMENTS`        | 7                |                                    |
| `MAX_DEPTH`           | 6                | `NUM_SEGMENTS - 1`                 |
| `TICK_MS`             | 800              | Enemy/wall movement interval       |
| `BULLET_TICK_MS`      | 200              | Bullet movement interval           |
| `FIRE_COOLDOWN_BULLET_TICKS` | 1.5       | Effectively 2 bullet ticks (400ms) |
| `R0`                  | 300              | Base hex radius                    |
| `SCALE_MIN`           | 0.05             | Smallest ring scale (far end)      |
| `SCALE_POWER`         | 0.5              | Perspective curve exponent         |
| `ANGLE_OFFSET`        | `-PI/3`          | Flat-bottom hex orientation        |
| `WIDTH × HEIGHT`      | 768 × 672        |                                    |
| `CENTER_X, CENTER_Y`  | 384, 355         | Tunnel vanishing point             |
| `WALL_Z_THICKNESS`    | 0.15             | Depth extent of wall blocks        |
| `WALL_HEIGHT`         | 48               | Pixel height of wall perpendicular |
| `PHASE_DEPTH`         | 2                | Depth at which phase enemy becomes vulnerable |

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
| `PHASE`        | `0xcc66ff` | Phase enemy (purple)        |
| `SPIRAL`       | `0x44ffdd` | Spiral enemy (cyan)         |
| `HUD`          | `'#7cffb2'`| Score/health text (CSS string) |

---

## Mobile Support

### Detection
`'ontouchstart' in window || navigator.maxTouchPoints > 0` in `main.js`.

### Cabinet Layout
- `backdropnew.png` (1536×2752) shown full-width as arcade cabinet backdrop
- Desktop elements (`#game-container`, `#shader-toggle`) hidden
- Phaser game parented into `#cabinet-screen` div positioned over the backdrop's screen area
- Canvas scaled via `width: 100% !important; height: auto !important`
- Body centered vertically (`justify-content: center`)

### Touch Zones
Invisible absolutely-positioned divs over the backdrop's button artwork:
- `#touch-left` — dispatches ArrowLeft keydown
- `#touch-fire` — dispatches Space keydown (starts game, fires, restarts)
- `#touch-right` — dispatches ArrowRight keydown
- `#touch-display` — toggles CRT ↔ Vector shader
- All use `touchstart` with `preventDefault()` to avoid scrolling/zooming
- Viewport locked: `maximum-scale=1.0, user-scalable=no`

---

## Gotchas & Pitfalls

- **Bullet initial depth = 0** (player position). The tick moves it to 1 before the post-move collision check, but the pre-move check catches enemies at depth 0.
- **Dead entities must be filtered** in tick loops (`if (e.alive)`) to avoid ticking killed entities.
- **`scene.restart()` creates all new instances** — no manual reset needed on subsystems.
- **Tank is stored in `enemies[]`**, not a separate array. Distinguished by `entity.type === 'tank'` and presence of `hp` / `hit()` method.
- **Bomb is stored in `enemies[]`**. Distinguished by `entity.type === 'bomb'`. Chain-kills all other enemies when shot.
- **Heart is stored in `enemies[]`**. Distinguished by `entity.type === 'heart'`. Must be shot to heal; damages player if it reaches depth 0. Also repairs all damaged tunnel segments when collected.
- **Phase enemy is stored in `enemies[]`**. Distinguished by `entity.type === 'phase'`. Shielded at depth > 2, vulnerable at depth ≤ 2. Bullets deflect off shielded state.
- **Spiral enemy is stored in `enemies[]`**. Distinguished by `entity.type === 'spiral'`. Changes lane every 2 ticks. Has `prevLane` for visual interpolation.
- **DoubleWall has its own array** (`doublewalls[]`) separate from `walls[]`.
- **Walls/doublewalls cannot be shot** — CollisionSystem only checks `enemies[]` vs `bullets[]`.
- **`WALL` color constant exists but is unused** — wall rendering uses `TUNNEL` color for consistency with the tunnel wireframe.
- **Rotation direction mapping**: `rotateRight()` uses `+5` (mod 6), `rotateLeft()` uses `+1`. This is because visual direction is inverted from world rotation.
- **InputSystem uses a FIFO queue** (max 4), not boolean flags. Rotations block the queue until animation completes.
- **Health bar uses stroked rectangles** (not filled) — consistent with vector screen aesthetic.
- **`onPlayerHit` callback** fires when entities deal damage to the player, triggering explosions at the player position.
- **Bullets are stopped by walls** — CollisionSystem checks walls/doublewalls before enemies. Wall gets hitFlash, bullet is killed.
- **SoundEngine is shared** — created once in `main.js`, stored in `game.registry`, survives scene restarts. AudioContext must be created during a user gesture for iOS. Accessed as `this.soundEngine` in GameScene (not `this.sound`, which is Phaser's built-in SoundManager).
- **Phosphor decay is dynamic** — set to 0.1 during rotation (prevents smearing), restored to 0.78 when done.
- **Wall escalation is cumulative** — `wallHits` counter persists for the entire game, 3rd wall hit = instant death.
- **`getMidpointLerp` can return null** for negative depth — always guard with `if (!pos) return;` in callbacks.
- **Spawn happens before movement** in `_onEnemyTick` so entities move immediately on their spawn tick.
- **Segment damage is cumulative** — each lane tracks damage independently. Second hit on same lane = instant death. Hearts repair all segments.
- **Pattern timing is ms-based** — uses `state.elapsedMs` timestamps, not tick counts, so pattern durations are consistent regardless of tick speed changes.

---

## Game Loop Order

### Enemy Tick (dynamic: 800ms → 500ms)
1. Remove dead enemies, walls, doublewalls from previous tick
2. Maybe spawn new entity (spawn before movement so entities move immediately)
3. Tick all alive enemies (depth -= 1)
4. Tick all alive walls (depth -= 1)
5. Tick all alive doublewalls (depth -= 1)
6. Notify ring flash (onEnemyMove callback)
7. Resolve collisions (bullet vs wall deflect, bullet vs enemy)
8. Remove dead enemies (shot ones)
9. Damage checks: enemies at depth < 0 → segment damage (non-hearts) + apply type-specific HP damage, kill entity
10. Damage checks: walls at depth < 0 on player lane → wall escalation (else dodge/remove)
11. Damage checks: doublewalls at depth < 0 on player lane → wall escalation (else dodge/remove)
12. If health ≤ 0 → game over (onGameOver callback, stop music)
13. Increment tickCount and elapsedMs
14. Update enemy tick speed (gradually faster)

### Bullet Tick (every 200ms)
1. Remove dead bullets
2. Resolve collisions BEFORE moving (catch enemies at depth 0)
3. Remove dead enemies
4. Tick all alive bullets (depth += 1)
5. Resolve collisions AFTER moving (bullet moved into enemy)
6. Remove dead enemies immediately
7. Decrement fire cooldown

### Per-Frame Update
1. Process input queue (rotations block queue, fire is instant)
2. Advance smooth rotation animation (150ms lerp) + set phosphor decay
3. Update wobble overlay
4. Decay ring flash + wall hitFlash
5. Clear graphics
6. Update explosion particles
7. Draw tunnel → entities → explosions (skip if game over)
8. Draw explosion particles + tunnel explosion
9. Update HUD (score, multiplier, health bar, warnings, game over text)

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
15. **Wall escalation**: 1st wall = -30, 2nd = -60, 3rd = instant death, with warnings
16. **Bullet vs wall**: bullet destroyed, wall flashes bright, hitwall sound plays
17. **Game over**: health reaches 0, "GAME OVER" + Space/Fire to restart, tunnel explosion, music stops
18. **Ramp**: spawn cadence increases over time (3.5→1 ticks), tick speed increases (800→500ms)
19. **Entity gating**: tanks/phase at 15s, walls at 20s, doublewalls/spirals at 70s, bombs/hearts at 100s
20. **Score multiplier**: increments on kills (including tanks), displayed in HUD, resets on wall hit
21. **Explosion colors**: orange (enemy), blue (tank), yellow (bomb), pink (heart), purple (phase), cyan (spiral), white (wall)
22. **Input queuing**: left→space fires in the turned lane, not the departing lane
23. **Mobile**: backdrop cabinet, touch zones, display mode toggle, audio works on iOS
24. **Display shaders**: CRT mode (scanlines, bloom), Vector mode (phosphor, persistence, blue hue)
25. **Phase enemy**: shielded at depth > 2 (deflects bullets), vulnerable at depth ≤ 2
26. **Spiral enemy**: changes lanes while approaching, arrow shows direction
27. **Segment damage**: enemy reaching player damages segment, second hit on same segment = instant death
28. **Heart segment repair**: shooting heart repairs all damaged segments
