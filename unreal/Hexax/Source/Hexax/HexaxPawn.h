#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "HexaxState.h"
#include "HexaxEntity.h"
#include "HexaxSpawnSystem.h"
#include "HexaxCollisionSystem.h"
#include "HexaxPawn.generated.h"

class UCameraComponent;
class ULineBatchComponent;
class UProceduralMeshComponent;
class UMaterialInterface;
class UMaterialInstanceDynamic;
class USoundBase;
class UAudioComponent;
class UInputComponent;

/** A single explosion particle (radial burst with a trailing line). */
struct FHexaxParticle
{
	FVector      Pos;
	FVector      Vel;
	FVector      Half;       // shard half-segment (gives it length + orientation)
	FVector      SpinAxis = FVector::UpVector;
	float        SpinRate = 0.f;
	FLinearColor Color;
};

struct FHexaxExplosion
{
	TArray<FHexaxParticle> Particles;
	float Elapsed = 0.f;
	float Life    = 0.6f;
};

/** A 3D wireframe solid: unit-ish vertices + edge index pairs. */
struct FHexaxPoly
{
	TArray<FVector>   Verts;
	TArray<FIntPoint> Edges;
};

/** Expanding glowing ring spawned with each explosion. */
struct FHexaxShockwave
{
	FVector      Center;
	FLinearColor Color;
	float        Elapsed = 0.f;
	float        Life    = 0.45f;
	float        MaxRadius = 130.f;
};

/** A dynamic-object line segment captured for phosphor afterglow (replayed decaying). */
struct FHexaxGhostSeg
{
	FVector      A;
	FVector      B;
	FLinearColor Color;
	float        Intensity = 1.f;
	float        Life      = 1.f;   // 1 -> 0 over GHOST_PERSIST seconds
};

/**
 * The whole game lives on this pawn — the Unreal analogue of GameScene.js.
 * It owns the pure-logic state/systems, drives the two fixed-step timers via
 * accumulators, reads input, renders the vector wireframe through a
 * ULineBatchComponent, and presents collision/explosion effects.
 */
UCLASS()
class HEXAX_API AHexaxPawn : public APawn
{
	GENERATED_BODY()

public:
	AHexaxPawn();

	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	// --- HUD accessors (read by AHexaxHUD) ---
	int32 GetScore() const        { return State.Score; }
	int32 GetHealth() const       { return State.Health; }
	float GetMultiplier() const   { return State.ScoreMultiplier; }
	bool  IsGameOver() const      { return State.bGameOver; }
	bool  IsNewHighScore() const  { return State.bNewHighScore; }
	const FString& GetWarning() const { return WarningText; }
	float GetWarningTimer() const { return WarningTimer; }

protected:
	virtual void BeginPlay() override;

	// --- Sound hooks (assign in a Blueprint child; all optional) ---
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* ShootSound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* ExplosionSound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* HitWallSound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* HeartSound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* RotateSound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* DeathSound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* PlayerHitSound = nullptr;   // breach
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* MusicLoop = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* GetReadySound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* TankHitSound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* TankKillSound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* BombSound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* SpiralKillSound = nullptr;
	UPROPERTY(EditAnywhere, Category = "Hexax|Audio") USoundBase* PhaseKillSound = nullptr;

	USoundBase* KillSoundForType(EHexaxType Type, bool bTankKill) const;

private:
	UPROPERTY() UCameraComponent* Camera = nullptr;
	UPROPERTY() ULineBatchComponent* Lines = nullptr;
	UPROPERTY() UProceduralMeshComponent* GlowMesh = nullptr;
	UPROPERTY() UProceduralMeshComponent* LogoMesh = nullptr; // title logo quad
	UPROPERTY() UMaterialInstanceDynamic* LogoMID  = nullptr; // logo material (pulse intensity)
	UPROPERTY() UMaterialInterface* GlowMaterial = nullptr;
	UPROPERTY() UAudioComponent* MusicAudio = nullptr;

	// Per-frame glow mesh buffers (rebuilt each Render). Lines become camera-facing
	// emissive ribbon quads so they write HDR to scene color and actually bloom.
	TArray<FVector>      MeshVerts;
	TArray<int32>        MeshTris;
	TArray<FLinearColor> MeshColors;

	// --- Juice & atmosphere ---
	float ShakeAmp = 0.f;                 // camera shake, decays to 0
	TArray<FHexaxShockwave> Shockwaves;  // expanding rings from explosions

	// Game-over cascading tunnel explosion
	bool  bTunnelExploding = false;
	float ExplodeClock     = 0.f;
	int32 ExplodeNextRing  = 0;

	void AddShake(float Amt);
	void DrawShockwaves();
	void AdvanceTunnelExplosion(float Dt);

	// Input handlers (legacy BindKey targets)
	void OnLeftPressed();
	void OnRightPressed();
	void OnFirePressed();
	void OnToggleCRT();

	// CRT post-process (toggled with the 1 key)
	UPROPERTY() UMaterialInstanceDynamic* CRTDynamic = nullptr;
	bool bCRTOn = true; // CRT on by default; press 1 to toggle

	// --- Simulation ---
	FHexaxState            State;
	FHexaxEntities         Entities;
	FHexaxSpawnSystem      Spawn;
	FHexaxCollisionSystem  Collision;

	// --- Fixed-step timing (the two-timer system) ---
	float EnemyAccumMs  = 0.f;
	float BulletAccumMs = 0.f;
	float CurrentTickMs = HX::TICK_MS;

	// --- Input queue (FIFO, max 4; rotations block) ---
	TArray<uint8> InputQueue;   // 0 = left, 1 = right, 2 = fire
	bool bPendingRestart = false;

	// --- Smooth rotation animation ---
	bool  bRotating       = false;
	int32 RotDir          = 0;     // +1 right, -1 left
	float RotAnimOffset   = 0.f;   // current offset in lane-units
	float RotAnimElapsed  = 0.f;

	// --- Visual effects ---
	TArray<FHexaxExplosion> Explosions;
	float RingFlash[HX::NUM_SEGMENTS];
	bool  bWobble        = false;
	float WobbleElapsed  = 0.f;
	float WobbleAmp      = HX::WOBBLE_AMPLITUDE;
	float MuzzleFlash    = 0.f;
	float ScreenFlash    = 0.f;   // bomb-chain global brightness flash, decays to 0

	// --- Front end (title / attract) ---
	bool  bTitle         = true;  // boot into the title/attract screen
	float TitleSpin      = 0.f;   // continuous attract-mode tunnel rotation (lane units)
	int32 HighScore      = 0;     // persisted best score
	bool  bTitleNewHigh  = false; // celebrate a fresh record on the title after a run

	// Phosphor afterglow: dynamic-object segments captured this frame (when
	// bRecordTrails is true) and replayed with decay over the next frames.
	bool  bRecordTrails  = false;
	TArray<FHexaxGhostSeg> Trails;

	// --- HUD transient text ---
	FString WarningText;
	float   WarningTimer = 0.f;

	// --- Dev: gated auto-screenshot (run with -hexaxshot) ---
	bool  bWantShot = false;
	bool  bShotDone = false;
	float ShotClock = 0.f;

	// --- Visual: free-running clock that drives 3D enemy tumbling ---
	float RenderClock = 0.f;

	// --- Loop pieces (ported from TickSystem + GameScene.update) ---
	void OnEnemyTick();
	void OnBulletTick();
	void ProcessInput(float Dt);
	void StartRotAnim(int32 Direction);
	void AdvanceRotAnim(float Dt);
	void Fire();
	void DrainCollisionEvents();
	void AdvancePendingKills(float Dt);
	void AdvanceDyingSpirals(float Dt);
	void UpdateExplosions(float Dt);
	void ResetGame();
	void StartGame();        // leave the title and begin a run (audio + music)
	void EnterTitle();       // (re)enter the title/attract screen
	void LoadHighScore();    // read persisted high score (GConfig)
	void SaveHighScore();    // persist high score (GConfig)

	// --- Effects ---
	void SpawnExplosionAt(const FVector& WorldPos, const FLinearColor& Color, const FVector& Bias = FVector::ZeroVector, float BiasAmt = 0.f);
	void OnPlayerHit(int32 Lane, const FLinearColor& Color, int32 Damage);
	void OnWallHit(int32 Tier);
	void TriggerGameOver();
	void PlaySound(USoundBase* Sound) const;
	void ShowWarning(const FString& Text, float Seconds);

	// --- Rendering ---
	void Render(float Dt);
	void DrawTitle();                // title / attract overlay (logo, high score, prompt)
	void DrawAndAgeTrails(float Dt); // replay + decay captured dynamic-object afterglow
	void DrawTunnel();
	void DrawDamagedSegments();
	void DrawEntities();
	void DrawShip();
	void DrawExplosions();
	void DrawBolt(int32 Lane, float VisualDepth, float Intensity = 1.f); // energy-dart projectile
	void DrawLightning(const FVector& A, const FVector& B, const FLinearColor& Color, float Intensity, float Amp, int32 Segs); // crackling jagged bolt
	void DrawGhostBullets(); // render in-flight deferred kills so the bolt reaches the target
	void DrawHud();          // vector/neon HUD drawn into the glow mesh, locked to the camera

	// line-batch glow primitives
	void GlowLine(const FVector& A, const FVector& B, const FLinearColor& Base, float Intensity = 1.f);
	void GlowCircleYZ(const FVector& Center, float Radius, const FLinearColor& Color, float Intensity = 1.f, int32 Segments = 18);
	void GlowEllipseYZ(const FVector& Center, float RadiusY, float RadiusZ, const FLinearColor& Color, float Intensity = 1.f, int32 Segments = 18);
	void GlowPolyYZ(const TArray<FVector>& Points, const FLinearColor& Color, bool bClosed, float Intensity = 1.f);

	// True 3D wireframe solid: rotates each vertex, projects via the camera.
	void DrawPolyhedron(const FHexaxPoly& Poly, const FVector& Center, float Scale, const FRotator& Rot, const FLinearColor& Color, float Intensity = 1.f, int32 EdgeStride = 1);

	// Faceted cylinder between two world points (two n-gon rims + verticals).
	void DrawCylinderBetween(const FVector& P0, const FVector& P1, float Radius, int32 Sides, const FLinearColor& Color, float Intensity = 1.f, int32 Stride = 1);

	// Low-poly hockey puck lying on the tunnel wall, oriented to its lane.
	void DrawPuckLP(const FVector& Center, float AngleDeg, float Radius, const FLinearColor& Color, float Intensity = 1.f, bool bDashed = false);

	// Heart laid flat on the tunnel wall (like the puck): two heart rims + ribs.
	void DrawHeartLP(const FVector& Center, float AngleDeg, float Radius, const FLinearColor& Color, float Intensity = 1.f);

	// 3D glyph helpers (front+back faces so perspective foreshortens them)
	void GlowDisc3D(float Depth, float AngleDeg, float Radius, const FLinearColor& Color, float Intensity = 1.f);
	void GlowSphere3D(float Depth, float AngleDeg, float Radius, const FLinearColor& Color, float Intensity = 1.f);
	// Hockey-puck glyph: two foreshortened ellipse rims + side walls, oriented to
	// the lane (rotates with the tunnel face it sits on). Matches Phaser.
	void GlowPuck(const FVector& Center, float AngleDeg, float Radius, const FLinearColor& Color, float Intensity = 1.f, bool bDashed = false);

	// continuous render-lane position of a logical lane (includes rotation anim)
	float RenderLaneFloat(int32 LogicalLane) const;
	float RenderLaneFloatF(float LogicalC) const;
	// world position of a tunnel hex vertex k (0..5) at a depth, carrying world rotation
	FVector TunnelVertexWorld(float Depth, int32 K) const;
	// world position of an entity at (logical lane, visual depth)
	FVector EntityWorld(int32 LogicalLane, float VisualDepth, float Radius = HX::TUBE_RADIUS) const;
	float CurrentEnemyLerp() const;
	float CurrentBulletLerp() const;
};
