# DS-004-BLOG — Blog index design

The accepted design for the blog index page defined in `docs/specs/SPEC-003.md`
§ 4.6 (REQ-4.1 display all article metadata, REQ-4.2 client-side search over
keywords and topics, REQ-4.3 metadata only — never content, never comments).

**Editorial Index** — the archive as a contents page: one column, one article per
ruled row, newest first, a masthead lead article, and a slim filter bar sticking
under the site header. Selected from a set of three options on 2026-08-11; the
two rejected options have been removed.

Built on `docs/specs/external-docs/stylesheets/app.css` with shadcn/ui and
Tailwind v4 per REQ-1.2, consuming the `GET /v1/articles/list` response schema
from SPEC-002 § 6.1.8 unchanged.

## Referencing this design from a spec

Add to SPEC-003's *External Resources* table:

| Filepath | Description | When to use |
|----------|-------------|-------------|
| `docs/plans/designs/DS-004-BLOG/DS-004-BLOG.md` | Accepted design for the blog index page | Use when implementing or reviewing the blog index |

and add a requirement under § 4.6 pointing at it, matching REQ-2.2 in § 4.2:

> - **REQ-4.4**: `docs/plans/designs/DS-004-BLOG/` contains the accepted design
>   that must be followed when building the blog index page.

Cite specific requirements as `DS-004-BLOG § <section>` — for example
*DS-004-BLOG § Filtering changes the shape of the page* for the lead-article
withdrawal rule, *DS-004-BLOG § Interaction & States* for the conditional topic
counts, or *DS-004-BLOG § Blocking issue* for the contrast fix that must land
first.

## Files

| File | Role | Purpose |
| ---- | ---- | ------- |
| `DS-004-BLOG.md` | **spec reference** | The design document: concept, layout, components, states, accessibility, trade-offs |
| `DS-004-BLOG-mockup.html` | review | Self-contained static mockup — open directly in a browser |
| `blog-index.tsx` | production | Implementation — real shadcn/ui + Tailwind component code |
| `theme.css` | production | Tailwind v4 + shadcn/ui theme bridge onto `app.css` tokens |
| `article-data.ts` | production | Types mirroring `GET /v1/articles/list`, search/filter helpers, sample data |
| `mockup.css` | review | Mockup-only build entry; plain-CSS stand-ins for shadcn components |
| `mockup-build.css` | generated | Compiled bundle, inlined into the mockup by `build.sh` |
| `articles-data.js` | generated | Sample data extracted from `article-data.ts` by `build.sh` |
| `build.sh` | review | Compiles the Tailwind bundle and inlines it, plus the data, into the mockup |

`theme.css` and `article-data.ts` are design-independent — they would have
carried over from any of the three options and are reusable across the rest of
SPEC-003.

## The theme bridge

`theme.css` is the piece that makes unmodified shadcn/ui components inherit the
Linear look required by REQ-1.2. It maps `app.css` custom properties onto the
variable names shadcn expects:

```css
--background: var(--color-bg);        /* hsl(220 7% 4%)  */
--card:       var(--color-surface);   /* hsl(220 6% 7%)  */
--primary:    var(--color-accent);    /* hsl(234 56% 60%) — Linear indigo */
--border:     var(--color-border);    /* hsla(0 0% 100% / 0.08) hairline */
--ring:       var(--color-accent-text);
```

`app.css` stays the single source of truth — no colour is ever hardcoded in
`theme.css`. It is deliberately byte-identical to `../DS-004-CV/theme.css` apart
from one marked additions block containing a single utility, `clamp-2`, so the
two design sets merge into one `app/globals.css` without conflict. It also
forces `[hidden] { display: none !important }`, which this design depends on —
see `DS-004-BLOG.md` § Accessibility Notes.

## Implementation checklist

1. **Land the contrast fix first** — raise `--color-text-tertiary` in `app.scss`
   from `hsl(220, 5%, 42%)` to about `hsl(220, 5%, 50%)`. See
   `DS-004-BLOG.md` § Blocking issue; shipping without it puts the date column
   below AA.
2. Copy `article-data.ts` to `lib/article-data.ts` and drop `sampleArticles`,
   replacing it with the server-side fetch of `GET /v1/articles/list`.
3. Copy `theme.css` to `app/globals.css` — or merge its BLOG ADDITIONS block into
   the one DS-004-CV already installed — fixing the `@import` path to
   `app.scss`/`app.css` and adding `@source` directives for the app's source tree.
4. Install the shadcn components: `npx shadcn@latest add input toggle badge button`.
5. Copy `blog-index.tsx` to `components/blog/`, and render it from the blog route's
   server component, which does the fetch and passes `articles`.
6. Point `ArticleRow`'s and `LeadArticle`'s `href` at the real post route if it is
   not `/blog/[id]`.
7. Delete `mockup.css`, `mockup-build.css`, `articles-data.js`, and `build.sh`
   from the app tree — they are review scaffolding and must not ship.

## What REQ-4.3 looks like in code

`article-data.ts` has no `content` field and no `comments` field. The constraint
is enforced by the type rather than by convention, so no index component *can*
render either — the article body is fetched separately, per article, by the blog
post page (`GET /v1/articles/:article_id/content`, SPEC-002 § 6.1.9).

One consequence worth carrying into implementation: **the page shows no reading
time**, because reading time is not derivable from metadata and fetching every
article body to compute one would defeat the purpose of a metadata-only
endpoint. If it is wanted, it is an API change — a `read_minutes` field on the
list schema, computed server-side. The same reasoning drives the empty-state
copy, which says the search covers titles, descriptions, and topics rather than
full text: promising more than the payload supports is how a search box loses
trust.

## Verification

The mockup was exercised in jsdom, asserting: all 14 sample articles present in
the DOM, no content or comments in any article node, topic filtering (`Go` → 5)
and search (`postgres` → 3) producing the right visible counts, the live count
text, the empty state appearing and clearing, the lead article showing when
unfiltered with its list row suppressed, and the lead withdrawing as soon as a
filter is applied. All pass.

It has **not** been rendered in a real browser — no Chromium was installable in
the environment it was built in. Behaviour is verified; visual layout is not.
Assess the visuals by opening the file.

## Rebuilding the mockup

Requires the [Tailwind v4 standalone CLI](https://github.com/tailwindlabs/tailwindcss/releases)
(no Node needed) and optionally Dart Sass to recompile `app.scss` first:

```bash
./build.sh                          # if tailwindcss is on PATH
./build.sh /path/to/tailwindcss     # otherwise
```

The script strips previously inlined CSS and data before scanning, so it is
idempotent — running it twice produces a byte-identical file. It also
regenerates `articles-data.js` from `article-data.ts`, so sample content is
edited in one place only.

## Notes on the mockup

The mockup substitutes plain HTML and CSS for the interactive shadcn components:
`aria-pressed` buttons for `Toggle`, and a small vanilla-JS state machine for the
query and topic selection. It matches `blog-index.tsx` visually and
behaviourally, but the production DOM and ARIA wiring come from Radix — assess
layout and hierarchy from the mockup, not accessibility implementation.

The mockup also builds its article list **client-side** from `articles-data.js`.
The production page is server-rendered per REQ-1.1: the article list arrives as
HTML and the client only toggles the `hidden` attribute on rows already there.
The "works with JavaScript disabled" claim in `DS-004-BLOG.md` § Trade-offs is
about that production behaviour, and is not something the mockup demonstrates.

Sample content is placeholder data, not real articles.

## A note on the identifier

This set is `DS-004-BLOG` rather than `DS-003-BLOG` even though the UI spec is
now `SPEC-003`. The UI spec was `SPEC-004` when `DS-004-CV` and `DS-004-AGENTS`
were created, and SPEC-003 § 4.2 (REQ-2.2) and § 4.5 (REQ-3.5) still point at
those `DS-004-*` paths by name. Matching the siblings keeps one convention for
the UI design sets; renumbering all three is a separate cleanup, and would need
those two REQ references updated with it.
