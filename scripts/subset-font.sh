#!/usr/bin/env bash
# Regenerate the site's font subsets from the brand masters (needs fontTools: pip install fonttools brotli).
# The subsets cover ASCII and common punctuation: Instrument Sans 30 -> 21 KB (the preloaded headline
# face) and Commit Mono 20 -> 11 KB. Other characters fall through to the full brand files, which load
# only if a page uses them. Keep UNICODES in step with the unicodeRange values in astro.config.ts.
set -euo pipefail
cd "$(dirname "$0")/.."
UNICODES='U+0020-007E,U+00A0,U+00A3,U+00A9,U+00B7,U+00D7,U+2013-2014,U+2018-201D,U+2022,U+2026,U+20AC'
subset() {
  pyftsubset "brand/fonts/$1.woff2" --unicodes="$UNICODES" --layout-features='kern,liga,calt,case,tnum,lnum' \
    --flavor=woff2 --output-file="src/assets/fonts/$1-basic.woff2"
  ls -l "src/assets/fonts/$1-basic.woff2"
}
subset instrument-sans-wght
subset commit-mono-400
