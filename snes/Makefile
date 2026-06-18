# Hexax SNES — build via PVSnesLib (LoROM, SlowROM).
#
# macOS note: PVSnesLib's snes_rules cleans the .sym with GNU-style `sed -i`,
# which BSD/macOS sed rejects. We ship a sed shim in .tools/. GNU make's
# fast command-exec searches make's *own* process PATH (not the exported one),
# so the shim dir must be on PATH before recipes run. The guard below re-execs
# make once with it set, so plain `make` works (so does ./build.sh).

ifeq (,$(findstring $(CURDIR)/.tools,$(PATH)))
# --- shim not yet on process PATH: re-exec make once with it ---
.DEFAULT_GOAL := __reexec
__reexec:
	@env PATH="$(CURDIR)/.tools:$$PATH" $(MAKE) --no-print-directory $(MAKECMDGOALS)
ifneq ($(MAKECMDGOALS),)
$(MAKECMDGOALS): __reexec ;
.PHONY: $(MAKECMDGOALS)
endif
.PHONY: __reexec

else
# --- real build (shim on PATH) ---
ifeq ($(strip $(PVSNESLIB_HOME)),)
$(error "Create an environment variable PVSNESLIB_HOME (see PVSnesLib install guide)")
endif

# Audio (snesmod): smconv builds res/soundbank.{asm,h,bnk} from our .it module and
# snes_rules auto-links soundbank.obj. Must be set BEFORE the include (snes_rules
# checks AUDIOFILES then). -b 5 = place the soundbank ROM data at bank 5.
AUDIOFILES := res/music_hexax.it
export SOUNDBANK := res/soundbank
SMCONVFLAGS := -s -o $(SOUNDBANK) -V -b 5

include ${PVSNESLIB_HOME}/devkitsnes/snes_rules

.PHONY: bitmaps all

# ROMNAME is consumed by snes_rules
export ROMNAME := hexax

all: bitmaps $(ROMNAME).sfc

# snes_rules doesn't track that data.obj incbins the generated graphics, so a
# graphics-only change wouldn't relink the ROM. Make the .sfc depend on the .pic
# files so regenerated graphics always force a rebuild.
$(ROMNAME).sfc: tunnel.pc7 far.pic near.pic hudfont.pic

clean: cleanBuildRes cleanRom cleanGfx

# Regenerate the Mode 7 tunnel texture from geometry, then convert to SNES format.
tunnel.bmp: tools/gen_tunnel.cjs
	@echo generate tunnel texture ...
	node tools/gen_tunnel.cjs

tunnel.pc7: tunnel.bmp
	@echo convert tunnel mode7 ... $(notdir $@)
	$(GFXCONV) -p -m -M 7 -t bmp -i $<

# Sprite sheets: gen_sprites.cjs emits far.bmp (16x16: ship + bullet + enemy far
# frames), near.bmp (32x32: distinct enemy near frames) and src/sprgfx.h (gfx tables).
far.bmp: tools/gen_sprites.cjs
	@echo generate sprite sheets ...
	node tools/gen_sprites.cjs

near.bmp: far.bmp ;           # emitted by the same script
src/sprgfx.h: far.bmp ;       # emitted by the same script

far.pic: far.bmp
	@echo convert far sprites ... $(notdir $@)
	$(GFXCONV) -s 16 -o 16 -u 16 -t bmp -i $<

near.pic: near.bmp
	@echo convert near sprites ... $(notdir $@)
	$(GFXCONV) -s 32 -o 16 -u 16 -t bmp -i $<

# HUD font: deadfall hud_font.png -> 16x16 sprite cells (+ src/hudfont.h). -R keeps
# the cell tile layout (reduction would break 16x16 sprites).
hudfont.png: tools/gen_hudfont.py res/hud_font.png
	@echo generate HUD font ...
	python3 tools/gen_hudfont.py

hudfont.pic: hudfont.png
	@echo convert HUD font ... $(notdir $@)
	$(GFXCONV) -s 16 -o 16 -u 16 -R -t png -i $<

# Entity position table (C const header, #included by src/main.c).
src/entpos.h: tools/gen_entpos.cjs
	@echo generate entity positions ...
	node tools/gen_entpos.cjs

# Music: soundtrack.mid -> res/music_hexax.it (polyphonic chiptune, capped to fit ARAM).
res/music_hexax.it: soundtrack.mid tools/mid2it_poly.py tools/mid2it.py tools/make_it.py
	@echo convert soundtrack midi -> it ...
	python3 tools/mid2it_poly.py soundtrack.mid hexax

# The soundbank's ROM-bank count varies with the module size; auto-generate the
# matching spcSetBank list (SPC_SET_ALL_BANKS) so main.c registers EVERY bank (a
# missing one makes the linker discard the music data). Runs after smconv.
src/soundbank_banks.h: $(SOUNDBANK).asm
	@python3 tools/gen_soundbank_banks.py $< $@

# Build the soundbank in the bitmaps phase too, so res/soundbank.h exists before
# src/main.c (which #includes it) is compiled.
bitmaps: tunnel.pc7 far.pic near.pic hudfont.pic src/entpos.h src/sprgfx.h $(SOUNDBANK).asm src/soundbank_banks.h

endif
