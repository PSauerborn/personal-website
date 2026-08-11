# DS-004-AGENTS — Agent catalogue design

The accepted design for the homepage agentic-development section defined in
`docs/specs/SPEC-004.md` § 4.3 (REQ-3.1 – REQ-3.4): the agentic workflow, the
subagent catalogue, and the specs used to build the site.

**Reference Dossier** — the section is presented as documentation rather than a
feature tour: a sticky sub-nav over four fully expanded blocks (Workflow, Agent
catalogue, Specs, CI), with every agent's purpose, inputs, and outputs visible
on first paint. Selected from a set of three options on 2026-08-11; the two
rejected options have been removed.

Built on `docs/specs/external-docs/stylesheets/app.css` with shadcn/ui and
Tailwind v4 per REQ-1.2, consuming `GET /v1/agents/list` and
`GET /v1/agents/specs/list` (SPEC-002 § 6.1.4 – § 6.1.5) unchanged.

## Referencing this design from a spec

Add to the spec's *External Resources* table:

| Filepath | Description | When to use |
|----------|-------------|-------------|
| `docs/plans/designs/DS-004-AGENTS/DS-004-AGENTS.md` | Accepted design for the homepage agent catalogue section | Use when implementing or reviewing the agentic development section |

And to SPEC-004 § 4.3, alongside REQ-3.1:

> **REQ-3.5**: `docs/plans/designs/DS-004-AGENTS/` contains the accepted design
> that must be followed when building the agent catalogue.

Cite specific requirements as `DS-004-AGENTS § <section>` — for example
*DS-004-AGENTS § Data Contract Notes* for the acceptance-criteria sourcing
decision, *DS-004-AGENTS § Interaction & States* for the empty-state rules, or
*DS-004-AGENTS § Accessibility Notes* for the anchor-offset and table
requirements.

## Requirement coverage

| Requirement | Where it is satisfied |
| ----------- | --------------------- |
| REQ-3.1 — workflow, catalogue, and specs in one section | The four stacked blocks |
| REQ-3.2 — graphical representation of the full workflow | Workflow block: a numbered nine-stage rail with gate markers |
| REQ-3.3 — full agent list with purpose, inputs, outputs | Agent catalogue block: one spec-sheet row per agent, always visible |
| REQ-3.3 — specs with acceptance criteria | Specs block: ledger with a nested criteria table per spec |
| REQ-3.4 — GitHub link to the agents repository | Section header and page footer |

## Files

| File | Role | Purpose |
| ---- | ---- | ------- |
| `DS-004-AGENTS.md` | **spec reference** | The design document: concept, layout, components, states, data-contract notes, accessibility, trade-offs |
| `DS-004-AGENTS-mockup.html` | review | Self-contained static mockup — open directly in a browser |
| `agents-data.js` | review | Content: the nine stages, the thirteen agents, the four specs, the CI workflows |
| `mockup.css` | review | Mockup-only stylesheet; plain-CSS stand-ins for the shadcn components |
| `build.sh` | review | Inlines `app.css` + `mockup.css` and `agents-data.js` into the mockup |

Nothing in this directory ships. The production section is built from shadcn/ui
components and Tailwind utilities as listed in *DS-004-AGENTS.md § Component
Inventory*; the mockup uses plain component classes only so it needs no build
step to open. Mockup class names are prefixed `dossier-` and `ag-`, and the
design document cites them only where a class carries a design decision.

## The theme bridge

The shadcn/ui ↔ `app.css` token bridge already exists at
`docs/plans/designs/DS-004-CV/theme.css` and is design-independent — it is
reused unchanged and is deliberately not duplicated here. It maps `app.css`
custom properties onto the variable names shadcn expects (`--background`,
`--card`, `--primary`, `--border`, `--ring`) and adds the utilities Tailwind has
no equivalent for (`hairline`, `gradient-text`, `accent-glow`, `label-caps`,
`raised`).

## Implementation checklist

1. Resolve the two items in *DS-004-AGENTS.md § Data Contract Notes* — how
   acceptance criteria reach the page, and which spec-content endpoint path is
   correct. The first determines the server-side fetch for the Specs block.
2. Copy `theme.css` from `DS-004-CV/` to `app/globals.css` if the CV section has
   not already landed it, fixing the `@import` path and adding `@source`
   directives for the app's source tree.
3. Install the shadcn components: `npx shadcn@latest add collapsible badge table separator button`.
4. Build the section as `components/agents/agent-dossier.tsx` with the
   sub-components named in the Component Inventory, typing the API responses
   against SPEC-002 § 6.1.4 – § 6.1.5.
5. Port the workflow and CI content from `agents-data.js`. The nine stages and
   the five CI workflows are static site content, not API data — only the agent
   catalogue and the spec ledger come from the API.
6. Do not copy `mockup.css`, `agents-data.js`, or `build.sh` into the app tree —
   they are review scaffolding.

## Content accuracy

`agents-data.js` is not placeholder copy. The stages mirror the `implement-spec`
orchestration procedure, the thirteen agents mirror the agent definitions in
[PSauerborn/agents](https://github.com/PSauerborn/agents), and the specs and
criteria counts mirror `docs/specs/` and the scenario tags in
`acceptance/features/` as of 2026-08-11 — 36 scenarios tagged `@spec-002`, 28
tagged `@spec-003`, and none yet for SPEC-001 or SPEC-004. Those two zero-count
specs are deliberately left in: they exercise the empty-criteria state the
design has to handle on day one.

## Notes on the mockup

The strip at the top of the file is review scaffolding and is not part of the
design. The mockup builds its DOM from `agents-data.js` at load, so it needs
JavaScript enabled to render even though the production section does not — the
markup it produces is what the server emits. Assess layout, hierarchy, and
density from the mockup; the ARIA wiring in production comes from Radix.

## Rebuilding the mockup

```bash
./build.sh
```

No Tailwind CLI is needed. Dart Sass is used to recompile `app.scss` first when
it is on `PATH`; otherwise the committed `app.css` is used as-is. The script
strips previously inlined blocks before re-inlining, so it is idempotent —
running it twice produces a byte-identical file.
