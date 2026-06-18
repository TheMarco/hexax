"""
Headless creation of the neon glow material at /Game/Materials/M_HexaxGlow.

Unlit, two-sided, Emissive = VertexColor * Boost. The mesh carries the line hue
in 8-bit vertex color (0..1); the material multiplies it into HDR so bloom turns
each line into a glowing neon stroke.

Run:
  UnrealEditor-Cmd Hexax.uproject -run=pythonscript -script="Scripts/create_glow_material.py"
"""
import unreal

PKG = "/Game/Materials"
NAME = "M_HexaxGlow"
FULL = PKG + "/" + NAME
BOOST = 6.0

# Always regenerate so fixes take effect.
if unreal.EditorAssetLibrary.does_asset_exist(FULL):
    unreal.EditorAssetLibrary.delete_asset(FULL)

at = unreal.AssetToolsHelpers.get_asset_tools()
mat = at.create_asset(NAME, PKG, unreal.Material, unreal.MaterialFactoryNew())
mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
mat.set_editor_property("two_sided", True)

mle = unreal.MaterialEditingLibrary
vc = mle.create_material_expression(mat, unreal.MaterialExpressionVertexColor, -400, 0)
con = mle.create_material_expression(mat, unreal.MaterialExpressionConstant, -400, 180)
con.set_editor_property("R", BOOST)
mul = mle.create_material_expression(mat, unreal.MaterialExpressionMultiply, -180, 40)

# VertexColor's main RGBA output is the unnamed ("") pin, NOT "RGB".
mle.connect_material_expressions(vc, "", mul, "A")
mle.connect_material_expressions(con, "", mul, "B")
mle.connect_material_property(mul, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)

mle.recompile_material(mat)
saved = unreal.EditorAssetLibrary.save_asset(FULL, only_if_is_dirty=False)
unreal.log("Created glow material at {} (saved={})".format(FULL, saved))
