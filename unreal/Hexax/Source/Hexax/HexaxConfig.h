#pragma once

#include "CoreMinimal.h"

/**
 * All Hexax tuning constants in one place — the Unreal analogue of src/game/config.js.
 *
 * Gameplay constants are ported 1:1 from the JS game and drive the discrete
 * simulation. The 3D/render constants are NEW: the Phaser version faked
 * perspective by hand in 2D, but here the tunnel is real world geometry and the
 * camera does the projection, so these describe the actual world layout.
 */
namespace HX
{
	// ---- Gameplay (ported from config.js) ----------------------------------
	constexpr int32   NUM_LANES                 = 6;
	constexpr int32   NUM_SEGMENTS              = 7;
	constexpr int32   MAX_DEPTH                 = 6;   // NUM_SEGMENTS - 1
	constexpr int32   PLAYER_DEPTH              = 0;

	constexpr float   TICK_MS                   = 800.f;
	constexpr float   BULLET_TICK_MS            = 200.f;
	constexpr float   FIRE_COOLDOWN_BULLET_TICKS = 1.5f;

	constexpr int32   PHASE_DEPTH               = 2;   // phase enemy becomes vulnerable at depth <= 2

	// ---- 3D world layout (new for Unreal) ----------------------------------
	// Tunnel runs along +X (camera forward). Camera sits at the origin looking
	// down +X; ring `depth` lives at world X = NEAR_X + depth * SEG_LEN.
	constexpr float   TUBE_RADIUS               = 320.f;  // hex "radius" in world units
	// Rings use the original's perspective CURVE (not linear spacing) so the
	// tunnel recedes to a tiny ring at the centre. A ring's projected size is
	// proportional to GetScale(depth); we place each ring at world
	// X = PERSP_NEAR / GetScale(depth). Larger PERSP_NEAR = zoomed out (smaller mouth).
	constexpr float   PERSP_NEAR                = 480.f;
	constexpr float   SCALE_MIN                 = 0.05f;  // far ring is 5% size (matches Phaser)
	constexpr float   SCALE_POWER               = 0.5f;   // bunches rings toward the far end
	constexpr float   BOTTOM_ANGLE_DEG          = -90.f;  // render lane 0 sits straight down (-Z)
	constexpr float   CAMERA_FOV                = 90.f;
	constexpr float   CAMERA_ASPECT             = 4.f / 3.f; // constrained for arcade framing

	constexpr float   ENTITY_SIZE               = 110.f;  // base size of entity glyphs (world units)
	constexpr float   BULLET_SIZE               = 30.f;
	constexpr float   WALL_HEIGHT_FRAC          = 0.16f;  // wall perpendicular height as a fraction of TUBE_RADIUS (orig 48/300)
	constexpr float   WALL_Z_THICKNESS          = 0.15f;  // wall slab depth extent (in depth units)

	// ---- Visuals -----------------------------------------------------------
	constexpr float   ROT_DURATION             = 0.18f;   // seconds for the 60-degree rotation lerp (eased)
	constexpr float   GLOW_CORE_INTENSITY      = 1.0f;    // per-vertex color scale (hue is carried 0..1; the emissive material multiplies to HDR for bloom)
	constexpr float   LINE_WIDTH_K            = 0.0019f;  // ribbon half-width as a fraction of distance => ~constant on-screen line width at any depth
	constexpr float   GLOW_WIDE_INTENSITY      = 0.6f;    // multiplier on the soft wide pass
	constexpr float   GLOW_WIDE_THICKNESS      = 6.0f;    // world-space thickness of the wide glow pass
	// 0 => true 1-pixel vector lines. World-space thickness quads go sub-pixel on
	// far rings and get dropped by the rasterizer, so 0 keeps every line visible.
	constexpr float   GLOW_CORE_THICKNESS      = 0.0f;

	constexpr float   FLASH_DECAY              = 4.0f;    // ring-flash decay per second
	constexpr float   WOBBLE_DURATION         = 0.15f;
	constexpr float   WOBBLE_AMPLITUDE        = 0.06f;    // radians

	// Phosphor afterglow: dynamic-object line segments are captured each frame and
	// replayed with a decaying brightness, like a real vector monitor's persistence.
	constexpr float   GHOST_PERSIST           = 0.06f;   // afterglow lifetime in seconds
	constexpr float   GHOST_GAIN              = 0.20f;   // first ghost brightness vs the source line

	// ---- Colors (from config.js COLORS, sRGB hex -> linear) ----------------
	FORCEINLINE FLinearColor FromHex(uint32 RGB)
	{
		return FLinearColor(FColor((RGB >> 16) & 0xFF, (RGB >> 8) & 0xFF, RGB & 0xFF, 255));
	}

	FORCEINLINE FLinearColor Tunnel()      { return FromHex(0x7cffb2); }
	FORCEINLINE FLinearColor ActiveLane()  { return FromHex(0xbbffdd); }
	FORCEINLINE FLinearColor Enemy()       { return FromHex(0xff6644); }
	FORCEINLINE FLinearColor Bullet()      { return FromHex(0xaaffdd); }
	FORCEINLINE FLinearColor Ship()        { return FromHex(0x7cffb2); }
	FORCEINLINE FLinearColor Wall()        { return FromHex(0xff4444); }
	FORCEINLINE FLinearColor Tank()        { return FromHex(0xffc688); }
	FORCEINLINE FLinearColor TankDamaged() { return FromHex(0xffc688); }
	FORCEINLINE FLinearColor Bomb()        { return FromHex(0xffdd44); }
	FORCEINLINE FLinearColor Heart()       { return FromHex(0xff4488); }
	FORCEINLINE FLinearColor Phase()       { return FromHex(0xcc66ff); }
	FORCEINLINE FLinearColor Spiral()      { return FromHex(0xff66ff); }
}
