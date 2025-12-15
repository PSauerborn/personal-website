aws_region=eu-west-2
aws_account_id=215268073545

version ?= latest

image_name := web
repository_name := personal-website-web

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

.PHONY: run-server
run-server: build-image
	docker run --rm \
		-p 8080:8080 \
		$(image_name)

.PHONY: lint
lint:
	prettier --write "**/*.{js,jsx,ts,tsx,json,css,scss,md,vue}"

.PHONY: ecr-login
ecr-login:
	aws ecr get-login-password --region ${aws_region} | \
		docker login --username AWS --password-stdin ${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com
