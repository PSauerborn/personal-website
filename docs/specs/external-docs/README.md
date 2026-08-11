# Linear-inspired personal website stylesheet

A self-contained SCSS design system modeled on the look and feel of
[linear.app](https://linear.app/): near-black canvas, Inter typography with
tight letter-spacing, hairline white-alpha borders, muted indigo accent,
gradient headlines, and a glassy sticky nav.

## Files

| File           | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `app.scss`     | The design system — tokens, mixins, base styles, components    |
| `app.css`      | Compiled output (regenerate after editing the SCSS)            |
| `example.html` | Reference page exercising every component                      |

## Compiling

Requires [Dart Sass](https://sass-lang.com/install):

```bash
sass app.scss app.css              # one-off
sass --watch app.scss app.css     # during development
```

## Fonts

The system is built around **Inter** (weights 400/500/600). Load it from
[rsms.me/inter](https://rsms.me/inter/) as in `example.html`, or self-host.
The optional `.text-mono` / `.kbd` styles fall back through Berkeley Mono →
SF Mono → JetBrains Mono → `ui-monospace`.

## Design tokens (§1 of `app.scss`)

- **Color** — cool-grey ramp from `hsl(220, 7%, 4%)` (canvas) to
  `hsl(220, 27%, 97%)` (primary text); Linear-indigo accent ramp centered on
  `hsl(234, 56%, 60%)` (`#5e6ad2`); white-alpha tints for borders and glass.
- **Type scale** — 12 / 14 / 16 / 18 / 21 / 24 / 32 / 40 / 56 / 64 px; weights
  400 / 500 / 600 only; letter-spacing tightens as size grows.
- **Spacing scale** — 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160 px via the
  `space($step)` function. Use only these values.
- **Radii** — 6 / 8 / 12 / 16 px + pill.
- **Elevation** — three shadow levels (raised / overlay / modal), each pairing
  an ambient and a contact shadow plus a lighter top edge; one accent glow.

## Component inventory

- `.header` — sticky glass nav with logo, links, actions
- `.hero` — gradient headline (`.text-hero`), lede, CTA row, ambient glow
- `.pill` — announcement pill with status dot
- `.btn` — `--primary` / `--secondary` / `--ghost`, sizes `--sm` / `--lg`
- `.section` — labeled page section; `--ruled` adds a faded top rule
- `.grid` / `.card` — feature grid; `.card--feature` spans full width with glow
- `.media-frame` — framed screenshot/video panel
- `.list-check`, `.tag`, `.kbd` — upgraded list, tech tags, keyboard keys
- `.quote` — centered testimonial with gradient text
- `.input`, `.field` — dark inset form controls
- `.empty-state` — designed zero-data state
- `.footer` — multi-column footer with meta row
- Utilities: `.u-container`, `.u-stack`, `.u-visually-hidden`, `.reveal`
  (scroll reveal — pair with the IntersectionObserver snippet in
  `example.html`; respects `prefers-reduced-motion`)

## Conventions

- Every spacing / size / color / shadow value comes from the token scales —
  never invent one-off values; extend the scale instead.
- Hierarchy is carried by **weight and color**, not size: two weights
  (400 / 500–600), three text colors (primary / secondary / tertiary).
- Prefer background shifts and shadows over `border: 1px solid`; when a line
  is needed, use the white-alpha hairline tints.
- One `.btn--primary` per view.
