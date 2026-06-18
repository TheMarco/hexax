.include "hdr.asm"

.section ".rodata_tunnel" superfree

; Mode 7 tunnel texture (generated: tunnel.bmp -> gfx4snes -M 7)
patterns:
.incbin "tunnel.pc7"
patterns_end:

map:
.incbin "tunnel.mp7"
map_end:

palette:
.incbin "tunnel.pal"

.ends

.section ".rosprite" superfree

; Far sprite sheet + palette: ship + bullet + enemy FAR frames (gfx4snes -s 16) -> tile 0
fartiles:
.incbin "far.pic"
fartiles_end:

farpal:
.incbin "far.pal"
farpal_end:

; 32x32 distinct enemy NEAR frames (dmaCopyVram'd to VRAM tile 256)
neartiles:
.incbin "near.pic"
neartiles_end:

; HUD font glyphs as 16x16 sprite cells (dmaCopyVram'd to VRAM tile 160)
hudfonttiles:
.incbin "hudfont.pic"
hudfonttiles_end:

.ends
