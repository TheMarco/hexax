#include "HexaxHUD.h"

// The HUD is now rendered as glowing vector geometry inside AHexaxPawn::DrawHud()
// (same neon style as the rest of the game), so the Canvas HUD is intentionally empty.
void AHexaxHUD::DrawHUD()
{
	Super::DrawHUD();
}
