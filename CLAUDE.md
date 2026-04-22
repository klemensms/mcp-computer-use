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
