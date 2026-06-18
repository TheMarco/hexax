#include "HexaxPawn.h"
#include "HexaxGeometry.h"
#include "HexaxConfig.h"
#include "HexaxFont.h"
#include "Camera/CameraComponent.h"
#include "Components/LineBatchComponent.h"
#include "ProceduralMeshComponent.h"
#include "Materials/MaterialInterface.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Components/AudioComponent.h"
#include "Sound/SoundBase.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/PlayerController.h"
#include "Engine/Engine.h"
#include "Engine/PostProcessVolume.h"
#include "Misc/ConfigCacheIni.h"
#include "Engine/World.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "HAL/PlatformMisc.h"

static constexpr float GHOST_BULLET_SPEED = 5.5f; // segments/sec — ~matches the bullet so the rendered ghost bolt travels seamlessly into the target
static constexpr float PENDING_TIMEOUT_MS = 300.f;
static constexpr float STEP_LANES         = 1.f;  // one rotation = one lane

// ---------------------------------------------------------------------------
// 3D wireframe solids (built once, cached). Verts are normalised so DrawPolyhedron
// scales them uniformly; edges connect the nearest vertices.
// ---------------------------------------------------------------------------
static TArray<FIntPoint> EdgesByMinDist(const TArray<FVector>& V, float Tolerance = 1.25f)
{
	float MinD2 = TNumericLimits<float>::Max();
	for (int32 i = 0; i < V.Num(); ++i)
		for (int32 j = i + 1; j < V.Num(); ++j)
			MinD2 = FMath::Min(MinD2, (float)FVector::DistSquared(V[i], V[j]));

	TArray<FIntPoint> E;
	const float Thr = MinD2 * Tolerance;
	for (int32 i = 0; i < V.Num(); ++i)
		for (int32 j = i + 1; j < V.Num(); ++j)
			if ((float)FVector::DistSquared(V[i], V[j]) <= Thr)
				E.Add(FIntPoint(i, j));
	return E;
}

static void NormalizeVerts(TArray<FVector>& V)
{
	for (FVector& v : V) { v.Normalize(); }
}

static const FHexaxPoly& IcosaPoly()
{
	static FHexaxPoly P = []()
	{
		const float g = 1.6180339887f;
		FHexaxPoly p;
		p.Verts = {
			FVector(0, 1, g), FVector(0, -1, g), FVector(0, 1, -g), FVector(0, -1, -g),
			FVector(1, g, 0), FVector(-1, g, 0), FVector(1, -g, 0), FVector(-1, -g, 0),
			FVector(g, 0, 1), FVector(-g, 0, 1), FVector(g, 0, -1), FVector(-g, 0, -1)
		};
		NormalizeVerts(p.Verts);
		p.Edges = EdgesByMinDist(p.Verts);
		return p;
	}();
	return P;
}

// Spiked mine: icosahedron rim plus an outward spike from every vertex.
static const FHexaxPoly& SpikedPoly()
{
	static FHexaxPoly P = []()
	{
		FHexaxPoly p = IcosaPoly(); // copy rim verts + edges
		const int32 Base = p.Verts.Num();
		for (int32 i = 0; i < Base; ++i)
		{
			p.Verts.Add(p.Verts[i] * 1.7f);          // spike tip
			p.Edges.Add(FIntPoint(i, Base + i));     // shaft
		}
		return p;
	}();
	return P;
}

AHexaxPawn::AHexaxPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	AutoPossessPlayer = EAutoReceiveInput::Player0;

	// Fixed scene root so the camera can shake without moving the world geometry.
	USceneComponent* SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = SceneRoot;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(SceneRoot);
	Camera->SetFieldOfView(HX::CAMERA_FOV);
	Camera->bConstrainAspectRatio = false;
	Camera->SetAutoActivate(true);   // make sure THIS camera is the view source
	BaseEyeHeight = 0.f;             // no default eye-height offset if a fallback view is ever used

	Lines = CreateDefaultSubobject<ULineBatchComponent>(TEXT("Lines"));
	Lines->SetupAttachment(SceneRoot);
	Lines->PrimaryComponentTick.bCanEverTick = false;
	Lines->SetRelativeTransform(FTransform::Identity);

	// Emissive ribbon mesh — this is what actually glows (real geometry in scene color).
	GlowMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("GlowMesh"));
	GlowMesh->SetupAttachment(SceneRoot);
	GlowMesh->SetRelativeTransform(FTransform::Identity);
	GlowMesh->bUseAsyncCooking = false;
	GlowMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	GlowMesh->SetCastShadow(false);
	GlowMesh->bCastDynamicShadow = false;

	// Textured logo quad for the title screen (own mesh so it can sample the logo texture).
	LogoMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("LogoMesh"));
	LogoMesh->SetupAttachment(SceneRoot);
	LogoMesh->SetRelativeTransform(FTransform::Identity);
	LogoMesh->bUseAsyncCooking = false;
	LogoMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	LogoMesh->SetCastShadow(false);
	LogoMesh->bCastDynamicShadow = false;

	for (int32 i = 0; i < HX::NUM_SEGMENTS; ++i) { RingFlash[i] = 0.f; }
}

void AHexaxPawn::BeginPlay()
{
	Super::BeginPlay();

	// Pin to the origin looking down +X so geometry world == component local space.
	SetActorLocationAndRotation(FVector::ZeroVector, FRotator::ZeroRotator);

	// Lock arcade framing so the whole tunnel fits regardless of window aspect.
	Camera->SetFieldOfView(HX::CAMERA_FOV);
	Camera->bConstrainAspectRatio = true;
	Camera->AspectRatio = HX::CAMERA_ASPECT;

	// Vector-screen post processing: lock exposure (so black stays black) and
	// bloom the HDR line cores into a glow.
	bWantShot = FParse::Param(FCommandLine::Get(), TEXT("hexaxshot"));

	// FXAA instead of temporal AA — temporal AA ghosts/smears the thin neon lines
	// while the tunnel rotates. Also keep motion blur off.
	if (GEngine)
	{
		GEngine->Exec(GetWorld(), TEXT("r.AntiAliasingMethod 1"));
		GEngine->Exec(GetWorld(), TEXT("r.MotionBlurQuality 0"));
	}

	// Build the post-process look once.
	FPostProcessSettings PP;
	// Lock exposure so the void stays black and bright lines read as neon.
	PP.bOverride_AutoExposureMinBrightness = true; PP.AutoExposureMinBrightness = 1.f;
	PP.bOverride_AutoExposureMaxBrightness = true; PP.AutoExposureMaxBrightness = 1.f;
	// Big soft bloom — turns the bright lines into glowing neon.
	PP.bOverride_BloomIntensity = true;   PP.BloomIntensity = 1.7f;
	PP.bOverride_BloomThreshold = true;   PP.BloomThreshold = 0.30f;
	PP.bOverride_BloomSizeScale = true;   PP.BloomSizeScale = 6.f;
	// Arcade CRT flavour.
	PP.bOverride_SceneFringeIntensity = true; PP.SceneFringeIntensity = 0.6f; // chromatic aberration (subtle)
	PP.bOverride_VignetteIntensity = true;    PP.VignetteIntensity = 0.55f;
	PP.bOverride_FilmGrainIntensity = true;   PP.FilmGrainIntensity = 0.15f;
	PP.bOverride_LensFlareIntensity = true;   PP.LensFlareIntensity = 0.f;  // off (the orange shimmer/streaks); engine default is 1.0 so force it to 0

	// Apply on the camera component...
	Camera->PostProcessSettings = PP;
	Camera->PostProcessBlendWeight = 1.f;
	Camera->Activate(true);

	// ...AND via an unbound PostProcessVolume — this applies globally regardless
	// of which camera ends up being the view source, which is the reliable path.
	if (UWorld* W = GetWorld())
	{
		if (APostProcessVolume* Vol = W->SpawnActor<APostProcessVolume>())
		{
			Vol->bUnbound = true;
			Vol->BlendWeight = 1.f;
			Vol->Priority = 100.f;
			Vol->Settings = PP;

			// CRT post-process material as a blendable, driven by a dynamic instance
			// so the 1 key can toggle it via the 'Enabled' scalar.
			if (UMaterialInterface* CRTMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Materials/M_HexaxCRT.M_HexaxCRT")))
			{
				CRTDynamic = UMaterialInstanceDynamic::Create(CRTMat, this);
				if (CRTDynamic)
				{
					if (bWantShot) { bCRTOn = true; } // dev capture always shows the CRT
					CRTDynamic->SetScalarParameterValue(TEXT("Enabled"), bCRTOn ? 1.f : 0.f);
					Vol->Settings.AddBlendable(CRTDynamic, 1.f);
				}
			}
		}
	}

	// Emissive glow material (created headlessly by Scripts/create_glow_material.py).
	GlowMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Materials/M_HexaxGlow.M_HexaxGlow"));
	if (GlowMaterial && GlowMesh)
	{
		GlowMesh->SetMaterial(0, GlowMaterial);
	}

	// Title logo material (additive emissive, samples the imported logo texture).
	if (UMaterialInterface* LogoMat = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/UI/M_HexaxLogo.M_HexaxLogo")))
	{
		LogoMID = UMaterialInstanceDynamic::Create(LogoMat, this);
		if (LogoMID && LogoMesh) { LogoMesh->SetMaterial(0, LogoMID); }
	}

	// Audio (imported by Scripts/import_audio.py into /Game/Audio).
	auto LoadSnd = [](const TCHAR* Name) -> USoundBase*
	{
		return LoadObject<USoundBase>(nullptr, *FString::Printf(TEXT("/Game/Audio/%s.%s"), Name, Name));
	};
	ShootSound      = LoadSnd(TEXT("shoot"));
	ExplosionSound  = LoadSnd(TEXT("explode"));
	HitWallSound    = LoadSnd(TEXT("hitwall"));
	HeartSound      = LoadSnd(TEXT("heart"));
	RotateSound     = LoadSnd(TEXT("twist"));
	DeathSound      = LoadSnd(TEXT("death"));
	PlayerHitSound  = LoadSnd(TEXT("breach"));
	MusicLoop       = LoadSnd(TEXT("soundtrack"));
	GetReadySound   = LoadSnd(TEXT("getready"));
	TankHitSound    = LoadSnd(TEXT("tank_hit"));
	TankKillSound   = LoadSnd(TEXT("tank_kill"));
	BombSound       = LoadSnd(TEXT("bomb_explode"));
	SpiralKillSound = LoadSnd(TEXT("spiral_kill"));
	PhaseKillSound  = LoadSnd(TEXT("phase_kill"));

	LoadHighScore();
	EnterTitle();   // boot into the title / attract screen
}

void AHexaxPawn::ResetGame()
{
	State.Reset();
	Entities.Reset();
	Spawn.Init(&Entities, &State);
	Collision.Init(&Entities, &State);

	EnemyAccumMs = 0.f;
	BulletAccumMs = 0.f;
	CurrentTickMs = HX::TICK_MS;

	InputQueue.Reset();
	bPendingRestart = false;
	bRotating = false;
	RotDir = 0;
	RotAnimOffset = 0.f;
	RotAnimElapsed = 0.f;

	Explosions.Reset();
	Shockwaves.Reset();
	Trails.Reset();
	bRecordTrails = false;
	ScreenFlash = 0.f;
	ShakeAmp = 0.f;
	bTunnelExploding = false;
	ExplodeClock = 0.f;
	ExplodeNextRing = 0;
	for (int32 i = 0; i < HX::NUM_SEGMENTS; ++i) { RingFlash[i] = 0.f; }
	bWobble = false;
	WobbleElapsed = 0.f;
	MuzzleFlash = 0.f;
	WarningText.Reset();
	WarningTimer = 0.f;
	TitleSpin = 0.f;

	// Silent reset — audio/music belongs to StartGame so the title stays quiet.
	if (MusicAudio) { MusicAudio->Stop(); MusicAudio = nullptr; }
}

void AHexaxPawn::StartGame()
{
	ResetGame();
	bTitle = false;
	bTitleNewHigh = false;
	if (LogoMesh) { LogoMesh->ClearMeshSection(0); } // hide the title logo during play
	if (MusicLoop)
	{
		MusicAudio = UGameplayStatics::SpawnSound2D(this, MusicLoop, 1.f, 1.f, 0.f, nullptr, false, false);
	}
	PlaySound(GetReadySound);
}

void AHexaxPawn::EnterTitle()
{
	ResetGame();        // clears entities/effects and stops music
	bTitle = true;      // bTitleNewHigh is set by TriggerGameOver and kept until next StartGame
}

void AHexaxPawn::LoadHighScore()
{
	int32 V = 0;
	if (GConfig) { GConfig->GetInt(TEXT("Hexax"), TEXT("HighScore"), V, GGameUserSettingsIni); }
	HighScore = FMath::Max(0, V);
}

void AHexaxPawn::SaveHighScore()
{
	if (GConfig)
	{
		GConfig->SetInt(TEXT("Hexax"), TEXT("HighScore"), HighScore, GGameUserSettingsIni);
		GConfig->Flush(false, GGameUserSettingsIni);
	}
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
void AHexaxPawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	// Legacy direct key binds — no InputMappingContext assets required.
	PlayerInputComponent->BindKey(EKeys::Left,  IE_Pressed, this, &AHexaxPawn::OnLeftPressed);
	PlayerInputComponent->BindKey(EKeys::A,     IE_Pressed, this, &AHexaxPawn::OnLeftPressed);
	PlayerInputComponent->BindKey(EKeys::Right, IE_Pressed, this, &AHexaxPawn::OnRightPressed);
	PlayerInputComponent->BindKey(EKeys::D,     IE_Pressed, this, &AHexaxPawn::OnRightPressed);
	PlayerInputComponent->BindKey(EKeys::SpaceBar, IE_Pressed, this, &AHexaxPawn::OnFirePressed);
	PlayerInputComponent->BindKey(EKeys::One, IE_Pressed, this, &AHexaxPawn::OnToggleCRT); // toggle CRT

	PlayerInputComponent->BindKey(EKeys::Gamepad_DPad_Left,  IE_Pressed, this, &AHexaxPawn::OnLeftPressed);
	PlayerInputComponent->BindKey(EKeys::Gamepad_LeftStick_Left, IE_Pressed, this, &AHexaxPawn::OnLeftPressed);
	PlayerInputComponent->BindKey(EKeys::Gamepad_DPad_Right, IE_Pressed, this, &AHexaxPawn::OnRightPressed);
	PlayerInputComponent->BindKey(EKeys::Gamepad_LeftStick_Right, IE_Pressed, this, &AHexaxPawn::OnRightPressed);
	PlayerInputComponent->BindKey(EKeys::Gamepad_FaceButton_Bottom, IE_Pressed, this, &AHexaxPawn::OnFirePressed);
}

void AHexaxPawn::OnLeftPressed()
{
	if (InputQueue.Num() < 4) InputQueue.Add(0);
}

void AHexaxPawn::OnRightPressed()
{
	if (InputQueue.Num() < 4) InputQueue.Add(1);
}

void AHexaxPawn::OnFirePressed()
{
	if (State.bGameOver)
	{
		if (State.GameOverElapsed >= 3000.f) bPendingRestart = true;
	}
	else if (InputQueue.Num() < 4)
	{
		InputQueue.Add(2);
	}
}

void AHexaxPawn::OnToggleCRT()
{
	bCRTOn = !bCRTOn;
	if (CRTDynamic) { CRTDynamic->SetScalarParameterValue(TEXT("Enabled"), bCRTOn ? 1.f : 0.f); }
}

void AHexaxPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	const float Dt = DeltaSeconds;
	RenderClock += Dt;

	// Attract screen: keep the tunnel slowly rotating, no simulation.
	if (bTitle) { TitleSpin += Dt * 0.30f; }

	// --- Fixed-step simulation (the two-timer system) ---
	if (!State.bGameOver && !bTitle)
	{
		BulletAccumMs += Dt * 1000.f;
		int32 Guard = 0;
		while (BulletAccumMs >= HX::BULLET_TICK_MS && Guard++ < 8)
		{
			BulletAccumMs -= HX::BULLET_TICK_MS;
			OnBulletTick();
		}

		EnemyAccumMs += Dt * 1000.f;
		Guard = 0;
		while (EnemyAccumMs >= CurrentTickMs && Guard++ < 8)
		{
			EnemyAccumMs -= CurrentTickMs;
			OnEnemyTick();
			if (State.bGameOver) break;
		}
	}

	// --- Per-frame update ---
	ProcessInput(Dt);
	AdvanceRotAnim(Dt);

	// Decay ring flashes / muzzle / wobble / warning
	for (int32 i = 0; i < HX::NUM_SEGMENTS; ++i)
	{
		RingFlash[i] = FMath::Max(0.f, RingFlash[i] - HX::FLASH_DECAY * Dt);
	}
	if (MuzzleFlash > 0.f) MuzzleFlash = FMath::Max(0.f, MuzzleFlash - Dt * 12.f);

	// Camera shake (decaying) + a slow "breathing" dolly along the view axis. The
	// dolly makes the whole tunnel + everything in it gently grow/shrink; the HUD
	// is camera-locked so it stays put.
	ShakeAmp = FMath::Max(0.f, ShakeAmp - Dt * 4.f);
	if (Camera)
	{
		const float Breathe = FMath::Sin(RenderClock * 5.5f) * 14.f; // faster pulse, smaller amplitude
		const float s = ShakeAmp;
		const float sy = (s > 0.f) ? FMath::FRandRange(-s, s) * 14.f : 0.f;
		const float sz = (s > 0.f) ? FMath::FRandRange(-s, s) * 14.f : 0.f;
		Camera->SetRelativeLocation(FVector(Breathe, sy, sz));
		Camera->SetRelativeRotation((s > 0.f)
			? FRotator(FMath::FRandRange(-s, s) * 1.5f, 0.f, FMath::FRandRange(-s, s) * 2.5f)
			: FRotator::ZeroRotator);
	}
	if (bWobble)
	{
		WobbleElapsed += Dt * 1000.f;
		if (WobbleElapsed >= HX::WOBBLE_DURATION * 1000.f) bWobble = false;
	}
	if (WarningTimer > 0.f) WarningTimer = FMath::Max(0.f, WarningTimer - Dt);
	if (ScreenFlash > 0.f) ScreenFlash = FMath::Max(0.f, ScreenFlash - Dt / 0.22f); // ~220ms flash

	AdvancePendingKills(Dt);
	AdvanceDyingSpirals(Dt);
	AdvanceTunnelExplosion(Dt);
	UpdateExplosions(Dt);

	Render(Dt);

	// Dev-only: capture one screenshot a few seconds in, then quit (run with -hexaxshot).
	if (bWantShot)
	{
		ShotClock += Dt;
		if (!bShotDone && ShotClock > 4.0f)
		{
			bShotDone = true;
			if (GEngine) { GEngine->Exec(GetWorld(), TEXT("HighResShot 1600x900")); }
		}
		else if (bShotDone && ShotClock > 8.0f)
		{
			FPlatformMisc::RequestExit(false);
		}
	}
}

void AHexaxPawn::ProcessInput(float Dt)
{
	if (bTitle)
	{
		// Fire starts a run; other inputs are ignored on the attract screen.
		bool bFire = false;
		for (uint8 A : InputQueue) { if (A == 2) { bFire = true; } }
		InputQueue.Reset();
		if (bFire) { StartGame(); }
		return;
	}

	if (State.bGameOver)
	{
		State.GameOverElapsed += Dt * 1000.f;
		if (bPendingRestart)
		{
			bPendingRestart = false;
			StartGame();                 // Fire -> restart straight into a new run
		}
		else if (State.GameOverElapsed >= 6000.f)
		{
			EnterTitle();                // idle -> drift back to the attract screen
		}
		InputQueue.Reset();
		return;
	}

	while (InputQueue.Num() > 0)
	{
		if (bRotating) return; // rotation blocks the queue
		const uint8 Action = InputQueue[0];
		// Left/Right reversed to match the original game.
		if (Action == 0)        { InputQueue.RemoveAt(0); StartRotAnim(+1); return; } // left
		else if (Action == 1)   { InputQueue.RemoveAt(0); StartRotAnim(-1); return; } // right
		else /* fire */         { InputQueue.RemoveAt(0); Fire(); }
	}
}

void AHexaxPawn::StartRotAnim(int32 Direction)
{
	RotDir = Direction;
	RotAnimElapsed = 0.f;
	bRotating = true;
	PlaySound(RotateSound);
}

void AHexaxPawn::AdvanceRotAnim(float Dt)
{
	if (!bRotating) return;
	RotAnimElapsed += Dt;
	const float T = FMath::Min(RotAnimElapsed / HX::ROT_DURATION, 1.f);
	const float E = T * T * T * (T * (T * 6.f - 15.f) + 10.f); // smootherstep (quintic) ease-in/out
	RotAnimOffset = RotDir * STEP_LANES * E;
	if (T >= 1.f)
	{
		RotAnimOffset = 0.f;
		bRotating = false;
		if (RotDir == 1)       State.RotateRight();
		else if (RotDir == -1) State.RotateLeft();
		RotDir = 0;
	}
}

void AHexaxPawn::Fire()
{
	if (State.FireCooldown > 0.f) return;
	Entities.Bullets.Add(MakeBullet(State.WorldRot));
	State.FireCooldown = HX::FIRE_COOLDOWN_BULLET_TICKS;
	MuzzleFlash = 1.f;
	AddShake(0.1f);
	PlaySound(ShootSound);
}

// ---------------------------------------------------------------------------
// Fixed-step ticks (ported from TickSystem.js)
// ---------------------------------------------------------------------------
float AHexaxPawn::CurrentEnemyLerp() const  { return FMath::Clamp(EnemyAccumMs / CurrentTickMs, 0.f, 1.f); }
float AHexaxPawn::CurrentBulletLerp() const { return FMath::Clamp(BulletAccumMs / HX::BULLET_TICK_MS, 0.f, 1.f); }

void AHexaxPawn::OnEnemyTick()
{
	if (State.bGameOver) return;

	Entities.RemoveDeadEnemiesAndWalls();

	Spawn.MaybeSpawn();

	for (const FHexaxEntityPtr& E : Entities.Enemies)     { if (E->bAlive && !E->bDying) E->Tick(); }
	for (const FHexaxEntityPtr& W : Entities.Walls)       { if (W->bAlive) W->Tick(); }
	for (const FHexaxEntityPtr& W : Entities.DoubleWalls) { if (W->bAlive) W->Tick(); }

	// Ring flash on the rings entities just left
	for (const FHexaxEntityPtr& E : Entities.Enemies)
	{
		if (E->bAlive && E->PrevDepth >= 0.f)
		{
			const int32 R = FMath::Clamp(FMath::RoundToInt(E->PrevDepth), 0, HX::NUM_SEGMENTS - 1);
			RingFlash[R] = FMath::Max(RingFlash[R], 0.35f);
		}
	}

	// Collisions: enemies just moved (enemyLerp = 0)
	Collision.Resolve(CurrentBulletLerp(), 0.f);
	DrainCollisionEvents();
	Entities.RemoveDeadEnemies();

	// Damage: enemies that reached the player
	for (const FHexaxEntityPtr& Enemy : Entities.Enemies)
	{
		if (Enemy->bAlive && !Enemy->bDying && !Enemy->bPendingKill && Enemy->Depth < 0.f)
		{
			int32 Dmg = 10;
			FLinearColor Color = HX::Enemy();
			switch (Enemy->Type)
			{
			case EHexaxType::Tank:   Dmg = (Enemy->Hp >= 2) ? 20 : 10; Color = HX::Tank();  break;
			case EHexaxType::Bomb:   Dmg = 20; Color = HX::Bomb();  break;
			case EHexaxType::Heart:  Color = HX::Heart(); break;
			case EHexaxType::Phase:  Color = HX::Phase(); break;
			case EHexaxType::Spiral: Color = HX::Spiral(); break;
			default: break;
			}
			Enemy->Kill();
			State.ScoreMultiplier = 1.f;
			OnPlayerHit(Enemy->Lane, Color, Dmg);

			if (Enemy->Type != EHexaxType::Heart)
			{
				const FHexaxSegmentResult Seg = State.DamageSegment(Enemy->Lane);
				if (Seg.bFirstDamage) ShowWarning(TEXT("HEXAX INTEGRITY COMPROMISED!"), 2.f);
				if (Seg.bCritical)    ShowWarning(TEXT("HEXAX INTEGRITY CRITICAL!"), 2.f);
				if (Seg.bFatal) { TriggerGameOver(); return; }
			}
			if (State.TakeDamage(Dmg)) { TriggerGameOver(); return; }
		}
	}

	// Wall escalation
	for (const FHexaxEntityPtr& Wall : Entities.Walls)
	{
		if (Wall->bAlive && Wall->Depth < 0.f)
		{
			if (State.GetRenderLane(Wall->Lane) == 0)
			{
				Wall->Kill();
				const FHexaxWallHitResult R = State.TakeWallHit();
				OnPlayerHit(Wall->Lane, HX::Tunnel(), 0);
				OnWallHit(R.Tier);
				if (R.bFatal) { TriggerGameOver(); return; }
			}
			else { Wall->Kill(); }
		}
	}
	for (const FHexaxEntityPtr& DW : Entities.DoubleWalls)
	{
		if (DW->bAlive && DW->Depth < 0.f)
		{
			if (State.GetRenderLane(DW->Lane) == 0 || State.GetRenderLane(DW->Lane2) == 0)
			{
				DW->Kill();
				const FHexaxWallHitResult R = State.TakeWallHit();
				OnPlayerHit(DW->Lane, HX::Tunnel(), 0);
				OnWallHit(R.Tier);
				if (R.bFatal) { TriggerGameOver(); return; }
			}
			else { DW->Kill(); }
		}
	}

	State.TickCount++;
	State.ElapsedMs += CurrentTickMs;
	CurrentTickMs = FMath::RoundToInt(State.GetTickMs());
}

void AHexaxPawn::OnBulletTick()
{
	if (State.bGameOver) return;

	Entities.RemoveDeadBullets();

	const float EnemyLerp = CurrentEnemyLerp();

	Collision.Resolve(1.f, EnemyLerp);  // before moving
	DrainCollisionEvents();
	Entities.RemoveDeadEnemies();

	for (const FHexaxEntityPtr& B : Entities.Bullets) { if (B->bAlive) B->Tick(); }

	Collision.Resolve(0.f, EnemyLerp);  // after moving
	DrainCollisionEvents();
	Entities.RemoveDeadEnemies();

	if (State.FireCooldown > 0.f) State.FireCooldown -= 1.f;
}

// ---------------------------------------------------------------------------
// Deferred kills / dying spirals / explosions
// ---------------------------------------------------------------------------
void AHexaxPawn::DrainCollisionEvents()
{
	for (const FHexaxHitEvent& H : Collision.HitEvents)
	{
		const FVector P = EntityWorld(H.Lane, H.VisualDepth);
		SpawnExplosionAt(P, H.Color);
		PlaySound(H.bHeart ? HeartSound : KillSoundForType(H.EntityType, false));
		// Bomb detonation -> screen-wide brightness flash.
		if (H.EntityType == EHexaxType::Bomb) { ScreenFlash = 1.0f; }
	}
	Collision.HitEvents.Reset();

	if (Collision.DeflectCount > 0) { PlaySound(HitWallSound); Collision.DeflectCount = 0; }
	Collision.bHeartCollected = false;
}

void AHexaxPawn::AdvancePendingKills(float Dt)
{
	const float EnemyLerp = CurrentEnemyLerp();
	for (int32 i = Collision.PendingKills.Num() - 1; i >= 0; --i)
	{
		FHexaxPendingKill& PK = Collision.PendingKills[i];
		PK.Elapsed += Dt * 1000.f;
		PK.GhostDepth += GHOST_BULLET_SPEED * Dt;

		const bool bEnemyAlive = PK.Enemy.IsValid() && PK.Enemy->bAlive;
		const float EnemyVisualDepth = bEnemyAlive
			? PK.Enemy->PrevDepth + (PK.Enemy->Depth - PK.Enemy->PrevDepth) * EnemyLerp
			: PK.GhostDepth;

		if (PK.GhostDepth >= EnemyVisualDepth || PK.Elapsed > PENDING_TIMEOUT_MS || !bEnemyAlive)
		{
			const FVector P = EntityWorld(PK.Lane, EnemyVisualDepth);
			SpawnExplosionAt(P, PK.Color);
			PlaySound(KillSoundForType(PK.EntityType, PK.bTankKill));
			if (PK.Enemy.IsValid()) { PK.Enemy->bPendingKill = false; PK.Enemy->Kill(); }
			Collision.PendingKills.RemoveAt(i);
		}
	}
}

void AHexaxPawn::AdvanceDyingSpirals(float Dt)
{
	// Exactly like the original: resolve dying spirals the instant their lane-hop
	// animation completes (laneLerp = enemyLerp * SPIRAL_LANE_SPEED reaches 1),
	// which is within the same tick — so the frozen spiral never crosses a tick
	// boundary (where enemyLerp resets and the lane would snap backwards).
	const float EnemyLerp = CurrentEnemyLerp();
	if (FMath::Min(1.f, EnemyLerp * 3.f) < 1.f) return;
	for (const FHexaxEntityPtr& E : Entities.Enemies)
	{
		if (!E->bAlive || !E->bDying) continue;
		const float VD = E->PrevDepth + (E->Depth - E->PrevDepth) * EnemyLerp;
		SpawnExplosionAt(EntityWorld(E->Lane, VD), E->DyingColor);
		PlaySound(SpiralKillSound);
		E->Kill();
	}
}

void AHexaxPawn::SpawnExplosionAt(const FVector& WorldPos, const FLinearColor& Color, const FVector& Bias, float BiasAmt)
{
	FHexaxExplosion Ex;
	Ex.Life = (BiasAmt > 0.f) ? 1.3f : 0.95f; // tunnel debris lingers a bit longer
	Ex.Elapsed = 0.f;
	const FVector BiasN = Bias.GetSafeNormal();
	// Main debris burst — wide speed range gives both fast streaks and lingering embers.
	const int32 N = 80;
	for (int32 i = 0; i < N; ++i)
	{
		// Optional directional bias makes shards spray a particular way (e.g. the
		// tunnel blowing outward toward the viewer) instead of a uniform burst.
		const FVector Dir = (BiasAmt > 0.f) ? (FMath::VRand() + BiasN * BiasAmt).GetSafeNormal() : FMath::VRand();
		const float Speed = FMath::FRandRange(180.f, 1150.f) * ((BiasAmt > 0.f) ? 1.5f : 1.f);
		FHexaxParticle Pt;
		Pt.Pos = WorldPos + Dir * FMath::FRandRange(0.f, 16.f);
		Pt.Vel = Dir * Speed;
		Pt.Half = FMath::VRand() * FMath::FRandRange(7.f, 30.f); // shard length + orientation
		Pt.SpinAxis = FMath::VRand();
		Pt.SpinRate = FMath::FRandRange(-20.f, 20.f);
		Pt.Color = Color * FMath::FRandRange(0.7f, 1.4f);
		Ex.Particles.Add(Pt);
	}
	// White-hot core sparks: very fast, very bright, streaked along their travel -> the flash.
	const FLinearColor Hot = FMath::Lerp(Color, FLinearColor::White, 0.7f) * 2.4f;
	for (int32 i = 0; i < 16; ++i)
	{
		const FVector Dir = (BiasAmt > 0.f) ? (FMath::VRand() + BiasN * BiasAmt).GetSafeNormal() : FMath::VRand();
		FHexaxParticle Pt;
		Pt.Pos = WorldPos + Dir * FMath::FRandRange(0.f, 6.f);
		Pt.Vel = Dir * FMath::FRandRange(750.f, 1500.f);
		Pt.Half = Dir * FMath::FRandRange(16.f, 38.f); // streak aligned with velocity
		Pt.SpinAxis = FMath::VRand();
		Pt.SpinRate = 0.f;
		Pt.Color = Hot;
		Ex.Particles.Add(Pt);
	}
	Explosions.Add(MoveTemp(Ex));

	// Camera kick only — no expanding shock ring (particles only).
	AddShake(0.22f);
}

void AHexaxPawn::AddShake(float Amt)
{
	ShakeAmp = FMath::Min(1.f, ShakeAmp + Amt);
}

void AHexaxPawn::UpdateExplosions(float Dt)
{
	for (int32 i = Explosions.Num() - 1; i >= 0; --i)
	{
		FHexaxExplosion& Ex = Explosions[i];
		Ex.Elapsed += Dt;
		if (Ex.Elapsed >= Ex.Life) { Explosions.RemoveAt(i); continue; }
		for (FHexaxParticle& P : Ex.Particles)
		{
			P.Pos += P.Vel * Dt;
			P.Vel *= FMath::Pow(0.1f, Dt); // drag
			P.Half = FQuat(P.SpinAxis, P.SpinRate * Dt).RotateVector(P.Half); // tumble
		}
	}

	for (int32 i = Shockwaves.Num() - 1; i >= 0; --i)
	{
		Shockwaves[i].Elapsed += Dt;
		if (Shockwaves[i].Elapsed >= Shockwaves[i].Life) { Shockwaves.RemoveAt(i); }
	}
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
void AHexaxPawn::OnPlayerHit(int32 Lane, const FLinearColor& Color, int32 Damage)
{
	const FVector P = HexaxGeo::LaneCenter(0.f, 0.f); // player position (bottom mouth)
	SpawnExplosionAt(P, Color.Equals(HX::Tunnel()) ? HX::Tunnel() : Color);
	AddShake(0.7f);
	PlaySound(PlayerHitSound);

	if (!Color.Equals(HX::Tunnel()) && Damage > 0)
	{
		const float Intensity = Damage >= 20 ? 0.6f : 0.3f;
		for (int32 i = 0; i < HX::NUM_SEGMENTS; ++i) { RingFlash[i] = FMath::Max(RingFlash[i], Intensity); }
		bWobble = true;
		WobbleElapsed = 0.f;
		WobbleAmp = (Damage >= 20 ? 0.8f : 0.4f) * HX::WOBBLE_AMPLITUDE;
	}
}

void AHexaxPawn::OnWallHit(int32 Tier)
{
	for (int32 i = 0; i < HX::NUM_SEGMENTS; ++i)
	{
		RingFlash[i] = FMath::Max(RingFlash[i], Tier >= 2 ? 1.5f : 1.f);
	}
	bWobble = true;
	WobbleElapsed = 0.f;
	WobbleAmp = (Tier >= 2 ? 2.f : 1.f) * HX::WOBBLE_AMPLITUDE;
	AddShake(Tier >= 2 ? 1.0f : 0.6f);

	if (Tier == 1)      ShowWarning(TEXT("WARNING"), 1.5f);
	else if (Tier == 2) ShowWarning(TEXT("STRUCTURE CRITICAL"), 1.5f);
}

void AHexaxPawn::TriggerGameOver()
{
	State.bGameOver = true;
	State.GameOverElapsed = 0.f;

	// New high score? Persist it and flag the celebration for the title screen.
	if (State.Score > HighScore)
	{
		HighScore = State.Score;
		State.bNewHighScore = true;
		bTitleNewHigh = true;
		SaveHighScore();
	}
	if (MusicAudio) { MusicAudio->Stop(); }
	PlaySound(DeathSound);
	AddShake(1.f);

	// Kick off the cascading whole-tunnel explosion.
	bTunnelExploding = true;
	ExplodeClock = 0.f;
	ExplodeNextRing = 0;
}

void AHexaxPawn::AdvanceTunnelExplosion(float Dt)
{
	if (!bTunnelExploding) return;
	ExplodeClock += Dt;
	// Fast cascade from the mouth inward — each ring's six faces shatter and the
	// pieces blast OUTWARD (away from the axis) and toward the viewer.
	while (ExplodeNextRing <= HX::MAX_DEPTH && ExplodeClock >= ExplodeNextRing * 0.04f)
	{
		const float d = (float)ExplodeNextRing;
		for (int32 L = 0; L < HX::NUM_LANES; ++L)
		{
			const float Ang = HexaxGeo::LaneCenterAngleDeg(RenderLaneFloatF((float)L));
			const FVector Pos = HexaxGeo::OnTube(d, Ang, HX::TUBE_RADIUS);
			const FVector Outward = FVector(0.f, Pos.Y, Pos.Z).GetSafeNormal(); // away from the tunnel axis
			const FVector Bias = Outward + FVector(-0.7f, 0.f, 0.f);            // out + toward the camera
			SpawnExplosionAt(Pos, HX::Tunnel(), Bias, 1.3f);
		}
		AddShake(0.8f);
		ExplodeNextRing++;
	}
	if (ExplodeNextRing > HX::MAX_DEPTH && ExplodeClock > 2.0f)
	{
		bTunnelExploding = false;
	}
}

void AHexaxPawn::PlaySound(USoundBase* Sound) const
{
	if (Sound) { UGameplayStatics::PlaySound2D(GetWorld(), Sound); }
}

USoundBase* AHexaxPawn::KillSoundForType(EHexaxType Type, bool bTankKill) const
{
	switch (Type)
	{
	case EHexaxType::Tank:   return bTankKill ? TankKillSound : TankHitSound;
	case EHexaxType::Bomb:   return BombSound;
	case EHexaxType::Heart:  return HeartSound;
	case EHexaxType::Phase:  return PhaseKillSound;
	case EHexaxType::Spiral: return SpiralKillSound;
	default:                 return ExplosionSound;
	}
}

void AHexaxPawn::ShowWarning(const FString& Text, float Seconds)
{
	WarningText = Text;
	WarningTimer = Seconds;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
float AHexaxPawn::RenderLaneFloat(int32 LogicalLane) const
{
	return ((float)LogicalLane - (float)State.WorldRot) + RotAnimOffset + TitleSpin;
}

float AHexaxPawn::RenderLaneFloatF(float LogicalC) const
{
	return (LogicalC - (float)State.WorldRot) + RotAnimOffset + TitleSpin;
}

FVector AHexaxPawn::TunnelVertexWorld(float Depth, int32 K) const
{
	// Hex corners sit at half-lane positions; carrying the world rotation makes
	// the whole tunnel spin (ship stays pinned at the bottom).
	const float Angle = HexaxGeo::LaneCenterAngleDeg(RenderLaneFloatF((float)K + 0.5f));
	return HexaxGeo::OnTube(Depth, Angle, HX::TUBE_RADIUS);
}

FVector AHexaxPawn::EntityWorld(int32 LogicalLane, float VisualDepth, float Radius) const
{
	const float Angle = HexaxGeo::LaneCenterAngleDeg(RenderLaneFloat(LogicalLane));
	return HexaxGeo::OnTube(VisualDepth, Angle, Radius);
}

// ---------------------------------------------------------------------------
// Rendering (line-batch vector glow)
// ---------------------------------------------------------------------------
void AHexaxPawn::GlowLine(const FVector& A, const FVector& B, const FLinearColor& Base, float Intensity)
{
	// Phosphor afterglow: while drawing dynamic objects, remember the logical line
	// so it can be replayed (decaying) over the next frames as a glowing trail.
	if (bRecordTrails)
	{
		Trails.Add(FHexaxGhostSeg{ A, B, Base, Intensity, 1.f });
	}

	// Global brightness flash (e.g. bomb chain) brightens + blooms everything briefly.
	Intensity *= (1.f + ScreenFlash);

	// Emit a camera-facing ribbon quad (two triangles) into the glow mesh. The
	// ribbon half-width scales with distance so the on-screen width is ~constant
	// at any depth (no sub-pixel dropouts), and the emissive material blooms it.
	// Camera sits at the origin, so each point's view ray is the point itself.
	const FVector Dir = B - A;

	FVector SideA = FVector::CrossProduct(Dir, A).GetSafeNormal();
	if (SideA.IsNearlyZero()) { SideA = FVector::CrossProduct(Dir, FVector::UpVector).GetSafeNormal(); }
	FVector SideB = FVector::CrossProduct(Dir, B).GetSafeNormal();
	if (SideB.IsNearlyZero()) { SideB = SideA; }

	const float WA = HX::LINE_WIDTH_K * A.Size();
	const float WB = HX::LINE_WIDTH_K * B.Size();
	const FLinearColor C = Base * (HX::GLOW_CORE_INTENSITY * Intensity);

	const int32 V0 = MeshVerts.Num();
	MeshVerts.Add(A - SideA * WA);
	MeshVerts.Add(A + SideA * WA);
	MeshVerts.Add(B + SideB * WB);
	MeshVerts.Add(B - SideB * WB);
	for (int32 i = 0; i < 4; ++i) { MeshColors.Add(C); }
	MeshTris.Add(V0 + 0); MeshTris.Add(V0 + 1); MeshTris.Add(V0 + 2);
	MeshTris.Add(V0 + 0); MeshTris.Add(V0 + 2); MeshTris.Add(V0 + 3);
}

void AHexaxPawn::GlowCircleYZ(const FVector& Center, float Radius, const FLinearColor& Color, float Intensity, int32 Segments)
{
	FVector Prev = Center + FVector(0.f, Radius, 0.f);
	for (int32 i = 1; i <= Segments; ++i)
	{
		const float A = (2.f * PI * i) / Segments;
		const FVector Cur = Center + FVector(0.f, Radius * FMath::Cos(A), Radius * FMath::Sin(A));
		GlowLine(Prev, Cur, Color, Intensity);
		Prev = Cur;
	}
}

void AHexaxPawn::GlowEllipseYZ(const FVector& Center, float RadiusY, float RadiusZ, const FLinearColor& Color, float Intensity, int32 Segments)
{
	FVector Prev = Center + FVector(0.f, RadiusY, 0.f);
	for (int32 i = 1; i <= Segments; ++i)
	{
		const float A = (2.f * PI * i) / Segments;
		const FVector Cur = Center + FVector(0.f, RadiusY * FMath::Cos(A), RadiusZ * FMath::Sin(A));
		GlowLine(Prev, Cur, Color, Intensity);
		Prev = Cur;
	}
}

// A puck/disc: front and back rims at two depths so perspective foreshortens it.
void AHexaxPawn::GlowDisc3D(float Depth, float AngleDeg, float Radius, const FLinearColor& Color, float Intensity)
{
	const float T = 0.5f; // depth half-thickness
	const FVector CF = HexaxGeo::OnTube(Depth - T, AngleDeg, HX::TUBE_RADIUS);
	const FVector CB = HexaxGeo::OnTube(Depth + T, AngleDeg, HX::TUBE_RADIUS);
	const int32 Seg = 16;
	FVector PrevF = CF + FVector(0.f, Radius, 0.f);
	FVector PrevB = CB + FVector(0.f, Radius, 0.f);
	for (int32 i = 1; i <= Seg; ++i)
	{
		const float A = (2.f * PI * i) / Seg;
		const FVector Off(0.f, Radius * FMath::Cos(A), Radius * FMath::Sin(A));
		const FVector F = CF + Off;
		const FVector B = CB + Off;
		GlowLine(PrevF, F, Color, Intensity);          // front rim (bright)
		GlowLine(PrevB, B, Color, Intensity * 0.55f);  // back rim (dimmer)
		if (i % 4 == 0) { GlowLine(F, B, Color, Intensity * 0.5f); } // connecting edges
		PrevF = F; PrevB = B;
	}
}

// A wire sphere: outline circle plus a meridian ellipse (matches Phaser).
void AHexaxPawn::GlowSphere3D(float Depth, float AngleDeg, float Radius, const FLinearColor& Color, float Intensity)
{
	const FVector C = HexaxGeo::OnTube(Depth, AngleDeg, HX::TUBE_RADIUS);
	GlowCircleYZ(C, Radius, Color, Intensity);
	GlowEllipseYZ(C, Radius * 0.38f, Radius, Color, Intensity * 0.85f);
}

// Hockey-puck: a flat disc lying on the tunnel wall. Drawn in the lane's local
// basis — major axis along the ring tangent, minor axis foreshortened along the
// radial — so it rotates with whichever face it's on (matches Phaser).
void AHexaxPawn::GlowPuck(const FVector& C, float AngleDeg, float R, const FLinearColor& Color, float Intensity, bool bDashed)
{
	const float a = FMath::DegreesToRadians(AngleDeg);
	const FVector T(0.f, -FMath::Sin(a), FMath::Cos(a));   // tangent (along the ring)
	const FVector Rad(0.f, FMath::Cos(a), FMath::Sin(a));  // radial (outward)

	const float rx = R;            // full radius along the tangent
	const float ry = R * 0.32f;    // foreshortened along the radial
	const float sepHalf = R * 0.30f;
	const FVector TopC = C + Rad * sepHalf;
	const FVector BotC = C - Rad * sepHalf;

	auto DrawRim = [&](const FVector& Ctr)
	{
		const int32 Seg = 24;
		FVector Prev = Ctr + T * rx;
		for (int32 i = 1; i <= Seg; ++i)
		{
			const float ang = (2.f * PI * i) / Seg;
			const FVector Cur = Ctr + T * (rx * FMath::Cos(ang)) + Rad * (ry * FMath::Sin(ang));
			if (!bDashed || (i % 2 == 0)) { GlowLine(Prev, Cur, Color, Intensity); }
			Prev = Cur;
		}
	};
	DrawRim(TopC);
	DrawRim(BotC);

	// side walls joining the two rims at the tangent extremes
	GlowLine(TopC + T * rx, BotC + T * rx, Color, Intensity);
	GlowLine(TopC - T * rx, BotC - T * rx, Color, Intensity);
}

void AHexaxPawn::GlowPolyYZ(const TArray<FVector>& Points, const FLinearColor& Color, bool bClosed, float Intensity)
{
	for (int32 i = 0; i < Points.Num() - 1; ++i) { GlowLine(Points[i], Points[i + 1], Color, Intensity); }
	if (bClosed && Points.Num() > 2) { GlowLine(Points.Last(), Points[0], Color, Intensity); }
}

void AHexaxPawn::DrawPolyhedron(const FHexaxPoly& Poly, const FVector& Center, float Scale, const FRotator& Rot, const FLinearColor& Color, float Intensity, int32 EdgeStride)
{
	const FQuat Q(Rot);
	for (int32 i = 0; i < Poly.Edges.Num(); ++i)
	{
		if (EdgeStride > 1 && (i % EdgeStride) != 0) continue;
		const FVector A = Center + Q.RotateVector(Poly.Verts[Poly.Edges[i].X]) * Scale;
		const FVector B = Center + Q.RotateVector(Poly.Verts[Poly.Edges[i].Y]) * Scale;
		GlowLine(A, B, Color, Intensity);
	}
}

void AHexaxPawn::DrawCylinderBetween(const FVector& P0, const FVector& P1, float Radius, int32 Sides, const FLinearColor& Color, float Intensity, int32 Stride)
{
	const FVector Axis = (P1 - P0).GetSafeNormal();
	FVector U = FVector::CrossProduct(Axis, FVector(1.f, 0.f, 0.f));
	if (U.SizeSquared() < 1e-4f) { U = FVector::CrossProduct(Axis, FVector(0.f, 0.f, 1.f)); }
	U.Normalize();
	const FVector V = FVector::CrossProduct(Axis, U);

	FVector Prev0 = FVector::ZeroVector, Prev1 = FVector::ZeroVector;
	for (int32 i = 0; i <= Sides; ++i)
	{
		const float a = (2.f * PI * i) / Sides;
		const FVector Off = U * (Radius * FMath::Cos(a)) + V * (Radius * FMath::Sin(a));
		const FVector R0 = P0 + Off;
		const FVector R1 = P1 + Off;
		if (i > 0)
		{
			GlowLine(Prev0, R0, Color, Intensity); // rim on the P0 cap
			GlowLine(Prev1, R1, Color, Intensity); // rim on the P1 cap
		}
		if (i < Sides && (Stride <= 1 || (i % Stride) == 0))
		{
			GlowLine(R0, R1, Color, Intensity);    // vertical facet edge
		}
		Prev0 = R0; Prev1 = R1;
	}
}

void AHexaxPawn::DrawPuckLP(const FVector& Center, float AngleDeg, float Radius, const FLinearColor& Color, float Intensity, bool bDashed)
{
	const float a = FMath::DegreesToRadians(AngleDeg);
	const FVector Rad(0.f, FMath::Cos(a), FMath::Sin(a)); // outward; puck axis lies along this
	const FVector Outer = Center;                          // the rim on the wall
	const FVector Inner = Center - Rad * (Radius * 0.55f); // the rim toward the centre (puck thickness; ~30% taller)
	DrawCylinderBetween(Outer, Inner, Radius, 12, Color, Intensity, bDashed ? 2 : 1);
}

void AHexaxPawn::DrawHeartLP(const FVector& Center, float AngleDeg, float Radius, const FLinearColor& Color, float Intensity)
{
	// Same idea as the puck: a flat shape on the wall extruded toward the tube
	// centre, with rim outlines + connecting ribs. Cross-section is a heart curve
	// lying in the wall plane (width around the ring, height down the tube).
	const float a = FMath::DegreesToRadians(AngleDeg);
	const FVector Rad  (0.f, FMath::Cos(a),  FMath::Sin(a)); // outward (extrusion axis)
	const FVector Tang (0.f, -FMath::Sin(a), FMath::Cos(a)); // around the ring -> heart width
	const FVector Axial(1.f, 0.f, 0.f);                      // down the tube  -> heart height
	const FVector Outer = Center;
	const FVector Inner = Center - Rad * (Radius * 0.55f);
	const float Sc = Radius / 15.f;
	const int32 Steps = 26;
	TArray<FVector> O, I; O.Reserve(Steps + 1); I.Reserve(Steps + 1);
	for (int32 s = 0; s <= Steps; ++s)
	{
		const float t  = (2.f * PI * s) / Steps;
		const float hx = 16.f * FMath::Pow(FMath::Sin(t), 3.f);
		const float hy = 13.f * FMath::Cos(t) - 5.f * FMath::Cos(2.f*t) - 2.f * FMath::Cos(3.f*t) - FMath::Cos(4.f*t);
		const FVector Off = Tang * (hx * Sc) + Axial * ((hy + 2.5f) * Sc); // +2.5 centres the curve
		O.Add(Outer + Off);
		I.Add(Inner + Off);
	}
	for (int32 s = 0; s < Steps; ++s)
	{
		GlowLine(O[s], O[s + 1], Color, Intensity);          // outer rim (on the wall)
		GlowLine(I[s], I[s + 1], Color, Intensity * 0.85f);  // inner rim (toward centre)
		if (s % 2 == 0) { GlowLine(O[s], I[s], Color, Intensity * 0.9f); } // rib
	}
}

void AHexaxPawn::DrawAndAgeTrails(float Dt)
{
	// Replay each captured dynamic segment dimmer than the source (GHOST_GAIN) and
	// fading over GHOST_PERSIST seconds, then age it out. bRecordTrails is false
	// here, so replaying does not re-capture.
	const float Fade = (HX::GHOST_PERSIST > 0.f) ? (Dt / HX::GHOST_PERSIST) : 1.f;
	for (int32 i = Trails.Num() - 1; i >= 0; --i)
	{
		FHexaxGhostSeg& G = Trails[i];
		GlowLine(G.A, G.B, G.Color, G.Intensity * G.Life * HX::GHOST_GAIN);
		G.Life -= Fade;
		if (G.Life <= 0.f) { Trails.RemoveAtSwap(i); }
	}
}

void AHexaxPawn::DrawTitle()
{
	if (!Camera) return;

	// Same screen-locked projection the HUD uses: place text on a plane in front
	// of the camera. sx,sy ~ [-1,1] across the view; sy>0 is up.
	const FTransform CamX = Camera->GetComponentTransform();
	const float D = 120.f, HXs = D, VZs = D * 0.75f, AX = VZs / HXs;
	auto Pt = [&](float sx, float sy) -> FVector
	{
		return CamX.TransformPosition(FVector(D, sx * HXs, sy * VZs));
	};
	auto TextW = [&](const FString& S, float ch) -> float
	{
		return S.Len() * HexaxFont::ADV * (ch / HexaxFont::GH) * AX;
	};
	auto Text = [&](const FString& S, float cx, float sy, float ch, const FLinearColor& Col, float Inten)
	{
		const float Scale = ch / HexaxFont::GH;
		for (int32 i = 0; i < S.Len(); ++i)
		{
			TArray<TArray<FVector2D>> G;
			HexaxFont::Glyph(FChar::ToUpper(S[i]), G);
			for (const TArray<FVector2D>& Poly : G)
			{
				for (int32 p = 0; p + 1 < Poly.Num(); ++p)
				{
					GlowLine(Pt(cx + Poly[p].X * Scale * AX, sy + Poly[p].Y * Scale),
					         Pt(cx + Poly[p + 1].X * Scale * AX, sy + Poly[p + 1].Y * Scale), Col, Inten);
				}
			}
			cx += HexaxFont::ADV * Scale * AX;
		}
	};
	auto TextC = [&](const FString& S, float sy, float ch, const FLinearColor& Col, float Inten)
	{
		Text(S, -TextW(S, ch) * 0.5f, sy, ch, Col, Inten);
	};

	const FLinearColor Active = HX::ActiveLane();

	// Original logo as an additive emissive quad (blooms + runs through the CRT).
	// Aspect 2752:1536 -> h = w / (A * VZs/HXs); centred in the upper area.
	if (LogoMesh && LogoMID)
	{
		const float LW = 0.52f, LH = 0.387f, LCY = 0.34f;
		TArray<FVector>          LV  = { Pt(-LW, LCY - LH), Pt(LW, LCY - LH), Pt(LW, LCY + LH), Pt(-LW, LCY + LH) };
		TArray<int32>            LT  = { 0, 1, 2, 0, 2, 3 };
		TArray<FVector2D>        LUV = { FVector2D(0,1), FVector2D(1,1), FVector2D(1,0), FVector2D(0,0) };
		TArray<FVector>          LN;
		TArray<FLinearColor>     LC;
		TArray<FProcMeshTangent> LTan;
		LogoMesh->CreateMeshSection_LinearColor(0, LV, LT, LN, LUV, LC, LTan, false);
		LogoMID->SetScalarParameterValue(TEXT("Intensity"), 1.5f + 0.25f * FMath::Sin(RenderClock * 3.0f));
	}

	// High score (top).
	TextC(FString::Printf(TEXT("HIGH SCORE  %d"), HighScore), 0.88f, 0.045f, Active, 1.0f);

	// New-record celebration after a strong run.
	if (bTitleNewHigh)
	{
		const float NH = 0.6f + 0.4f * FMath::Abs(FMath::Sin(RenderClock * 6.0f));
		TextC(TEXT("NEW HIGH SCORE!"), -0.20f, 0.05f, HX::Heart(), 1.3f * NH);
	}

	// Prompts (bottom).
	const float PromptA = 0.45f + 0.55f * FMath::Abs(FMath::Sin(RenderClock * 2.5f));
	TextC(TEXT("PRESS SPACE TO START"), -0.42f, 0.05f, Active, 1.2f * PromptA);
	TextC(TEXT("PRESS 1 TO TOGGLE CRT MODE"), -0.55f, 0.038f, Active, 0.7f);

	// Credit line.
	TextC(TEXT("\u00A9 2026 BY MARCO VAN HYLCKAMA VLIEG - AI-CREATED.COM"), -0.80f, 0.030f, HX::Tunnel() * 0.7f, 0.7f);
}

void AHexaxPawn::Render(float Dt)
{
	MeshVerts.Reset();
	MeshTris.Reset();
	MeshColors.Reset();

	if (bTitle)
	{
		DrawTunnel();   // slowly spinning attract backdrop (driven by TitleSpin)
		DrawTitle();    // logo, high score, pulsing prompt
	}
	else
	{
		DrawTunnel();
		DrawDamagedSegments();

		// Phosphor afterglow sits behind the live dynamic objects: replay the decaying
		// ghosts from previous frames, then capture this frame's dynamic draws.
		DrawAndAgeTrails(Dt);
		bRecordTrails = true;
		if (!State.bGameOver)
		{
			DrawEntities();
			DrawGhostBullets();
			DrawShip();
		}
		DrawExplosions();
		bRecordTrails = false;

		DrawShockwaves();
		DrawHud();
	}

	// Rebuild the emissive ribbon mesh for this frame.
	static const TArray<FVector> NoNormals;
	static const TArray<FVector2D> NoUV;
	static const TArray<FProcMeshTangent> NoTangents;
	GlowMesh->CreateMeshSection_LinearColor(0, MeshVerts, MeshTris, NoNormals, NoUV, MeshColors, NoTangents, false);
}

void AHexaxPawn::DrawTunnel()
{
	// Score multiplier "heats" the tunnel: shift the green toward a charged
	// cyan-white and brighten as the multiplier climbs (1x -> 4x). A gentle
	// rhythmic breathe pulses the whole tunnel's glow.
	const float Heat = FMath::Clamp((State.ScoreMultiplier - 1.f) / 3.f, 0.f, 1.f);
	const FLinearColor TunnelCol = FMath::Lerp(HX::Tunnel(), FLinearColor(0.70f, 1.0f, 1.0f), Heat * 0.55f);
	const FLinearColor ActiveCol = HX::ActiveLane();
	const float Breathe   = 1.f + 0.05f * FMath::Sin(RenderClock * 7.5f); // ~1.2 Hz glow pulse
	const float TitleDim  = bTitle ? 0.0f : 1.f;   // tunnel hidden on the title (logo on black)
	const float TunnelInt = Breathe * (1.f + Heat * 0.40f) * TitleDim;

	// Depth atmosphere: far rings fade toward a cool blue haze and dim, so the
	// tunnel recedes into a glowing infinity (atmospheric perspective).
	const FLinearColor HazeCol = FLinearColor(0.25f, 0.45f, 1.0f);

	// Whole wireframe carries the world rotation, so rotating spins the TUNNEL
	// (the ship stays pinned at the bottom). Rings + longitudinal lane lines.
	for (int32 k = 0; k < HX::NUM_LANES; ++k)
	{
		for (int32 d = 0; d <= HX::MAX_DEPTH; ++d)
		{
			if (State.bGameOver && d < ExplodeNextRing) continue; // ring blown apart — stays gone
			const FVector A = TunnelVertexWorld((float)d, k);
			const FVector B = TunnelVertexWorld((float)d, (k + 1) % HX::NUM_LANES);
			const float Flash = RingFlash[FMath::Clamp(d, 0, HX::NUM_SEGMENTS - 1)];
			const float Df = (float)d / (float)HX::MAX_DEPTH;                       // 0 near .. 1 far
			const FLinearColor DepthCol = FMath::Lerp(TunnelCol, HazeCol, Df * 0.5f);
			const float DepthInt = TunnelInt * (1.f - Df * 0.35f);
			GlowLine(A, B, DepthCol + HX::Tunnel() * Flash, DepthInt); // ring edge
			if (d < HX::MAX_DEPTH)
			{
				GlowLine(A, TunnelVertexWorld((float)(d + 1), k), DepthCol, DepthInt); // lane line
			}
		}
	}

	// Active-lane highlight = the player's face (logical lane worldRot), which
	// always sits at the bottom. Its edges track the rotating wireframe vertices.
	const float AngL = HexaxGeo::LaneCenterAngleDeg(RenderLaneFloatF((float)State.WorldRot - 0.5f));
	const float AngR = HexaxGeo::LaneCenterAngleDeg(RenderLaneFloatF((float)State.WorldRot + 0.5f));
	for (int32 d = 0; d <= HX::MAX_DEPTH; ++d)
	{
		if (State.bGameOver && d < ExplodeNextRing) continue; // bottom segment blows apart too
		const FVector L = HexaxGeo::OnTube((float)d, AngL, HX::TUBE_RADIUS);
		const FVector R = HexaxGeo::OnTube((float)d, AngR, HX::TUBE_RADIUS);
		const float Adf = (float)d / (float)HX::MAX_DEPTH;
		const FLinearColor ActiveDepth = FMath::Lerp(ActiveCol, HazeCol, Adf * 0.4f);
		const float ActiveInt = 0.6f * Breathe * (1.f - Adf * 0.35f) * TitleDim;
		GlowLine(L, R, ActiveDepth, ActiveInt); // bright bottom edge
		if (d < HX::MAX_DEPTH)
		{
			GlowLine(L, HexaxGeo::OnTube((float)(d + 1), AngL, HX::TUBE_RADIUS), ActiveDepth, ActiveInt);
			GlowLine(R, HexaxGeo::OnTube((float)(d + 1), AngR, HX::TUBE_RADIUS), ActiveDepth, ActiveInt);
		}
	}
}

void AHexaxPawn::DrawDamagedSegments()
{
	if (State.bGameOver) return; // tunnel is busy exploding
	const float Pulse = 0.55f + 0.45f * FMath::Abs(FMath::Sin(RenderClock * 6.f));
	const FLinearColor Red = HX::Wall();
	for (int32 L = 0; L < HX::NUM_LANES; ++L)
	{
		if (!State.SegmentDamage[L]) continue;
		const float aL = HexaxGeo::LaneCenterAngleDeg(RenderLaneFloatF((float)L - 0.5f));
		const float aR = HexaxGeo::LaneCenterAngleDeg(RenderLaneFloatF((float)L + 0.5f));
		// Pulsing red, dashed down the damaged lane (every other ring), like the original.
		for (int32 d = 0; d < HX::MAX_DEPTH; d += 2)
		{
			GlowLine(HexaxGeo::OnTube((float)d, aL, HX::TUBE_RADIUS),
			         HexaxGeo::OnTube((float)(d + 1), aL, HX::TUBE_RADIUS), Red, Pulse);
			GlowLine(HexaxGeo::OnTube((float)d, aR, HX::TUBE_RADIUS),
			         HexaxGeo::OnTube((float)(d + 1), aR, HX::TUBE_RADIUS), Red, Pulse);
			GlowLine(HexaxGeo::OnTube((float)d, aL, HX::TUBE_RADIUS),
			         HexaxGeo::OnTube((float)d, aR, HX::TUBE_RADIUS), Red, Pulse);
		}
		// Bright pulsing mouth edge — the clearest "this lane is damaged" cue.
		GlowLine(HexaxGeo::OnTube(0.f, aL, HX::TUBE_RADIUS),
		         HexaxGeo::OnTube(0.f, aR, HX::TUBE_RADIUS), Red, Pulse * 1.7f);
	}
}

void AHexaxPawn::DrawEntities()
{
	const float EnemyLerp = CurrentEnemyLerp();
	const float BulletLerp = CurrentBulletLerp();

	const float WH = HX::TUBE_RADIUS * HX::WALL_HEIGHT_FRAC; // perpendicular height

	// Walls — 3D slab: front face (outer base + inward ridge) + depth to a back ridge.
	for (const FHexaxEntityPtr& W : Entities.Walls)
	{
		if (!W->bAlive) continue;
		const float VD = W->PrevDepth + (W->Depth - W->PrevDepth) * EnemyLerp;
		const float Lf = RenderLaneFloat(W->Lane);
		const float aL = HexaxGeo::LaneCenterAngleDeg(Lf - 0.5f);
		const float aR = HexaxGeo::LaneCenterAngleDeg(Lf + 0.5f);
		const float aMid = FMath::DegreesToRadians(HexaxGeo::LaneCenterAngleDeg(Lf));
		const FVector In(0.f, -FMath::Cos(aMid), -FMath::Sin(aMid)); // toward the axis
		const float DB = VD + HX::WALL_Z_THICKNESS;
		const FLinearColor Col = (W->HitFlash > 0.f) ? FMath::Lerp(HX::Wall(), HX::Tunnel(), W->HitFlash) : HX::Wall();
		const float Ig = 1.f + W->HitFlash;

		const FVector fO1 = HexaxGeo::OnTube(VD, aL, HX::TUBE_RADIUS);
		const FVector fO2 = HexaxGeo::OnTube(VD, aR, HX::TUBE_RADIUS);
		const FVector fI1 = fO1 + In * WH, fI2 = fO2 + In * WH;
		const FVector bI1 = HexaxGeo::OnTube(DB, aL, HX::TUBE_RADIUS) + In * WH;
		const FVector bI2 = HexaxGeo::OnTube(DB, aR, HX::TUBE_RADIUS) + In * WH;

		GlowLine(fO1, fO2, Col, Ig); GlowLine(fO2, fI2, Col, Ig);   // outer base, right
		GlowLine(fI2, fI1, Col, Ig); GlowLine(fI1, fO1, Col, Ig);   // top ridge, left
		GlowLine(fI1, bI1, Col, Ig); GlowLine(fI2, bI2, Col, Ig);   // depth edges
		GlowLine(bI1, bI2, Col, Ig);                                // back ridge
		if (W->HitFlash > 0.f) // crackling lightning across the struck face
		{
			const float LI = (0.5f + W->HitFlash) * 1.5f;
			const float Amp = HX::TUBE_RADIUS * 0.05f;
			DrawLightning(fO1, fI2, FLinearColor::White, LI, Amp, 7);
			DrawLightning(fO2, fI1, HX::Tunnel(),        LI, Amp, 7);
			DrawLightning(fI1, fI2, FLinearColor::White, LI, Amp * 0.7f, 6);
			DrawLightning(fO1, fO2, HX::Tunnel(),        LI, Amp * 0.7f, 6);
		}
		W->HitFlash = FMath::Max(0.f, W->HitFlash - HX::FLASH_DECAY * (1.f / 60.f));
	}

	// DoubleWalls — one continuous slab spanning two faces (single perpendicular).
	for (const FHexaxEntityPtr& W : Entities.DoubleWalls)
	{
		if (!W->bAlive) continue;
		const float VD = W->PrevDepth + (W->Depth - W->PrevDepth) * EnemyLerp;
		const float Lf = RenderLaneFloat(W->Lane);
		const float a1 = HexaxGeo::LaneCenterAngleDeg(Lf - 0.5f);
		const float aM = HexaxGeo::LaneCenterAngleDeg(Lf + 0.5f);
		const float a3 = HexaxGeo::LaneCenterAngleDeg(Lf + 1.5f);
		const float DB = VD + HX::WALL_Z_THICKNESS;
		const FLinearColor Col = (W->HitFlash > 0.f) ? FMath::Lerp(HX::Wall(), HX::Tunnel(), W->HitFlash) : HX::Wall();
		const float Ig = 1.f + W->HitFlash;

		// Per-vertex inward (radial) so the raised ridge follows the hex bend — this
		// makes it read as TWO wall slabs meeting at the middle seam, not a triangle.
		auto InAt = [](float Deg) { const float r = FMath::DegreesToRadians(Deg); return FVector(0.f, -FMath::Cos(r), -FMath::Sin(r)); };
		const FVector In1 = InAt(a1), InM = InAt(aM), In3 = InAt(a3);

		const FVector fO1 = HexaxGeo::OnTube(VD, a1, HX::TUBE_RADIUS);
		const FVector fOM = HexaxGeo::OnTube(VD, aM, HX::TUBE_RADIUS);
		const FVector fO3 = HexaxGeo::OnTube(VD, a3, HX::TUBE_RADIUS);
		const FVector fI1 = fO1 + In1 * WH, fIM = fOM + InM * WH, fI3 = fO3 + In3 * WH;
		const FVector bI1 = HexaxGeo::OnTube(DB, a1, HX::TUBE_RADIUS) + In1 * WH;
		const FVector bIM = HexaxGeo::OnTube(DB, aM, HX::TUBE_RADIUS) + InM * WH;
		const FVector bI3 = HexaxGeo::OnTube(DB, a3, HX::TUBE_RADIUS) + In3 * WH;

		GlowLine(fO1, fOM, Col, Ig); GlowLine(fOM, fO3, Col, Ig);                       // outer base (2 faces)
		GlowLine(fI1, fIM, Col, Ig); GlowLine(fIM, fI3, Col, Ig);                       // top ridge follows the bend
		GlowLine(fO1, fI1, Col, Ig); GlowLine(fOM, fIM, Col, Ig); GlowLine(fO3, fI3, Col, Ig); // verticals + middle seam
		GlowLine(fI1, bI1, Col, Ig); GlowLine(fIM, bIM, Col, Ig); GlowLine(fI3, bI3, Col, Ig); // depth edges
		GlowLine(bI1, bIM, Col, Ig); GlowLine(bIM, bI3, Col, Ig);                       // back ridge
		if (W->HitFlash > 0.f) // crackling lightning across the struck span
		{
			const float LI = (0.5f + W->HitFlash) * 1.5f;
			const float Amp = HX::TUBE_RADIUS * 0.05f;
			DrawLightning(fO1, fIM, FLinearColor::White, LI, Amp, 7);
			DrawLightning(fOM, fI3, HX::Tunnel(),        LI, Amp, 7);
			DrawLightning(fI1, fI3, FLinearColor::White, LI, Amp * 0.7f, 7);
		}
		W->HitFlash = FMath::Max(0.f, W->HitFlash - HX::FLASH_DECAY * (1.f / 60.f));
	}

	// Bullets — sleek energy darts
	for (const FHexaxEntityPtr& B : Entities.Bullets)
	{
		if (!B->bAlive) continue;
		const float VD = FMath::Max(0.f, B->PrevDepth + (B->Depth - B->PrevDepth) * BulletLerp);
		DrawBolt(B->Lane, VD, 1.f);
	}

	// Enemies (and tank/bomb/heart/phase/spiral)
	for (const FHexaxEntityPtr& E : Entities.Enemies)
	{
		if (!E->bAlive) continue;

		float LaneF = (float)E->Lane;
		if (E->Type == EHexaxType::Spiral && E->PrevLane != E->Lane)
		{
			// Move exactly ONE lane in the spin direction. Using (Lane - PrevLane)
			// breaks on wrap (5->0 reads as -5 = a whole lap); SpinDir is the real step.
			const float LaneLerp = FMath::Min(1.f, EnemyLerp * 3.f);
			LaneF = (float)E->PrevLane + (float)E->SpinDir * LaneLerp;
		}
		const float VD = E->PrevDepth + (E->Depth - E->PrevDepth) * EnemyLerp;
		const float Angle = HexaxGeo::LaneCenterAngleDeg(((float)LaneF - (float)State.WorldRot) + RotAnimOffset);
		const FVector C = HexaxGeo::OnTube(VD, Angle, HX::TUBE_RADIUS);
		const float Sz = HX::ENTITY_SIZE;
		// Fixed tilt so low-poly spheres read as 3D while sitting still.
		const FRotator Tilt(22.f, 34.f, 0.f);
		const float ar = FMath::DegreesToRadians(Angle);
		const FVector Tang(0.f, -FMath::Sin(ar), FMath::Cos(ar)); // along the ring

		switch (E->Type)
		{
		case EHexaxType::Enemy:
			DrawPuckLP(C, Angle, Sz * 0.5f, HX::Enemy(), 1.2f);
			break;

		case EHexaxType::Tank:
		{
			const FLinearColor TC = (E->Hp >= 2) ? HX::Tank() : HX::TankDamaged();
			const float Sep = Sz * 0.42f;     // half-distance between balls (along the ring)
			const float BallR = Sz * 0.33f;
			auto DrawTankSphere = [&](const FVector& P, float Intensity)
			{
				GlowCircleYZ(P, BallR, TC, Intensity);
				GlowEllipseYZ(P, BallR, BallR * 0.32f, TC, Intensity * 0.92f);
				GlowEllipseYZ(P, BallR * 0.32f, BallR, TC, Intensity * 0.92f);
			};
			if (E->Hp >= 2)
			{
				const FVector L = C - Tang * Sep;
				const FVector R = C + Tang * Sep;
				DrawTankSphere(L, 1.15f);
				DrawTankSphere(R, 1.15f);
				DrawCylinderBetween(L, R, Sz * 0.12f, 8, TC, 1.0f);      // low-poly cylinder bar
			}
			else
			{
				const FVector Keep = (E->HitSide == 1) ? (C + Tang * Sep) : (C - Tang * Sep);
				DrawTankSphere(Keep, 1.15f);
			}
			break;
		}

		case EHexaxType::Bomb:
			DrawPolyhedron(SpikedPoly(), C, Sz * 0.4f, Tilt, HX::Bomb(), 1.2f); // low-poly sphere + spikes
			break;

		case EHexaxType::Heart:
			DrawHeartLP(C, Angle, Sz * 0.5f, HX::Heart(), 1.3f); // flat on the wall, like the puck
			break;

		case EHexaxType::Phase:
		{
			const bool bShielded = (E->Phase == EHexaxPhase::Shielded);
			const FLinearColor PC = E->TransitionFlash > 0.f ? FLinearColor::White : HX::Phase();
			DrawPuckLP(C, Angle, Sz * 0.5f, PC, bShielded ? 0.7f : 1.3f, bShielded);
			E->TransitionFlash = FMath::Max(0.f, E->TransitionFlash - HX::FLASH_DECAY * (1.f / 60.f));
			break;
		}

		case EHexaxType::Spiral:
		{
			// Original look: a wire orb (circle + two meridian ellipses) with a
			// tangent arrow + barbs pointing in the spin direction.
			const FLinearColor SC = HX::Spiral();
			const float r = Sz * 0.32f;
			GlowCircleYZ(C, r, SC, 1.2f);
			GlowEllipseYZ(C, r, r * 0.32f, SC, 1.1f);   // horizontal meridian
			GlowEllipseYZ(C, r * 0.32f, r, SC, 1.1f);   // vertical meridian

			const float aRad = FMath::DegreesToRadians(Angle);
			const FVector T(0.f, -FMath::Sin(aRad), FMath::Cos(aRad)); // tangent around the ring
			const FVector Up(0.f, FMath::Cos(aRad), FMath::Sin(aRad)); // radial (perp to tangent)
			const FVector Dir = T * (float)E->SpinDir;
			const FVector Stem = C + Dir * r;
			const FVector Tip  = C + Dir * (r + Sz * 0.32f);
			GlowLine(Stem, Tip, SC, 1.3f);
			GlowLine(Tip, Tip - Dir * (Sz * 0.16f) + Up * (Sz * 0.11f), SC, 1.3f);
			GlowLine(Tip, Tip - Dir * (Sz * 0.16f) - Up * (Sz * 0.11f), SC, 1.3f);
			break;
		}

		default: break;
		}
	}
}

void AHexaxPawn::DrawBolt(int32 Lane, float VisualDepth, float Intensity)
{
	const float LaneF = RenderLaneFloat(Lane);
	const float Ang = HexaxGeo::LaneCenterAngleDeg(LaneF);

	// Origin the bolt at the gun muzzle (bottom-edge midpoint of the depth-0 face,
	// raised to the barrel tip — matches DrawShip), blending back to the lane path
	// as it flies inward so it emerges from inside the gun, not below the rim line.
	FVector Radial, Tangent; HexaxGeo::Basis(Ang, Radial, Tangent);
	const FVector Inward = -Radial;
	const FVector EdgeMid = (HexaxGeo::OnTube(0.f, HexaxGeo::LaneCenterAngleDeg(LaneF - 0.5f), HX::TUBE_RADIUS)
	                       + HexaxGeo::OnTube(0.f, HexaxGeo::LaneCenterAngleDeg(LaneF + 0.5f), HX::TUBE_RADIUS)) * 0.5f;
	const FVector Muzzle = EdgeMid + Inward * (HX::ENTITY_SIZE * 0.29f); // platH+bodyH+barH
	const FVector Off0 = Muzzle - HexaxGeo::OnTube(0.f, Ang, HX::TUBE_RADIUS);
	auto Pos = [&](float d) -> FVector
	{
		const float dd = FMath::Max(0.f, d);
		const float fade = FMath::Clamp(1.f - dd / 0.8f, 0.f, 1.f); // muzzle correction fades out by depth 0.8
		return HexaxGeo::OnTube(dd, Ang, HX::TUBE_RADIUS) + Off0 * fade;
	};

	// Hot core — bright, blooms into a glowing dart head.
	GlowLine(Pos(VisualDepth - 0.12f), Pos(VisualDepth + 0.12f), HX::Bullet(), Intensity * 2.6f);

	// Tapered fading trail streaking back toward the muzzle.
	const int32 TN = 6;
	const float Seg = 0.18f;
	for (int32 i = 0; i < TN; ++i)
	{
		const float A = VisualDepth - 0.12f - i * Seg;
		const float B = VisualDepth - 0.12f - (i + 1) * Seg;
		if (A <= 0.f) break;
		const float Fade = (1.f - (float)i / TN) * 0.5f;
		GlowLine(Pos(B), Pos(A), HX::Bullet(), Intensity * Fade);
	}
}

void AHexaxPawn::DrawLightning(const FVector& A, const FVector& B, const FLinearColor& Color, float Intensity, float Amp, int32 Segs)
{
	const FVector Dir = B - A;
	const float Len = Dir.Size();
	if (Len < KINDA_SMALL_NUMBER) return;
	const FVector D = Dir / Len;
	FVector P1 = FVector::CrossProduct(D, FVector(1.f, 0.f, 0.f));
	if (P1.IsNearlyZero()) P1 = FVector::CrossProduct(D, FVector(0.f, 0.f, 1.f));
	P1.Normalize();
	const FVector P2 = FVector::CrossProduct(D, P1);
	FVector Prev = A;
	for (int32 i = 1; i <= Segs; ++i)
	{
		FVector Pt = A + Dir * ((float)i / Segs);
		if (i < Segs)
		{
			Pt += P1 * FMath::FRandRange(-Amp, Amp) + P2 * FMath::FRandRange(-Amp, Amp);
		}
		GlowLine(Prev, Pt, Color, Intensity);
		Prev = Pt;
	}
}

void AHexaxPawn::DrawGhostBullets()
{
	// In-flight deferred kills: keep drawing the dart so it visibly reaches the
	// target before the explosion (instead of vanishing at the grid cell).
	for (const FHexaxPendingKill& PK : Collision.PendingKills)
	{
		if (PK.Enemy.IsValid()) { DrawBolt(PK.Lane, PK.GhostDepth, 1.f); }
	}
}

void AHexaxPawn::DrawShip()
{
	// Turret sitting ON the bottom rim line (the flat hex edge of the mouth ring).
	const float Ang  = HexaxGeo::LaneCenterAngleDeg(0.f);
	FVector Radial, Tangent;
	HexaxGeo::Basis(Ang, Radial, Tangent);
	const FVector Inward = -Radial; // up into the tube

	// Anchor to the MIDPOINT of the bottom edge (where the red line is), not the
	// face-centre direction at radius R (which lands outside the flat edge -> below).
	const float AngL = HexaxGeo::LaneCenterAngleDeg(-0.5f);
	const float AngR = HexaxGeo::LaneCenterAngleDeg(0.5f);
	const FVector OnLine = (HexaxGeo::OnTube(0.f, AngL, HX::TUBE_RADIUS)
	                      + HexaxGeo::OnTube(0.f, AngR, HX::TUBE_RADIUS)) * 0.5f;

	const FLinearColor Col = HX::Ship() * (1.8f + MuzzleFlash * 3.f);
	const float w     = HX::ENTITY_SIZE * 0.150f;  // base half-width
	const float platH = HX::ENTITY_SIZE * 0.045f;  // base platform height
	const float bodyH = HX::ENTITY_SIZE * 0.085f;  // tapered body height
	const float barH  = HX::ENTITY_SIZE * 0.160f;  // barrel length
	const float shW   = w * 0.42f;                 // shoulder / barrel-base half-width
	const float tipW  = w * 0.13f;                 // barrel tip half-width (thin)

	auto P = [&](float side, float up) { return OnLine + Tangent * side + Inward * up; };

	// Base platform (rests on the line)
	const FVector A1 = P(-w, 0.f),      A2 = P(w, 0.f);
	const FVector A3 = P(w, platH),     A4 = P(-w, platH);
	GlowLine(A1, A2, Col, 1.4f); GlowLine(A2, A3, Col, 1.4f);
	GlowLine(A3, A4, Col, 1.4f); GlowLine(A4, A1, Col, 1.4f);

	// Tapered body: platform-top corners angle inward to the shoulder
	const FVector S1 = P(-shW, platH + bodyH), S2 = P(shW, platH + bodyH);
	GlowLine(A4, S1, Col, 1.4f); GlowLine(A3, S2, Col, 1.4f);
	GlowLine(S1, S2, Col, 1.4f);

	// Slim tapered barrel up to a thin muzzle
	const FVector T1 = P(-tipW, platH + bodyH + barH), T2 = P(tipW, platH + bodyH + barH);
	GlowLine(S1, T1, Col, 1.6f); GlowLine(S2, T2, Col, 1.6f);
	GlowLine(T1, T2, Col, 1.6f + MuzzleFlash * 2.f); // muzzle (flares when firing)
}

void AHexaxPawn::DrawExplosions()
{
	for (const FHexaxExplosion& Ex : Explosions)
	{
		const float t = Ex.Elapsed / Ex.Life;
		const float A = (1.f - t) * (1.f - t); // ease-out fade
		for (const FHexaxParticle& P : Ex.Particles)
		{
			GlowLine(P.Pos - P.Half, P.Pos + P.Half, P.Color, A * 1.6f);
		}
	}
}

void AHexaxPawn::DrawShockwaves()
{
	for (const FHexaxShockwave& SW : Shockwaves)
	{
		const float T = SW.Elapsed / SW.Life;
		const float R = T * SW.MaxRadius;
		const float A = 1.f - T;
		const int32 Seg = 22;
		FVector Prev = SW.Center + FVector(0.f, R, 0.f);
		for (int32 i = 1; i <= Seg; ++i)
		{
			const float a = (2.f * PI * i) / Seg;
			const FVector Cur = SW.Center + FVector(0.f, R * FMath::Cos(a), R * FMath::Sin(a));
			GlowLine(Prev, Cur, SW.Color, 1.3f * A);
			Prev = Cur;
		}
	}
}

void AHexaxPawn::DrawHud()
{
	if (!Camera) return;

	{
		const FTransform HudCamX = Camera->GetComponentTransform();
		const float HudD = 120.f;
		const float HudHX = HudD;
		const float HudVZ = HudD * 0.75f;
		const float HudAX = HudVZ / HudHX;

		auto HudPtLine = [&](float sx, float sy) -> FVector
		{
			return HudCamX.TransformPosition(FVector(HudD, sx * HudHX, sy * HudVZ));
		};
		auto HudLineLine = [&](float ax, float ay, float bx, float by, const FLinearColor& Col, float Inten)
		{
			GlowLine(HudPtLine(ax, ay), HudPtLine(bx, by), Col, Inten);
		};
		auto HudTextWLine = [&](const FString& Str, float ch) -> float
		{
			return Str.Len() * HexaxFont::ADV * (ch / HexaxFont::GH) * HudAX;
		};
		auto HudTextLine = [&](const FString& Str, float sx, float sy, float ch, const FLinearColor& Col, float Inten)
		{
			const float Scale = ch / HexaxFont::GH;
			float cx = sx;
			for (int32 i = 0; i < Str.Len(); ++i)
			{
				TArray<TArray<FVector2D>> Strokes;
				HexaxFont::Glyph(FChar::ToUpper(Str[i]), Strokes);
				for (const TArray<FVector2D>& Poly : Strokes)
				{
					for (int32 p = 0; p + 1 < Poly.Num(); ++p)
					{
						GlowLine(
							HudPtLine(cx + Poly[p].X * Scale * HudAX, sy + Poly[p].Y * Scale),
							HudPtLine(cx + Poly[p + 1].X * Scale * HudAX, sy + Poly[p + 1].Y * Scale),
							Col,
							Inten);
					}
				}
				cx += HexaxFont::ADV * Scale * HudAX;
			}
		};

		const FLinearColor HudCyan = HX::Tunnel();
		const FLinearColor HudRed = HX::Wall();
		const FLinearColor HudHealth = (State.Health <= 30) ? HudRed : HudCyan;
		const float TopY = 0.90f;
		const float TextH = 0.044f;

		HudTextLine(FString::Printf(TEXT("SCORE %d"), State.Score), -0.94f, TopY, TextH, HudCyan, 1.1f);
		HudTextLine(FString::Printf(TEXT("X%.1f"), State.ScoreMultiplier), -0.52f, TopY, TextH, HX::ActiveLane(), 1.0f);
		HudTextLine(TEXT("HP"), -0.34f, TopY, TextH, HudHealth, 1.0f);

		const float BarX0 = -0.24f;
		const float BarX1 = 0.55f;
		const float BarY = TopY - 0.002f;
		const float BarH = 0.034f;
		HudLineLine(BarX0, BarY, BarX1, BarY, HudHealth, 1.0f);
		HudLineLine(BarX0, BarY + BarH, BarX1, BarY + BarH, HudHealth, 1.0f);
		HudLineLine(BarX0, BarY, BarX0, BarY + BarH, HudHealth, 1.0f);
		HudLineLine(BarX1, BarY, BarX1, BarY + BarH, HudHealth, 1.0f);

		const int32 Segs = 10;
		const int32 Filled = FMath::Clamp((State.Health + 9) / 10, 0, Segs);
		for (int32 s = 1; s < Segs; ++s)
		{
			const float x = BarX0 + (BarX1 - BarX0) * (float)s / (float)Segs;
			HudLineLine(x, BarY, x, BarY + BarH, HudHealth, 0.55f);
		}
		for (int32 s = 0; s < Filled; ++s)
		{
			const float fx0 = BarX0 + (BarX1 - BarX0) * (float)s / (float)Segs + 0.004f;
			const float fx1 = BarX0 + (BarX1 - BarX0) * (float)(s + 1) / (float)Segs - 0.004f;
			HudLineLine(fx0, BarY + BarH * 0.35f, fx1, BarY + BarH * 0.35f, HudHealth, 1.35f);
			HudLineLine(fx0, BarY + BarH * 0.65f, fx1, BarY + BarH * 0.65f, HudHealth, 1.35f);
		}

		const float HexCx = 0.70f;
		const float HexCy = TopY + 0.014f;
		const float HexR = 0.046f;
		const float Pulse = 0.75f + 0.45f * FMath::Abs(FMath::Sin(RenderClock * 6.f));
		for (int32 i = 0; i < HX::NUM_LANES; ++i)
		{
			// Rotate the icon with the tunnel: segment i sits at its current render
			// angle (bottom = the ship's lane), so damaged faces read accurately.
			const float rc = RenderLaneFloatF((float)i);
			const float A0 = FMath::DegreesToRadians(-90.f + (rc - 0.5f) * 60.f);
			const float A1 = FMath::DegreesToRadians(-90.f + (rc + 0.5f) * 60.f);
			const bool bDmg = State.SegmentDamage[i];
			const FLinearColor EdgeCol = bDmg ? HudRed : HudCyan;
			const float EdgeInt = bDmg ? Pulse : 0.75f;
			HudLineLine(
				HexCx + HexR * HudAX * FMath::Cos(A0),
				HexCy + HexR * FMath::Sin(A0),
				HexCx + HexR * HudAX * FMath::Cos(A1),
				HexCy + HexR * FMath::Sin(A1),
				EdgeCol,
				EdgeInt);
		}

		if (WarningTimer > 0.f && !WarningText.IsEmpty())
		{
			const float Ch = 0.06f;
			HudTextLine(WarningText, -HudTextWLine(WarningText, Ch) * 0.5f, 0.56f, Ch, HudRed, 1.25f);
		}

		if (State.bGameOver)
		{
			const FString GO = TEXT("GAME OVER");
			const float Ch1 = 0.14f;
			HudTextLine(GO, -HudTextWLine(GO, Ch1) * 0.5f, 0.06f, Ch1, HudRed, 1.4f);
			const FString Sub = TEXT("PRESS FIRE TO RESTART");
			const float Ch2 = 0.05f;
			HudTextLine(Sub, -HudTextWLine(Sub, Ch2) * 0.5f, -0.06f, Ch2, HudCyan, 1.1f);
		}
	}
	return;
}
