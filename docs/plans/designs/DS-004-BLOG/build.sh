#!/usr/bin/env bash
#
# Compiles the Tailwind bundle and inlines it, plus the sample article data,
# into the mockup so the .html file stays self-contained and can be opened
# directly from disk.
#
# Content is injected between marker comments; anything already between a pair
# of markers is replaced:
#
#   <!-- build:css -->  … compiled Tailwind bundle …  <!-- /build:css -->
#   <!-- build:data --> … sample article data …       <!-- /build:data -->
#
# Re-run after editing theme.css, mockup.css, article-data.ts, app.scss, or any
# mockup markup.
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

MOCKUPS=(
  DS-004-BLOG-mockup.html
)

# 1. app.scss -> app.css, so the mockups always reflect the current design system
if command -v sass >/dev/null 2>&1; then
  sass --style=expanded --no-source-map \
    ../../../specs/external-docs/stylesheets/app.scss \
    ../../../specs/external-docs/stylesheets/app.css
  echo "compiled app.scss"
else
  echo "note: sass not found, using the committed app.css as-is"
fi

# 2. article-data.ts -> articles-data.js. The typed file is the single source of
#    sample content; the mockups get a plain-JS copy of the same array so the
#    two cannot drift.
{
  cat <<'HEADER'
/* DS-004-BLOG — sample article metadata for the static mockups.
 *
 * GENERATED — do not edit. Regenerate with `./build.sh`, which extracts the
 * `sampleArticles` array from `article-data.ts` so the mockups and the typed
 * production data file can never drift apart.
 *
 * Shape matches `GET /v1/articles/list` (SPEC-002 § 6.1.8). There is no
 * `content` and no `comments` field, per SPEC-003 REQ-4.3.
 */
HEADER
  awk '
    /^export const sampleArticles/ { inside = 1; print "const ARTICLES = ["; next }
    inside && /^\];$/              { print "];"; exit }
    inside                         { print }
  ' article-data.ts
} > articles-data.js
echo "generated articles-data.js ($(grep -c '^    id:' articles-data.js) articles)"

# 3. Strip previously inlined content BEFORE Tailwind scans the mockup.
#    Without this the scanner treats last build's inlined stylesheet as source
#    markup, harvesting class names out of it and growing the bundle on every
#    run. Stripping first keeps the build idempotent.
# `open_tag`/`close_tag` rather than `open`/`close` — awk reserves close() and
# refuses to parse a variable that shadows it.
strip_block() {
  awk -v open_tag="$2" -v close_tag="$3" '
    index($0, open_tag)  { print "  " open_tag;  skip = 1; next }
    index($0, close_tag) { print "  " close_tag; skip = 0; next }
    !skip { print }
  ' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}

for html in "${MOCKUPS[@]}"; do
  strip_block "$html" "<!-- build:css -->" "<!-- /build:css -->"
  strip_block "$html" "<!-- build:data -->" "<!-- /build:data -->"
done

# 4. Tailwind + theme bridge + app.css -> one bundle
"$TAILWIND" -i mockup.css -o mockup-build.css --optimize
echo "compiled mockup-build.css ($(wc -c < mockup-build.css) bytes)"

# 5. Inline the bundle and the data into the mockup
inline_block() {
  awk -v src="$2" -v open_tag="$3" -v close_tag="$4" -v pre="$5" -v post="$6" '
    index($0, open_tag) {
      print "  " open_tag
      if (pre != "") print "  " pre
      while ((getline line < src) > 0) print line
      close(src)
      if (post != "") print "  " post
      skip = 1
      next
    }
    index($0, close_tag) { print "  " close_tag; skip = 0; next }
    !skip { print }
  ' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}

for html in "${MOCKUPS[@]}"; do
  inline_block "$html" mockup-build.css "<!-- build:css -->" "<!-- /build:css -->" "<style>" "</style>"
  inline_block "$html" articles-data.js "<!-- build:data -->" "<!-- /build:data -->" "<script>" "</script>"
  echo "inlined -> $html"
done

echo "done"
