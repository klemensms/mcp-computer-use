# mcp-computer-use

MCP server giving Claude Code (and any MCP client) **semantic macOS app control** — screenshot, click, type, keypress, scroll — via the Accessibility API and ScreenCaptureKit.

> **Status:** v0.2.0-beta. macOS 14+. Full Xcode required for the
> postinstall Swift build (Xcode Command Line Tools alone are not
> sufficient — `swift build` ships with Xcode). Windows backend planned
> for v2.

## Why

Existing browser-automation tools (Playwright, etc.) can't touch native apps. AppleScript is scripted, not conversational. This gives an agent the same kind of conversational, screenshot-driven control it has over a web page — but for Obsidian, Finder, Figma Desktop, or anything else you add to the allowlist.

Default-secure: per-app allowlist, rate limit, `type_text` secret scan, JSONL audit log, PROFILE presets. Agent can't act on apps you didn't bless.

## Install

MCP config:

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/computer-use@beta", "mcp-cu"],
      "env": {
        "MCP_CU_ALLOWED_APPS": "md.obsidian,com.apple.finder,dev.cmux.app,com.figma.Desktop,com.apple.calculator"
      }
    }
  }
}
```

First launch compiles the Swift helper from source via SwiftPM (requires
full Xcode — install from the App Store; `xcode-select -s /Applications/Xcode.app`
if it's already there but unselected). The helper imports
[`BackgroundComputerUseKit`](https://github.com/actuallyepic/background-computer-use)
and resolves on first build (~10s on a cold cache, ~1s warm). macOS
then prompts for Accessibility + Screen Recording on
`~/.mcp-computer-use/bridge` — grant both.

## Quick example

> Agent to MCP: `screenshot({app: "com.apple.calculator"})`
> → returns PNG + `capture_id: "cap_abc12345"`
>
> Agent: `click({x: 50, y: 180, capture_id: "cap_abc12345"})`
> → presses the `7` button in Calculator

## Tools

| Tool | Kind | Gated by |
|---|---|---|
| `screenshot` | read | redaction for sensitive apps |
| `list_windows` | read | — |
| `get_frontmost_window` | read | — |
| `check_permissions` | read | — |
| `click` | write | allowlist + rate limit |
| `type_text` | write | allowlist + rate limit + secret scan |
| `key_press` | write | allowlist + rate limit |
| `scroll` | write | allowlist + rate limit |
| `wait` | neutral | rate limit |

Set `MCP_CU_READONLY=1` and only the reads are registered — write tools don't even appear in tool discovery.

## CLI

Every MCP tool has a matching CLI command via `mcp-cu-cli`:

```bash
npx --package=@mcp-consultant-tools/computer-use mcp-cu-cli --help
npx --package=@mcp-consultant-tools/computer-use mcp-cu-cli screenshot --app com.apple.finder --out finder.png
```

## Safety

See `docs/technical/COMPUTER_USE_TECHNICAL.md` for the full safety model. Short version:
- Strict-AX (stealth) mode on by default
- `type_text` rejects `sk-…`, `ghp_…`, `AKIA…`, `xoxb-…`, long base64
- Every action logged to `~/.local/state/mcp-computer-use/audit.log` (JSONL; text fields redacted)
- PROFILE presets: `stealth` (default) / `permissive` / `readonly` / `confirm`

## Acknowledgements

The Swift helper at `native/macos/Sources/McpComputerUseHelper/` is a
thin wrapper over [`BackgroundComputerUseKit`](https://github.com/actuallyepic/background-computer-use)
(MIT © cam + anupam, dubdubdub labs), consumed via SwiftPM and pinned by
commit SHA in `native/macos/Package.swift`. The wrapper translates upstream's
Swift API into this project's existing JSON-over-stdio wire protocol; the
TypeScript side and safety model are owned here. See `NOTICE` for full
attribution and `UPSTREAM_SYNC.md` for the upgrade ritual.

Earlier releases (v0.1.x) shipped a vendored helper seeded from
[`injaneity/pi-computer-use`](https://github.com/injaneity/pi-computer-use);
that file was deleted in v0.2.0 — see the v0.2.0 release notes for the
migration story.

Uses `@mcp-consultant-tools/core` for shared helpers across sibling MCP packages.

## Roadmap

- **v1.1** — richer AX tools (`axPressAtPoint`, `axFindTextInput`), proper sensitive-app redaction pipeline, confirm-mode polish.
- **v2** — Windows backend (UIA + `Windows.Graphics.Capture`) slots in behind the existing `NativeBridge` interface.

## Docs

- User guide: [`docs/documentation/computer-use.md`](docs/documentation/computer-use.md)
- Technical reference: [`docs/technical/COMPUTER_USE_TECHNICAL.md`](docs/technical/COMPUTER_USE_TECHNICAL.md)
- Design spec: [`docs/superpowers/specs/2026-04-22-mcp-computer-use-design.md`](docs/superpowers/specs/2026-04-22-mcp-computer-use-design.md)
- Release notes: [`docs/release-notes/`](docs/release-notes/)

## License

MIT. See `LICENSE` for dual copyright attribution (Zane Chee upstream + Klemens Stelk this project).
