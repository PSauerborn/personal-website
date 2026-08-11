#!/usr/bin/env bash
#
# Inlines the stylesheet and the shared content data into each mockup, so the
# .html files stay self-contained and can be opened directly from disk.
#
#   <!-- build:css -->   <- app.css followed by mockup.css
#   <!-- build:data -->  <- agents-data.js
#
# Anything already between a pair of markers is replaced, so the script is
# idempotent: running it twice produces a byte-identical file. Re-run after
# editing mockup.css, agents-data.js, or app.scss.
#
# Usage:  ./build.sh
#
# Unlike DS-004-CV, this set needs no Tailwind CLI — the mockups use plain
# component classes rather than utilities. Dart Sass is used when present to
# recompile app.scss first; otherwise the committed app.css is used as-is.

set -euo pipefail

cd "$(dirname "$0")"

STYLES="../../../specs/external-docs/stylesheets"
MOCKUPS=(
  DS-004-AGENTS-mockup.html
)

# 1. app.scss -> app.css, so the mockups always reflect the current design system
if command -v sass >/dev/null 2>&1; then
  sass --style=expanded --no-source-map "$STYLES/app.scss" "$STYLES/app.css"
  echo "compiled app.scss"
else
  echo "note: sass not found, using the committed app.css as-is"
fi

# 2. Strip a previously inlined block, so the build stays idempotent.
#    Markers are matched with index(), not as regexes, and the awk variables
#    avoid the names of awk builtins (`close`).
strip_block() {
  awk -v om="$2" -v cm="$3" '
    index($0, om) { print "  " om; skip = 1; next }
    index($0, cm) { print "  " cm; skip = 0; next }
    !skip         { print }
  ' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}

# 3. Inline a file between a pair of markers, wrapped in the given tags
inline_block() {
  local html="$1" om="$2" cm="$3" src="$4" topen="$5" tclose="$6"
  awk -v om="$om" -v cm="$cm" -v src="$src" -v topen="$topen" -v tclose="$tclose" '
    index($0, om) {
      print "  " om
      print "  " topen
      while ((getline line < src) > 0) print line
      close(src)
      print "  " tclose
      skip = 1
      next
    }
    index($0, cm) { print "  " cm; skip = 0; next }
    !skip { print }
  ' "$html" > "$html.tmp" && mv "$html.tmp" "$html"
}

cat "$STYLES/app.css" mockup.css > .bundle.css

for html in "${MOCKUPS[@]}"; do
  strip_block "$html" "<!-- build:css -->" "<!-- /build:css -->"
  strip_block "$html" "<!-- build:data -->" "<!-- /build:data -->"

  inline_block "$html" "<!-- build:css -->" "<!-- /build:css -->" .bundle.css "<style>" "</style>"
  inline_block "$html" "<!-- build:data -->" "<!-- /build:data -->" agents-data.js "<script>" "</script>"

  echo "inlined -> $html ($(wc -c < "$html") bytes)"
done

rm -f .bundle.css
echo "done"
