# Sample Spec

This document is the worked example of what a spec looks like on this site. It
is public, it is linked to a visible spec, and it is the document the content
endpoint hands back byte-for-byte when a visitor asks to read a spec.

## 1. Purpose

A spec answers one question: what is being built, and how will anyone know when
it is finished? Everything else — the diagrams, the rejected alternatives, the
half-remembered discussion in a chat thread — is context. Context is welcome,
but it goes under the answer, not in front of it.

Concretely, a spec on this site carries four things:

1. the problem, stated in the language of the person who has it;
2. the scope, including an explicit list of what is *not* being built;
3. the interface — the schema, the endpoints, or the contract other components
   will pin themselves to;
4. the acceptance criteria, written so that a failing one is unambiguous.

## 2. Scope

A spec covers a single component. When two components have to change together,
the coupling itself is the interesting part, and it belongs in a spec of its
own rather than being split across two documents that quietly disagree.

Out of scope for any spec: implementation detail that the interface does not
constrain. If a section can be deleted without invalidating a single acceptance
criterion, it was commentary.

## 3. Structure

The numbered-section layout is not decoration. Sections are referenced from
work plans, from task files and from review notes, and a reference of the form
"§4.2" only survives if the numbering is stable. Sections are therefore appended
rather than renumbered, and a section that is no longer true is marked
superseded in place.

## 4. Acceptance Criteria

Each criterion is a sentence that is either true or false about a running
system. "The API is fast" is not a criterion. "The list endpoint responds in
under 200 ms with 10,000 seeded rows" is.

Criteria are numbered independently of the sections, because a criterion tends
to outlive the section that motivated it.

## 5. Lifecycle

A spec is visible once it is worth reading. Until then it is hidden, which is a
property of the spec row rather than of this file: the same document is served
to an admin listing hidden specs and to nobody else. Restricted documents —
internal notes, review transcripts, anything not written for a visitor — are
linked to the spec but omitted from every public response.
