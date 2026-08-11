#!/usr/bin/env bash
#
# Compiles the Tailwind bundle and inlines it into the mockup, so the
# .html files stay self-contained and can be opened directly from disk.
#
# The CSS is injected between the `build:css` markers in the mockup; anything
# already between them is replaced. Re-run after editing theme.css, mockup.css,
# app.scss, or any mockup markup.
#
# Usage:  ./build.sh [path-to-tailwindcss-binary]
#
# Requires the Tailwind v4 standalone CLI (no Node needed):
#   https://github.com/tailwindlabs/tailwindcss/releases

set -euo pipefail

cd "$(dirname "$0")"

TAILWIND="${1:-tailwindcss}"

if ! command -v "$TAILWIND" >/dev/null 2>&1 && [ ! -x "$TAILWIND" ]; then
  echo "error: tailwindcss CLI not found at '$TAILWIND'" >&2
  echo "       pass the binary path as the first argument" >&2
  exit 1
fi

# 1. app.scss -> app.css, so the mockups always reflect the current design system
if command -v sass >/dev/null 2>&1; then
  sass --style=expanded --no-source-map \
    ../../../specs/external-docs/stylesheets/app.scss \
    ../../../specs/external-docs/stylesheets/app.css
  echo "compiled app.scss"
else
  echo "note: sass not found, using the committed app.css as-is"
fi

# 2. Strip any previously inlined CSS BEFORE Tailwind scans the mockups.
#    Without this the scanner treats last build's inlined stylesheet as source
#    markup, harvesting class names out of it and growing the bundle on every
#    run. Stripping first keeps the build idempotent.
strip_inlined_css() {
  awk '
    /<!-- build:css -->/ { print "  <!-- build:css -->"; skip = 1; next }
    /<!-- \/build:css -->/ { print "  <!-- /build:css -->"; skip = 0; next }
    !skip { print }
  ' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}

for html in DS-004-CV-mockup.html; do
  strip_inlined_css "$html"
done

# 3. Tailwind + theme bridge + app.css -> one bundle
"$TAILWIND" -i mockup.css -o mockup-build.css --optimize
echo "compiled mockup-build.css ($(wc -c < mockup-build.css) bytes)"

# 4. Inline the bundle into each mockup between the build:css markers
for html in DS-004-CV-mockup.html; do
  awk -v css_file="mockup-build.css" '
    /<!-- build:css -->/ {
      print "  <!-- build:css -->"
      print "  <style>"
      while ((getline line < css_file) > 0) print line
      close(css_file)
      print "  </style>"
      skip = 1
      next
    }
    /<!-- \/build:css -->/ { print "  <!-- /build:css -->"; skip = 0; next }
    !skip { print }
  ' "$html" > "$html.tmp" && mv "$html.tmp" "$html"
  echo "inlined -> $html"
done

echo "done"
