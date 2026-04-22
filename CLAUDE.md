# CLAUDE.md

Project guidance for Claude Code working in this repo.

## Design docs
- Spec: `docs/superpowers/specs/2026-04-22-mcp-computer-use-design.md`
- Plan: `docs/superpowers/plans/2026-04-22-mcp-computer-use-v1.md`

## Conventions (mirrored from mcp-consultant-tools)
- Service-Tool-Prompt layering: services hold business logic, tools are thin MCP wrappers, CLI wraps the same services.
- NEVER use `console.log()` (corrupts MCP stdio). Only `console.error` / `console.warn`.
- Every MCP tool has a matching CLI command.
- Tests are vitest; run via `npm test`.
- Build: `npm run build`. Native helper: `npm run build:native` (macOS only).

## Security: Preventing Secret Leaks

This repo is public on GitHub. Secret leakage is a hard fail.

### Setup
```bash
./scripts/install-hooks.sh  # Install pre-commit hook (one-time per clone)
```

### Pre-Commit Hook & Allowlists

The pre-commit hook at `scripts/hooks/pre-commit` scans every staged diff for
common secret patterns. Two allowlist files reduce false positives:
- `.secret-scan-allowlist` — keyword patterns to exclude (env var references, CLI command names, comments, test fixtures)
- `.secret-scan-longstr-allowlist` — long-string patterns to exclude (npm paths, integrity hashes, Apple framework identifiers)

When the hook triggers on a false positive, **add a pattern to the allowlist**
rather than using `--no-verify`. Each pattern is a `grep -E` regex.

### Claude Auto-Bypass Policy

When committing and the pre-commit hook blocks with warnings, Claude MUST:
1. Review every flagged line
2. Classify each as **false positive** or **real secret**

**If ALL flagged items are false positives** (env var references like
`process.env.MCP_CU_SECRET_SCAN`, CLI command names, code comments, test
fixtures like `sk-abc123def456ghi789jkl0` intentionally exercising the scanner):
- Use `git commit --no-verify` automatically without asking the user
- After committing, update the allowlist files to prevent the same false positives next time

**If ANY flagged item could be a real secret** (actual credential values,
hardcoded tokens, API keys with real-looking values):
- STOP immediately and alert the user
- Do NOT use `--no-verify`
- Wait for user guidance before proceeding

### Files That Should NEVER Be Committed
- `.env` / `.env.*` — Environment variables (hook hard-blocks)
- `.claude/settings.json` — May contain command patterns with embedded secrets
- `*.pem`, `*.key`, `*.p12` — Private keys

### If You Accidentally Commit Secrets
1. Rotate credentials immediately
2. Remove from git history using `git-filter-repo`
3. Notify affected parties

### Skill
`.claude/skills/pr-prep-secret-guard/SKILL.md` documents the scan manually for
git operations not covered by the hook (e.g., pushing, PR prep). Invoke before
pushing or creating a PR.
