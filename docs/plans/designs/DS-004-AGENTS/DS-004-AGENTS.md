# DS-004-AGENTS: Agent Catalogue — Reference Dossier

- **Design Set**: DS-004-AGENTS
- **Status**: Accepted — selected from a set of three options on 2026-08-11
- **Spec**: `docs/specs/SPEC-004.md` (§ 4.3 Agent Catalogue, REQ-3.1 – REQ-3.4)
- **Mockup**: `docs/plans/designs/DS-004-AGENTS/DS-004-AGENTS-mockup.html`
- **Data contracts**: `GET /v1/agents/list` (SPEC-002 § 6.1.4), `GET /v1/agents/specs/list` (§ 6.1.5)
- **Theme bridge**: `docs/plans/designs/DS-004-CV/theme.css` (reused unchanged)

## Design Concept

Treat the section as documentation, not as a feature tour. A sticky sub-nav
sits under the site header and the content runs in four stacked blocks —
Workflow, Agent catalogue, Specs, CI — each fully expanded, nothing behind a
click. The workflow is a numbered vertical rail; the catalogue is one
spec-sheet row per agent with its inputs and outputs set out beside its purpose;
the specs are a ledger table.

The argument is that a reader evaluating an engineer's process wants to *read*
it, not operate it, and that a section entirely present on first paint is the
most honest demonstration of a server-rendered site. Everything the section
claims is in the initial HTML payload: it survives being printed, piped into a
reader mode, or read with JavaScript disabled.

## Layout

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ AGENTIC DEVELOPMENT                                                     │
│ The pipeline that built this site, documented in full                   │
│ A spec goes in; an orchestrator delegates each stage…  [ View the repo ] │
├─────────────────────────────────────────────────────────────────────────┤
│ Workflow 9 │ Agent catalogue 13 │ Specs 4 │ CI      ← sticky sub-nav    │
├─────────────────────────────────────────────────────────────────────────┤
│ WORKFLOW                                                                │
│  (01)─ Spec review                            ⏸ Stops for approval      │
│   │    The spec is reviewed for ambiguity, missing edge cases…          │
│   │    RUNS [orchestrator]   PRODUCES [Review findings]                 │
│  (02)─ Requirements analysis                                            │
│   │    Task type, scale, affected files and UI impact are assessed…     │
│   │    RUNS [requirements-analyzer]   PRODUCES [Scale assessment]       │
│  (03)─ Frontend design gate                   ○ Conditional             │
│   ⋮                                                                     │
│  (09)─ Documentation                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│ AGENT CATALOGUE                                                         │
│ ───────────────────────────────────────────────────────────────────────  │
│ code-reviewer      │ The peer review. Reads the │ INPUTS               │
│ Review &           │ changeset diff the way a   │  workPlanId    req   │
│ remediation        │ senior engineer reads a    │  manifestPath  req   │
│ [Review] [inherit] │ pull request…              │  specPath      req   │
│ [effort: medium]   │ TOOLS Read, Grep, Glob…    │ OUTPUTS              │
│                    │                            │  findings[]          │
│                    │                            │  remediationTask     │
│ ───────────────────────────────────────────────────────────────────────  │
│ security-reviewer  │ …                          │ …                    │
├─────────────────────────────────────────────────────────────────────────┤
│ SPECS                                                                   │
│ SPEC   │ DATE       │ SCOPE                      │ DOCUMENTS            │
│ SPEC-002│ 2026-08-01│ The public read API…       │ [SPEC-002.md SPEC]   │
│ API     │           │ ▸ 36 acceptance criteria   │ [cv.feature ACC]     │
│         │           │   AC-24 REQ-5.2 A request… │                      │
│ SPEC-003│ 2026-08-01│ API-key authenticated…     │ [SPEC-003.md SPEC]   │
├─────────────────────────────────────────────────────────────────────────┤
│ CONTINUOUS INTEGRATION                                                  │
│ pre-merge.yaml          │ Lint, unit tests, and secret scan on every PR │
│ integration-tests.yaml  │ Godog acceptance suite against live Postgres  │
└─────────────────────────────────────────────────────────────────────────┘
```

The agent row is a `240px 1fr 300px` grid from `lg`: a fixed identity column, a
flexible purpose column, and a fixed inputs/outputs column. Below `lg` the three
stack in that order, so the name always precedes the prose that explains it.
Between `sm` and `lg` the inputs and outputs sit side by side, which keeps the
stacked row from running long.

The workflow rail is a two-column grid — a 32px numbered token and the step body
— with a hairline drawn behind the tokens by an absolutely positioned
pseudo-element, suppressed on the last step so the line terminates cleanly.

### Hierarchy

Rows are separated by hairlines rather than card surfaces. With thirteen agents,
thirteen raised cards would read as thirteen competing objects; hairline-
separated rows read as one document. Depth is therefore spent almost entirely on
the sticky sub-nav (glass, blur, hairline bottom edge), which is the only
element that needs to float above the rest.

Within a row: agent name 15px mono weight 500 primary, purpose 14px secondary,
tools 12px tertiary, parameter names 12px mono secondary with the descriptions
in tertiary. Four steps of hierarchy inside one row, achieved with size and
colour only — no rules, no boxes.

## Component Inventory

| Component | Source | Notes |
| --------- | ------ | ----- |
| `Collapsible` | reused — `@/components/ui/collapsible` | Per-spec acceptance-criteria table; the only interactive element in the section |
| `Badge` | reused — `@/components/ui/badge` | Role, model, and effort chips; document-type chips; required/optional flags |
| `Table`, `TableHeader`, `TableRow`, `TableCell` | reused — `@/components/ui/table` | Spec ledger and the CI table |
| `Separator` | reused — `@/components/ui/separator` | Row rules in the catalogue |
| `Button` | reused — `@/components/ui/button` | `variant="secondary"` repo link (REQ-3.4) |
| `AgentDossier` | new — `components/agents/agent-dossier.tsx` | Section shell: sub-nav plus the four blocks |
| `WorkflowRail` | new — same directory | Numbered stage rail with gate markers |
| `AgentRow` | new — same directory | One agent: identity, purpose, inputs/outputs |
| `SpecLedger` | new — same directory | Spec table with the nested criteria table |
| `.section`, `.card`, `.btn`, `.tag`, `.empty-state` | reused — `app.css` | Section chrome, buttons, chips, zero-data states |
| `theme.css` | reused — `docs/plans/designs/DS-004-CV/theme.css` | The shadcn/ui ↔ `app.css` token bridge; unchanged |

shadcn components to install: `collapsible`, `badge`, `table`, `separator`,
`button`. None require modification.

## Interaction & States

- **Primary interactions**: (1) jump to a block from the sticky sub-nav; (2)
  expand a spec's acceptance criteria; (3) follow an agent chip in the workflow
  rail to that agent's row in the catalogue (an in-page anchor). Everything else
  is already on screen.
- **Loading**: none — both endpoints are fetched server-side.
- **Empty**: an empty `agents` array replaces the catalogue block with an empty
  state and drops its sub-nav entry; the workflow rail is static content and
  still renders. An empty `specs` array does the same for the spec block. A spec
  with no acceptance criteria shows a one-line note in place of the disclosure —
  the current state of SPEC-001 and SPEC-004.
- **Error**: handled by the route's error boundary, per block. A failed spec
  fetch removes the spec block only.

## Accessibility Notes

- The section works with JavaScript disabled apart from the criteria
  disclosures, which are native `<details>` in the mockup and `Collapsible` in
  production. Nothing is hidden behind a state machine.
- The sub-nav is a `<nav>` with an `aria-label`; its links are in-page anchors,
  so browser history and back/forward behave normally — a scroll-spy that
  rewrote the URL would not.
- Each block carries `scroll-margin-top: 128px` (`.dossier-block` in the
  mockup), clearing both the 64px site header and the sticky sub-nav so an
  anchored heading is never hidden beneath them.
- The spec ledger is a real `<table>` with `<th scope="col">`, and the nested
  criteria tables are tables too — the acceptance-criteria data is genuinely
  tabular (ID, requirement, scenario) and reads correctly in a screen reader's
  table mode. Both scroll inside an `overflow-x: auto` wrapper so the page body
  never scrolls sideways.
- Required and optional parameters are marked with the words *req* and *opt* in
  green and grey; the colour is redundant with the text.
- Contrast: purposes use secondary text (~7:1 on the canvas); tertiary (~4:1) is
  limited to 12px metadata — tool lists, stage names, dates — that is either
  duplicated or non-essential.
- The mockup renders its DOM from an inline data literal (`agents-data.js`) so
  the file stays reviewable; production renders the same markup on the server.

## Data Contract Notes

Two contract issues surfaced while designing against SPEC-002. Both must be
resolved before or during implementation — neither changes the design.

1. **Acceptance criteria are not in the spec-list response.** REQ-3.3 requires
   the spec list to include acceptance criteria, but `GET /v1/agents/specs/list`
   (SPEC-002 § 6.1.5) returns metadata and a `documents[]` array only. The
   criteria live inside the linked `ACCEPTANCE` document, served as raw bytes by
   `GET /v1/agents/specs/:id/:document_id`. This design assumes the page fetches
   that document server-side and derives the count and rows from it; the
   alternative is adding a criteria field to SPEC-002. Whichever is chosen, the
   ledger's *N acceptance criteria* disclosure is the surface it feeds.
2. **SPEC-002 names the spec-content endpoint twice, differently.** REQ-5.1
   lists `GET /v1/agents/specs/:id`; REQ-5.5 and § 6.1.6 use
   `GET /v1/agents/specs/:id/:document_id`. This design assumes the two-segment
   form — the one with a response schema and acceptance criteria behind it.

## Trade-offs

- **Does well**: the most complete answer to REQ-3.3 — every agent's purpose,
  inputs, and outputs are visible at once, comparable by scanning down a column.
  All content sits in the initial payload with no interactive chrome, which is
  the strongest available SEO surface for REQ-1.1 and gives correct print and
  reader-mode behaviour. Low implementation risk: one disclosure component and
  no client state.
- **Accepted costs**: it is long. Thirteen agent rows plus nine workflow steps
  plus a spec ledger is a lot of scrolling on a homepage, and the sub-nav is a
  mitigation rather than a fix. It is also the quietest way to present the
  section on a page that is partly a portfolio piece — a deliberate contrast
  with the interactive CV explorer above it (`DS-004-CV`), not an oversight.
- **Risk to watch**: density has a floor. If agent purposes are edited to run
  longer than roughly forty words, rows lose their scannability and the design
  degrades into a wall of prose. Treat the purpose length as a content
  constraint, not a free field.
- **Scale note**: the row layout holds to roughly twenty agents. Past that, the
  catalogue block needs grouping by stage — the data already carries `stageName`
  for exactly this — rather than a longer flat list.
