# Hidden Spec Beta — Comment Moderation

Draft. Hidden for the same reason as its sibling: the component is specified but
unbuilt, and a published spec for an unbuilt component is a support request
waiting to happen.

## 1. Problem

Comments are currently accepted, stored and displayed with no intervening step.
That is fine while nobody has found the endpoint and untenable the moment
somebody has. The site needs a way to keep a comment out of public view without
deleting it, and a way to review what has been kept out.

## 2. Proposed approach

A moderation state on each comment rather than a boolean flag. Three states:

- `pending` — accepted and stored, not displayed;
- `published` — displayed;
- `rejected` — retained for review, never displayed, never deleted
  automatically.

New comments land in `pending` when a heuristic trips and in `published`
otherwise, so the common case stays instant and the moderation queue stays
short. The heuristics are deliberately dull: link count, length, and a rate
limit per source address over a rolling window.

## 3. Interface

- An admin endpoint listing comments filtered by state, ordered oldest first,
  because a moderation queue is a queue.
- An admin endpoint setting the state of one comment, recorded in the audit log
  like every other authenticated admin action.
- No public interface at all. A visitor cannot tell whether their comment is
  pending or published, and should not be able to: that distinction is exactly
  the signal an abusive submitter would tune against.

## 4. Migration

Existing comments become `published` on migration. The alternative — defaulting
to `pending` and reviewing the backlog — is more correct and would silently
empty the comment section of every post on deploy, which is the sort of
correctness nobody thanks you for.

## 5. Acceptance criteria

- A comment in `pending` or `rejected` never appears in a public response, and
  the public comment count excludes it.
- Setting a comment's state writes an audit-log entry naming the endpoint, the
  method and the resulting status code.
- Rejecting a comment never deletes the row, so a moderation decision can be
  reviewed and reversed.
