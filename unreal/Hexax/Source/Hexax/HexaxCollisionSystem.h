#pragma once

#include "CoreMinimal.h"
#include "HexaxEntity.h"
#include "HexaxState.h"

/**
 * A kill/explosion that should be presented this frame. The JS used an `onHit`
 * callback; here Resolve() accumulates events and the pawn drains them, which
 * keeps the simulation free of presentation code.
 */
struct FHexaxHitEvent
{
	int32        Lane        = 0;
	float        VisualDepth = 0.f;
	FLinearColor Color       = FLinearColor::White;
	EHexaxType   EntityType  = EHexaxType::Enemy;
	int32        TankSide    = 0;     // 0 none, 1 left, 2 right
	bool         bHeart      = false; // triggers heal sound
};

/** Deferred "ghost bullet" kill — ported from CollisionSystem.pendingKills. */
struct FHexaxPendingKill
{
	FHexaxEntityPtr Enemy;
	FLinearColor    Color      = FLinearColor::White;
	int32           Lane       = 0;
	float           GhostDepth = 0.f;
	float           Elapsed    = 0.f;
	int32           TankSide   = 0;
	EHexaxType      EntityType = EHexaxType::Enemy;
	bool            bTankKill  = false;
};

/**
 * Bullet/entity collision resolution — ported from CollisionSystem.js.
 * Order: walls -> doublewalls -> enemies. Grid match is floor(bulletDepth)==depth
 * with lerp-aware visual positions recorded for explosions and ghost bullets.
 */
struct FHexaxCollisionSystem
{
	FHexaxEntities* Ents  = nullptr;
	FHexaxState*    State = nullptr;

	TArray<FHexaxPendingKill> PendingKills;

	// Drained by the pawn after each Resolve():
	TArray<FHexaxHitEvent> HitEvents;   // explosions + kill sounds
	int32 DeflectCount = 0;             // wall/phase deflects -> hitwall sound
	bool  bHeartCollected = false;      // -> heal sound

	void Init(FHexaxEntities* InEnts, FHexaxState* InState)
	{
		Ents = InEnts;
		State = InState;
		PendingKills.Reset();
	}

	void Resolve(float BulletLerp, float EnemyLerp);

	void CancelPendingKillFor(const FHexaxEntity* E)
	{
		PendingKills.RemoveAll([E](const FHexaxPendingKill& PK) { return PK.Enemy.Get() == E; });
	}
};
