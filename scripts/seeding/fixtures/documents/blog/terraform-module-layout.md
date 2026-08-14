# Terraform Module Layout

Most Terraform repositories do not fail because of Terraform. They fail because
nobody decided, early and in writing, what a module is allowed to know about the
world outside it.

## Three kinds of module

It helps to name them, because they have genuinely different rules:

1. **Resource modules.** A thin, opinionated wrapper over one logical piece of
   infrastructure — a bucket with its policy, a database with its parameter
   group. No provider blocks, no backend, no data sources reaching out to
   discover their surroundings. Inputs in, outputs out.
2. **Composition modules.** Wire resource modules together into something a team
   would recognise as a system. Still no backend, still no provider
   configuration, but this is where naming conventions and tagging live.
3. **Root modules.** The only place a backend and a provider are configured.
   One root module per environment per region. A root module contains almost no
   resources of its own; it exists to pin versions and pass values down.

The layout follows from the taxonomy rather than the other way around:

```
├── modules/
│   ├── database/
│   ├── network/
│   └── service/
├── compositions/
│   └── platform/
└── environments/
    ├── production/
    └── staging/
```

## Rules worth enforcing

- **Never configure a provider inside a reusable module.** The moment you do,
  the module cannot be used twice with different credentials, and removing the
  block later is a breaking change for everyone who consumed it.
- **State boundaries are blast-radius boundaries.** One state file per
  environment, at minimum. A plan that touches production and staging in the
  same run will eventually touch production when you meant staging.
- **Variables get types and descriptions.** `type = any` is a promise to debug
  it later, at the least convenient moment.

```hcl
variable "retention_days" {
  description = "Number of days automated backups are retained."
  type        = number
  default     = 14

  validation {
    condition     = var.retention_days >= 7
    error_message = "Backups must be retained for at least seven days."
  }
}
```

- **Outputs are the module's API.** Export the identifiers a caller genuinely
  needs and nothing else. Every extra output is a coupling you will be asked to
  preserve.
- **Pin everything.** Module sources by tag, providers by version constraint. An
  unpinned module is a plan that changes meaning while you sleep.

## On repeating yourself

Terraform rewards a small amount of duplication. Two environments that are
ninety per cent identical are usually clearer as two explicit root modules than
as one root module with a conditional in every resource. The abstraction that
removes the duplication is almost always harder to read than the duplication
was — and it hides exactly the differences you most need to see before you
approve a plan.
