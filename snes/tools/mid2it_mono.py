#!/usr/bin/env python3
# Diagnostic: monophonic conversion of soundtrack.mid via mid2it's STOCK path (the
# deadfall MEL channel map -> all notes on IT channel 0, instrument TRI), just capped
# to fit ARAM. If this plays in hexax but the polyphonic build doesn't, the silence is
# in the poly note layout (density / per-note instruments), not the toolchain.
#   python3 tools/mid2it_mono.py soundtrack.mid hexax
import sys
import mid2it
from mid2it import R

MAX_PATTERNS = 30
_orig = mid2it.parse_midi


def cap(path):
    d, t, pr, notes, mt = _orig(path)
    c = MAX_PATTERNS * 64 * max(1, d // R)
    for ch in list(notes):
        notes[ch] = [x for x in notes[ch] if x[0] < c]
    return d, t, pr, notes, min(mt, c)


mid2it.parse_midi = cap

if __name__ == "__main__":
    mid2it.build_standalone(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "out")
