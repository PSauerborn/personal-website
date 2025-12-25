include .build.env

version ?= latest

image_name := load-seed-data
repository_name := personal-website-load-seed-data


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

.PHONY: run-script
run-script: build-image
	docker run --rm \
		-e DB_HOST \
		-e DB_PORT \
		-e DB_USER \
		-e DB_PASSWORD \
		-e DB_NAME \
		$(image_name)

.PHONY: lint
lint:
	black .

.PHONY: ecr-login
ecr-login:
	aws ecr get-login-password --region ${aws_region} | \
		docker login --username AWS --password-stdin ${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com
