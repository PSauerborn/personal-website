# Sample Spec — Working Notes

Restricted. These notes accompany the Sample Spec and are deliberately not part
of the published document: they record the arguments that were had, not the
conclusions that were reached. A visitor asking for the spec gets the spec; this
file is linked to the same spec but omitted from every public response.

## Open questions

- **Numbering.** Section numbers are load-bearing because other documents cite
  them, but a spec that only ever appends sections drifts towards a changelog.
  The compromise — append, and mark superseded sections in place — is a choice,
  not an obvious truth, and it is worth revisiting once a spec has been through
  three or four revisions.
- **Where acceptance criteria live.** Keeping them in the spec makes the spec
  self-contained; keeping them in the acceptance suite makes them executable.
  Both are currently true, and the two can disagree. The acceptance suite wins
  when they do, because it is the thing that actually runs.

## Rejected alternatives

- *One spec per endpoint.* Rejected: endpoints are not a unit of change. A
  single schema change routinely touches four of them, and four specs that each
  describe a quarter of the change describe none of it.
- *Inline document content in the fixtures.* Rejected: a Markdown document
  wedged into a JSON string field is unreadable, unreviewable, and impossible to
  diff. Documents live beside the fixtures as files, and the fixture carries a
  path.

## Review log

The first draft asserted that a spec should never be hidden, on the grounds that
a spec nobody can read is not doing its job. That was overruled by the simpler
observation that a spec is written before the thing it specifies exists, and
publishing it at that point advertises a component that cannot be used yet.
