# DESIGN.md — Hexax Gameplay, Difficulty & Flow Specification

> This document defines **intended gameplay rules, difficulty curves, and player experience goals** for Hexax.
>
> It may describe features that are **not yet implemented**.
>
> `CLAUDE.md` remains the canonical source of truth for what currently exists in code.

---

## 1. Core Design Philosophy

Hexax is a **continuous-run arcade game** built around spatial anticipation, not reflex dodging.

### Non-Negotiable Principles

1. **No levels, no waves, no pauses**
   - One uninterrupted run.
   - Difficulty increases continuously.
   - The game should feel like tightening pressure, not steps.

2. **The player manipulates space, not position**
   - The ship never moves.
   - The player rotates the tunnel.
   - Success is about *alignment and foresight*.

3. **Walls are terrain, not enemies**
   - Enemies are solved by shooting.
   - Walls are solved by leaving.
   - Terrain mistakes must feel more serious than enemy mistakes.

4. **Difficulty is felt, not counted**
   - Pressure comes from overlap, density, and constraint.
   - Not from raw spawn speed alone.

5. **Visual modes are mechanically equivalent**
   - CRT Mode: color, bloom, warmth.
   - Vector Display Mode: monochrome, contrast, intensity.
   - No rule may rely on color alone for meaning.

---

## 2. Player Mental Model (What the Game Should Teach)

The player should internalize the following truths:

- "I rotate the world to bring safety to the bottom."
- "Enemies are problems I clear *on* a wall."
- "Walls mean I should not be here."
- "If I hit walls repeatedly, the game will end me."

If the player ever thinks:
> "I died randomly"

The design has failed.

---

## 3. Wall Escalation System (Authoritative Design)

### Goal

Walls must:
- Feel terrifying
- Allow **one** learning mistake
- Punish repeated failure decisively
- Never feel cheap

### State

Add to game state:

```js
wallHits: number
```

Resets on new run

Does not decay over time

### Wall Impact Rules

Triggered when:

- A Wall or DoubleWall reaches depth 0
- AND occupies the player's current lane (or either lane for DoubleWall)

### Escalation Logic

| Wall Hit Count | Result |
|----------------|--------|
| 1st | −30 HP + heavy warning |
| 2nd | −60 HP + critical warning |
| 3rd | Instant Game Over |

Notes:
- DoubleWall increments wallHits once
- Enemy damage does not affect wallHits
- Walls are not shootable

This communicates:
> "Walls are mistakes you do not get to repeat."

### Required Feedback (CRT + Vector Safe)

Each wall impact must include:

**Tier 1 (First Hit)**
- Violent explosion at player lane
- Tunnel flash (white → base color)
- Short rotation wobble (~150ms)
- HUD warning text (non-color dependent)

**Tier 2 (Second Hit)**
- Larger explosion
- Brief tunnel distortion inward
- HUD text: STRUCTURE CRITICAL
- Health bar pulse

**Tier 3 (Fatal)**
- Tunnel collapse explosion
- Lines fade outward
- Immediate Game Over

Brightness, flicker, motion, and line weight must communicate severity.
Color alone is insufficient.

---

## 4. Difficulty Model Overview

Difficulty is governed by three independent curves:

- **Spawn Pressure** — how often things appear
- **Threat Composition** — what kinds of things appear
- **Spatial Constraint** — how boxed-in the player becomes

These curves must not ramp at the same speed.

---

## 5. Spawn Pressure Curve (How Often)

### Intent
- Early game must feel readable and forgiving
- Pressure increases slowly, then plateaus
- Tick = 1 is rare, not permanent

### Design Formula

```
spawnIntervalTicks =
  clamp(
    round(4.5 - sqrt(elapsedSeconds / 25)),
    1,
    4
  )
```

### Resulting Feel

| Time | Typical Interval |
|------|-----------------|
| 0–30s | 4–5 ticks |
| 30–90s | 3–4 ticks |
| 90–180s | 2–3 ticks |
| 180s+ | Mostly 2 ticks, occasional 1 |

---

## 6. Threat Composition Timeline (What Appears)

Threat types are gated by elapsed time, not RNG.

### Authoritative Introduction Order

| Time (s) | Allowed Entities |
|----------|-----------------|
| 0–20 | Enemy |
| 20–40 | Enemy, Wall |
| 40–70 | Enemy, Wall, Tank |
| 70–100 | + DoubleWall (rare) |
| 100+ | + Bomb, Heart |

Implementation rule:
- If an entity type is not unlocked, it cannot spawn, regardless of weights.
- Walls must appear after the player understands rotation.

---

## 7. Spatial Constraint Control (Wall Density Cap)

Walls are the strongest constraint in the game.

They must be capped.

### Design Rule

```
maxActiveWalls =
  min(1 + floor(elapsedSeconds / 35), 4)
```

Meaning:
- Early game: max 1 wall
- Mid game: 2–3 walls
- Late game: never more than 4

This prevents impossible states while preserving tension.

---

## 8. Pattern Moments (NOT Waves)

Hexax uses pattern bias, not discrete waves.

### Rule

Every 30–45 seconds, apply a spawn bias for 6–10 seconds.

- No pause
- No UI
- No reset
- The run continues uninterrupted

### Example Patterns

- **Adjacent Pressure**: Walls prefer adjacent lanes
- **Spiral**: Spawn lanes increment modulo 6
- **Gap**: One lane is guaranteed empty
- **Enemy Rush**: Enemies only, faster cadence

Patterns should feel:
- Learnable
- Rhythmic
- Fair
- Not chaotic.

---

## 9. Scoring & Psychology

Scoring exists to:
- Reward anticipation
- Slow perceived difficulty
- Encourage mastery

### Intended Bonuses
- Bonus for killing enemies ≥2 segments away
- Bonus for staying safely on the same wall for N ticks
- Score multiplier resets on wall hit

Players should feel:
> "I survived because I planned well."

---

## 10. CRT Mode vs Vector Display Mode Rules

### Absolute Rules
- No mechanic relies on color alone
- Every danger must communicate via:
  - Motion
  - Brightness
  - Line thickness
  - Flicker or instability

### CRT Mode
- Color reinforces meaning
- Bloom exaggerates impact
- HUD color shifts allowed

### Vector Display Mode
- Monochrome only
- Danger = brighter, thicker, flickering lines
- Safe = steady, thin, calm lines

All mechanics must be testable and readable in Vector mode.
CRT mode is enhancement, not dependency.

---

## 11. What This Game Will NOT Add

To protect the core experience, Hexax explicitly avoids:

- Discrete levels or stages
- Hard wave resets
- Temporary invulnerability
- Random instant-death mechanics
- Color-only rules
- Reaction-based "bullet hell" density

Hexax is about space manipulation, not chaos.

---

## 12. Promotion Rule (Design → Canon)

A rule or system may be promoted into CLAUDE.md only when:

1. Implemented
2. Tuned
3. Proven in playtests

Until then, this document defines intent, not fact.
