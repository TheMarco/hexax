#pragma once

#include "CoreMinimal.h"
#include <initializer_list>

/**
 * Minimal uppercase vector stroke font for the HUD, so text renders as glowing
 * lines in the same style as the rest of the game. Each glyph is a set of
 * polylines on a grid x:[0..4], y:[0..6] (y up). Unknown chars draw nothing.
 */
namespace HexaxFont
{
	static constexpr float GW  = 4.f;   // glyph width units
	static constexpr float GH  = 6.f;   // glyph height units
	static constexpr float ADV = 5.4f;  // advance (glyph + gap)

	inline void Glyph(TCHAR C, TArray<TArray<FVector2D>>& Out)
	{
		auto S = [&Out](std::initializer_list<FVector2D> P) { Out.Emplace(P); };
		switch (C)
		{
		case 'A': S({{0,0},{2,6},{4,0}}); S({{0.8f,2.2f},{3.2f,2.2f}}); break;
		case 'B': S({{0,0},{0,6},{3,6},{4,5},{3,3},{0,3}}); S({{3,3},{4,1.5f},{3,0},{0,0}}); break;
		case 'C': S({{4,4.7f},{3,6},{1,6},{0,4.7f},{0,1.3f},{1,0},{3,0},{4,1.3f}}); break;
		case 'D': S({{0,0},{0,6},{2.5f,6},{4,4.3f},{4,1.7f},{2.5f,0},{0,0}}); break;
		case 'E': S({{4,6},{0,6},{0,0},{4,0}}); S({{0,3},{3,3}}); break;
		case 'F': S({{4,6},{0,6},{0,0}}); S({{0,3},{3,3}}); break;
		case 'G': S({{4,4.7f},{3,6},{1,6},{0,4.7f},{0,1.3f},{1,0},{3,0},{4,1.3f},{4,3},{2.2f,3}}); break;
		case 'H': S({{0,0},{0,6}}); S({{4,0},{4,6}}); S({{0,3},{4,3}}); break;
		case 'I': S({{1,0},{3,0}}); S({{2,0},{2,6}}); S({{1,6},{3,6}}); break;
		case 'J': S({{4,6},{4,1.3f},{3,0},{1,0},{0,1.5f}}); break;
		case 'K': S({{0,0},{0,6}}); S({{4,6},{0,3},{4,0}}); break;
		case 'L': S({{0,6},{0,0},{4,0}}); break;
		case 'M': S({{0,0},{0,6},{2,3},{4,6},{4,0}}); break;
		case 'N': S({{0,0},{0,6},{4,0},{4,6}}); break;
		case 'O': S({{1,0},{0,1.3f},{0,4.7f},{1,6},{3,6},{4,4.7f},{4,1.3f},{3,0},{1,0}}); break;
		case 'P': S({{0,0},{0,6},{3,6},{4,5},{4,4},{3,3},{0,3}}); break;
		case 'Q': S({{1,0},{0,1.3f},{0,4.7f},{1,6},{3,6},{4,4.7f},{4,1.3f},{3,0},{1,0}}); S({{2.5f,1.5f},{4.3f,-0.3f}}); break;
		case 'R': S({{0,0},{0,6},{3,6},{4,5},{4,4},{3,3},{0,3}}); S({{2,3},{4,0}}); break;
		case 'S': S({{4,4.7f},{3,6},{1,6},{0,4.7f},{1,3},{3,3},{4,1.3f},{3,0},{1,0},{0,1.3f}}); break;
		case 'T': S({{0,6},{4,6}}); S({{2,6},{2,0}}); break;
		case 'U': S({{0,6},{0,1.3f},{1,0},{3,0},{4,1.3f},{4,6}}); break;
		case 'V': S({{0,6},{2,0},{4,6}}); break;
		case 'W': S({{0,6},{1,0},{2,3},{3,0},{4,6}}); break;
		case 'X': S({{0,0},{4,6}}); S({{0,6},{4,0}}); break;
		case 'Y': S({{0,6},{2,3},{4,6}}); S({{2,3},{2,0}}); break;
		case 'Z': S({{0,6},{4,6},{0,0},{4,0}}); break;

		case '0': S({{1,0},{0,1.3f},{0,4.7f},{1,6},{3,6},{4,4.7f},{4,1.3f},{3,0},{1,0}}); S({{1,1},{3,5}}); break;
		case '1': S({{1,4.5f},{2,6},{2,0}}); S({{1,0},{3,0}}); break;
		case '2': S({{0,4.7f},{1,6},{3,6},{4,4.7f},{4,4},{0,0},{4,0}}); break;
		case '3': S({{0,5},{1,6},{3,6},{4,5},{4,4},{3,3},{1.3f,3}}); S({{3,3},{4,2},{4,1},{3,0},{1,0},{0,1}}); break;
		case '4': S({{3,0},{3,6},{0,2},{4,2}}); break;
		case '5': S({{4,6},{0,6},{0,3.3f},{3,3.3f},{4,2.3f},{4,1},{3,0},{1,0},{0,1}}); break;
		case '6': S({{4,4.7f},{3,6},{1,6},{0,4.7f},{0,1.3f},{1,0},{3,0},{4,1.3f},{4,2.3f},{3,3.3f},{0,3.3f}}); break;
		case '7': S({{0,6},{4,6},{1.5f,0}}); break;
		case '8': S({{1,3},{0,4},{0,5},{1,6},{3,6},{4,5},{4,4},{3,3},{1,3}}); S({{1,3},{0,2},{0,1},{1,0},{3,0},{4,1},{4,2},{3,3}}); break;
		case '9': S({{4,3.3f},{1,3.3f},{0,2.3f},{0,1.3f},{1,0},{3,0},{4,1.3f},{4,4.7f},{3,6},{1,6},{0,4.7f}}); break;

		case ':': S({{2,1.2f},{2,1.9f}}); S({{2,3.8f},{2,4.5f}}); break;
		case '!': S({{2,1.7f},{2,6}}); S({{2,0},{2,0.6f}}); break;
		case '.': S({{1.7f,0},{2.3f,0}}); break;
		case '-': S({{1,3},{3,3}}); break;
		case '/': S({{0,0},{4,6}}); break;
		case '+': S({{2,1},{2,5}}); S({{0.5f,3},{3.5f,3}}); break;
		case '@':
			S({{4,2},{4,4.5f},{3,6},{1,6},{0,4.5f},{0,1.5f},{1,0},{3,0},{4,1}}); // outer ring (open lower-right)
			S({{3,2},{3,4},{1.8f,4},{1.3f,3},{1.8f,2},{3,2}});                     // inner 'a' loop
			S({{3,2},{3.6f,1.4f}});                                                // tail
			break;
		case (TCHAR)0x00A9: // copyright ©
			S({{1,0},{0,1.3f},{0,4.7f},{1,6},{3,6},{4,4.7f},{4,1.3f},{3,0},{1,0}}); // outer ring
			S({{3,4},{2.4f,4.5f},{1.6f,4.5f},{1.1f,4},{1.1f,2},{1.6f,1.5f},{2.4f,1.5f},{3,2}}); // inner C
			break;
		default: break; // space and unknowns: advance only
		}
	}
}
