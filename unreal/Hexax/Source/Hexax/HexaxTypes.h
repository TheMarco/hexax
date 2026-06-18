#pragma once

#include "CoreMinimal.h"

/** Entity kind. Mirrors the JS `type` string on each entity. */
enum class EHexaxType : uint8
{
	Enemy,
	Wall,
	DoubleWall,
	Tank,
	Bomb,
	Heart,
	Phase,
	Spiral,
	Bullet
};

/** Phase enemy shield state. */
enum class EHexaxPhase : uint8
{
	Shielded,
	Vulnerable
};

/** Result of GameState::takeWallHit (3-tier wall escalation). */
struct FHexaxWallHitResult
{
	int32 Damage = 0;
	int32 Tier   = 0;
	bool  bFatal = false;
};

/** Result of GameState::damageSegment (tunnel integrity). */
struct FHexaxSegmentResult
{
	bool bFatal       = false;
	bool bFirstDamage = false;
	bool bCritical    = false;
};
