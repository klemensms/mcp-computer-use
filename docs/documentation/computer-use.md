<!-- AGENT POINTER: Full technical reference at docs/technical/COMPUTER_USE_TECHNICAL.md -->

# mcp-computer-use

MCP server giving Claude Code (and any MCP client) semantic macOS app control — screenshot, click, type, keypress, scroll — via the Accessibility API and ScreenCaptureKit.

## MCP Configuration

Add to your MCP config (`.mcp.json` or Claude Code's config):

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/computer-use@beta", "mcp-cu"],
      "env": {
        "MCP_CU_ALLOWED_APPS": "md.obsidian,com.apple.finder,com.apple.systempreferences,com.mitchellh.ghostty,dev.cmux.app,com.figma.Desktop,com.apple.calculator",
        "MCP_CU_STRICT_AX": "1",
        "MCP_CU_RATE_LIMIT_MS": "250",
        "MCP_CU_AUDIT_LOG": "1",
        "MCP_CU_SECRET_SCAN": "1",
        "MCP_CU_REDACT": "1"
      }
    }
  }
}
```

## First run

1. `npx -y --package=@mcp-consultant-tools/computer-use@beta mcp-cu` — fires the postinstall which compiles the Swift helper from source. Requires Xcode Command Line Tools (`xcode-select --install`).
2. macOS will prompt for Accessibility + Screen Recording on the helper binary the first time an action is attempted. Grant both to `~/.mcp-computer-use/bridge`. Revoke in System Settings → Privacy & Security when not in use.

## Tools (v1)

Read-only: `screenshot`, `list_windows`, `get_frontmost_window`, `check_permissions`.
Write: `click`, `type_text`, `key_press`, `scroll`, `wait` (rate-limited).

- **Allowlist** gates all write tools. Default: Obsidian, Finder, System Settings, Ghostty, cmux, Figma Desktop, Calculator. Extend via `MCP_CU_ALLOWED_APPS`.
- **Secret scan**: `type_text` rejects common key patterns (sk-…, ghp_…, AKIA…, xoxb-…, long base64) with `SECRET_DETECTED`.
- **READONLY mode**: set `MCP_CU_READONLY=1` — hides write tools entirely from the MCP tools list.

## PROFILE presets

- `stealth` (default) — strict-AX on, allowlist on, audit on, rate limit 250ms, secret scan on, redact on.
- `permissive` — ALLOW_ALL, strict-AX off, redact off. Audit + secret scan stay on.
- `readonly` — only read tools registered.
- `confirm` — stealth + requires explicit confirmation on every write (not fully wired in v1; see roadmap).

Set via `MCP_CU_PROFILE=stealth` (etc).

## Prompts

(none in v1 — pure tool server)

## CLI

Every MCP tool has a CLI twin:

```bash
npx --package=@mcp-consultant-tools/computer-use mcp-cu-cli --help
npx --package=@mcp-consultant-tools/computer-use mcp-cu-cli check-permissions
npx --package=@mcp-consultant-tools/computer-use mcp-cu-cli screenshot --app com.apple.calculator --out calc.png
```

Full command list: `mcp-cu-cli --help`.

## More

- Full technical reference: `docs/technical/COMPUTER_USE_TECHNICAL.md`
- Design spec: `docs/superpowers/specs/2026-04-22-mcp-computer-use-design.md`
- Attribution: `NOTICE`
