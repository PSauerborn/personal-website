# Makefile for the alembic migration component.
#
# Invoked from the repository root via the monorepo convention
#
#   $ make -C alembic <target>
#
# No connection setting is defined here: the run-migrations target passes the
# POSTGRES_* / ALEMBIC_* and optional LOG_* variables through from the parent
# shell using the
# value-less `docker run -e <NAME>` form, so no credential ever reaches this file
# or the built image.

image_name ?= alembic-migrations
image_tag ?= latest
image ?= $(image_name):$(image_tag)

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

.PHONY: run-migrations
run-migrations: build
	docker run --rm \
		-e POSTGRES_HOST \
		-e POSTGRES_PORT \
		-e POSTGRES_USER \
		-e POSTGRES_PASSWORD \
		-e POSTGRES_DB \
		-e ALEMBIC_REVISION \
		-e ALEMBIC_COMMAND \
		-e LOG_LEVEL \
		-e LOG_FILE \
		--network personal-website_personal-website \
		$(image)

.PHONY: lint
lint:
	black .
	flake8 .
