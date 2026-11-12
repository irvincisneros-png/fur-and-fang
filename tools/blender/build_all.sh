#!/bin/sh
# Rebuild every GLB in assets/models/ (rabbit.glb, fox.glb, flora.glb) + review renders in playtest-shots/. Run from the repo root.
B=/Applications/Blender.app/Contents/MacOS/Blender
for s in rabbit fox flora; do "$B" -b --factory-startup --python tools/blender/build_$s.py -- "$@" || exit 1; done
