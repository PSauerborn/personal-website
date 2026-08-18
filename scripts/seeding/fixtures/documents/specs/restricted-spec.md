# Restricted Spec

Restricted. This document is the only spec document linked to its spec, which is
what makes the spec invisible to the public listing: a spec whose spec document
cannot be described to a visitor has nothing to say to one.

## Subject

Internal operational details of the deployment pipeline — the hosts it runs on,
the order in which services are drained, and the manual steps that still exist
between "the tests passed" and "the change is live". None of it is secret in the
interesting sense, and all of it is the kind of detail that goes stale the week
after it is written, which is reason enough not to publish it.

## Drain order

Services are drained back to front: the ingress stops accepting new connections,
in-flight requests are given a grace period, the API is replaced, and only then
is the database migration applied. The migration runs last because every
revision is written to be compatible with the API version preceding it — a rule
that costs one extra revision per breaking change and saves every rollback.

## Manual steps

Two steps remain manual, and both are recorded here so that their cost stays
visible rather than becoming folklore:

1. Rotating the acceptance-suite API key, which requires a coordinated update in
   two places and is therefore done deliberately rather than on a schedule.
2. Confirming the post-migration row counts against the pre-migration snapshot.
   This is automatable and should be automated; it is listed as a manual step
   because pretending otherwise would make the list shorter and the deployment
   no safer.

## Why this is restricted rather than hidden

The spec itself is visible: it exists, and an admin listing specs sees it. The
document is restricted, so no public response describes it and no public request
retrieves it. That combination — a visible row whose only spec document is
restricted — is precisely the case the listing endpoint has to exclude, and it
is why this pair exists in the fixtures at all.
