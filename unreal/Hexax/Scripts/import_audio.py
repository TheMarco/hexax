"""
Import the game's mp3s as USoundWave assets into /Game/Audio, and mark the
soundtrack as looping. Run:
  UnrealEditor-Cmd Hexax.uproject -run=pythonscript -script="Scripts/import_audio.py"
"""
import unreal

SRC = "/Users/marcovhv/projects/GIT/hexax/public/sounds"
DEST = "/Game/Audio"
NAMES = [
    "bomb_explode", "breach", "death", "explode", "getready", "heart",
    "hitwall", "phase_kill", "shoot", "soundtrack", "spiral_kill",
    "tank_hit", "tank_kill", "twist",
]

tasks = []
for n in NAMES:
    t = unreal.AssetImportTask()
    t.filename = SRC + "/" + n + ".mp3"
    t.destination_path = DEST
    t.automated = True
    t.replace_existing = True
    t.save = True
    tasks.append(t)

unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)

# Make the soundtrack loop.
st = unreal.EditorAssetLibrary.load_asset(DEST + "/soundtrack")
if st:
    try:
        st.set_editor_property("looping", True)
    except Exception as e:
        unreal.log_warning("could not set looping: {}".format(e))
    unreal.EditorAssetLibrary.save_asset(DEST + "/soundtrack")

unreal.log("Audio import complete.")
