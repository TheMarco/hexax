#include "HexaxCollisionSystem.h"
#include "HexaxConfig.h"

static FLinearColor ColorForType(EHexaxType Type)
{
	switch (Type)
	{
	case EHexaxType::Tank:   return HX::Tank();
	case EHexaxType::Bomb:   return HX::Bomb();
	case EHexaxType::Heart:  return HX::Heart();
	case EHexaxType::Phase:  return HX::Phase();
	case EHexaxType::Spiral: return HX::Spiral();
	default:                 return HX::Enemy();
	}
}

void FHexaxCollisionSystem::Resolve(float BulletLerp, float EnemyLerp)
{
	HitEvents.Reset();
	DeflectCount = 0;
	bHeartCollected = false;

	for (const FHexaxEntityPtr& Bullet : Ents->Bullets)
	{
		if (!Bullet->bAlive) continue;
		const int32 BulletDepth = FMath::FloorToInt(Bullet->Depth);

		// --- Walls: bullet destroyed, wall lights up ---
		bool bHitWall = false;
		for (const FHexaxEntityPtr& Wall : Ents->Walls)
		{
			if (!Wall->bAlive) continue;
			if (BulletDepth == FMath::RoundToInt(Wall->Depth) && Bullet->Lane == Wall->Lane)
			{
				Bullet->Kill();
				Bullet->HitDepth = Wall->Depth;
				Bullet->HitPrevDepth = Wall->PrevDepth;
				Wall->HitFlash = 1.f;
				DeflectCount++;
				bHitWall = true;
				break;
			}
		}
		if (bHitWall) continue;

		// --- DoubleWalls (span two lanes) ---
		for (const FHexaxEntityPtr& DW : Ents->DoubleWalls)
		{
			if (!DW->bAlive) continue;
			if (BulletDepth == FMath::RoundToInt(DW->Depth) &&
				(Bullet->Lane == DW->Lane || Bullet->Lane == DW->Lane2))
			{
				Bullet->Kill();
				Bullet->HitDepth = DW->Depth;
				Bullet->HitPrevDepth = DW->PrevDepth;
				DW->HitFlash = 1.f;
				DeflectCount++;
				bHitWall = true;
				break;
			}
		}
		if (bHitWall) continue;

		// --- Enemies ---
		for (const FHexaxEntityPtr& Enemy : Ents->Enemies)
		{
			if (!Enemy->bAlive || Enemy->bDying || Enemy->bPendingKill) continue;
			if (BulletDepth != FMath::RoundToInt(Enemy->Depth) || Bullet->Lane != Enemy->Lane) continue;

			// Phase shielded — deflect like a wall (instant)
			if (Enemy->Type == EHexaxType::Phase && Enemy->Phase == EHexaxPhase::Shielded)
			{
				Bullet->Kill();
				Bullet->HitDepth = Enemy->Depth;
				Bullet->HitPrevDepth = Enemy->PrevDepth;
				Enemy->HitFlash = 1.f;
				DeflectCount++;
				break;
			}

			Bullet->Kill();
			Bullet->HitDepth = Enemy->Depth;
			Bullet->HitPrevDepth = Enemy->PrevDepth;

			const float DistBonus = Enemy->Depth >= 4.f ? 1.5f : 1.f;
			const float BulletVisualDepth = Bullet->PrevDepth + (Bullet->Depth - Bullet->PrevDepth) * BulletLerp;
			const float EnemyVisualDepth = Enemy->PrevDepth + (Enemy->Depth - Enemy->PrevDepth) * EnemyLerp;

			if (Enemy->Type == EHexaxType::Heart)
			{
				Enemy->Kill();
				State->Health = 100;
				State->RepairAllSegments();
				bHeartCollected = true;
				HitEvents.Add({ Enemy->Lane, EnemyVisualDepth, HX::Heart(), EHexaxType::Heart, 0, true });
			}
			else if (Enemy->Type == EHexaxType::Bomb)
			{
				Enemy->Kill();
				State->AddScore(FMath::RoundToInt(100.f * DistBonus));
				HitEvents.Add({ Enemy->Lane, EnemyVisualDepth, HX::Bomb(), EHexaxType::Bomb, 0, false });

				// Chain-kill all other alive, non-dying enemies
				for (const FHexaxEntityPtr& E : Ents->Enemies)
				{
					if (!E->bAlive || E.Get() == Enemy.Get() || E->bDying) continue;
					const FLinearColor C = ColorForType(E->Type);
					const float EVisual = E->PrevDepth + (E->Depth - E->PrevDepth) * EnemyLerp;
					if (E->bPendingKill)
					{
						CancelPendingKillFor(E.Get());
						E->bPendingKill = false;
					}
					E->Kill();
					State->AddScore(100.f);
					HitEvents.Add({ E->Lane, EVisual, C, E->Type, 0, false });
				}
				State->ScoreMultiplier = FMath::Min(State->ScoreMultiplier + 0.5f, 4.f);
			}
			else if (Enemy->Type == EHexaxType::Tank)
			{
				const bool bDead = Enemy->TankHit();
				if (bDead)
				{
					// TankHit() killed it — resurrect for deferred (ghost-bullet) rendering
					Enemy->bAlive = true;
					Enemy->bPendingKill = true;
					State->AddScore(FMath::RoundToInt(200.f * DistBonus));
					const int32 SurvivingSide = (Enemy->HitSide == 1) ? 2 : 1; // opposite of hitSide
					FHexaxPendingKill PK;
					PK.Enemy = Enemy;
					PK.Color = HX::Tank();
					PK.Lane = Enemy->Lane;
					PK.GhostDepth = BulletVisualDepth;
					PK.TankSide = SurvivingSide;
					PK.EntityType = EHexaxType::Tank;
					PK.bTankKill = true;
					PendingKills.Add(PK);
				}
				else
				{
					State->AddScore(FMath::RoundToInt(50.f * DistBonus));
					HitEvents.Add({ Enemy->Lane, EnemyVisualDepth, HX::Tank(), EHexaxType::Tank, Enemy->HitSide, false });
				}
				State->ScoreMultiplier = FMath::Min(State->ScoreMultiplier + 0.1f, 4.f);
			}
			else if (Enemy->Type == EHexaxType::Spiral && Enemy->PrevLane != Enemy->Lane)
			{
				// Mid-lane-change: defer explosion until lane animation completes
				Enemy->bDying = true;
				Enemy->DyingColor = HX::Spiral();
				State->AddScore(FMath::RoundToInt(100.f * DistBonus));
				State->ScoreMultiplier = FMath::Min(State->ScoreMultiplier + 0.1f, 4.f);
			}
			else
			{
				// Regular enemy / phase vulnerable / spiral same lane — deferred kill
				const FLinearColor HitColor =
					Enemy->Type == EHexaxType::Phase ? HX::Phase() :
					Enemy->Type == EHexaxType::Spiral ? HX::Spiral() : HX::Enemy();
				State->AddScore(FMath::RoundToInt(100.f * DistBonus));
				State->ScoreMultiplier = FMath::Min(State->ScoreMultiplier + 0.1f, 4.f);

				Enemy->bPendingKill = true;
				FHexaxPendingKill PK;
				PK.Enemy = Enemy;
				PK.Color = HitColor;
				PK.Lane = Enemy->Lane;
				PK.GhostDepth = BulletVisualDepth;
				PK.EntityType = Enemy->Type;
				PendingKills.Add(PK);
			}
			break;
		}
	}
}
