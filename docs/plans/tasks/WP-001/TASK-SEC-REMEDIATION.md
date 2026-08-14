# Task: Security Remediation (review loop iteration 1) — complete the DSN password redaction

Work Plan ID: WP-001
Task ID: TASK-SEC-REMEDIATION
Created Date: 2026-08-13
Description: One finding remains after the first remediation round. `secret_renderings()` does not
produce the rendering SQLAlchemy actually uses when it renders the DSN, so a password containing a
space or a `+` together with any character that must be percent-encoded survives `redact()` and can
reach stdout and `LOG_FILE`.
Acceptance Criteria Covered: _(none — security remediation)_

## Implementation Content

Close SEC-005. `alembic/src/config.py:85` builds the connection URL with
`URL.render_as_string(hide_password=False)`. In SQLAlchemy 2.0.52 that method encodes the password
as `quote(str(self.password), safe=" +")`
(`.../site-packages/sqlalchemy/engine/url.py:647`) — space and `+` are **left literal**, everything
else is percent-encoded.

`alembic/src/main.py:234` covers only three renderings: the raw secret, `quote_plus(secret)`
(space → `+`, `+` → `%2B`) and `quote(secret, safe="")` (space → `%20`, `+` → `%2B`). None of them
equals the SQLAlchemy form whenever the secret contains a space or a `+` **and** at least one
character requiring encoding — the common case of a base64-generated password.

Add the SQLAlchemy rendering to `secret_renderings()` so `redact()` removes it, and pin it with a
doctest (the component has no pytest suite by binding decision 5).

## Target Files

- [x] `alembic/src/main.py` (`secret_renderings`, `redact` doctests)

## Investigation Targets

- `alembic/src/main.py` — `secret_renderings` (line 213) and `redact` (line 238)
- `alembic/src/config.py` — `postgres_connection_url` (line 65), the producer of the DSN
- `<site-packages>/sqlalchemy/engine/url.py:640-649` — `URL.render_as_string`, the authority on the
  encoding that must be covered

## Investigation Notes

- `sqlalchemy` 2.0.52 is the installed version; `URL.render_as_string(hide_password=False)` emits
  `quote(str(self.password), safe=" +")` (the username uses the same `safe=" +"`). Space and `+`
  stay literal, everything else is percent-encoded.
- `alembic/src/config.py:78-85` builds the DSN via `URL.create(...).render_as_string(hide_password=False)`,
  so that encoding is exactly what an error message echoing the DSN carries. Confirmed empirically:
  password `xY+9/abc=` renders as `postgresql+psycopg://user:xY+9%2Fabc%3D@db:5432/portfolio`.
- `secret_renderings` (main.py:213) previously returned `{secret, quote_plus(secret), quote(secret, safe="")}`
  — none of which equals the `safe=" +"` form when the secret mixes `+`/space with an encodable
  character. `redact` (main.py:238) replaces each rendering longest-first, so adding the missing
  rendering to the set is sufficient; the ordering keeps the raw value from breaking up the longer
  encoded forms.
- The component ships no pytest suite (binding decision 5), so the behaviour is pinned by the
  `redact` doctests, which now build the DSN with `URL.create(...).render_as_string(hide_password=False)`
  rather than hand-writing it.

## Remediation Context

- Source: security-reviewer
- Finding / failing command: SEC-005 — `redact()` misses SQLAlchemy's own DSN password encoding
- Evidence:

  ```text
  sqlalchemy/engine/url.py:647   quote(str(self.password), safe=" +")
  alembic/src/main.py:234        renderings = {secret, quote_plus(secret), quote(secret, safe="")}

  secret  = "xY+9/abc="                 # a base64-generated password
  DSN     = "xY+9%2Fabc%3D"             # produced by render_as_string(hide_password=False)
  covered = {"xY+9/abc=", "xY%2B9%2Fabc%3D"}   # neither matches the DSN form
  ```

- Verification: `cd alembic && python -m doctest src/main.py -v` (or
  `python -m pytest --doctest-modules src/main.py`) passes with a doctest asserting that a DSN
  rendered by `URL.create(...).render_as_string(hide_password=False)` for a password containing
  both `+` and `/` is fully redacted.

For remediation without a testable behavior change, replace the TDD cycle below with: reproduce the
failure, apply the fix, re-run the Verification command until it passes.

## Findings

| # | File / line | Class | Severity | Attack scenario | Required fix |
| --- | --- | --- | --- | --- | --- |
| SEC-005 | `alembic/src/main.py:234` | secrets | medium | An operator sets `POSTGRES_PASSWORD` to a base64-generated value such as `xY+9/abc=`. A migration run fails in a way whose message embeds the DSN (for example `sqlalchemy.exc.ArgumentError: Could not parse SQLAlchemy URL from string 'postgresql+psycopg://user:xY+9%2Fabc%3D@host:5432/db'`). `main()` line 349 passes that message through `redact()`, which finds none of its three renderings, so the encoded password is written verbatim to stdout and appended to `LOG_FILE`. Anyone with log access — the platform log store, or any process able to read the log file in the container — recovers the database password by URL-decoding it. | Add `quote(secret, safe=" +")` to the set returned by `secret_renderings()`, so the set matches SQLAlchemy's own encoding exactly, and keep the longest-first ordering. Extend the `redact` doctests with a password containing both `+` and `/` (and one containing a space) redacted out of a DSN produced by `URL.create(...).render_as_string(hide_password=False)`. |

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase

- [x] Read the Investigation Targets and record the exact encoding used by `render_as_string`
- [x] Add a `redact` doctest for a password containing `+` and `/`, and one containing a space,
      against a DSN built with `URL.create(...).render_as_string(hide_password=False)`
- [x] Run the Verification command and confirm the new doctests fail

### 2. Green Phase

- [x] Add the `quote(secret, safe=" +")` rendering to `secret_renderings()`
- [x] Re-run the Verification command and confirm the doctests pass

### 3. Refactor Phase

- [x] Update the `secret_renderings` docstring to name all four covered renderings and why
- [x] Run `black .` and `flake8 .` in `alembic/`; confirm the doctests still pass

## Completion Criteria

- [x] `redact(URL.create(..., password=p).render_as_string(hide_password=False), p)` contains no
      substring of `p` for passwords containing `+`, `/`, `%`, `@` and a space
- [x] All added doctests pass
- [x] Verification command from Remediation Context passes

## Notes

- Impact scope: `alembic/src/main.py` only. The seeding component does not build a DSN — it passes
  connection parameters to `psycopg.connect` as keywords — so it needs no equivalent change.
- Scope boundary: do not change `alembic/src/config.py`; `render_as_string(hide_password=False)` is
  the required behaviour of the URL builder and the redaction is the compensating control.
- Confirmed resolved in this iteration and not to be reopened: the `--yes` destructive-run opt-in
  (`scripts/seeding/src/main.py:267-297`, checked at line 470 before any fixture read and before
  `open_connection`), the regenerated and fully audited `.secrets.baseline` (118 results, every
  entry `is_secret: false`, no genuine credential baselined), and the honestly recorded
  `OUTSTANDING:` base-image digest deferral in both Dockerfiles (no fabricated digest committed).
