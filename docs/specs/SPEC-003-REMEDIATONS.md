The following remediations have been identified post execution of SPEC-003:

- [x] UI should include Github URL in homepage header next to email and phone number
  - `githubUrl` added to `web/lib/siteConfig.ts` (`https://github.com/PSauerborn`,
    taken from this repository's `origin` remote), rendered as a third column of
    the masthead contact rail in `web/components/home/personal-details-header.tsx`.
- [x] Education tab on CV viewer doesn't do anything. The education entries are listed below the main view component. This needs to be brought into the main view component, under the education tab.
  - Root cause: both `TabsContent` panels pass `forceMount`, and Radix computes the
    panel's `hidden` attribute as `!(forceMount || isSelected)` — so a force-mounted
    panel is never hidden and both rendered at once. `web/components/ui/tabs.tsx` now
    hides the inactive panel on `data-[state=inactive]`, which keeps both panels in
    the server response (REQ-1.5) while restoring the switch. The role counter beside
    the tab strip is also suppressed on the education panel, where it describes
    nothing on screen.
- [x] No padding on CV entry selection column. Text in the selection/navigation bar is right on the left border of the cell
- [x] The same padding issue on the project list and the blog list
  - One rule applied to all three ledgers: the list container bleeds `-mx-3` into
    the page gutter (`--gutter` is `clamp(20px, 4vw, 24px)`, so 12px always fits)
    and each row pads the same `px-3` back in. The rows' hover/selected background
    gains its breathing room, the hairline rules stay flush with one another, and
    no text moves off the section's left edge.
    - `web/components/home/cv-section-explorer.tsx` — experience selection column
    - `web/components/blog/blog-index.tsx` — article ledger
    - `web/components/projects/project-index.tsx` — project ledger
- [x] Contact form is not center aligned
  - `mx-auto` added to the form and to the post-submit confirmation panel in
    `web/components/home/contact-form.tsx`. The section heading above them is left
    aligned, per DES-001.
- [x] Comments are never fetched from API when blog post is loaded
  - Root cause: environment, not code. `NEXT_PUBLIC_API_BASE_URL` was unset, so
    (a) `resolveBaseUrl()` has no browser base URL and (b) `next.config.ts` derives
    the CSP `connect-src` directive from the same variable, leaving it at `'self'` —
    the running dev server was serving `connect-src 'self'`, which refuses the API
    origin outright. No request was therefore ever made, and nothing said why. A
    local `web/.env` now supplies it (git-ignored, per `web/.env.example`),
    `next.config.ts` warns loudly when it is missing, and `web/README.md` names the
    symptom. The contact form's submission was broken by the same cause.
    NOTE: `next dev` must be restarted to pick up the new `.env` — the value is
    inlined at compile time.
