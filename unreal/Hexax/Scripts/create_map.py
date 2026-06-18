"""
Headless creation of the empty launch map at /Game/Maps/Hexax.

The Hexax GameMode spawns the whole game from C++, so the map only needs to
exist and be empty. Run via:

  UnrealEditor-Cmd Hexax.uproject -run=pythonscript -script="Scripts/create_map.py"
"""
import unreal

PACKAGE_PATH = "/Game/Maps"
ASSET_NAME = "Hexax"
FULL_PATH = PACKAGE_PATH + "/" + ASSET_NAME

if unreal.EditorAssetLibrary.does_asset_exist(FULL_PATH):
    unreal.log("Hexax map already exists at {} — nothing to do.".format(FULL_PATH))
else:
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    world = asset_tools.create_asset(ASSET_NAME, PACKAGE_PATH, unreal.World, unreal.WorldFactory())
    if world is None:
        unreal.log_error("Failed to create World asset at {}".format(FULL_PATH))
    else:
        saved = unreal.EditorAssetLibrary.save_asset(FULL_PATH, only_if_is_dirty=False)
        unreal.log("Created and saved Hexax map at {} (saved={})".format(FULL_PATH, saved))
