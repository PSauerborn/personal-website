# Makefile for the api component.
#
# Invoked from the repository root via the monorepo convention
#
#   $ make -C api <target>
#
# Every recipe sets GOTOOLCHAIN=auto so that the toolchain pinned by the `go`
# directive in go.mod (go1.25.0) is fetched on demand when the locally installed
# toolchain is older; without it the build fails on hosts shipping go1.24.
go_bin ?= go
GOTOOLCHAIN := auto
export GOTOOLCHAIN

# Linter binary. Overridable so the target can be pointed at a version pinned in
# a local toolchain directory (`make lint golangci_lint_bin=./bin/golangci-lint`).
golangci_lint_bin ?= golangci-lint

.PHONY: help
help:
	@echo "Available targets:"
	@echo "  build  - compile every package in the module"
	@echo "  test   - run the module test suite"
	@echo "  fmt    - format every Go file in the module"
	@echo "  lint   - run golangci-lint over the module"

.PHONY: build
build:
	GOTOOLCHAIN=auto $(go_bin) build ./...

.PHONY: test
test:
	GOTOOLCHAIN=auto $(go_bin) test ./...

.PHONY: fmt
fmt:
	GOTOOLCHAIN=auto $(go_bin) fmt ./...

# pre-commit invokes this target. golangci-lint is not vendored, so its absence
# is reported as an actionable error rather than being skipped, which would let
# unlinted code through the hook.
.PHONY: lint
lint:
	@command -v $(golangci_lint_bin) >/dev/null 2>&1 || { \
		echo "error: '$(golangci_lint_bin)' not found on PATH."; \
		echo "install it with 'go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest'"; \
		echo "or point the target at an existing binary: 'make -C api lint golangci_lint_bin=<path>'"; \
		exit 1; \
	}
	GOTOOLCHAIN=auto $(golangci_lint_bin) run ./...
