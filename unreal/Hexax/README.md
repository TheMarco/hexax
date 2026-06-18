# Hexax — Unreal Engine port

A faithful Unreal Engine 5 port of the Phaser tunnel shooter. The discrete
6-lane simulation is ported ~1:1 from the JS systems; the tunnel is now **real
3D geometry** (the camera does the perspective the JS faked by hand), and the
vector-glow look is drawn with a `ULineBatchComponent` + bloom — **no meshes,
materials, or other binary art assets required.**

Target: **UE 5.8** (C++ project). API calls (`ULineBatchComponent`,
`SpawnSound2D`, legacy `BindKey`, post-process settings) were verified against
the 5.8 engine headers installed on this machine.

---

## Status

Already done on this machine:
- ✅ **Compiles** — `HexaxEditor` (Mac, Development) built clean under UE 5.8's
  strict warnings-as-errors (`BuildSettingsVersion.V7`).
- ✅ **Launch map generated** — `Content/Maps/Hexax.umap` was created headlessly
  (see `Scripts/create_map.py`); `Config/DefaultEngine.ini` points at it.
- ✅ **Boots** — a headless `-game` run loaded world `Hexax` and ticked with no
  crashes/fatals.

So normally you just **open `Hexax.uproject` and press Play.**

## Rebuilding from scratch (other machines / after a clean)

You need Unreal Engine 5.8 with a C++ toolchain (Xcode on macOS, VS2022 on
Windows).

1. **Compile** — double-click `Hexax.uproject` and click **Yes** to rebuild the
   module, or from a terminal:
   ```
   "<UE>/Engine/Build/BatchFiles/Mac/Build.sh" HexaxEditor Mac Development \
     -Project="<path>/Hexax.uproject" -waitmutex
   ```
2. **Create the launch map** (only if `Content/Maps/Hexax.umap` is missing):
   ```
   "<UE>/Engine/Binaries/Mac/UnrealEditor-Cmd" "<path>/Hexax.uproject" \
     -run=pythonscript -script="<path>/Scripts/create_map.py" -unattended -nullrhi
   ```
   …or just **File → New Level → Empty Level**, save as `/Game/Maps/Hexax`.
3. **Play** — open the project, ensure `/Game/Maps/Hexax` is the active map,
   press **Play** (PIE).

---

## Controls

| Key                         | Action                |
|-----------------------------|-----------------------|
| **Left / A / D-pad left**   | Rotate world left     |
| **Right / D / D-pad right** | Rotate world right    |
| **Space / Gamepad A**       | Fire / Restart        |

Restart is available ~3s after game over (press Fire).

---

## What was ported, and where it lives

| Source (JS)                     | Unreal                                   |
|---------------------------------|------------------------------------------|
| `config.js`                     | `HexaxConfig.h` (gameplay + new 3D consts)|
| `GameState.js`                  | `HexaxState.h`                           |
| entity classes + `EntityManager`| `HexaxEntity.h/.cpp`, `HexaxTypes.h`     |
| `SpawnSystem.js`                | `HexaxSpawnSystem.h/.cpp`                |
| `CollisionSystem.js`            | `HexaxCollisionSystem.h/.cpp`            |
| `TickSystem.js` + `GameScene`   | `HexaxPawn.h/.cpp` (the orchestrator)    |
| `TunnelGeometry.js`             | `HexaxGeometry.h` (now real 3D)          |
| renderers + `GlowRenderer`      | `HexaxPawn` line-batch drawing           |
| `HUD.js`                        | `HexaxHUD.h/.cpp` (Canvas)               |
| `SoundEngine.js`                | sound `UPROPERTY` hooks on the pawn      |

All gameplay rules carried over: two-timer fixed step (enemy 800→600ms, bullet
200ms), weighted spawning with time-gating + wall cap + pattern moments,
3-tier wall escalation, per-lane segment damage (2nd hit = instant death),
deferred "ghost bullet" kills, distance bonus, score multiplier, all 8 entity
types (enemy, wall, doublewall, tank, bomb, heart, phase, spiral).

---

## Adding sound (optional)
The pawn exposes `USoundBase*` properties (Shoot, Explosion, HitWall, Heart,
Rotate, Death, PlayerHit, MusicLoop). To use your existing `.mp3`s:
1. Import them into `Content/Audio` (drag the files into the Content Browser).
2. Create a **Blueprint child** of `HexaxPawn` (right-click `HexaxPawn` →
   *Create Blueprint class based on*), assign the sounds in its Details panel,
   and set that BP as the GameMode's *Default Pawn Class* (or make a BP GameMode).
   For a looping soundtrack, enable **Looping** on the `MusicLoop` sound asset.

No code changes needed.

---

## Tuning the look (`HexaxConfig.h`)
- **World scale / framing:** `TUBE_RADIUS`, `NEAR_X`, `SEG_LEN`, `CAMERA_FOV`.
- **Glow strength:** `GLOW_CORE_INTENSITY` (HDR multiplier that drives bloom),
  `GLOW_WIDE_INTENSITY`, thicknesses. Bloom amount itself is in
  `AHexaxPawn::BeginPlay` (`PP.BloomIntensity`).
- **Rotation feel:** `ROT_DURATION`. If left/right feel inverted for you, flip
  the sign in `AHexaxPawn::StartRotAnim`.
- Colors are in the `HX::` color helpers (same hex values as the JS `COLORS`).

---

## "Make it spectacular later" — natural upgrade path
The simulation is fully decoupled from rendering, so visuals can be swapped
without touching gameplay:
1. Replace line-batch glyphs with **Niagara ribbon/beam** emitters for richer
   glow and trails.
2. Swap the procedural tunnel for an emissive **mesh** tube; keep the geometry
   helpers for entity placement.
3. Add a post-process material for CRT/scanline and phosphor-persistence (a
   SceneCapture feedback buffer) to match the original shader modes.
4. Real explosions/impacts via Niagara, camera shake via `PlayerCameraManager`.

---

## Known limitations of this first pass
- Vector glow is approximated by HDR lines + bloom, not the exact 3-pass
  Vectrex curve or the P31 phosphor persistence (those are the "spectacular
  later" items above).
- Entity glyphs are recognizable but simplified vs. the foreshortened 3D pucks
  / dumbbells of the original `EntityRenderer`.
- Dying-spiral resolution waits one enemy cycle (vs. exact lane-lerp completion).
- If `ULineBatchComponent`'s API differs on your engine version, it's the only
  rendering dependency — everything else is plain gameplay code.
