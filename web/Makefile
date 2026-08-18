# Makefile for the web component.
#
# Invoked from the repository root via the monorepo convention
#
#   $ make -C web <target>
#
# Every recipe shells out to npm, so `npm ci` (or `npm install`) must have been
# run once in this directory beforehand.

# Package manager binary. Overridable so the targets can be pointed at a Node
# toolchain that is not on PATH (`make -C web test npm_bin=/opt/node/bin/npm`).
npm_bin ?= npm

.PHONY: help
help:
	@echo "Available targets:"
	@echo "  build  - produce a production build of the application"
	@echo "  test   - run the application test suite"
	@echo "  format - format every source file with prettier"
	@echo "  format-check - report unformatted files without rewriting them"
	@echo "  lint   - run eslint over the application"
	@echo "  audit  - report advisories against the dependency tree"

.PHONY: build
build:
	$(npm_bin) run build

.PHONY: test
test:
	$(npm_bin) run test

.PHONY: format
format:
	$(npm_bin) run format

# The pre-commit half of `format`, over the same glob. It reports and fails
# rather than rewriting: a hook that reformats files under the committer stages
# nothing and leaves the working tree differing from the commit that was just
# made, which is a worse failure mode than one that stops and says what to run.
# `eslint-config-prettier` switches every formatting rule off, so the web-lint
# hook enforces none of [JS-005]; this target is what does.
.PHONY: format-check
format-check:
	$(npm_bin) run format:check

.PHONY: lint
lint:
	$(npm_bin) run lint

# Deliberately not wired into .pre-commit-config.yaml: it needs the registry and
# would break every offline commit. It is for CI and for a manual run before a
# dependency bump.
#
# The WP-003 risk plan names this countermeasure as `npm audit --omit=dev` "or
# equivalent". `--audit-level=high` is the equivalent chosen: the toolchain that
# runs against this repository's source (Next, TypeScript, ESLint, Vitest) is
# almost entirely devDependencies, so omitting them would hide the advisories
# that matter most. The whole tree is audited; only high and critical advisories
# fail the target. See the Make targets section of README.md.
.PHONY: audit
audit:
	$(npm_bin) audit --audit-level=high
