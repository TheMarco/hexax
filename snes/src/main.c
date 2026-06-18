/*---------------------------------------------------------------------------------
    Hexax (SNES) — foundation: Mode 7 hex tunnel with smooth discrete rotation.

    The tunnel texture is 6-fold symmetric, so every 60 deg rotation looks
    identical. We exploit that: the Mode 7 angle always RESTS at 0 (axis-aligned,
    crisp) and only sweeps +/-60 deg during a transition, then snaps back to 0.
    The logical worldRot (0..5, which lane is at the bottom) is tracked separately
    and will drive entity placement later.

    PVSnesLib's setMode7 fixes the rotation center at texture (128,128); main()
    overrides M7VOFS so that pivot maps to screen center, and the tunnel texture is
    drawn at (128,128) — so it sits centered and spins in place.
---------------------------------------------------------------------------------*/
#include <snes.h>
#include "entpos.h"           // apothem/faceAngle/sintab + tierIdx
#include "hudfont.h"          // const charGfx[] : ascii -> HUD-font sprite gfxoffset
#include "sprgfx.h"           // SHIP_GFX/BULLET_GFX + gfxA/gfxB/bigTier (per type & tier)

extern char patterns, patterns_end;
extern char palette;
extern char map, map_end;
extern char fartiles, fartiles_end;          // far sheet: ship + bullet + enemy far frames
extern char farpal, farpal_end;
extern char hudfonttiles, hudfonttiles_end;  // HUD font glyphs (dmaCopyVram'd to tile 160)
extern char neartiles, neartiles_end;        // 32x32 distinct enemy near frames (-> tile 256)
#include "soundbank_banks.h"                 // SPC_SET_ALL_BANKS() (generated from soundbank.asm)

// Recolor palettes for the enemy types (= shapes drawn in index 2 on sprite palette N).
// Only index 2 (the body) matters; index 1 stays white. SNES BGR555.
const u16 tankpal[16]  = { 0, 0x7FFF, 0x7E28, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }; // blue
const u16 bombpal[16]  = { 0, 0x7FFF, 0x237F, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }; // yellow
const u16 heartpal[16] = { 0, 0x7FFF, 0x451F, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }; // pink
const u16 phasepal[16] = { 0, 0x7FFF, 0x7D99, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }; // purple
const u16 spiralpal[16]= { 0, 0x7FFF, 0x6FE8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }; // cyan
const u16 phasedim[16] = { 0, 0x4210, 0x3CCC, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 }; // dim purple (phase shielded)

// DEBUG_SPAWN: one enemy at a time, cycling all types (no waves/ramp) for inspection;
// SELECT skips to the next type. Set to 0 for the real game.
#define DEBUG_SPAWN 1
const u8 dbgCycle[6] = { 0, 1, 2, 3, 4, 5 };   // enemy, tank, bomb, heart, phase, spiral
u8 dbgIdx;

// gfxA/gfxB[type*4 + tier] + bigTier[4] + SHIP_GFX/BULLET_GFX come from sprgfx.h
// (generated from the sprite sheets). Tiers 0-2 = 16x16, tier 3 = 32x32 near.

extern u16 m7sx, m7sy;          // PVSnesLib Mode 7 scale factors

#define SPIN_STEP  5            // byte-angle units/frame (~9 frames for a 60deg step => ~150ms)
#define SPIN_60    43           // round(256/6): one hex face

#define TUNNEL_SCALE 0x200      // Mode 7 scale: 0x200 = true 1:1 (crisp 1px lines, mouth fits)
#define SHIP_X       120        // ship sprite top-left (16x16); tune to sit on the bottom rim
#define SHIP_Y       192
#define ENEMY_STEP   10         // depth units/frame in 8.8 fixed-point (smooth travel)
#define MAX_ENEMIES  8          // enemy pool size
#define SPAWN_INTERVAL 80       // frames between enemy spawns
#define NBULLET      4          // max simultaneous bullets
#define BULLET_STEP  36         // bullet depth units/frame (8.8); faster than enemy
#define FIRE_COOLDOWN 10        // frames between shots

u16 pad0, padprev;
u8  worldRot;                   // 0..5 logical bottom lane
s16 spin;                       // tunnel animation angle; rests at 0
s8  spinDir;                    // +1 / -1 while animating, 0 when idle
u16 enDepth[MAX_ENEMIES];       // enemy depth 8.8 (>=0x600 = inactive)
u8  enLane[MAX_ENEMIES];        // enemy logical lane (orbits with worldRot)
u8  enType[MAX_ENEMIES];        // 0 = puck, 1 = tank
u8  enHp[MAX_ENEMIES];          // hit points (tank = 2)
u8  ei, e2, rr;                 // enemy loop index, chain-kill index, spawn roll
u16 spawnTimer, rng;            // spawn countdown + xorshift RNG
u16 gameFrames;                 // frames survived this run (difficulty clock)
u16 enemyStep, spawnInterval;   // current descent speed + spawn period (ramp up over time)
u16 epx, epy;                   // entity screen center (working)
u8  lvl;                        // size-tier level
u16 bulDepth[NBULLET];          // bullet depth 8.8 (>=0x600 = inactive)
u16 bulx, buly;
u8  bulCool, bi, fireQueued;
u16 score;
u16 gx, gy;                     // entScreen() output: entity screen center
u8  entAng;                     // entScreen() output: screen angle (for orientation)
u8  bulLane[NBULLET];           // each bullet's logical lane (= worldRot at fire)
u8  ob, fl, ti, pal;            // orientation byte, h-flip flag, size-tier index, palette
u16 gfx, ga, gb;                // chosen gfx + the 0deg/60deg gfx pair for the tier
u16 hudv;                       // working value for HUD score digits
u8  health, gameOver, k;        // health segments (0..5), game-over flag, HUD index

// Linear interpolate a->b by fr/256. Unsigned-shift safe for either direction
// (avoids relying on 816-tcc's signed >> behaviour).
u16 lerp(u16 a, u16 b, u8 fr) {
    s16 d = (s16)b - (s16)a;
    if (d >= 0) return a + ((u16)(d * fr) >> 8);
    return a - ((u16)((s16)(0 - d) * fr) >> 8);
}

// (radius * trig)/128, sign-safe (avoids 816-tcc signed-shift behaviour).
s16 trigmul(u16 r, s8 t) {
    if (t >= 0) return (s16)(((u16)r * (u8)t) >> 7);
    return (s16)0 - (s16)(((u16)r * (u8)(0 - t)) >> 7);
}

// Compute an entity's screen center (-> gx,gy) from its logical lane and depth,
// folding in the world rotation (committed worldRot + in-progress spin) so the
// entity orbits WITH the tunnel. Screen tunnel center = (128,112).
void entScreen(u8 lane, u16 depth16) {
    u8  sf  = (u8)((lane + 6 - worldRot) % 6);       // screen face
    u8  ang = (u8)((s16)faceAngle[sf] - spin);       // + in-progress spin
    u8  fd  = (u8)(depth16 >> 8);
    entAng = ang;                                    // expose for puck orientation
    u16 r   = lerp(apothem[fd], apothem[fd + 1], (u8)depth16);   // radius at depth
    gx = (u16)(128 + trigmul(r, sintab[(u8)(ang + 64)]));        // 128 + r*cos
    gy = (u16)(112 + trigmul(r, sintab[ang]));                   // 112 + r*sin
}

// Fire a bullet up the current player lane (worldRot), if a slot is free.
void doFire(void) {
    for (bi = 0; bi < NBULLET; bi++)
        if (bulDepth[bi] >= 0x600) { bulDepth[bi] = 0; bulLane[bi] = worldRot; bulCool = FIRE_COOLDOWN; break; }
}

// Draw one HUD glyph (16x16 sprite, glyph in its top-left 8x8) at screen (x,y).
void hudPut(u16 id, u16 x, u16 y, u8 ch) {
    oamSet(id, x, y, 3, 0, 0, charGfx[ch - 32], 0);
    oamSetEx(id, OBJ_SMALL, OBJ_SHOW);
}

// (Re)start a game: clear entities, full health, zero score.
void resetGame(void) {
    for (ei = 0; ei < MAX_ENEMIES; ei++) enDepth[ei] = 0x600;
    for (bi = 0; bi < NBULLET; bi++) bulDepth[bi] = 0x600;
    score = 0; health = 5; gameOver = 0;
    spawnTimer = 30; worldRot = 0; spin = 0; spinDir = 0; bulCool = 0; fireQueued = 0;
    gameFrames = 0; enemyStep = ENEMY_STEP; spawnInterval = SPAWN_INTERVAL;
}

int main(void) {
    // Boot the SPC700 audio driver FIRST (timing-sensitive handshake, before any video
    // setup), register the 2-bank music soundbank (highest bank first), upload the
    // module. spcPlay happens after setScreenOn (per the >32KB-music example).
    spcBoot();
    SPC_SET_ALL_BANKS();             // register every soundbank ROM bank (highest first)
    spcLoad(0);                      // MOD_MUSIC_HEXAX

    bgInitMapTileSet7(&patterns, &map, &palette, (&patterns_end - &patterns), 0x0000);
    setMode7(0);

    // Sprites render over Mode 7. Load tiles+palette into upper VRAM (word 0x4000),
    // clear of the Mode 7 data (which fills words 0x0000-0x3FFF).
    // Far sheet (ship + bullet + enemy 16x16 far frames) -> page 0 tile 0 (word 0x4000).
    oamInitGfxSet(&fartiles, (&fartiles_end - &fartiles),
                  &farpal, (&farpal_end - &farpal),
                  0, 0x4000, OBJ_SIZE16_L32);
    // HUD font glyphs at VRAM tile 160 (word 0x4A00) -> sprite gfxoffset 160 (charGfx[]).
    dmaCopyVram(&hudfonttiles, 0x4A00, (&hudfonttiles_end - &hudfonttiles));
    // 32x32 distinct enemy near frames at VRAM tile 256 (word 0x5000) -> gfxoffset 256.
    dmaCopyVram(&neartiles, 0x5000, (&neartiles_end - &neartiles));
    // Recolor palettes: sprite palette 1 = blue tank, 2 = yellow bomb (CGRAM 128+p*16).
    dmaCopyCGram((u8 *)tankpal, 144, 32);
    dmaCopyCGram((u8 *)bombpal, 160, 32);
    dmaCopyCGram((u8 *)heartpal, 176, 32);   // sprite palette 3 = pink heart
    dmaCopyCGram((u8 *)phasepal, 192, 32);   // sprite palette 4 = purple phase
    dmaCopyCGram((u8 *)spiralpal, 208, 32);  // sprite palette 5 = cyan spiral
    dmaCopyCGram((u8 *)phasedim, 224, 32);   // sprite palette 6 = dim purple (phase shield)
    // Player ship fixed on the bottom face of the tunnel mouth (16x16 sprite;
    // oamSet takes top-left). SHIP_X/SHIP_Y are tunable to sit it on the rim.
    oamSet(0, SHIP_X, SHIP_Y, 3, 0, 0, SHIP_GFX, 0);
    oamSetEx(0, OBJ_SMALL, OBJ_SHOW);

    worldRot = 0;
    spin = 0;
    spinDir = 0;
    rng = 0x1234;
    resetGame();

    // Center the tunnel and make it spin in place: keep M7X/M7Y = (128,128)
    // (setMode7 default) and scroll so that pivot maps to screen center (128,112)
    // => M7HOFS = 0, M7VOFS = 128 - 112 = 16. Scale 1:1 so the tunnel fills screen.
    m7sx = TUNNEL_SCALE;
    m7sy = TUNNEL_SCALE;
    REG_M7HOFS = 0;  REG_M7HOFS = 0;     // write-twice 13-bit: low, then high
    REG_M7VOFS = 16; REG_M7VOFS = 0;
    setMode7Rot(0);

    setScreenOn();
    padprev = 0;

    // Music DISABLED: the auto-chiptune of the dense piano sounds bad. The whole audio
    // pipeline (boot/bank/load/process) stays wired; drop in a real SNES-arranged .it
    // and re-enable spcPlay(0) to play it.
    // spcPlay(0);

    while (1) {
        pad0 = padsCurrent(0);

        if (!gameOver) {
        // Start a 60-deg sweep on a fresh Left/Right press (ignored mid-animation).
        if (!spinDir) {
            if ((pad0 & KEY_LEFT) && !(padprev & KEY_LEFT))  spinDir = +1;   // rotate world left
            else if ((pad0 & KEY_RIGHT) && !(padprev & KEY_RIGHT)) spinDir = -1;  // right
        }
        // Fire on a fresh A press. If a turn is in progress, BUFFER the shot and
        // release it on the new lane when the turn completes (so it doesn't fire on
        // the lane we just departed from).
        if (bulCool) bulCool--;
        if ((pad0 & KEY_A) && !(padprev & KEY_A)) {
            if (spinDir) fireQueued = 1;
            else if (!bulCool) doFire();
        }
#if DEBUG_SPAWN
        if ((pad0 & KEY_SELECT) && !(padprev & KEY_SELECT)) enDepth[0] = 0x600;  // skip type
#endif
        padprev = pad0;

        // Advance the sweep; when a full face is reached, commit worldRot and
        // snap the tunnel back to the crisp angle-0 orientation (symmetry).
        // Sweep the FULL 60deg (land exactly on SPIN_60), hold it one frame, then
        // settle: reset spin to 0 (invisible — 60deg == 0deg for the symmetric hex)
        // and commit worldRot. This makes the tunnel complete its turn smoothly with
        // the entities, instead of jerking back from a partial angle.
        if (spinDir > 0) {
            if (spin >= SPIN_60) { spin = 0; worldRot = (worldRot + 1) % 6; spinDir = 0; }
            else { spin += SPIN_STEP; if (spin > SPIN_60) spin = SPIN_60; }
        } else if (spinDir < 0) {
            if (spin <= -SPIN_60) { spin = 0; worldRot = (worldRot + 5) % 6; spinDir = 0; }
            else { spin -= SPIN_STEP; if (spin < -SPIN_60) spin = -SPIN_60; }
        }
        // Turn just finished with a buffered shot -> fire it on the new lane.
        if (!spinDir && fireQueued) { doFire(); fireQueued = 0; }

        setMode7Rot((u8)spin);           // negative wraps mod 256 = small reverse rotation

#if DEBUG_SPAWN
        // DEBUG: one slow enemy at a time in the player's lane; auto-advance to the next
        // type when it's gone (killed / reached the mouth / SELECT-skipped).
        enemyStep = 4;
        if (enDepth[0] >= 0x600) {
            dbgIdx++; if (dbgIdx >= 6) dbgIdx = 0;
            enLane[0] = worldRot;
            enType[0] = dbgCycle[dbgIdx];
            enHp[0] = (enType[0] == 1) ? 2 : 1;
            enDepth[0] = 0x5FF;
        }
#else
        // --- difficulty ramp: enemies descend faster + spawn more often over time ---
        if (gameFrames < 16384) gameFrames++;
        enemyStep = ENEMY_STEP + (gameFrames >> 10);          // 10 -> 24 descent speed
        if (enemyStep > 24) enemyStep = 24;
        spawnInterval = SPAWN_INTERVAL - (gameFrames >> 8);   // 80 -> 30 frames/spawn
        if (spawnInterval < 30) spawnInterval = 30;

        // --- spawn a new enemy on a random lane when the timer fires ---
        if (spawnTimer) spawnTimer--;
        if (!spawnTimer) {
            spawnTimer = spawnInterval;
            for (ei = 0; ei < MAX_ENEMIES; ei++) if (enDepth[ei] >= 0x600) {
                rng ^= rng << 7; rng ^= rng >> 9; rng ^= rng << 8;   // xorshift16
                enLane[ei] = (u8)(rng % 6);
                rr = (rng >> 8) & 7;
                // 0 bomb, 1-2 tank, 3 heart (only when hurt), 4 spiral, rest plain enemy
                enType[ei] = (rr == 0) ? 2 : (rr <= 2) ? 1 :
                             (rr == 3 && health < 5) ? 3 : (rr == 4) ? 5 : 0;
                enHp[ei] = (enType[ei] == 1) ? 2 : 1;                // only tanks take 2 hits
                enDepth[ei] = 0x5FF;                                 // spawn at far
                break;
            }
        }
#endif

        // --- enemies: descend, orbit with the tunnel, depth-scale + lane-rotate ---
        // OAM ids 4,8,..,32 (4 bytes/sprite). Orientation: the disc's wide axis follows
        // the lane tangent (3 orientations via g0 / g1 / g1+H-flip).
        for (ei = 0; ei < MAX_ENEMIES; ei++) {
            if (enDepth[ei] >= 0x600) { oamSetEx(4 + (ei << 2), OBJ_LARGE, OBJ_HIDE); continue; }
            if (enDepth[ei] < enemyStep) {      // reached the ship -> damage the player
                enDepth[ei] = 0x600; oamSetEx(4 + (ei << 2), OBJ_LARGE, OBJ_HIDE);
#if !DEBUG_SPAWN
                if (health) health--;
                if (!health) gameOver = 1;
#endif
                continue;
            }
            // descend; spirals also hop to the next lane at each segment boundary
            if (enType[ei] == 5) {
                rr = enDepth[ei] >> 8;                  // segment before the step
                enDepth[ei] -= enemyStep;
                if ((enDepth[ei] >> 8) != rr) enLane[ei] = (enLane[ei] + 1) % 6;
            } else {
                enDepth[ei] -= enemyStep;
            }
            entScreen(enLane[ei], enDepth[ei]);
            epx = gx; epy = gy;
            lvl = enDepth[ei] >> 5; if (lvl > 47) lvl = 47;
            ti = tierIdx[lvl];                          // size tier 0..3
            ga = gfxA[enType[ei] * 4 + ti];             // 0deg gfx for (type, tier)
            gb = gfxB[enType[ei] * 4 + ti];             // 60deg gfx
            pal = enType[ei];                           // palette = type colour
            if (enType[ei] == 4 && enDepth[ei] > 0x200) pal = 6;  // phase shielded -> dim
            ob = (u8)(entAng + 64) & 0x7F;
            if (ob >= 106 || ob < 21) { gfx = ga; fl = 0; }
            else if (ob < 64)         { gfx = gb; fl = 0; }
            else                      { gfx = gb; fl = 1; }
            if (bigTier[ti]) {
                oamSet(4 + (ei << 2), epx - 16, epy - 16, 2, fl, 0, gfx, pal);
                oamSetEx(4 + (ei << 2), OBJ_LARGE, OBJ_SHOW);
            } else {
                oamSet(4 + (ei << 2), epx - 8, epy - 8, 2, fl, 0, gfx, pal);
                oamSetEx(4 + (ei << 2), OBJ_SMALL, OBJ_SHOW);
            }
        }

        // --- bullets: rise up their lane; hit any enemy on the SAME lane ---
        // OAM ids 36,40,44,48 (after the enemy ids).
        for (bi = 0; bi < NBULLET; bi++) {
            if (bulDepth[bi] >= 0x600) { oamSetEx(36 + (bi << 2), OBJ_SMALL, OBJ_HIDE); continue; }
            bulDepth[bi] += BULLET_STEP;
            for (ei = 0; ei < MAX_ENEMIES; ei++)
                if (enDepth[ei] < 0x600 && bulLane[bi] == enLane[ei] && bulDepth[bi] >= enDepth[ei]) {
                    bulDepth[bi] = 0x600;      // consume bullet
                    if (enType[ei] == 2) {     // bomb: chain-kill every enemy on screen
                        for (e2 = 0; e2 < MAX_ENEMIES; e2++)
                            if (enDepth[e2] < 0x600) { enDepth[e2] = 0x600; score++; }
                    } else if (enType[ei] == 3) {           // heart: shoot it to fully heal
                        enDepth[ei] = 0x600; health = 5;
                    } else if (enType[ei] == 4 && enDepth[ei] > 0x200) {
                        // phase shielded while far -> bullet deflects, phase unharmed
                    } else if (enHp[ei] > 1) enHp[ei]--;    // tank survives the first hit
                    else { enDepth[ei] = 0x600; score++; }  // destroyed
                    break;
                }
            if (bulDepth[bi] >= 0x5FF) { bulDepth[bi] = 0x600; oamSetEx(36 + (bi << 2), OBJ_SMALL, OBJ_HIDE); continue; }
            entScreen(bulLane[bi], bulDepth[bi]);
            bulx = gx; buly = gy;
            oamSet(36 + (bi << 2), bulx - 8, buly - 8, 2, 0, 0, BULLET_GFX, 0);
            oamSetEx(36 + (bi << 2), OBJ_SMALL, OBJ_SHOW);
        }
        } else {
            // GAME OVER: restart on a fresh A; freeze and hide the game sprites.
            if ((pad0 & KEY_A) && !(padprev & KEY_A)) resetGame();
            padprev = pad0;
            for (ei = 0; ei < MAX_ENEMIES; ei++) oamSetEx(4 + (ei << 2), OBJ_LARGE, OBJ_HIDE);
            for (bi = 0; bi < NBULLET; bi++) oamSetEx(36 + (bi << 2), OBJ_SMALL, OBJ_HIDE);
        }

        // "GAME OVER" text (OAM ids 116..144), centered; shown only on game over.
        if (gameOver) {
            hudPut(116,  88, 96, 'G'); hudPut(120,  96, 96, 'A'); hudPut(124, 104, 96, 'M');
            hudPut(128, 112, 96, 'E'); hudPut(132, 128, 96, 'O'); hudPut(136, 136, 96, 'V');
            hudPut(140, 144, 96, 'E'); hudPut(144, 152, 96, 'R');
        } else {
            for (k = 0; k < 8; k++) oamSetEx(116 + (k << 2), OBJ_SMALL, OBJ_HIDE);
        }

        // --- HUD: "SCORE:" + 5 digits (font sprites, top-left, OAM ids 52..92) ---
        hudPut(52,  8, 4, 'S'); hudPut(56, 16, 4, 'C'); hudPut(60, 24, 4, 'O');
        hudPut(64, 32, 4, 'R'); hudPut(68, 40, 4, 'E'); hudPut(72, 48, 4, ':');
        hudv = score;
        hudPut(92, 92, 4, '0' + (hudv % 10)); hudv /= 10;   // units
        hudPut(88, 84, 4, '0' + (hudv % 10)); hudv /= 10;
        hudPut(84, 76, 4, '0' + (hudv % 10)); hudv /= 10;
        hudPut(80, 68, 4, '0' + (hudv % 10)); hudv /= 10;
        hudPut(76, 60, 4, '0' + (hudv % 10));               // ten-thousands

        // health bar (top-right): one '#' block per remaining segment (ids 96..112)
        for (k = 0; k < 5; k++) {
            if (k < health) hudPut(96 + (k << 2), 200 + (k << 3), 4, '#');
            else oamSetEx(96 + (k << 2), OBJ_SMALL, OBJ_HIDE);
        }

        spcProcess();                   // service the SPC700 audio driver each frame
        WaitForVBlank();
    }
    return 0;
}
