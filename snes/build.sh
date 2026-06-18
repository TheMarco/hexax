#!/bin/sh
# Build the Hexax SNES ROM. Puts the sed shim on PATH so GNU make's fast
# command-exec finds it (needed for macOS BSD sed in PVSnesLib's snes_rules).
# Equivalent to plain `make` thanks to the Makefile's re-exec guard, but explicit.
#   ./build.sh          # build hexax.sfc
#   ./build.sh clean    # clean
cd "$(dirname "$0")" || exit 1
exec env PATH="$PWD/.tools:$PATH" make "$@"
