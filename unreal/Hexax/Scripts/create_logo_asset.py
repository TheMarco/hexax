"""
Import the original Hexax logo and build an unlit additive emissive material so it
glows/blooms and runs through the CRT like the web title screen.

  /Game/UI/T_HexaxLogo  (texture, imported from public/logo.png)
  /Game/UI/M_HexaxLogo  (unlit additive: Emissive = Tex.rgb * Tint * Intensity, Opacity = Tex.a)

Run:
  UnrealEditor-Cmd Hexax.uproject -run=pythonscript -script="Scripts/create_logo_asset.py"
"""
import unreal

SRC  = "/Users/marcovhv/projects/GIT/hexax/public/logo.png"
PKG  = "/Game/UI"
TEX  = PKG + "/T_HexaxLogo"
MAT  = PKG + "/M_HexaxLogo"

at  = unreal.AssetToolsHelpers.get_asset_tools()
mle = unreal.MaterialEditingLibrary

# --- import the texture ---
task = unreal.AssetImportTask()
task.set_editor_property("filename", SRC)
task.set_editor_property("destination_path", PKG)
task.set_editor_property("destination_name", "T_HexaxLogo")
task.set_editor_property("automated", True)
task.set_editor_property("save", True)
task.set_editor_property("replace_existing", True)
at.import_asset_tasks([task])
logo = unreal.EditorAssetLibrary.load_asset(TEX)
unreal.log("Imported logo texture: {}".format(logo))

# --- material ---
if unreal.EditorAssetLibrary.does_asset_exist(MAT):
    unreal.EditorAssetLibrary.delete_asset(MAT)
mat = at.create_asset("M_HexaxLogo", PKG, unreal.Material, unreal.MaterialFactoryNew())
mat.set_editor_property("material_domain", unreal.MaterialDomain.MD_SURFACE)
mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
mat.set_editor_property("two_sided", True)

tex = mle.create_material_expression(mat, unreal.MaterialExpressionTextureSampleParameter2D, -700, 0)
tex.set_editor_property("parameter_name", "LogoTex")
if logo:
    tex.set_editor_property("texture", logo)

tint = mle.create_material_expression(mat, unreal.MaterialExpressionVectorParameter, -700, 320)
tint.set_editor_property("parameter_name", "Tint")
tint.set_editor_property("default_value", unreal.LinearColor(0.486, 1.0, 0.698, 1.0))  # 0x7cffb2

inten = mle.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -700, 460)
inten.set_editor_property("parameter_name", "Intensity")
inten.set_editor_property("default_value", 1.6)

mul1 = mle.create_material_expression(mat, unreal.MaterialExpressionMultiply, -380, 60)
mle.connect_material_expressions(tex, "RGB", mul1, "A")
mle.connect_material_expressions(tint, "", mul1, "B")

mul2 = mle.create_material_expression(mat, unreal.MaterialExpressionMultiply, -180, 60)
mle.connect_material_expressions(mul1, "", mul2, "A")
mle.connect_material_expressions(inten, "", mul2, "B")

mle.connect_material_property(mul2, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
mle.connect_material_property(tex, "A", unreal.MaterialProperty.MP_OPACITY)

mle.recompile_material(mat)
unreal.EditorAssetLibrary.save_asset(MAT)
unreal.log("Created logo material: {}".format(MAT))
