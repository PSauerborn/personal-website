.PHONY: lint
lint:
	terraform fmt -recursive
	terraform validate

.PHONY: tf-plan
tf-plan:
	terraform init
	terraform plan
