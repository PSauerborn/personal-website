# DES-001 "Broadsheet" — Frontend Design Review Remediations

**Date:** 2026-08-14
**Scope:** `web/` — all routes, `app/globals.css`, `styles/app.css`, every component under `web/components`.
**Method:** review against the `frontend-design` skill rubric (hierarchy, spacing, typography, colour, depth, finishing) and against the token contract `app/globals.css` declares for itself.

## Summary

The token system is unusually disciplined: one declaration site, no literal colours in components, three text colours, two weights, a documented elevation scale, and `EmptyState` wired into every list view (blog, projects, agents, specs, comments, CV). The findings below are not "the design is wrong" — they are places where the implementation contradicts its own stated contract, or where the narrow viewport and contrast floor were not carried through.

Findings are ordered by severity. Each is independently actionable.

---

## MAJOR-1 — The numeric Tailwind spacing scale is **not** the design's spacing scale

**Files:** `app/globals.css:112-127`, and ~18 call sites across `components/` and `app/`.

`globals.css` declares a non-linear scale and then asserts the two are the same thing:

```css
--spacing: 0.25rem;
--space-5: 24px;
/* "…keeps the numeric Tailwind utilities on the same 4px grid, so `p-5` is
    step 5 (24px) and `var(--space-5)` is the same value." */
```

This claim is false. With `--spacing: 0.25rem`, Tailwind computes `p-5` as `calc(0.25rem * 5)` = **20px**, not 24px. The numeric utilities are a *linear* 4px ramp; `--space-*` is a *non-linear* scale. They coincide only at 4, 8, 12, 16, 32, 48, 64, 96 and 128 — and diverge at every step past index 4.

Consequence: every numeric utility whose index is not on the non-linear scale emits an off-scale value, and the codebase does this in two places systematically:

| Utility | Emits | On the declared scale? | Occurrences |
| --- | --- | --- | --- |
| `gap-5`, `py-5`, `p-5`, `px-5` | 20px | No (scale jumps 16 → 24) | 12 |
| `mt-10` | 40px | No (scale jumps 32 → 48) | 6 |

Representative sites: `components/ui/card.tsx:21` (`p-5`), `components/agents/agent-workflow.tsx:264` (`gap-5 … py-5`), `components/home/agentic-summary.tsx:75` (same), `components/home/cv-section-explorer.tsx:124`, `components/agents/agent-workflow.tsx:253,260`, `app/blog/page.tsx:63`, `app/projects/page.tsx:59`, `app/agents/page.tsx:150,162`.

This is the rubric's first checklist item ("no one-off values") failing silently, at scale, *because* the documentation says it cannot.

**Remediation — pick one and apply it everywhere:**

- **(a) Preferred.** Delete `--spacing` and define the numeric utilities to match the real scale, e.g. `--spacing-5: 24px`, `--spacing-7: 48px`, `--spacing-9: 96px`, so `p-5` genuinely is `--space-5`. Then the two idioms currently in the codebase (`mt-6` vs `mt-(--space-5)`) are interchangeable and the file comment becomes true.
- **(b)** Keep `--spacing` and forbid numeric spacing utilities entirely — every margin, padding and gap reads `p-(--space-N)`. Mechanical, but consistent.

Either way, correct the comment at `globals.css:112-118`, and add a lint rule (or a `stylelint`/ESLint class-name check) so an off-scale index cannot be reintroduced.

---

## MAJOR-2 — Primary button text fails WCAG AA (4.30:1)

**Files:** `app/globals.css:56` (`--color-accent`), `components/ui/button.tsx:28`, `components/layout/site-header.tsx` (Wordmark monogram).

Measured contrast of `--color-text-primary` `hsl(220 27% 97%)` on `--color-accent` `hsl(234 56% 60%)` is **4.30:1**. The button's default size renders 14px `font-medium` text, which needs 4.5:1. It fails. The `lg` size (16px) fails too — 16px regular is not "large text" under WCAG (that threshold is 18.66px bold / 24px regular).

The same pair appears in the wordmark monogram badge (`bg-accent` + inherited `text-text-primary` at `text-xs`), which is worse: 12px at 4.30:1.

`--color-accent` is the only token in the palette that does not clear its own contrast floor:

| Token | on `--color-bg` | on `--color-surface` | on `--color-surface-active` |
| --- | --- | --- | --- |
| `text-primary` | 18.42 | 17.50 | 15.06 |
| `text-secondary` | 6.13 | 5.82 | 5.01 |
| `text-tertiary` | 4.82 | 4.58 | **3.94** |
| `accent` (as bg) | 4.29 | 4.07 | 3.50 |
| `accent-text` | 6.24 | 5.93 | 5.10 |

**Remediation:** darken `--color-accent` to roughly `hsl(234 56% 50%)` (≈5.9:1 against `text-primary`), and step `--color-accent-hover` / `-active` / `-deep` down with it to preserve the ramp. The skill's own advice — prefer flipping the contrast on colour backgrounds over white-on-mid-shade — also applies: an alternative is a tinted button (`bg-accent-tint` + `text-accent-bright`, measured 9.18:1) with the solid fill reserved for the single page-level primary action.

---

## MAJOR-3 — No narrow-viewport navigation

**File:** `components/layout/site-header.tsx:139-186`.

The header renders all four navigation entries plus a divider plus *Get in touch* inline, at every width, inside a fixed 64px bar. Measured at the design's own type sizes that row needs roughly 520px including gutters and the monogram — it does not fit the ~400px viewport the rubric says to design first. The only concession is hiding the wordmark's name below `sm`, which is a symptom, not a fix.

There is no responsive treatment anywhere else either: a repo-wide search for responsive type utilities (`sm:text-*`, `md:text-*`) returns exactly one hit, and it is `sm:text-right` — an alignment, not a size.

**Remediation:** collapse the nav below `sm` into a disclosure (a `<details>`-based menu keeps the header a Server Component and ships no JavaScript, matching the component's stated constraint), or a single-row scrollable strip with *Get in touch* promoted to the footer/masthead only. Verify at 375px and 400px.

---

## MAJOR-4 — Masthead and article headings do not step down on narrow viewports

**Files:** `components/home/personal-details-header.tsx:150-155`, `components/blog/article-header.tsx:43`, `components/ui/section-heading.tsx:60`.

`--text-5xl` is 56px and `--text-4xl` is 40px, both applied unconditionally. At 400px the 56px masthead is roughly 7 characters per line; a two-word name survives, a longer headline in the same treatment would not. The 40px article title at `--measure-heading` (24ch) has the same exposure.

This is the same root cause as MAJOR-3 — the layout was composed wide-first.

**Remediation:** define the responsive step in the component, from the existing scale only: `text-4xl sm:text-5xl` for the masthead, `text-3xl sm:text-4xl` for the article header and `text-2xl sm:text-3xl` for `SectionHeading`. No new type sizes.

---

## MEDIUM-5 — `text-tertiary` on `surface-active` is 3.94:1

**Files:** `components/home/cv-section-explorer.tsx:409-436`.

The selected row of the CV explorer rail sets `bg-surface-active` (line 417) and renders its date range inside at `text-xs text-text-tertiary` (line 434) — **3.94:1**, below the 4.5:1 floor for 12px text. Selecting a row therefore *reduces* the legibility of its own metadata.

`globals.css:20-22` states tertiary was raised to 50% lightness for "~4.6:1, WCAG AA". That holds on `--color-bg` (4.82) and `--color-surface` (4.58) but not on `--color-surface-active`.

**Remediation:** promote the metadata to `text-text-secondary` when the row is selected (5.01:1), or use `--color-surface-hover` as the selected fill and reserve `surface-active` for pressed states. Then amend the `globals.css` note to say which surfaces the tertiary claim is verified against.

---

## MEDIUM-6 — Two different mechanisms draw the same hairline rule

**Files:** `components/agents/agent-catalogue.tsx:205`, `components/agents/spec-listing.tsx:73,137` vs. everywhere else.

Most ruled rows use `border-b border-border-subtle`. Three use an arbitrary shadow instead:

```
shadow-[inset_0_-1px_0_0_var(--color-border-subtle)] last:shadow-none
```

That value is not a token — it is a hand-written inset shadow that duplicates `--hairline*` in spirit but is not part of the elevation scale, and `last:shadow-none` silently discards any *other* shadow those elements might later carry. Two mechanisms for one visual will drift.

**Remediation:** either standardise on the border (simplest, matches the other seven components) or add a `--hairline-bottom` token to `globals.css` and use it in all ruled-list components. Do not leave both.

---

## MEDIUM-7 — Container widths hard-coded as raw numeric utilities

**Files:** `components/blog/comments-section.tsx:311` (`max-w-130`), `components/blog/blog-index.tsx:143` (`sm:max-w-105`).

`max-w-130` resolves to 520px, which is exactly `--container-form`. The token exists and is used correctly by `components/home/contact-form.tsx:308` (`max-w-(--container-form)`) — the comment composer just re-expresses it as a magic number. `max-w-105` (420px) corresponds to no token at all.

**Remediation:** replace `max-w-130` with `max-w-(--container-form)`. For `max-w-105`, either introduce a named token (`--container-filter`) or reuse an existing measure.

---

## MEDIUM-8 — The contact rail's dividers break when it wraps

**File:** `components/home/personal-details-header.tsx:158-180`.

The rail is `flex flex-wrap` with each cell carrying `mr-8 border-r pr-8 last:mr-0 last:border-r-0`. `:last-child` is the last cell in the *list*, not the last cell in each *rendered row*. Once the three entries wrap — which they do below roughly 640px, since the phone number and GitHub handle are long — the cell that ends the first row keeps its right border and its 32px right margin, leaving a divider hanging in empty space at the row's edge.

The `border-t` on the `<dl>` also has no closing rule, so the rail reads as an open-ended fragment rather than a bounded group.

**Remediation:** switch the rail to a grid (`grid gap-(--space-5) sm:grid-cols-3`) and draw the dividers with a left border on cells 2..n via `sm:border-l`, so wrapping cannot orphan one. Add the closing `border-b` if the group is meant to read as bounded.

---

## MINOR-9 — Long-form article body sits at the secondary text colour

**Files:** `components/blog/article-content.tsx:141`, `components/home/cv-section-explorer.tsx:189`.

Article prose renders as `text-base leading-prose text-text-secondary` — 6.13:1, comfortably AA, but it means the content a reader came for is never the most prominent text on the page. Headings, author name and inline `<strong>` are all `text-primary`; the article itself is not. The rubric's hierarchy rule is that primary content gets the primary colour and *supporting* material recedes.

This is a defensible dark-mode choice (97%-lightness body text over several screens is fatiguing), so it is filed as minor — but it should be a decision recorded in DES-001, not an accident of the default.

**Remediation:** either promote long-form body to `text-text-primary` and let the metadata carry the recession, or introduce a `--color-text-body` between primary and secondary (around 78% lightness) and document why prose gets its own step.

---

## MINOR-10 — `Card` is defined but unused

**File:** `components/ui/card.tsx`.

`Card`, `CardHeader` and `CardBody` are exported and unit-tested, but no route or component imports them — the design explicitly separates content with hairline rules "rather than solid borders or cards" (`globals.css:39-41`). The component is dead code that contradicts the stated design language, and it is the most likely thing a future contributor reaches for.

**Remediation:** delete it, or add a doc comment naming the one context it is sanctioned for. Note it is also the only component using `p-5` (20px), so MAJOR-1's count drops by one if it goes.

---

## Not findings

Recorded so they are not re-raised:

- **Border density.** The design is deliberately rule-based ("Broadsheet"); the rubric's "use fewer borders" is a default, and DES-001 overrides it. The rules are consistently `--color-border-subtle` at 1px and read as ledger lines, not as boxes.
- **Empty states.** Every list view has one — blog, projects, agent catalogue, spec listing, comments, and the CV explorer's filtered state. This is the checklist item most projects miss.
- **Font weights.** 400/500/600 only, nothing below 400, and the 600 weight is confined to the 12px all-caps labels as documented.
- **Focus treatment.** One `:focus-visible` rule in `styles/app.css:44-47` covers every interactive element; no component restates or removes it.
- **Reduced motion.** Handled globally at `styles/app.css:60-68`.

---

## Suggested order of work

1. MAJOR-2 and MEDIUM-5 — contrast; token-level, small diffs, unblocks any accessibility audit.
2. MAJOR-1 — spacing scale; mechanical but touches ~18 sites, so land it before other layout work rebases onto it.
3. MAJOR-3 and MAJOR-4 — narrow viewport; needs manual verification at 375/400px.
4. MEDIUM-6, -7, -8 and the two minors — consistency cleanup.
