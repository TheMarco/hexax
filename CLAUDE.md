
---

## Gameplay Model (Core Mechanics)

### Lanes & Rotation
There are **6 lanes** (walls) indexed `0..5` around the tunnel.

The player is always considered to be on **render lane 0**, because the ship never moves.
Instead, the **world rotation index** changes:

- `worldRot` in `0..5`
- Right: `worldRot = (worldRot + 1) % 6`
- Left:  `worldRot = (worldRot + 5) % 6`

Objects have a **logical lane** `lane` (0..5).
At render time, map them to a visible lane:
- `renderLane = (lane - worldRot + 6) % 6`

That makes everything “rotate with the tunnel.”

### Discrete Segments
Define `NUM_SEGMENTS` rings (e.g. 9).
Define `MAX_DEPTH = NUM_SEGMENTS - 1` (far end).
Define `PLAYER_DEPTH = 0` (closest ring / mouth of tunnel).

Enemies spawn at `depth = MAX_DEPTH` and tick toward `0`.
Bullets spawn near the player and tick away toward `MAX_DEPTH`.

Movement is discrete:
- Each tick: `enemy.depth -= 1`
- Each tick: `bullet.depth += 1`

### Collision
On each tick, resolve:
1. Bullet–enemy hits:
   - If `bullet.depth === enemy.depth` AND `bullet.lane === enemy.lane` → destroy both, +score.
2. Enemy reaches player:
   - If any enemy `depth <= 0` → game over (or reset).

No physics, no hitboxes. Grid logic only.

---

## Rendering Requirements (Vector Tunnel)

### Tunnel Geometry
Render a tunnel as a stack of shrinking hexagons centered at `(cx, cy)`.

- Compute `scales[]` length = `NUM_SEGMENTS`.
- `scales[0]` is largest (closest), `scales[last]` smallest (far end).
- Use a base radius `R0` (e.g. 260) and `radius = R0 * scales[i]`.
- For each ring `i`, compute 6 points:
  - Use angles `i*60°` with an offset so a flat face is at the bottom.
  - Recommend angle offset: `-90°` so one vertex points up; or adjust until the “bottom face” looks right. Keep it consistent.

#### Draw:
1. For each ring: draw the hex perimeter (6 edges).
2. For each lane index `k` in 0..5: connect ring `i` point `k` to ring `i+1` point `k`.

This produces a clear wireframe tunnel like the provided sketch.

### Entity Positions (Enemies/Bullets)
Place objects along a lane at a given depth.
Simplest: anchor them to the ring point at `renderLane` and depth ring:

- For a depth `d` (integer), get ring points `ring[d].points[renderLane]`.
- Draw a small vector shape (diamond/triangle) at that position.

(Optionally later: allow fractional depth with lerp between rings, but for POC discrete is fine.)

### Fake Bloom / Glow (must look “Vectrex”)
Implement a `drawGlowLine(x1,y1,x2,y2,color)` that does:
- Draw the same line 2–3 times:
  - Pass 1: thick + low alpha
  - Pass 2: medium thickness + medium alpha
  - Pass 3: thin + high alpha
Use additive-ish feel by keeping alpha and brightness strong. Background black.

Do similarly for entity shapes.

Keep it tasteful; avoid huge blur. It just needs “glowy vector.”

---

## Game Loop Requirements
### Fixed Tick (authoritative motion)
- Use a Phaser timer event:
  - `tickMs = 120` (tweakable)
  - On tick:
    - advance bullets
    - advance enemies
    - resolve collisions
    - spawn enemies (see below)
- Rendering can be per frame in `update`, but positions are discrete.

### Enemy Spawning
Start simple:
- Every N ticks, spawn an enemy at far depth:
  - Lane chosen randomly: `0..5`
  - Depth = `MAX_DEPTH`
- Spawn rate ramps slowly:
  - e.g. start: every 6 ticks
  - after 30 seconds: every 4 ticks
  - after 60 seconds: every 3 ticks

Keep the POC fun quickly.

---

## Controls
- Left Arrow: rotate world left (60°)
- Right Arrow: rotate world right (60°)
- Space: fire bullet

Fire rules:
- Rate limit: 1 bullet per tick (or per 2 ticks) so it doesn’t spam.
- Bullet lane: **always lane = worldRot mapped to logical?**
  - IMPORTANT: Bullet should travel down the lane aligned with the ship’s “bottom lane.”
  - Because player is always visually bottom, easiest is:
    - bullet logical lane = `worldRot` (so after mapping it renders to lane 0).
  - Verify mapping with `renderLane = (lane - worldRot + 6) % 6` results in renderLane 0.

This is crucial—test it.

---

## HUD / Minimal UX
- Display score (top-left) as plain text.
- Game over message centered:
  - “GAME OVER — Press R to Restart”
- `R` resets state.

Optional: subtle “click” feel when rotating (no audio required).

---

## Acceptance Criteria (Definition of Done)
- Tunnel renders clearly as stacked wireframe hex rings with connecting edges.
- Ship is fixed at bottom; world rotation is in 60° steps.
- Enemies spawn from far center and march inward **1 segment per tick**.
- Bullets march outward **1 segment per tick**.
- Collisions work using lane+depth equality.
- Vector glow aesthetic is convincing (multi-pass line draw).
- Runs with `npm run dev` in browser, stable 60fps.

---

## Implementation Notes / Pitfalls to Avoid
- Do NOT implement real 3D. This is 2D math only.
- Keep all motion discrete to validate the feel.
- Ensure lane mapping is correct (object rotates with world).
- Keep code modular: tunnel geometry in `tunnel.js`, entities in `entities.js`, tick logic in `scene.js`.

---

## Suggested Constants (config.js)
- `NUM_LANES = 6`
- `NUM_SEGMENTS = 9`
- `TICK_MS = 120`
- `R0 = 260`
- `CENTER_X = width/2`
- `CENTER_Y = height/2 + 40` (lower center feels better)
- `SHIP_Y_OFFSET = +220` (ship drawn near bottom ring)
- Colors:
  - Background: `#000000`
  - Vector line: `#7CFFB2` (or classic green)
  - Enemy: slightly different brightness of same color
  - Bullet: brighter

---

## What NOT to Build Yet
Do not add:
- powerups
- wall hazards
- persistent wall states
- fancy menus
- sound
- particle effects beyond simple glow

Keep it brutally minimal and playable.

---

## Quick Test Plan
1. Rotate left/right: confirm tunnel and all enemies rotate together.
2. Fire: bullet travels straight down the current “bottom lane.”
3. Spawn: enemies are readable and approach at consistent cadence.
4. Shoot: collisions remove enemies reliably.
5. Miss: enemy hits depth 0 triggers game over.
6. Ramp: spawn cadence increases slightly over time.

---

## Extra Credit (only if time remains)
- Add subtle screen flicker by oscillating alpha slightly.
- Add a “scanline” overlay as a faint transparent pattern (optional).
- Add a slight wobble to tunnel scales (tiny) for analog vibe.

But do not block shipping the core POC on these.

---
END

