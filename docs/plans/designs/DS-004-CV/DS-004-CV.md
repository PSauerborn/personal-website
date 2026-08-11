# DS-004-CV: CV Display — Skill-Filtered Explorer

- **Design Set**: DS-004-CV
- **Status**: Accepted — selected from a set of three options on 2026-08-11
- **Spec**: `docs/specs/SPEC-004.md` (§ 4.2 CV Display, REQ-2.1)
- **Mockup**: `docs/plans/designs/DS-004-CV/DS-004-CV-mockup.html`
- **Implementation**: `docs/plans/designs/DS-004-CV/cv-section-explorer.tsx`
- **Data contract**: `GET /v1/cv` — `docs/specs/SPEC-002.md` § 6.1.3
- **Theme bridge**: `docs/plans/designs/DS-004-CV/theme.css`

## Design Concept

Treats the CV as a small application rather than a document. Headline skills are
not just displayed — they are the filter control. Selecting *Kafka* narrows the
role list to the roles that used it and highlights it inside their stack. Roles
sit in a master list beside a sticky detail panel, and a tab switches the panel
between Experience and Education. It answers the question a technical visitor
actually arrives with: *where has this person used the thing I care about?*

Section ordering is headline skills → experience → education, as REQ-2.1
requires. The skills block is both the first element on the page and the control
surface for everything beneath it, so its primacy is functional rather than
merely positional.

## Layout

```text
┌─────────────────────────────────────────────────────────────────┐
│ CURRICULUM VITAE                                                │
│ Ten years building backend platforms                            │
│ Pick a skill to see only the roles where I used it.             │
│                                                                 │
│ HEADLINE SKILLS                                  [Clear filter] │
│ LANGUAGES      (Go) (Python) ⟨Rust⟩ ⟨TypeScript⟩ ⟨SQL⟩          │  ⟨…⟩ = display-only
│ INFRASTRUCTURE (Kubernetes) (Terraform) (AWS) (Docker)          │  (…) = filterable
│ DATA           (PostgreSQL) [KAFKA] (Redis) (ClickHouse)        │  […] = active
│ PRACTICES      ⟨Event-driven architecture⟩ ⟨Observability⟩      │
│                                                                 │
│ ┌ Experience │ Education ┐          2 of 4 roles used Kafka     │  tabs + count
│ ─────────────────────────────────────────────────────────────   │
│ ┌───────────────────┐  ┌────────────────────────────────────┐   │
│ │ Principal Backend●│  │ Feb 2023 — Present · 3y 6m Current │   │  sticky panel
│ │ Helix Systems     │  │ Principal Backend Engineer         │   │
│ │ Feb 2023—Present  │  │ Helix Systems                      │   │
│ ├───────────────────┤  │                                    │   │
│ │ Senior Platform   │  │ Lead engineer on the event         │   │
│ │ Northwind Data    │  │ platform processing several…       │   │
│ │ Jun 2020—Jan 2023 │  │                                    │   │
│ └───────────────────┘  │ STACK                              │   │
│   ↑ filtered list      │ [Go] [KAFKA] [Kubernetes] […]      │   │  match highlighted
│                        └────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

Master/detail is a `280px 1fr` grid from `lg` up — a fixed master column rather
than a fractional one, so only the detail panel flexes as the viewport widens.
The master list is `position: sticky` at `top-24` so it stays available while a
long description scrolls.

Below `lg` the grid collapses to one column: the role list sits above the detail
panel, and selecting a role swaps the panel below it. The skills grid stacks its
category label above the chips below `sm`.

### Hierarchy

Within the detail panel, `job_title` is the primary element (21px, weight 500,
primary text) and `organization` is demoted to 14px secondary. Dates lead the
panel but in 12px tertiary — they orient without competing. In the master list
the same fields drop a step each, so the selected role's detail always outranks
its list entry.

### Skills that cannot filter

Categories like *Practices* contain items that appear in no `tech_stack` array,
and SPEC-002 REQ-2.6 guarantees only that skills are grouped by category — not
that they intersect the stacks. Those chips render in a distinct display-only
state: transparent background, muted text, `disabled`, and an `aria-label`
explaining why. They are not dimmed with opacity, which would make them look
like a bug rather than a category.

## Component Inventory

| Component | Source | Notes |
| --------- | ------ | ----- |
| `Toggle` | reused — `@/components/ui/toggle` | One per skill; `pressed` drives `data-[state=on]`, restyled to the accent fill |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | reused — `@/components/ui/tabs` | Experience / Education switch; default pill styling replaced with the `app.css` nav-link treatment |
| `Badge` | reused — `@/components/ui/badge` | Stack tokens, with a highlighted variant when the token matches the active filter |
| `Button` | reused — `@/components/ui/button` | `variant="ghost"` clear-filter, `variant="secondary"` in the empty state |
| `CVSectionExplorer` | new — `components/cv/cv-section-explorer.tsx` | Owns `filter` and `selectedId` state |
| `SkillFilters` | new — same file | Skills grouped by category, each a `Toggle` |
| `RoleListItem` | new — same file | Master-list button; `aria-current` marks selection |
| `RoleDetail` | new — same file | Detail panel; takes `highlight` to emphasise the filtered skill |
| `EducationList` | new — same file | Two-up card grid under the Education tab |
| `.section`, `.empty-state` | reused — `app.css` | Section chrome and zero-data states |

shadcn components to install: `toggle`, `tabs`, `badge`, `button`. None require
modification — only their `className` is overridden.

## Interaction & States

- **Primary interactions**: (1) toggle a skill filter — re-toggling the active
  skill clears it; (2) select a role in the master list; (3) switch the
  Experience/Education tab.
- **Selection follows filtering**: applying a filter that excludes the open role
  moves selection to the first remaining match, so the detail panel is never
  showing a role the list no longer contains. Clearing the filter leaves the
  selection where it is.
- **Loading**: server-rendered with data in hand; filter state initialises to
  null so first paint shows the full list with the most recent role selected.
- **Empty**: three distinct zero-data states. No skills → empty state in place of
  the filter bar. No experience → empty state in place of the explorer. No
  *matches* for the active filter → a dedicated state naming the skill with a
  Clear filter button. The first two satisfy SPEC-002 REQ-2.5, where an empty CV
  is a `200` with empty collections rather than a `404`; the third is reachable
  only through interaction, never from an API response.
- **Error**: a failed CV fetch is handled by the route's error boundary; the
  section is omitted rather than rendered half-populated.

## Accessibility Notes

- Every experience and education entry is rendered into the server HTML and
  hidden with the `hidden` attribute rather than conditionally mounted.
  Filtering therefore never removes content from the server-rendered payload,
  which preserves the SEO value SPEC-004 REQ-1.1 exists to protect.
  `theme.css` forces `[hidden] { display: none !important }` because a display
  utility on the same element would otherwise beat the UA default.
- The match counter is `role="status"`, so filtering announces "2 of 4 roles used
  Kafka" to screen readers instead of silently reordering the page.
- Master-list selection uses `aria-current="true"` and is styled with a surface
  change plus a hairline ring, not colour alone. Current roles are marked with
  both a status dot carrying an `aria-label` and a text *Current* badge in the
  detail panel.
- Display-only skill chips are genuinely `disabled` with an explanatory
  `aria-label`, so they are skipped in the tab order rather than presenting as
  broken controls.
- Radix `Tabs` supplies arrow-key navigation and correct `aria-controls`
  wiring. Focus is not moved into the detail panel on selection — the panel is
  adjacent in DOM order, so the next Tab press reaches it naturally.
- The sticky master list is capped at `lg:top-24`, clearing the 64px sticky
  header so a focused list item is never scrolled under it.
- Dates use `<time datetime="…">` with the raw ISO value from the API, so the
  machine-readable date survives display formatting.
- Contrast: secondary text `hsl(219 6% 57%)` on `hsl(220 7% 4%)` is ~7.4:1;
  tertiary `hsl(220 5% 42%)` is ~4.0:1 and is therefore used only for 12px
  metadata that is duplicated elsewhere — never for content that exists nowhere
  else.

## Trade-offs

- **Does well**: lets a visitor interrogate the CV rather than read it, and
  demonstrates frontend capability on a page whose purpose is partly to
  demonstrate frontend capability. Handles a long career comfortably — the
  master list stays compact at any length. Closest in feel to Linear's product
  UI rather than its marketing site.
- **Accepted costs**: requires client state (`filter`, `selectedId`), three
  distinct empty states, and a selection-follows-filter rule that has to be got
  right — materially more machinery than a static timeline. Only one role's
  description is visible at a time, so there is no "read the whole career in one
  scroll" path. Prints badly; the *Download PDF* action in the header is the
  mitigation.
- **Risk to watch**: the filtering is only as good as the `tech_stack` data. If
  stacks are sparse or inconsistently named across roles, most chips render
  display-only and the central mechanic looks broken. Keep stack items
  consistent with the categorised skills in the database, and treat a low
  filterable-chip ratio as a data bug rather than a design one.
- **Scale note**: the payoff arrives at roughly eight or more roles. With four,
  the interaction risks reading as decoration.
