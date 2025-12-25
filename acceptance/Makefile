include .build.env

version ?= latest

image_name := acceptance
repository_name := personal-website-acceptance

.PHONY: run-tests
run-tests:
	docker build \
		--pull \
		-t $(image_name)-tests .

	docker run --rm \
		-e ADMIN_API_KEY=${ADMIN_API_KEY} \
		$(image_name)-tests

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

.PHONY: lint
lint:
	go fmt ./...
	go mod tidy
	go run github.com/golangci/golangci-lint/cmd/golangci-lint@latest run --timeout 5m

.PHONY: ecr-login
ecr-login:
	aws ecr get-login-password --region ${aws_region} | \
		docker login --username AWS --password-stdin ${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com
