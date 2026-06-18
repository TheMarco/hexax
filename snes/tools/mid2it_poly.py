#!/usr/bin/env python3
"""Polyphonic MIDI->.it for FLATTENED single-channel MIDIs.

hexax/soundtrack.mid is one piano on MIDI channel 0 with up to 26 simultaneous
notes. mid2it maps one MIDI channel -> one tracker voice, which would play the
whole song monophonically. Here we instead ALLOCATE the overlapping notes across
6 tracker voices (first-free; the SNES has 8, we keep 6 sustained-melodic and
leave mid2it's 2 drum slots empty), giving each note a register-appropriate
chiptune timbre (square bass / triangle mid / pulse-25 treble). When more than 6
notes sound at once the extra voices are dropped -- the SNES hard limit. Reuses
mid2it's MIDI parser, sample bank, pattern packer, WAV preview and .it writer.

  python3 tools/mid2it_poly.py soundtrack.mid hexax  -> res/music_hexax.it + preview
"""
import sys
import mid2it
from mid2it import R, SQR, TRI, P25

NCH = 6          # melodic voices (mid2it treats 0..5 as sustained, 6..7 as drums)
MAX_PATTERNS = 20   # keep the module under one 32KB ROM bank (2-bank split broke it)


# The full 161s song overruns ARAM, so cap the song to the first MAX_PATTERNS worth
# of rows (truncate notes + the loop point). Patch parse_midi so prepare() sees the
# capped notes/length and to_patterns loops cleanly at the cut.
_orig_parse = mid2it.parse_midi


def parse_capped(path):
    div, tempo, progs, notes, maxtick = _orig_parse(path)
    cap = MAX_PATTERNS * 64 * max(1, div // R)        # rows -> ticks
    for ch in list(notes):
        notes[ch] = [t for t in notes[ch] if t[0] < cap]
    return div, tempo, progs, notes, min(maxtick, cap)


mid2it.parse_midi = parse_capped


def build_events_poly(div, notes):
    """Melody-forward arrangement for the SNES. The top-note contour becomes a LOUD
    lead voice, the bottom-note contour a bass voice, and the inner notes fill quiet
    harmony. The whole song is transposed down one octave so the high piano melody
    clears the ~note-84 pitch ceiling WITHOUT the per-note octave jumps that garbled
    the earlier pass. snesmod needs one fixed instrument per voice."""
    tpr = max(1, div // R)
    TRANSPOSE = -12                          # 1 octave down: clears the note-84 ceiling
    allnotes = []
    for lst in notes.values():
        for (s, e, note, vel) in lst:
            sr = int(round(s / tpr)); er = int(round(e / tpr))
            if er <= sr:
                er = sr + 1
            note += TRANSPOSE
            while note > 84:                 # fold the rare residual highs
                note -= 12
            while note < 24:                 # keep bass out of sub-audible mud
                note += 12
            allnotes.append((sr, er, note))
    ev = {c: [] for c in range(8)}
    if not allnotes:
        return tpr, ev
    maxrow = max(er for (sr, er, n) in allnotes)

    # per-row highest/lowest sounding note -> the melody and bass contours
    top = [0] * maxrow
    bot = [128] * maxrow
    for (sr, er, n) in allnotes:
        for r in range(sr, min(er, maxrow)):
            if n > top[r]:
                top[r] = n
            if n < bot[r]:
                bot[r] = n

    def held_line(arr, silence, voice, ins, vol):
        # collapse a per-row contour into held (legato) note events on one voice
        r = 0
        while r < maxrow:
            if arr[r] == silence:
                r += 1
                continue
            n = arr[r]; start = r
            while r < maxrow and arr[r] == n:
                r += 1
            ev[voice].append((start, r, n, ins, vol))

    held_line(top, 0, 5, P25, 62)            # MELODY: loud bright lead (voice 5)
    held_line(bot, 128, 0, SQR, 46)          # BASS:   medium square     (voice 0)

    # HARMONY: voices 1-4 carry the inner notes, QUIET, nearest-register first-free.
    HVREG = [50, 58, 66, 74]
    free = {1: -1, 2: -1, 3: -1, 4: -1}
    dropped = 0
    for (sr, er, n) in sorted(allnotes):
        cand = [v for v in (1, 2, 3, 4) if free[v] < sr]
        if not cand:
            dropped += 1
            continue
        c = min(cand, key=lambda v: abs(HVREG[v - 1] - n))
        ev[c].append((sr, er, n, TRI if n < 64 else P25, 22))
        free[c] = er

    print(f"melody-forward: {len(allnotes)} notes -> melody+bass lines + 4 harmony voices "
          f"({dropped} harmony notes dropped)")
    return tpr, ev


mid2it.build_events = build_events_poly       # prepare() picks this up at call time

if __name__ == "__main__":
    src = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else "out"
    mid2it.build_standalone(src, name)
