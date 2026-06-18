#include "HexaxSpawnSystem.h"
#include "HexaxConfig.h"

// Types the spawner can produce (bullets are never spawned here).
static const EHexaxType GSpawnTypes[] = {
	EHexaxType::Enemy, EHexaxType::Wall, EHexaxType::DoubleWall, EHexaxType::Tank,
	EHexaxType::Bomb, EHexaxType::Heart, EHexaxType::Phase, EHexaxType::Spiral
};

// Base spawn weights (config WEIGHTS).
static float BaseWeight(EHexaxType T)
{
	switch (T)
	{
	case EHexaxType::Enemy:      return 55.f;
	case EHexaxType::Wall:       return 14.f;
	case EHexaxType::DoubleWall: return 9.f;
	case EHexaxType::Tank:       return 11.f;
	case EHexaxType::Bomb:       return 9.f;
	case EHexaxType::Heart:      return 2.f;
	case EHexaxType::Phase:      return 10.f;
	case EHexaxType::Spiral:     return 16.f;
	default:                     return 0.f;
	}
}

// Unlock time in seconds (config UNLOCK_TIMES).
static float UnlockTime(EHexaxType T)
{
	switch (T)
	{
	case EHexaxType::Enemy:      return 0.f;
	case EHexaxType::Wall:       return 20.f;
	case EHexaxType::Tank:       return 15.f;
	case EHexaxType::DoubleWall: return 70.f;
	case EHexaxType::Bomb:       return 100.f;
	case EHexaxType::Heart:      return 100.f;
	case EHexaxType::Phase:      return 15.f;
	case EHexaxType::Spiral:     return 70.f;
	default:                     return 0.f;
	}
}

void FHexaxSpawnSystem::Init(FHexaxEntities* InEnts, FHexaxState* InState)
{
	Ents = InEnts;
	State = InState;
	SpawnBudget = 0.f;
	ActivePattern = -1;
	SpiralLane = 0;
	GapLane = 0;
	AdjacentLane = 0;
	NextPatternIn();
}

void FHexaxSpawnSystem::NextPatternIn()
{
	const float Secs = 30.f + FMath::FRand() * 15.f;
	NextPatternAt = State->ElapsedMs + Secs * 1000.f;
}

void FHexaxSpawnSystem::StartPattern()
{
	ActivePattern = FMath::RandRange(0, 3); // 0=adjacent 1=spiral 2=gap 3=enemyRush
	const float Secs = 6.f + FMath::FRand() * 4.f;
	PatternEndAt = State->ElapsedMs + Secs * 1000.f;
	SpiralLane = FMath::RandRange(0, HX::NUM_LANES - 1);
	GapLane = FMath::RandRange(0, HX::NUM_LANES - 1);
	AdjacentLane = FMath::RandRange(0, HX::NUM_LANES - 1);
}

TArray<EHexaxType> FHexaxSpawnSystem::GetUnlockedTypes() const
{
	const float Secs = State->GetElapsedSeconds();
	TArray<EHexaxType> Out;
	for (EHexaxType T : GSpawnTypes)
	{
		if (Secs >= UnlockTime(T)) Out.Add(T);
	}
	return Out;
}

int32 FHexaxSpawnSystem::GetActiveWallCount() const
{
	int32 Count = 0;
	for (const FHexaxEntityPtr& W : Ents->Walls)       { if (W->bAlive) Count++; }
	for (const FHexaxEntityPtr& W : Ents->DoubleWalls) { if (W->bAlive) Count++; }
	return Count;
}

int32 FHexaxSpawnSystem::GetMaxActiveWalls() const
{
	const float Secs = State->GetElapsedSeconds();
	return FMath::Min(1 + FMath::FloorToInt(Secs / 35.f), 4);
}

float FHexaxSpawnSystem::GetDynamicWeight(EHexaxType Type) const
{
	const float Secs = State->GetElapsedSeconds();
	if (Type == EHexaxType::Heart)
	{
		const float T = FMath::Clamp((Secs - 100.f) / 200.f, 0.f, 1.f);
		return 2.f + T * 10.f;
	}
	if (Type == EHexaxType::Spiral)
	{
		const float T = FMath::Clamp((Secs - 70.f) / 300.f, 0.f, 1.f);
		return 16.f + T * 19.f;
	}
	return BaseWeight(Type);
}

EHexaxType FHexaxSpawnSystem::PickType(const TArray<EHexaxType>& Unlocked, bool bWallCapped) const
{
	float Total = 0.f;
	TArray<TPair<EHexaxType, float>> Pool;
	for (EHexaxType T : Unlocked)
	{
		if (bWallCapped && (T == EHexaxType::Wall || T == EHexaxType::DoubleWall)) continue;
		if (T == EHexaxType::Heart && State->Health >= 80) continue;
		const float W = GetDynamicWeight(T);
		Pool.Add({ T, W });
		Total += W;
	}
	if (Pool.Num() == 0) return EHexaxType::Enemy;

	float Roll = FMath::FRand() * Total;
	for (const TPair<EHexaxType, float>& Entry : Pool)
	{
		Roll -= Entry.Value;
		if (Roll <= 0.f) return Entry.Key;
	}
	return Pool.Last().Key;
}

void FHexaxSpawnSystem::SpawnType(EHexaxType Type, int32 Lane)
{
	FHexaxEntityPtr E = MakeSpawnEntity(Type, Lane);
	switch (Type)
	{
	case EHexaxType::Wall:       Ents->Walls.Add(E); break;
	case EHexaxType::DoubleWall: Ents->DoubleWalls.Add(E); break;
	default:                     Ents->Enemies.Add(E); break; // enemy, tank, bomb, heart, phase, spiral
	}
}

void FHexaxSpawnSystem::SpawnNormal(int32 ForceLane)
{
	const int32 Lane = (ForceLane >= 0) ? ForceLane : FMath::RandRange(0, HX::NUM_LANES - 1);
	const TArray<EHexaxType> Unlocked = GetUnlockedTypes();
	const bool bWallCapped = GetActiveWallCount() >= GetMaxActiveWalls();
	const EHexaxType Type = PickType(Unlocked, bWallCapped);
	SpawnType(Type, Lane);
}

void FHexaxSpawnSystem::MaybeSpawn()
{
	// Pattern timing (ms-based)
	if (ActivePattern >= 0)
	{
		if (State->ElapsedMs >= PatternEndAt)
		{
			ActivePattern = -1;
			NextPatternIn();
		}
	}
	else if (State->ElapsedMs >= NextPatternAt)
	{
		StartPattern();
	}

	const float Interval = State->GetSpawnInterval();
	SpawnBudget += (1.f / Interval);

	if (SpawnBudget >= 1.f)
	{
		SpawnBudget -= 1.f;
		if (ActivePattern >= 0)
		{
			switch (ActivePattern)
			{
			case 0: PatternAdjacent(); break;
			case 1: PatternSpiral(); break;
			case 2: PatternGap(); break;
			case 3: PatternEnemyRush(); break;
			}
			return;
		}
		SpawnNormal();
	}
}

void FHexaxSpawnSystem::PatternAdjacent()
{
	const TArray<EHexaxType> Unlocked = GetUnlockedTypes();
	const bool bWallCapped = GetActiveWallCount() >= GetMaxActiveWalls();
	const bool bHasWalls = Unlocked.Contains(EHexaxType::Wall) && !bWallCapped;
	if (bHasWalls && FMath::FRand() < 0.6f)
	{
		AdjacentLane = (AdjacentLane + 1) % HX::NUM_LANES;
		SpawnType(EHexaxType::Wall, AdjacentLane);
	}
	else
	{
		SpawnNormal();
	}
}

void FHexaxSpawnSystem::PatternSpiral()
{
	const int32 Lane = SpiralLane % HX::NUM_LANES;
	SpiralLane = (SpiralLane + 1) % HX::NUM_LANES;
	const TArray<EHexaxType> Unlocked = GetUnlockedTypes();
	const bool bWallCapped = GetActiveWallCount() >= GetMaxActiveWalls();
	const EHexaxType Type = PickType(Unlocked, bWallCapped);
	SpawnType(Type, Lane);
}

void FHexaxSpawnSystem::PatternGap()
{
	int32 Lane = FMath::RandRange(0, HX::NUM_LANES - 1);
	if (Lane == GapLane) Lane = (Lane + 1) % HX::NUM_LANES;
	const TArray<EHexaxType> Unlocked = GetUnlockedTypes();
	const bool bWallCapped = GetActiveWallCount() >= GetMaxActiveWalls();
	const EHexaxType Type = PickType(Unlocked, bWallCapped);
	SpawnType(Type, Lane);
}

void FHexaxSpawnSystem::PatternEnemyRush()
{
	const int32 Lane = FMath::RandRange(0, HX::NUM_LANES - 1);
	SpawnType(EHexaxType::Enemy, Lane);
}
