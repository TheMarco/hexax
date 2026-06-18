using UnrealBuildTool;
using System.Collections.Generic;

public class HexaxEditorTarget : TargetRules
{
	public HexaxEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V7;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("Hexax");
	}
}
