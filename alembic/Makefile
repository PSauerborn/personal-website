include .build.env

version ?= latest

image_name := alembic-migrations
repository_name := personal-website-alembic-migrations


.PHONY: build-image
build-image:
	docker build \
		--platform linux/amd64 \
		--provenance=false \
		--pull \
		-t $(image_name) .

.PHONY: push-image
push-image: build-image
	docker tag ${image_name} \
		${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com/${repository_name}:${version}
	docker push ${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com/${repository_name}:${version}

.PHONY: run-migrations
run-migrations: build-image
	docker run --rm \
		-e POSTGRES_HOST \
		-e POSTGRES_PORT \
		-e POSTGRES_USER \
		-e POSTGRES_PASSWORD \
		-e POSTGRES_DB \
		$(image_name)

.PHONY: lint
lint:
	black .

.PHONY: ecr-login
ecr-login:
	aws ecr get-login-password --region ${aws_region} | \
		docker login --username AWS --password-stdin ${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com
