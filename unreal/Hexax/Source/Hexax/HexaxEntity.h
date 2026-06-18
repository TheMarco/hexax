#pragma once

#include "CoreMinimal.h"
#include "HexaxTypes.h"

/**
 * A single game entity. The JS version used a small class hierarchy
 * (Enemy/Wall/Tank/...) but every subclass is just a few fields plus a tiny
 * tick(), so here it is one tagged struct. Entities are held by TSharedPtr so
 * that the collision system's deferred "ghost bullet" kills can keep a
 * reference alive after the entity has been filtered out of its array — exactly
 * like JS object references surviving an Array.filter().
 */
struct FHexaxEntity
{
	EHexaxType Type = EHexaxType::Enemy;

	int32 Lane      = 0;
	int32 Lane2     = 0;   // DoubleWall: second occupied lane
	float Depth     = 0.f;
	float PrevDepth = 0.f;
	bool  bAlive    = true;

	// Tank
	int32 Hp        = 0;
	int32 HitSide   = 0;   // 0 = none, 1 = left, 2 = right (visual side of remaining/destroyed ball)

	// Phase
	EHexaxPhase Phase      = EHexaxPhase::Shielded;
	float TransitionFlash  = 0.f;

	// Spiral
	int32 SpinDir   = 1;
	int32 PrevLane  = 0;
	int32 SpinTick  = 0;
	bool  bDying       = false;
	float DyingElapsed = 0.f;   // time since marked dying (resolves when >= one enemy cycle)
	FLinearColor DyingColor = FLinearColor::White;

	// Wall / Phase deflect flash
	float HitFlash  = 0.f;

	// Visual: per-entity spin offset so 3D wireframes tumble out of sync
	float SpinPhase = 0.f;

	// Collision bookkeeping
	bool  bPendingKill = false;
	float HitDepth     = 0.f;
	float HitPrevDepth = 0.f;

	FHexaxEntity() {}
	FHexaxEntity(EHexaxType InType, int32 InLane, float InDepth)
		: Type(InType), Lane(InLane), Depth(InDepth), PrevDepth(InDepth), PrevLane(InLane) {}

	/** Advance one logical tick. Behaviour depends on Type. */
	void Tick();

	/** Tank only: apply one hit, returns true if the tank was killed. */
	bool TankHit();

	void Kill() { bAlive = false; }
};

using FHexaxEntityPtr = TSharedPtr<FHexaxEntity>;

/** Owns the four entity arrays — the analogue of EntityManager.js. */
struct FHexaxEntities
{
	TArray<FHexaxEntityPtr> Enemies;     // enemy, tank, bomb, heart, phase, spiral
	TArray<FHexaxEntityPtr> Bullets;
	TArray<FHexaxEntityPtr> Walls;
	TArray<FHexaxEntityPtr> DoubleWalls;

	void Reset()
	{
		Enemies.Reset();
		Bullets.Reset();
		Walls.Reset();
		DoubleWalls.Reset();
	}

	void RemoveDeadBullets()
	{
		Bullets.RemoveAll([](const FHexaxEntityPtr& B) { return !B.IsValid() || !B->bAlive; });
	}

	void RemoveDeadEnemies()
	{
		Enemies.RemoveAll([](const FHexaxEntityPtr& E) { return !E.IsValid() || !E->bAlive; });
	}

	void RemoveDeadEnemiesAndWalls()
	{
		RemoveDeadEnemies();
		Walls.RemoveAll([](const FHexaxEntityPtr& W) { return !W.IsValid() || !W->bAlive; });
		DoubleWalls.RemoveAll([](const FHexaxEntityPtr& W) { return !W.IsValid() || !W->bAlive; });
	}
};

/** Build an entity at the far ring (depth = MAX_DEPTH), setting type-specific fields. */
FHexaxEntityPtr MakeSpawnEntity(EHexaxType Type, int32 Lane);

/** Build a bullet at the player ring (depth = 0.03, like the JS spawn). */
FHexaxEntityPtr MakeBullet(int32 Lane);
