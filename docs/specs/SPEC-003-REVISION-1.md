# SPEC-003-rv.1: UI Improvements

**Spec ID**: SPEC-003-rv.1

**Spec Date**: 2026-08-14

## 1. Spec Statement

As a site owner I want the homepage to open on a single full-height introduction, the subagent catalogue to be navigable one agent at a time, spec identifiers to stay inside their column, and blog code blocks to be syntax highlighted, so that a visitor arriving at the site meets a composed first screen and can read technical content without fighting the layout.

## 2. Context and Background

SPEC-003 delivered the site and its five routes. Reviewing the shipped result surfaced three defects and refinements that the original spec did not anticipate. This revision records them.

- **The homepage has no fold.** The personal details header renders at its natural content height, so the CV explorer intrudes on the first screen. The landing route reads as a stack of sections rather than an introduction followed by depth.
- **The subagent catalogue does not scale.** SPEC-003 REQ-3.3 asked for a full list of subagents rendered simultaneously. At thirteen agents, each with a description and an inputs/outputs schema, the agents page is dominated by a single section that a visitor must scroll past rather than read.
- **Spec identifiers overrun their column.** The spec ledger lays each entry out as a fixed identifier column beside a flexible content column. Identifiers are 32-character UUIDs with no break opportunities, so they run out of the mono column and collide with the spec name and description.
- **Blog code blocks are unreadable as code.** Fenced blocks render as undifferentiated mono text on a tinted surface, with no token colouring, which is a poor showing on a site whose articles are largely technical.

This revision amends SPEC-003 rather than replacing it. Every SPEC-003 requirement remains in force except where § 6.4 records a supersession.

## 3. Scope Definitions

### 3.1 In Scope

- Hero section update on the homepage
- Update of the agent catalogue to single-subagent display with a dropdown selector
- Overflow fix for spec identifiers in the spec ledger
- Syntax highlighting for fenced code blocks on the blog post page

### 3.2 Out of Scope

- Update of API
- Update of data model or schema
- Any change to the set of subagents, specs, or articles the API returns
- Deep-linking or URL reflection of the selected subagent
- Dark mode for the site as a whole
- Line numbers and copy-to-clipboard affordances on code blocks

## 4. Requirements

### 4.1 Hero Section

The "hero section" is the existing `PersonalDetailsHeader` (`web/components/home/personal-details-header.tsx`), rendered first on `/` by `web/app/page.tsx`. No new component is introduced.

- **REQ-RV1-1.1**: The hero section must occupy the full viewport height minus the height of the site header declared in `app/layout.tsx`.
  - The height must be expressed in `dvh`, not `vh`, so that mobile browser chrome is accounted for.
  - Every subsequent homepage section — the CV section explorer, the agentic summary, and the contact form — must begin below the fold on initial load.
  - On viewports too short to fit the hero's content, the section must grow past that height and scroll with the page; it must not clip its content and must not scroll its content internally.

### 4.2 Agent Catalogue

- **REQ-RV1-2.1**: The agents page must render exactly one subagent's detail at a time, selected via a dropdown control that lists every available subagent.
  - The markup for every subagent must remain in the server-rendered HTML; non-selected subagents must be hidden client-side and must never be omitted from the initial response. SPEC-003 REQ-1.5 requires the catalogue to reach crawlers fully populated, and this revision does not relax that.
  - The catalogue must still cover every subagent the API returns, and must still display each one's name, description, and inputs and outputs.
  - The existing "None declared" treatment must be retained for a subagent that declares neither inputs nor outputs.
  - The default selection must be the first subagent in the order the API returned.
  - The dropdown control must be programmatically labelled and must be fully operable by keyboard alone. The element choice — a native `<select>` or a custom listbox — is left to implementation.
  - The existing empty state must be preserved when the API returns no subagents.
- **REQ-RV1-2.2**: In the spec ledger (`web/components/agents/spec-listing.tsx`), a spec's identifier must wrap within its own grid column so that it never extends past that column's edge, at every breakpoint.
  - The full identifier must remain visible and selectable. Truncation, ellipsis, and hiding the identifier are not acceptable treatments.

### 4.3 Blog Post Page

- **REQ-RV1-3.1**: Fenced code blocks rendered on `/blog/[article_id]` must be syntax highlighted using a github-dark theme.
  - Highlighting must be performed by `rehype-highlight` (highlight.js).
  - Highlighting must run on the server. `ArticleContent` is and must remain a Server Component (SPEC-003 REQ-1.5, REQ-1.6); no part of highlighting may be deferred to the browser.
  - The rehype plugin order must place sanitisation such that the highlighter's output survives it while untrusted markup is still stripped.
  - Scope is fenced blocks only. Inline code must keep its current accent-tint styling.
  - A fence with no language tag, or with an unrecognised language tag, must render as an unhighlighted code block, without an error and without failing the build.
  - The `<pre>` chrome surrounding a highlighted block must be adapted so that a dark block on the site's light page reads as intentional.
  - Text and background within a highlighted block must meet WCAG AA contrast.

### 4.4 Package Management

- **REQ-4.1**: The web applications must be migrated to use `yarn` instead of `npm`.

## 5. Acceptance Criteria

Acceptance criteria live in `acceptance/features/`, organized by capability rather than by spec. Scenarios verifying this revision are tagged `@spec-003-rv1` and can be run in isolation using `godog --tags='@spec-003-rv1'`.

Feature files are cross-cutting by design — feature files contain scenarios tagged with other spec IDs. A scenario may carry both `@spec-003` and `@spec-003-rv1`. The tag, not the file, is the unit of ownership. Only scenarios tagged with `@spec-003-rv1` should be considered included as acceptance criteria for this revision.

The following table maps scenarios to requirements.

| Criterion ID | Requirement ID | Scenario (tagged `@spec-003-rv1`) |
| ------------ | -------------- | --------------------------------- |
| AC-1 | REQ-RV1-1.1 | The homepage hero fills the viewport beneath the site header |
| AC-2 | REQ-RV1-1.1 | The homepage sections below the hero start below the fold |
| AC-3 | REQ-RV1-1.1 | The homepage hero grows rather than clips on a short viewport |
| AC-4 | REQ-RV1-2.1 | The agents page displays one subagent at a time, selected from a dropdown |
| AC-5 | REQ-RV1-2.1 | The agents page server response carries the markup for every subagent |
| AC-6 | REQ-RV1-2.1 | The subagent dropdown is labelled and operable from the keyboard |
| AC-7 | REQ-RV1-2.1 | The agents page displays the catalogue empty state when no subagents exist |
| AC-8 | REQ-RV1-2.2 | A spec identifier wraps inside its own column in the spec ledger |
| AC-9 | REQ-RV1-3.1 | A fenced code block on a blog post is syntax highlighted |
| AC-10 | REQ-RV1-3.1 | A fenced code block with no language tag renders unhighlighted |
| AC-11 | REQ-RV1-3.1 | A fenced code block with an unrecognised language tag renders unhighlighted |
| AC-12 | REQ-RV1-3.1 | Executable markup in an article with code blocks is still not rendered |
| AC-13 | REQ-RV1-3.1 | Inline code on a blog post keeps its accent styling |

> **Note — these scenarios do not exist yet.** None of the scenarios named in the table above are present in `acceptance/features/`. They must be authored by the spec owner, tagged `@spec-003-rv1`, before the acceptance-validation stage can pass. Implementing agents must not author or edit them.
>
> In addition, the existing `@spec-003` scenario *The agents page displays the subagent catalogue* (`acceptance/features/agent_catalogue.feature:213`) asserts **"the catalogue section lists every subagent"**. REQ-RV1-2.1 makes that assertion false as written: every subagent is present in the markup, but only one is displayed. The scenario must be rewritten by the spec owner to match REQ-RV1-2.1 — assert that every subagent is offered by the selector and present in the response, and that the selected subagent's name, description, and inputs and outputs are displayed. The feature files are not edited by this revision.
>
> `acceptance/features/cv.feature:77` (*The homepage displays the CV sections in order*) is **unaffected in substance** by REQ-RV1-1.1: it asserts the ordering of the CV section's contents, not their visibility on initial load. No change is required there.

### 5.1 Additional Acceptance Criteria

- **AC-14** (REQ-RV1-3.1): Foreground token colours against the code block background meet WCAG AA contrast (4.5:1 for body text), verified for every token class the github-dark theme emits.
- **AC-15** (REQ-RV1-3.1): Highlighting is present in the raw server response and with JavaScript disabled; no highlighter code appears in the client bundle.
- **AC-16** (REQ-RV1-1.1): The hero's full-height behaviour holds at each breakpoint declared in `web/app/globals.css` (640px, 768px, 900px, 1024px) and in landscape phone orientation.
- **AC-17** (REQ-RV1-2.1): The dropdown carries a programmatic label, exposes a visible focus state, is reachable and operable using the keyboard alone, and announces the selected subagent to a screen reader.
- **AC-18** (REQ-RV1-2.2): The full spec identifier remains selectable and copyable as a single value at each breakpoint declared in `web/app/globals.css`.

## 6. Contracts and Constraints

### 6.1 Sanitisation and XSS

- **Constraint**: `web/components/blog/article-content.tsx` renders untrusted article markdown through `rehype-sanitize` with `ARTICLE_SANITIZE_SCHEMA`. This is the recorded RISK-003 stored-XSS mitigation and must be preserved.
- **Constraint**: `ARTICLE_SANITIZE_SCHEMA` must be widened only to permit `hljs-*` class names on `code` and `span` elements. No `style` attributes, no raw HTML, and no new element types beyond those required by the above may be admitted.
- **Constraint**: `rehype-raw` must remain uninstalled and `dangerouslySetInnerHTML` must remain unused.
- **Constraint**: the rehype plugin order must be such that the highlighter's output survives sanitisation while untrusted markup is still stripped. This is a requirement of the implementation, not a note.
- **Constraint**: the `@spec-003` scenario *A blog post displays the article header and rendered markdown content* asserts that markup capable of executing in the browser is not rendered. It must continue to pass unchanged.

### 6.2 Server Rendering

- **Constraint**: SPEC-003 REQ-1.5 and REQ-1.6 remain in force. `ArticleContent` and the subagent catalogue remain server-rendered; only the catalogue's selection state may cross a client boundary.
- **Constraint**: the agents page's server response must contain the markup for every subagent, so the catalogue reaches crawlers fully populated (SPEC-003 REQ-1.5).

### 6.3 Dependencies

- **New dependency**: `rehype-highlight` (highlight.js), used server-side only. It is the sole highlighter permitted by REQ-RV1-3.1; `rehype-pretty-code` and `shiki` are not to be introduced.
- **Constraint**: the github-dark stylesheet must be applied through the site's existing styling layer. `web/app/globals.css` declares no `prefers-color-scheme` or `.dark` variants and this revision does not add any; the dark code block is a scoped inversion on a light page, not the start of a dark theme.

### 6.4 Relationship to SPEC-003

- REQ-RV1-2.1 **supersedes the display obligation of SPEC-003 REQ-3.3** — a full list of subagents rendered simultaneously. The coverage obligation of REQ-3.3 (every subagent, with purpose, inputs and outputs) is retained in full.
- REQ-RV1-1.1 refines the presentation of SPEC-003 REQ-2.1 (personal details header). It does not change what that section contains.
- REQ-RV1-2.2 refines the presentation of SPEC-003 REQ-3.4 (spec listing). It does not change what that section contains.
- REQ-RV1-3.1 refines the presentation of SPEC-003 REQ-4.1 (blog post content rendering). It does not change what is rendered, only how fenced blocks are styled.
- All other SPEC-003 requirements remain in force unchanged.

### 6.5 Responsiveness and Accessibility

- **Constraint**: all three changes must hold across the site's existing breakpoints, declared in `web/app/globals.css` as 640px, 768px, 900px, and 1024px.
- **Constraint**: the subagent selector must be programmatically labelled, keyboard-operable, and must expose a visible focus state.
- **Constraint**: highlighted code blocks must meet WCAG AA contrast for text against their background.

## 7. Edge Cases and Error Handling

- **Short viewport (hero)**: on a viewport shorter than the hero's content, the section grows beyond the full-height target and the page scrolls normally. Content is never clipped and the section never scrolls internally.
- **Landscape phone (hero)**: the hero degrades the same way as any short viewport — it grows to fit its content rather than compressing it below legibility.
- **Zero subagents**: the API returns an empty list; the agents page renders the existing catalogue empty state. No dropdown is rendered, and no selection is made.
- **Single subagent**: the catalogue renders that subagent's detail. The dropdown is still rendered and labelled, with one option selected.
- **Empty code block**: a fence containing no content renders as an empty code block with the same chrome as a populated one. It is not omitted and does not collapse.
- **Unlabelled fence**: renders as an unhighlighted code block. No language is inferred and no error is raised.
- **Unknown language tag**: renders as an unhighlighted code block. The unknown tag is ignored; the build does not fail and no runtime error surfaces.
- **Very long lines in a code block**: the block scrolls horizontally within its own bounds, as the current `<pre>` already does. It must not widen the article column or introduce horizontal scrolling on the page body.
- **Article content otherwise unrenderable**: a failure elsewhere in the article body is handled exactly as it is today — the highlighter introduces no new failure mode, and a code block within a failing article does not change the outcome.
- **Article with no content**: unchanged from today. `ArticleContent` renders nothing for empty markdown.

## 8. Infrastructure Requirements

None

## 9. External Resources

| Filepath | Description | When to use |
|----------|-------------|-------------|
| web/app/page.tsx | Homepage section stack; renders `PersonalDetailsHeader` first | Use when implementing REQ-RV1-1.1 |
| web/components/home/personal-details-header.tsx | The hero section named by REQ-RV1-1.1 | Use when implementing REQ-RV1-1.1 |
| web/components/agents/agent-catalogue.tsx | Current full-list subagent catalogue, including the "None declared" and empty-state treatments | Use when implementing REQ-RV1-2.1 |
| web/components/agents/spec-listing.tsx | Spec ledger; renders the identifier in mono in a `220px` column beside a `1fr` content column | Use when implementing REQ-RV1-2.2 |
| web/components/blog/article-content.tsx | Article markdown renderer and `ARTICLE_SANITIZE_SCHEMA`, the RISK-003 XSS barrier | Use when implementing REQ-RV1-3.1 |
| web/app/globals.css | Design tokens, breakpoints, and the `--header-height` used by the hero calculation | Use when implementing any of REQ-RV1-1.1, REQ-RV1-2.2, REQ-RV1-3.1 |
| docs/specs/SPEC-003.md | Parent spec; the requirements this revision refines and supersedes | Use before starting any requirement in this revision |
