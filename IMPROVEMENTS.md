# Hexax — Improvement Notes

## Game Feel (the biggest gap)

**Rotation feels sluggish.** Each 60-degree rotation blocks input for 150ms, meaning crossing to the opposite lane takes 450ms minimum. In late game when ticks hit 500-600ms, that's nearly an entire enemy tick just to traverse the tunnel. Tempest let you zip across the tube almost instantly. This is the #1 game-feel issue.

**Shooting lacks juice.** No muzzle flash at the ship, no bullet trail/afterglow, no hit-stop freeze frame on kills. The bullet is a tiny diamond that's barely visible at far depths. Every kill plays the same generic explosion sound regardless of enemy type. Firing should feel *punchy* — right now it feels muted.

**Player damage has weak feedback.** Wobble/shake only triggers on wall hits. When an enemy reaches you and deals 10-20 HP damage, there's an explosion but no screen shake. Every hit to the player should have proportional camera feedback.

---

## Progression & Replayability

**No sense of progression.** The difficulty ramp is entirely invisible — no wave numbers, no level announcements, no "WAVE 5" text. The player has no milestones to aim for beyond raw score. Pattern moments (adjacent, spiral, gap, rush) activate silently with zero visual announcement.

**One mode, one score.** Single endless mode, single high score (no top-10 leaderboard, no initials entry). No statistics tracking across runs (total kills, best multiplier, longest survival). No achievements. Once you've seen all entity types (~100 seconds in), there's nothing new to discover.

**No player agency over power-ups.** No weapon upgrades, no screen-clear ability, no secondary fire. The only "power-up" is randomly spawning hearts and bombs. Tempest had the Superzapper. Something player-controlled would add strategic depth.

---

## UX Issues

**Zero onboarding.** Title screen drops you straight in with no control instructions. The "world rotates, not the ship" mechanic is unintuitive — a first-time player will be confused. Even a single overlay showing "LEFT/RIGHT: Rotate Tunnel | SPACE: Fire" would help enormously.

**No pause.** Can't pause the game at all. Basic QoL that every game needs.

**3-second restart delay is invisible.** "Press Fire to Restart" appears immediately at game over, but the input is silently ignored for 3 seconds. Then at 8 seconds it auto-kicks you to the title screen. The text should appear *after* the delay, or show a countdown.

**No volume controls.** Hardcoded gain values, no mute button, no sliders. The mobile cabinet has a display-toggle button but no audio control.

---

## Audio

**8 SFX + 1 music track is thin.** Every enemy kill sounds identical. Tanks should clang, bombs should cascade, spirals should whir. No sound for multiplier milestones, no danger cue when enemies are at depth 1, no phase-transition sound, no score jingles. One looping track for 5+ minute sessions gets repetitive — even a second track or dynamic layering as difficulty ramps would help.

---

## Balance Concerns

**Wall escalation is a hidden death sentence.** The cumulative `wallHits` counter never resets. After 2 wall hits (which can happen in the first 30 seconds), any 3rd wall hit is instant death regardless of 100 HP. A player with full health but 2 wall hits is in more danger than a player at 10 HP with 0 wall hits. This feels unintuitive and punishing.

**Segment double-hit instant death compounds the problem.** Two hits on the same lane = instant death. With 6 lanes and random spawning, this probability climbs fast. Combined with spirals that change lanes unpredictably, deaths can feel random rather than earned.

**Hearts spawn too late and too rarely.** Unlocking at 100 seconds with ~1.6% spawn chance, *and* excluded when health >= 80 (even if segments are damaged), means the one mechanic that repairs segment damage is nearly absent when you need it.

---

## Missing Polish

- No muzzle flash on fire
- No invincibility frames (multiple enemies hitting same tick = stacked damage)
- Ship has zero animation (no thruster glow, no damage state, no recoil)
- No background depth cues (star field, parallax)
- Game over shows no stats breakdown (enemies killed, time survived, multiplier achieved)
- No colorblind mode (8 entity types distinguished purely by color)
- No fullscreen toggle on desktop
- No haptic feedback on mobile
- Touch zones don't support hold-to-repeat for rotation

---

## Priority Ranking

1. **Reduce rotation blocking** — biggest game-feel win
2. **Add muzzle flash + bullet trail + per-enemy kill sounds** — biggest juice win
3. **Add a how-to-play overlay on first launch** — biggest onboarding win
4. **Add pause** — most basic missing QoL
5. **Make wall escalation/segment damage more forgiving or more visible** — biggest fairness win
