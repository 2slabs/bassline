#!/bin/sh
# The music core (scales, chords, progression generation, genre styles, harmony analysis) lives in
# chord-progressions; copy it here so both tools agree. Edit it there, not here.
#   scripts/sync-music.sh [path-to-chord-progressions]
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
src=${1:-$here/../chord-progressions}
cp "$src/src/theory.ts" "$src/src/styles.ts" "$src/src/analysis.ts" "$here/src/music/"
rev=$(git -C "$src" rev-parse --short HEAD 2>/dev/null || echo "uncommitted")
printf 'chord-progressions %s, synced %s. Edit there, not here.\n' "$rev" "$(date +%Y-%m-%d)" > "$here/src/music/VERSION"
echo "synced music core ($rev) into src/music"
