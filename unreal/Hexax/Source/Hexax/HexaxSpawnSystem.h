#pragma once

#include "CoreMinimal.h"
#include "HexaxEntity.h"
#include "HexaxState.h"

/**
 * Weighted spawning with time-gating, a wall-density cap, and timed pattern
 * "moments" — ported from SpawnSystem.js. Pattern timing is ms-based off
 * State->ElapsedMs so it is immune to tick-speed changes, exactly like the JS.
 */
struct FHexaxSpawnSystem
{
	FHexaxEntities* Ents  = nullptr;
	FHexaxState*    State = nullptr;

	float SpawnBudget   = 0.f;
	int32 ActivePattern = -1;   // -1 = none; otherwise index into the pattern table
	float PatternEndAt  = 0.f;
	float NextPatternAt = 0.f;
	int32 SpiralLane    = 0;
	int32 GapLane       = 0;
	int32 AdjacentLane  = 0;

	void Init(FHexaxEntities* InEnts, FHexaxState* InState);
	void MaybeSpawn();

private:
	void  NextPatternIn();
	void  StartPattern();
	void  SpawnNormal(int32 ForceLane = -1);
	void  SpawnType(EHexaxType Type, int32 Lane);
	EHexaxType PickType(const TArray<EHexaxType>& Unlocked, bool bWallCapped) const;
	TArray<EHexaxType> GetUnlockedTypes() const;
	int32 GetActiveWallCount() const;
	int32 GetMaxActiveWalls() const;
	float GetDynamicWeight(EHexaxType Type) const;

	// Pattern bodies
	void PatternAdjacent();
	void PatternSpiral();
	void PatternGap();
	void PatternEnemyRush();
};
