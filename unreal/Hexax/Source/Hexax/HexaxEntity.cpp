#include "HexaxEntity.h"
#include "HexaxConfig.h"

void FHexaxEntity::Tick()
{
	switch (Type)
	{
	case EHexaxType::Bullet:
		PrevDepth = Depth;
		Depth += 1.f;
		if (Depth > HX::MAX_DEPTH)
		{
			bAlive = false;
		}
		break;

	case EHexaxType::Phase:
		PrevDepth = Depth;
		Depth -= 1.f;
		if (Phase == EHexaxPhase::Shielded && Depth <= HX::PHASE_DEPTH)
		{
			Phase = EHexaxPhase::Vulnerable;
			TransitionFlash = 1.f;
		}
		break;

	case EHexaxType::Spiral:
		PrevDepth = Depth;
		PrevLane  = Lane;
		Depth -= 1.f;
		SpinTick++;
		if (SpinTick % 2 == 0)
		{
			Lane = (Lane + SpinDir + HX::NUM_LANES) % HX::NUM_LANES;
		}
		break;

	default:
		// Enemy, Wall, DoubleWall, Tank, Bomb, Heart all just advance one ring.
		PrevDepth = Depth;
		Depth -= 1.f;
		break;
	}
}

bool FHexaxEntity::TankHit()
{
	Hp--;
	if (Hp == 1)
	{
		HitSide = (FMath::FRand() < 0.5f) ? 1 : 2;
	}
	if (Hp <= 0)
	{
		Kill();
	}
	return Hp <= 0;
}

FHexaxEntityPtr MakeSpawnEntity(EHexaxType Type, int32 Lane)
{
	FHexaxEntityPtr E = MakeShared<FHexaxEntity>(Type, Lane, (float)HX::MAX_DEPTH);
	E->SpinPhase = FMath::FRand() * 360.f;
	switch (Type)
	{
	case EHexaxType::Tank:
		E->Hp = 2;
		break;
	case EHexaxType::DoubleWall:
		E->Lane2 = (Lane + 1) % HX::NUM_LANES;
		break;
	case EHexaxType::Phase:
		E->Phase = EHexaxPhase::Shielded;
		break;
	case EHexaxType::Spiral:
		E->SpinDir = (FMath::FRand() < 0.5f) ? 1 : -1;
		break;
	default:
		break;
	}
	return E;
}

FHexaxEntityPtr MakeBullet(int32 Lane)
{
	// JS: new Bullet(lane, 0.03) — prevDepth set behind spawn so it lerps immediately.
	FHexaxEntityPtr B = MakeShared<FHexaxEntity>(EHexaxType::Bullet, Lane, 0.03f);
	B->PrevDepth = 0.03f - 0.5f;
	return B;
}
