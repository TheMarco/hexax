"""
Create the CRT post-process material /Game/Materials/M_HexaxCRT.

Single-pass CRT-Royale / crt-lottes style:
  * brightness-dependent Gaussian scanline beam (dark = thin sharp lines with
    black gaps, bright = fat blooming lines that merge) -- the signature look
  * continuous horizontal sampling so smooth neon vector lines DON'T pixelate
  * aperture-grille phosphor mask with brightness compensation
  * Lottes barrel warp + rounded-corner bezel + vignette + gentle flicker

A SceneTexture(PostProcessInput0) node is wired into the Custom HLSL node so the
engine binds the scene texture (otherwise SceneTextureLookup silently no-ops).
Scalar param 'Enabled' lets a dynamic instance bypass it (0 = passthrough).

Run:
  UnrealEditor-Cmd Hexax.uproject -run=pythonscript -script="Scripts/create_crt_material.py"
"""
import unreal

PKG = "/Game/Materials"
NAME = "M_HexaxCRT"
FULL = PKG + "/" + NAME

HLSL = r"""
float2 uv0 = GetDefaultSceneTextureUV(Parameters, 14);
float3 raw = SceneColor.rgb;
if (Enabled < 0.5) { return raw; }

float  t      = View.GameTime;
float2 vsize  = View.ViewSizeAndInvSize.xy;   // rendered view size (px)
float2 binv   = View.BufferSizeAndInvSize.zw; // 1 / scene buffer size
float2 rmin   = View.ViewRectMin.xy;          // view offset within the buffer (px)
// Valid scene-texture UV range (half-texel inset) -> never sample the magenta
// padding the buffer carries on its right/bottom.
float2 uvLo   = (rmin + 0.5) * binv;
float2 uvHi   = (rmin + vsize - 0.5) * binv;
// Current pixel in TRUE viewport space [0,1].
float2 vp     = ((uv0 / binv) - rmin) / vsize;

// ---- 1) tube curvature (Lottes warp) + rounded-corner bezel ----
float wX = 0.031, wY = 0.041;
float2 p = vp * 2.0 - 1.0;
p *= float2(1.0 + (p.y * p.y) * wX, 1.0 + (p.x * p.x) * wY);
float2 uv = p * 0.5 + 0.5;
if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return float3(0.0, 0.0, 0.0); }

// ---- 2) brightness-dependent Gaussian scanline beam (CRT-Royale signature) ----
// Sample the 4 nearest virtual scanline rows; weight each by a Gaussian whose
// width grows with that row's brightness (sqrt = Royale "spherical" beam).
const float VROWS   = 240.0;   // virtual raster rows -> horizontal scanlines
const float SIG_MIN = 0.20;    // dark content: thin scanlines, big black gaps
const float SIG_MAX = 0.42;    // bright content: fat scanlines that bloom/merge
float fy   = uv.y * VROWS - 0.5;
float base = floor(fy);
float invV = 1.0 / VROWS;
float3 col = float3(0.0, 0.0, 0.0);
[unroll]
for (int j = -1; j <= 2; j++)
{
    float row  = base + float(j);
    float2 q   = float2(uv.x, (row + 0.5) * invV);          // viewport-space sample
    float2 sUV = clamp(q * vsize * binv + rmin * binv, uvLo, uvHi); // -> scene UV, clamped
    float3 c   = SceneTextureLookup(sUV, 14, false).rgb;
    float  lum = dot(c, float3(0.299, 0.587, 0.114));
    float  sig = lerp(SIG_MIN, SIG_MAX, sqrt(saturate(lum)));
    float  d   = fy - row;
    col += c * exp(-(d * d) / (2.0 * sig * sig));
}

// ---- 3) aperture-grille phosphor mask (subtle vertical RGB triads, 3 device px) ----
float md = 0.85, ml = 1.12;
float gx = frac(vp.x * vsize.x / 3.0);
float3 mask = float3(md, md, md);
if      (gx < 0.3333) mask.r = ml;
else if (gx < 0.6666) mask.g = ml;
else                  mask.b = ml;
col *= mask;
col *= 1.18;   // brightboost: compensate mask + scanline energy

// ---- 4) vignette ----
float2 vu = uv * 2.0 - 1.0;
col *= 0.32 + 0.68 * saturate(1.0 - dot(vu, vu) * 0.30);

// ---- 5) gentle flicker + slow rolling refresh bar ----
col *= 0.975 + 0.025 * sin(t * 9.0);
col *= 1.0 + 0.015 * sin((uv.y - frac(t * 0.2)) * 6.2831853);

return col;
"""

if unreal.EditorAssetLibrary.does_asset_exist(FULL):
    unreal.EditorAssetLibrary.delete_asset(FULL)

at = unreal.AssetToolsHelpers.get_asset_tools()
mat = at.create_asset(NAME, PKG, unreal.Material, unreal.MaterialFactoryNew())
mat.set_editor_property("material_domain", unreal.MaterialDomain.MD_POST_PROCESS)

mle = unreal.MaterialEditingLibrary

# Scene color source — REQUIRED to bind the scene texture for the Custom node.
st = mle.create_material_expression(mat, unreal.MaterialExpressionSceneTexture, -760, 200)
try:
    st.set_editor_property("scene_texture_id", unreal.SceneTextureId.PPI_POST_PROCESS_INPUT0)
except Exception as e:
    unreal.log_warning("scene_texture_id: {}".format(e))

en = mle.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, -760, 0)
en.set_editor_property("parameter_name", "Enabled")
en.set_editor_property("default_value", 1.0)

custom = mle.create_material_expression(mat, unreal.MaterialExpressionCustom, -300, 0)
custom.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3)
custom.set_editor_property("code", HLSL)
ciScene = unreal.CustomInput()
ciScene.set_editor_property("input_name", "SceneColor")
ciEn = unreal.CustomInput()
ciEn.set_editor_property("input_name", "Enabled")
custom.set_editor_property("inputs", [ciScene, ciEn])

# SceneTexture default output (Color) -> SceneColor ; binds scene textures.
mle.connect_material_expressions(st, "", custom, "SceneColor")
mle.connect_material_expressions(en, "", custom, "Enabled")
mle.connect_material_property(custom, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)

mle.recompile_material(mat)
unreal.EditorAssetLibrary.save_asset(FULL)
unreal.log("Created CRT material at {}".format(FULL))
