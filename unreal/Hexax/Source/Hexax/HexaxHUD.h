#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "HexaxHUD.generated.h"

/**
 * Canvas-drawn HUD — score, multiplier, segmented health bar, warnings and the
 * game-over prompt. No UMG assets; everything is drawn in code so the project
 * stays asset-free. Ported from HUD.js.
 */
UCLASS()
class HEXAX_API AHexaxHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;
};
