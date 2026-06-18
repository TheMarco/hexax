#pragma once

#include "CoreMinimal.h"
#include "HexaxTypes.h"
#include "HexaxConfig.h"

/**
 * Pure gameplay state — the Unreal port of GameState.js. No Unreal types beyond
 * containers; fully testable and owned by AHexaxPawn.
 */
struct FHexaxState
{
	int32 WorldRot        = 0;
	int32 Score           = 0;
	int32 Health          = 100;
	int32 WallHits        = 0;
	float ScoreMultiplier = 1.f;
	bool  bGameOver       = false;
	float GameOverElapsed = 0.f;
	bool  bNewHighScore   = false;
	float FireCooldown    = 0.f;
	int32 TickCount       = 0;
	float ElapsedMs       = 0.f;

	bool SegmentDamage[HX::NUM_LANES];

	FHexaxState() { Reset(); }

	void Reset()
	{
		WorldRot = 0;
		Score = 0;
		Health = 100;
		WallHits = 0;
		ScoreMultiplier = 1.f;
		bGameOver = false;
		GameOverElapsed = 0.f;
		bNewHighScore = false;
		FireCooldown = 0.f;
		TickCount = 0;
		ElapsedMs = 0.f;
		for (int32 i = 0; i < HX::NUM_LANES; ++i) { SegmentDamage[i] = false; }
	}

	/** Returns true if this damage was fatal. */
	bool TakeDamage(int32 Amount)
	{
		Health = FMath::Max(0, Health - Amount);
		if (Health <= 0) { bGameOver = true; return true; }
		return false;
	}

	FHexaxWallHitResult TakeWallHit()
	{
		WallHits++;
		ScoreMultiplier = 1.f; // reset multiplier on wall hit
		if (WallHits >= 3)
		{
			Health = 0;
			bGameOver = true;
			return { 0, 3, true };
		}
		else if (WallHits == 2)
		{
			const bool bFatal = TakeDamage(60);
			return { 60, 2, bFatal };
		}
		const bool bFatal = TakeDamage(30);
		return { 30, 1, bFatal };
	}

	FHexaxSegmentResult DamageSegment(int32 LogicalLane)
	{
		if (SegmentDamage[LogicalLane])
		{
			Health = 0;
			bGameOver = true;
			return { true, false, false };
		}
		SegmentDamage[LogicalLane] = true;
		const int32 Count = GetDamagedSegmentCount();
		return { false, Count == 1, Count >= 4 };
	}

	void RepairAllSegments()
	{
		for (int32 i = 0; i < HX::NUM_LANES; ++i) { SegmentDamage[i] = false; }
	}

	int32 GetDamagedSegmentCount() const
	{
		int32 C = 0;
		for (int32 i = 0; i < HX::NUM_LANES; ++i) { if (SegmentDamage[i]) C++; }
		return C;
	}

	void AddScore(float Base)
	{
		Score += FMath::RoundToInt(Base * ScoreMultiplier);
	}

	void RotateRight()
	{
		if (bGameOver) return;
		WorldRot = (WorldRot + 5) % HX::NUM_LANES;
	}

	void RotateLeft()
	{
		if (bGameOver) return;
		WorldRot = (WorldRot + 1) % HX::NUM_LANES;
	}

	int32 GetRenderLane(int32 LogicalLane) const
	{
		return (LogicalLane - WorldRot + HX::NUM_LANES) % HX::NUM_LANES;
	}

	float GetElapsedSeconds() const { return ElapsedMs / 1000.f; }

	/** Spawn interval in (fractional) enemy ticks. Ported from getSpawnInterval(). */
	float GetSpawnInterval() const
	{
		const float Secs = GetElapsedSeconds();
		if (Secs < 60.f)
		{
			return 3.5f - 1.2f * FMath::Min(1.f, Secs / 60.f);
		}
		else if (Secs < 70.f)
		{
			const float T = (Secs - 60.f) / 10.f;
			return 2.3f - 0.1f * T;
		}
		else if (Secs < 100.f)
		{
			return 2.2f;
		}
		const float T = FMath::Min(1.f, (Secs - 100.f) / 320.f);
		return 2.2f - 0.7f * T;
	}

	/** Enemy tick length in ms. Ported from getTickMs(). */
	float GetTickMs() const
	{
		const float Secs = GetElapsedSeconds();
		if (Secs < 60.f)
		{
			return 800.f - 100.f * FMath::Min(1.f, Secs / 60.f);
		}
		else if (Secs < 70.f)
		{
			const float T = (Secs - 60.f) / 10.f;
			return 700.f - 10.f * T;
		}
		else if (Secs < 100.f)
		{
			return 690.f;
		}
		else if (Secs < 150.f)
		{
			return 680.f;
		}
		const float T = FMath::Min(1.f, (Secs - 150.f) / 330.f);
		return 680.f - 80.f * T;
	}
};
