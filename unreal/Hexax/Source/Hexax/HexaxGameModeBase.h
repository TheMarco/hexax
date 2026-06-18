#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "HexaxGameModeBase.generated.h"

/** Wires the Hexax pawn + HUD. Referenced by Config/DefaultEngine.ini. */
UCLASS()
class HEXAX_API AHexaxGameModeBase : public AGameModeBase
{
	GENERATED_BODY()

public:
	AHexaxGameModeBase();
};
