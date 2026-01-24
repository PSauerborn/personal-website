.PHONY: scan-secrets
scan-secrets:
	detect-secrets scan \
		--exclude-files 'api/tests/fixtures/.*' \
		--exclude-files 'scripts/load_seed_data/data/.*' \
		> .secrets.baseline

	detect-secrets audit .secrets.baseline
