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

// ---- 2b) halation: warm light scattering through the glass around bright lines ----
float3 halo = float3(0.0, 0.0, 0.0);
float2 hpx = 2.0 / vsize;   // tight ~2px sample radius in viewport space
[unroll]
for (int hi = 0; hi < 6; hi++)
{
    float a = 1.04719755 * float(hi);            // 60-degree ring of taps
    float2 hq = uv + float2(cos(a), sin(a)) * hpx;
    float2 hUV = clamp(hq * vsize * binv + rmin * binv, uvLo, uvHi);
    halo += SceneTextureLookup(hUV, 14, false).rgb;
}
halo *= (1.0 / 6.0);
col += halo * float3(1.0, 0.85, 0.65) * 0.07;    // faint warm phosphor halation (not a blur)

// ---- 3) aperture-grille phosphor mask ----
// SOFT cosine triad at low depth. The old hard R/G/B thirds tinted each pixel
// column strongly, which shows as rainbow fringing on thin/sharp vector lines.
// A smooth, shallow triad keeps a phosphor feel but blends back to white.
float gp = vp.x * vsize.x * (6.2831853 / 3.0); // one RGB cycle per ~3 device px
float3 grille = float3(0.5 + 0.5 * cos(gp),
                       0.5 + 0.5 * cos(gp - 2.0943951),
                       0.5 + 0.5 * cos(gp + 2.0943951));
col *= lerp(float3(1.0, 1.0, 1.0), grille * 2.0, 0.10); // 10% tint, average-neutral
col *= 1.08;   // small brightboost (compensates scanline energy)

// ---- 4) vignette ----
float2 vu = uv * 2.0 - 1.0;
col *= 0.32 + 0.68 * saturate(1.0 - dot(vu, vu) * 0.30);

// ---- 5) gentle flicker + slow rolling refresh bar ----
col *= 0.975 + 0.025 * sin(t * 9.0);
col *= 1.0 + 0.015 * sin((uv.y - frac(t * 0.2)) * 6.2831853);

// ---- 6) glass: faint reflection sheen (upper-left) + phosphor grain ----
float2 gv = uv - float2(0.30, 0.20);
float sheen = saturate(1.0 - dot(gv, gv) * 3.0);
col += sheen * sheen * 0.035;
float grain = frac(sin(dot(floor(uv * vsize * 0.5), float2(12.9898, 78.233)) + t * 53.0) * 43758.5453);
col *= 0.965 + 0.07 * grain;

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
