.PHONY: scan-secrets
scan-secrets:
	detect-secrets scan \
		--exclude-files "acceptance/features/*" \
		--exclude-files "scripts/seeding/fixtures/*" \
		> .secrets.baseline

	detect-secrets audit .secrets.baseline

# claude configuration settings for agents, coding standards, and code version
claude_agents_version = 0.2.2
claude_coding_standards_version = v0.2.2-standards
claude_code_version = 2.1.220

.PHONY: claude
claude:
	@echo "Initiating sandboxed claude session..."
	@docker build \
		--pull \
		--build-arg AGENTS_VERSION=$(claude_agents_version) \
		--build-arg CODING_STANDARDS_VERSION=$(claude_coding_standards_version) \
		--build-arg CLAUDE_CODE_VERSION=$(claude_code_version) \
		-t claude-sandbox \
		-f Dockerfile.claude \
		.

	@docker run --rm \
		-v $(PWD):/home/agent/workspace \
		-it \
		claude-sandbox
