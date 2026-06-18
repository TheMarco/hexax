#pragma once

#include "CoreMinimal.h"
#include "HexaxConfig.h"

/**
 * Real-3D tunnel geometry. The Phaser version hand-projected everything to 2D;
 * here every helper returns a world-space FVector and the camera does the
 * projection.
 *
 * Layout: the tunnel runs along +X. A ring at logical `Depth` sits at
 * world X = NEAR_X + Depth * SEG_LEN. Around the X axis, angle 0 is +Y and the
 * angle sweeps through +Z; render lane 0 (the player's lane) is pinned to the
 * bottom of the screen (-Z, i.e. BOTTOM_ANGLE_DEG = -90).
 *
 * The hex wireframe is rotationally symmetric, so it is drawn static; only
 * entities and the active-lane highlight carry the rotation, expressed as a
 * continuous `RenderLaneFloat` (integer render lane + smooth animation offset).
 */
namespace HexaxGeo
{
	// Original perspective curve: ring screen-size ∝ GetScale(depth).
	FORCEINLINE float GetScale(float Depth)
	{
		const float D = FMath::Clamp(Depth, 0.f, (float)HX::MAX_DEPTH);
		const float T = D / (float)HX::MAX_DEPTH;
		return 1.f - (1.f - HX::SCALE_MIN) * FMath::Pow(T, HX::SCALE_POWER);
	}

	// Place each ring so perspective reproduces GetScale (smaller = further).
	FORCEINLINE float RingX(float Depth)
	{
		return HX::PERSP_NEAR / GetScale(Depth);
	}

	FORCEINLINE FVector OnTube(float Depth, float AngleDeg, float Radius)
	{
		const float A = FMath::DegreesToRadians(AngleDeg);
		return FVector(RingX(Depth), Radius * FMath::Cos(A), Radius * FMath::Sin(A));
	}

	// Corner k (0..5) of the hex ring. Flat-bottom: vertices straddle -90 so the
	// bottom edge (the player's face, between vertex 0 and 1) is horizontal.
	FORCEINLINE float VertexAngleDeg(int32 K)
	{
		return HX::BOTTOM_ANGLE_DEG - 30.f + K * 60.f;
	}

	FORCEINLINE FVector Vertex(float Depth, int32 K)
	{
		return OnTube(Depth, VertexAngleDeg(K), HX::TUBE_RADIUS);
	}

	FORCEINLINE FVector VertexAtRadius(float Depth, int32 K, float Radius)
	{
		return OnTube(Depth, VertexAngleDeg(K), Radius);
	}

	FORCEINLINE float LaneCenterAngleDeg(float RenderLaneFloat)
	{
		return HX::BOTTOM_ANGLE_DEG + RenderLaneFloat * 60.f;
	}

	// Center of a face (where entities sit), on the tube wall by default.
	FORCEINLINE FVector LaneCenter(float Depth, float RenderLaneFloat, float Radius = HX::TUBE_RADIUS)
	{
		return OnTube(Depth, LaneCenterAngleDeg(RenderLaneFloat), Radius);
	}

	// In-wall basis at a given angle: Radial points outward from the axis,
	// Tangent runs along the ring. Both lie in the Y-Z plane (facing the camera),
	// so glyphs drawn from these read as flat-on wireframes.
	FORCEINLINE void Basis(float AngleDeg, FVector& OutRadial, FVector& OutTangent)
	{
		const float A = FMath::DegreesToRadians(AngleDeg);
		OutRadial  = FVector(0.f, FMath::Cos(A), FMath::Sin(A));
		OutTangent = FVector(0.f, -FMath::Sin(A), FMath::Cos(A));
	}
}
