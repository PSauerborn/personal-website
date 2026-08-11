# DS-004-BLOG: Blog Index — Editorial Index

- **Design Set**: DS-004-BLOG
- **Status**: Accepted — selected from a set of three options on 2026-08-11
- **Spec**: `docs/specs/SPEC-003.md` (§ 4.6 Blog Page — REQ-4.1, REQ-4.2, REQ-4.3)
- **Mockup**: `docs/plans/designs/DS-004-BLOG/DS-004-BLOG-mockup.html`
- **Implementation**: `docs/plans/designs/DS-004-BLOG/blog-index.tsx`
- **Data contract**: `GET /v1/articles/list` — `docs/specs/SPEC-002.md` § 6.1.8
- **Theme bridge**: `docs/plans/designs/DS-004-BLOG/theme.css`

## Design Concept

The archive as a contents page. One column, one article per ruled row, ordered
newest first, with the most recent post pulled out at the top at masthead size.
Search and topic chips sit in a slim bar that sticks under the site header, so
filtering is always one keystroke away without ever being the thing the page is
about.

This is a reading-first design: it optimises for *scanning fourteen titles and
picking one*, which is what a visitor arriving from a CV link actually does.
Search is present because REQ-4.2 requires it, not because the archive is large
enough to need it — so it is given a single row and no more.

## Layout

```text
┌─────────────────────────────────────────────────────────────────────┐
│ WRITING                                                             │
│ Notes from the backend                                              │  hero
│ Long-form notes on distributed systems, Postgres, and building…     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ 🔍 Search articles by title, topic, or keyword                  [✕] │  ← sticky
│ (Go 5) (Testing 3) (PostgreSQL 3) (Deployment 2) … +13 more         │    top-16
│ 14 articles                                          [Clear filters]│
├─────────────────────────────────────────────────────────────────────┤
│ LATEST                                                              │
│ Spec-driven development                                             │  lead:
│ with subagents                                                      │  gradient
│ Every feature on this site started as a spec with numbered…         │  32px
│ 28 Jul 2026 · [Agentic development] [Testing]              Read →   │
├─────────────────────────────────────────────────────────────────────┤
│ 11 Jun 2026  Postgres advisory locks are a job queue                │
│              You probably do not need Redis for this. A walk…       │  rows
│              [PostgreSQL] [Go] [Distributed systems]       Read →   │
├─────────────────────────────────────────────────────────────────────┤
│ 19 May 2026  Exactly-once is a property of your consumer            │
│              Kafka does not give you exactly-once delivery…         │
│              [Kafka] [Distributed systems]                 Read →   │
└─────────────────────────────────────────────────────────────────────┘
      ↑ 112px date column
```

The content column is `app.css`'s standard `.section__inner` (1024px max, fluid
24–32px gutters) — the same measure as the rest of the site, so the blog does not
announce itself as a different application.

Each row is a `112px 1fr` grid from `sm` up: a fixed date column, and everything
else in the flexible one. Below `sm` the grid collapses and the date becomes the
first line of the row. Descriptions clamp to two lines and cap at 65ch, so a
long description can never turn one row into a paragraph.

### Hierarchy

Three levels, carried by weight and colour rather than size alone. Title is 18px
weight 500 in primary text; description 14px regular in secondary; date and
topic tags 12px in tertiary. The date leads the row spatially but is the quietest
thing in it — it orients without competing.

The lead article breaks the pattern deliberately: 24–32px, weight 500, with the
`app.css` white-to-faded gradient fill that the site reserves for hero titles.
It is the only element on the page at that size, so "latest" needs no badge to
read as latest.

### Filtering changes the shape of the page

When any filter is active the lead article is withdrawn and its row rejoins the
list. "Latest" is a claim about the whole archive; inside a result set for
*Kafka* the newest match is not editorially special, and showing it at masthead
size would say it was. The row order never changes, so a filtered list is the
unfiltered list with entries removed — the reading order a visitor has already
learned survives the interaction.

## Component Inventory

| Component | Source | Notes |
| --------- | ------ | ----- |
| `Input` | reused — `@/components/ui/input` | Search field; restyled to the `app.css` `.input` inset-shadow treatment, `type="search"` |
| `Toggle` | reused — `@/components/ui/toggle` | One per topic; `pressed` drives `data-[state=on]`, restyled to the accent fill |
| `Badge` | reused — `@/components/ui/badge` | Topic tags on each row; `app.css` `.tag` styling |
| `Button` | reused — `@/components/ui/button` | `variant="ghost"` for clear-search and clear-filters, `variant="secondary"` in the empty state |
| `BlogIndex` | new — `components/blog/blog-index.tsx` | Owns `query` and `topics`; the only client component on the page, and the only stateful one |
| `TopicFilters` | new — same file | Chips ordered by frequency, first 8 shown, rest behind "+13 more"; owns its own `expanded` state |
| `LeadArticle` | new — same file | Masthead treatment for the newest post |
| `ArticleRow` | new — same file | One ruled row; presentational, props only |
| `.section`, `.empty-state`, `.tag`, `.link-arrow` | reused — `app.css` | Section chrome, zero-data state, tags, hover arrow |

shadcn components to install: `input`, `toggle`, `badge`, `button`. None require
modification — only their `className` is overridden.

The implementation lives in one file (`blog-index.tsx`) because every component
in it is under 60 lines and none is reused elsewhere; split it only when
something in it grows a second caller.

## Interaction & States

- **Primary interactions**: (1) type in the search field — filters as you type,
  no submit; (2) toggle a topic chip; (3) expand the topic list past the first
  eight; (4) click a row to open the post.
- **Search and topics compose**: the query ANDs with the selected topics, and
  multiple selected topics AND with each other. Every added constraint narrows,
  which is what a search box trains people to expect.
- **Topic counts are conditional**: each chip's count is the number of articles
  that topic would leave *given the current query and the other selected
  topics*. A chip therefore never advertises a result count its click cannot
  deliver, and a chip that would return nothing is `disabled` rather than
  removed — the topic vocabulary stays stable as you type.
- **No match highlighting.** Matched terms are deliberately not wrapped in
  `<mark>` in the results. Highlighting means rewriting title and description
  HTML on every keystroke, and the value of this design is that it needs almost
  no client work — filtering only toggles one attribute per row. A row is short
  enough that the match is visible without it. If highlighting is added later,
  add it to the description only, and keep the title untouched: the title is the
  scanning target and must not reflow while typing.
- **Loading**: server-rendered with the full list in hand. `query` and `topics`
  initialise empty, so first paint is the complete archive with the lead in
  place — there is no loading state, and no skeleton to design.
- **Empty**: two distinct zero-data states. *No articles at all* (a legitimate
  `200` with an empty collection) replaces the whole index with an empty state
  and suppresses the controls, since there is nothing to filter. *No matches for
  the current filters* keeps the controls and shows an empty state that says
  plainly that the search covers metadata and not full text — the honest answer
  to "I searched for a phrase I know is in that post and got nothing".
- **Error**: a failed `GET /v1/articles/list` is handled by the route's error
  boundary. The page renders its error state rather than an index that silently
  looks like an empty archive.

## Accessibility Notes

- Every article is rendered into the server HTML and hidden with the `hidden`
  attribute rather than conditionally mounted. Filtering never removes content
  from the server-rendered payload, which preserves the SEO value REQ-1.1 exists
  to protect. `theme.css` forces `[hidden] { display: none !important }` because
  a display utility on the same element would otherwise beat the UA default.
- The result count is `role="status"`, so filtering announces "5 of 14 articles"
  rather than silently shortening the page.
- Topic chips are `aria-pressed` toggle buttons in a labelled group, so their
  state is announced. A chip with no available matches is genuinely `disabled`
  with a visible count of 0 — it leaves the tab order instead of presenting as a
  control that does nothing.
- Selected state is never colour alone: a pressed chip changes background *and*
  text colour *and* carries `aria-pressed="true"`.
- The sticky controls bar sits at `top-16`, exactly clearing the 64px header, so
  a focused chip is never scrolled underneath it.
- Dates use `<time datetime="…">` carrying the raw ISO value from the API, so
  the machine-readable date survives display formatting.
- Each row is a single `<a>` wrapping its whole content, so there is one tab stop
  per article and no nested interactive elements. The hover arrow also appears on
  `:focus-visible`, so keyboard users get the same affordance as pointer users.
- **Contrast, measured against `app.css` tokens on `hsl(220 7% 4%)`**: primary
  text 18.4:1, secondary 6.1:1, accent-text 6.2:1 — all comfortably past 4.5:1.
  Tertiary `hsl(220 5% 42%)` is **3.6:1 and fails AA for body text**. This
  design uses it for dates and tag labels at 12px. Dates are not duplicated
  anywhere else on the row, so this is a genuine finding, not a tolerable one —
  see *Blocking issue* below. It is inherited from `app.css` and is a
  design-system defect, not a defect of this page.

## Blocking issue

**Raise `--color-text-tertiary` before this page ships.** `hsl(220 5% 42%)`
measures 3.4:1 on `--color-surface` and 3.6:1 on the page background, under the
4.5:1 AA threshold for body text. About `hsl(220 5% 50%)` reaches 4.6:1 and
clears it.

It is a one-line change in `app.css` and affects the whole site, so it belongs
to the design system rather than to this page — but this page is where it first
has consequences, because a publication date rendered in tertiary text appears
nowhere else on the row. Implementing this design without the fix ships a date
column that fails AA.

## Trade-offs

- **Does well**: fastest to read and cheapest to build — one client component,
  two pieces of state, no layout that changes shape. Uses the site's existing
  section chrome verbatim, so the blog looks like the same site as the CV rather
  than a bolted-on section. Degrades gracefully: with JavaScript disabled the
  full archive is still present, ordered, and readable, and only the filtering
  is lost.
- **Accepted costs**: it looks like what it is, a list — the least visually
  distinctive of the three options considered. There is no way to see the shape
  of the archive (how much is about Postgres? what did I write in 2025?) without
  filtering and reading the count. A single column leaves the right half of a
  wide viewport empty.
- **Scale note**: comfortable to roughly 40 articles. Past that, the topic chip
  row outgrows its "+n more" affordance and the flat list starts wanting the
  year grouping this design does not have. Treat 40 as the review threshold, not
  a hard limit: the fix is additive (group rows under sticky year headings) and
  does not disturb anything else here.
- **Risk to watch**: search quality is description quality. The search covers
  titles, descriptions, topics, and author — the whole metadata payload — so an
  article with a thin description is hard to find by anything but its title.
  Treat the description as a search surface when writing it, not just as a
  subtitle.
