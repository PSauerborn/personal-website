include .build.env

environment ?= dev
# make sure environment is either dev or prod
ifeq ($(environment),prod)
else ifeq ($(environment),dev)
else
$(error environment must be one of: dev, prod)
endif

version ?= latest

image_name := api
repository_name := personal-website-${environment}-api

.PHONY: run-tests
run-tests:
	docker build \
		--pull \
		--target tests \
		-t $(image_name)-tests .

	docker run --rm $(image_name)-tests

.PHONY: build-image
build-image:
	docker build \
		--platform linux/amd64 \
		--provenance=false \
		--pull \
		-t $(image_name) .

.PHONY: push-image
push-image: run-tests build-image
	docker tag ${image_name} \
		${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com/${repository_name}:${version}
	docker push ${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com/${repository_name}:${version}

.PHONY: run-server
run-server: build-image
	docker run --rm \
		-p 8080:8080 \
		-e POSTGRES_HOST \
		-e POSTGRES_PORT \
		-e POSTGRES_USER \
		-e POSTGRES_PASSWORD \
		-e POSTGRES_DB \
		$(image_name)

.PHONY: lint
lint:
	go fmt ./...
	go mod tidy
	go run github.com/golangci/golangci-lint/cmd/golangci-lint@latest run --timeout 5m

.PHONY: ecr-login
ecr-login:
	aws ecr get-login-password --region ${aws_region} | \
		docker login --username AWS --password-stdin ${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com
