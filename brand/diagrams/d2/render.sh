#!/bin/sh
# Renders every .d2 in templates/ and examples/ (or only the files named) into out/:
#
#   <name>.svg            follows the reader's prefers-color-scheme (paper or ink)
#   <name>-paper.svg      forced paper, for documents and paper slides
#   <name>-ink.svg        forced ink, for ink slides
#   <name>-paper@2x.png   2x raster, paper
#   <name>-ink@2x.png     2x raster, ink
#   contact-{paper,ink}.png   every template on one sheet
#
#   ./render.sh                         everything, and the contact sheets
#   ./render.sh templates/access.d2     one file
#   OUT=/some/folder ./render.sh /abs/path/to/diagram.d2
#                                       a diagram kept elsewhere, rendered into its own folder
#                                       (give absolute paths: the script runs from its folder)
#
# Each file picks its own layout engine in vars.d2-config.layout-engine; brand.d2 sets the
# padding and the themes. Fonts come from fonts/ through D2's font flags (as environment
# variables). PNGs need Node and Playwright (this repository has it); set CHROME to a Chromium
# binary if Playwright has not downloaded one.
#
# This script renders once and exits. Never add d2 --watch: it starts a server and a file
# watcher, and this machine overheats with watchers.
set -eu
cd "$(dirname "$0")"

command -v d2 >/dev/null || { echo "d2 not found: install it to ~/.local/bin (see README.md)" >&2; exit 1; }

F=fonts
# Instrument Sans for the regular slots (set per file below), Commit Mono for the mono slots.
export D2_FONT_MONO="$F/CommitMono-400-Regular.ttf"
export D2_FONT_MONO_ITALIC="$F/CommitMono-400-Italic.ttf"
# Commit Mono ships in 400 and 700 only, so semibold uses 700.
export D2_FONT_MONO_SEMIBOLD="$F/CommitMono-700-Regular.ttf"
export D2_FONT_MONO_BOLD="$F/CommitMono-700-Regular.ttf"
export D2_WATCH=false

OUT=${OUT:-out}
SHEETS=0
if [ "$#" -eq 0 ]; then
  SHEETS=1
  for f in templates/*.d2 examples/*.d2; do [ -e "$f" ] && set -- "$@" "$f"; done
fi
export SHEETS

mkdir -p "$OUT"
for f in "$@"; do
  name=$(basename "$f" .d2)
  # sql_table always uses D2's regular face and ignores style.font, so a file with tables
  # gets Commit Mono as its regular face too. Everything else is mono already (brand.d2).
  if grep -q 'sql_table\|class: table' "$f"; then
    export D2_FONT_REGULAR="$F/CommitMono-400-Regular.ttf" D2_FONT_ITALIC="$F/CommitMono-400-Italic.ttf"
    export D2_FONT_SEMIBOLD="$F/CommitMono-700-Regular.ttf" D2_FONT_BOLD="$F/CommitMono-700-Regular.ttf"
  else
    export D2_FONT_REGULAR="$F/InstrumentSans-Regular.ttf" D2_FONT_ITALIC="$F/InstrumentSans-Italic.ttf"
    export D2_FONT_SEMIBOLD="$F/InstrumentSans-SemiBold.ttf" D2_FONT_BOLD="$F/InstrumentSans-Bold.ttf"
  fi
  # --scale=1 writes the natural width and height into the SVG, so <img> and PNGs size properly.
  rm -f "$OUT/$name.svg"
  if ! d2 --scale=1 --omit-version "$f" "$OUT/$name.svg" >"$OUT/.d2.log" 2>&1; then
    cat "$OUT/.d2.log" >&2; rm -f "$OUT/.d2.log"; exit 1
  fi
  grep -v '^success\|^info' "$OUT/.d2.log" >&2 || true
done
rm -f "$OUT/.d2.log"

node lib/finish.mjs "$OUT" "$@"
[ "$OUT" = out ] || exit 0

# The guidelines page, the slides and the documents use the kit and the worked example by
# these names, so keep them in step with the D2 sources.
for n in example kit; do
  for t in paper ink; do
    if [ -f "out/$n-$t.svg" ]; then cp "out/$n-$t.svg" "../$n-$t.svg"; fi
  done
done
