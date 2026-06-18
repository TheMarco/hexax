using UnrealBuildTool;
using System.Collections.Generic;

public class HexaxTarget : TargetRules
{
	public HexaxTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V7;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("Hexax");
	}
}
