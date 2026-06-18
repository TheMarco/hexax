#include "HexaxGameModeBase.h"
#include "HexaxPawn.h"
#include "HexaxHUD.h"
#include "GameFramework/PlayerController.h"

AHexaxGameModeBase::AHexaxGameModeBase()
{
	DefaultPawnClass = AHexaxPawn::StaticClass();
	HUDClass = AHexaxHUD::StaticClass();
	PlayerControllerClass = APlayerController::StaticClass();
}
