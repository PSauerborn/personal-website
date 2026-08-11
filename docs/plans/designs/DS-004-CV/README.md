# DS-004-CV — CV display design

The accepted design for the homepage CV section defined in
`docs/specs/SPEC-004.md` § 4.2 (REQ-2.1): headline skills first, then a timeline
of experience entries, then education entries.

**Skill-Filtered Explorer** — headline skills double as filter controls over a
master/detail role browser. Selected from a set of three options on 2026-08-11;
the two rejected options have been removed.

Built on `docs/specs/external-docs/stylesheets/app.css` with shadcn/ui and
Tailwind v4 per REQ-1.2, consuming the `GET /v1/cv` response schema from
SPEC-002 § 6.1.3 unchanged.

## Referencing this design from a spec

Add to the spec's *External Resources* table:

| Filepath | Description | When to use |
|----------|-------------|-------------|
| `docs/plans/designs/DS-004-CV/DS-004-CV.md` | Accepted design for the homepage CV section | Use when implementing or reviewing the CV display |

Cite specific requirements as `DS-004-CV § <section>` — for example
*DS-004-CV § Interaction & States* for the selection-follows-filter rule, or
*DS-004-CV § Accessibility Notes* for the server-rendering constraint.

## Files

| File | Role | Purpose |
| ---- | ---- | ------- |
| `DS-004-CV.md` | **spec reference** | The design document: concept, layout, components, states, accessibility, trade-offs |
| `DS-004-CV-mockup.html` | review | Self-contained static mockup — open directly in a browser |
| `cv-section-explorer.tsx` | production | Implementation — real shadcn/ui + Tailwind component code |
| `theme.css` | production | Tailwind v4 + shadcn/ui theme bridge onto `app.css` tokens |
| `cv-data.ts` | production | Types mirroring the `GET /v1/cv` schema, date helpers, sample data |
| `mockup.css` | review | Mockup-only build entry; plain-CSS stand-ins for shadcn components |
| `mockup-build.css` | generated | Compiled bundle, inlined into the mockup by `build.sh` |
| `build.sh` | review | Compiles the Tailwind bundle and inlines it into the mockup |

`theme.css` and `cv-data.ts` are design-independent — they would have carried
over from any of the three options and are reusable across the rest of SPEC-004.

## The theme bridge

`theme.css` is the piece that makes unmodified shadcn/ui components inherit the
Linear look. It maps `app.css` custom properties onto the variable names shadcn
expects:

```css
--background: var(--color-bg);        /* hsl(220 7% 4%)  */
--card:       var(--color-surface);   /* hsl(220 6% 7%)  */
--primary:    var(--color-accent);    /* hsl(234 56% 60%) — Linear indigo */
--border:     var(--color-border);    /* hsla(0 0% 100% / 0.08) hairline */
--ring:       var(--color-accent-text);
```

`app.css` stays the single source of truth — no colour is ever hardcoded in
`theme.css`. It also adds five utilities Tailwind has no equivalent for
(`hairline`, `gradient-text`, `accent-glow`, `label-caps`, `raised`) and forces
`[hidden] { display: none !important }`, which this design depends on — see
`DS-004-CV.md` § Accessibility Notes.

## Implementation checklist

1. Copy `cv-data.ts` to `lib/cv-data.ts` and replace `sampleCV` with the
   server-side fetch of `GET /v1/cv`.
2. Copy `theme.css` to `app/globals.css`, fixing the `@import` path to
   `app.scss`/`app.css`, and add `@source` directives for the app's source tree.
3. Install the shadcn components: `npx shadcn@latest add toggle tabs badge button`.
4. Copy `cv-section-explorer.tsx` to `components/cv/`, splitting the
   sub-components into their own files if preferred.
5. Delete `mockup.css`, `mockup-build.css`, and `build.sh` from the app tree —
   they are review scaffolding and must not ship.

## Rebuilding the mockup

Requires the [Tailwind v4 standalone CLI](https://github.com/tailwindlabs/tailwindcss/releases)
(no Node needed) and optionally Dart Sass to recompile `app.scss` first:

```bash
./build.sh                          # if tailwindcss is on PATH
./build.sh /path/to/tailwindcss     # otherwise
```

The script strips previously inlined CSS before scanning, so it is idempotent —
running it twice produces a byte-identical file.

## Notes on the mockup

The static mockup substitutes plain HTML and CSS for the interactive shadcn
components: `aria-pressed` buttons for `Toggle`, and a small vanilla-JS state
machine for `Tabs` and master/detail selection. It matches visually and
behaviourally, but the production DOM and ARIA wiring come from Radix — assess
layout and hierarchy from the mockup, not accessibility implementation.

Sample content is placeholder data, not the real CV.
