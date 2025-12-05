.PHONY: lint
lint:
	terraform fmt -recursive
	terraform validate
	terraform-docs markdown table modules/main > TF_DOCS.md
