# Makefile for the seeding component.
#
# Invoked from the repository root via the monorepo convention
#
#   $ make -C scripts/seeding <target>
#
# No connection setting is defined here: the seed target passes the POSTGRES_*
# and optional LOG_* variables through from the parent shell using the value-less
# `docker run -e <NAME>` form, so no credential ever reaches this file or the
# built image (REQ-2.7).

image_name ?= database-seeding
image_tag ?= latest
image ?= $(image_name):$(image_tag)

# Interpreter used by the local test target. Overridable so the suite can be run
# with the interpreter of a virtualenv (`make test python_bin=.venv/bin/python`).
python_bin ?= python3

# The cluster runs linux/amd64 nodes, and provenance attestations are not
# supported by the target registry, so both flags are mandatory on every build.
platform ?= linux/amd64

.PHONY: build
build:
	docker build \
		--platform $(platform) \
		--provenance=false \
		-t $(image) \
		-f Dockerfile \
		.

# Seeding truncates every seeded table and installs the fixture corpus, whose API
# keys are published in README.md, so the CLI refuses to run without the `--yes`
# opt-in. This target is the documented development workflow and therefore
# supplies it; never point it at a database that is not a development one.
.PHONY: seed
seed: build
	docker run --rm \
		-e POSTGRES_HOST \
		-e POSTGRES_PORT \
		-e POSTGRES_USER \
		-e POSTGRES_PASSWORD \
		-e POSTGRES_DB \
		-e LOG_LEVEL \
		-e LOG_FILE \
		$(image) --yes

.PHONY: test
test:
	$(python_bin) -m pytest

.PHONY: lint
lint:
	black .
	flake8 .
