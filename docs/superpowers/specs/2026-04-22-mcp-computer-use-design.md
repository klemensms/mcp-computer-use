# mcp-computer-use — Design Spec

- **Date:** 2026-04-22
- **Author:** Klemens Stelk (with Claude Code)
- **Status:** Approved for implementation planning
- **Source:** Obsidian note `inbox/pi-computer-use a Pi CLI integration that lets your agent control your applications.md`
- **Upstream reference:** `injaneity/pi-computer-use` v0.1.1 (MIT © Zane Chee), HEAD `96434a7`, local clone at `~/Repo/3rd party repos/pi-computer-use/`

---

## 1. Overview

A standalone MCP server that lets LLM agents running in Claude Code (or any MCP client) control native desktop applications on macOS — screenshot, click, type, scroll, enumerate windows — using the Accessibility API (AX) and ScreenCaptureKit for semantic, vision-grounded automation.

The Node/TypeScript server shell, tool surface, safety knobs, audit log, allowlist — all shared across platforms. Only the native "bridge" binary differs. v1 ships macOS; Windows slots in as a second `NativeBridge` implementation in v2 without touching the MCP layer.

Forked from `injaneity/pi-computer-use` (MIT) because that project is a Pi extension — not usable from Claude Code — but its Swift helper is a clean starting point. **Derived-from and extended-by:** we seeded `native/macos/bridge.swift` from upstream, but this project owns the file going forward. We add commands (`keyPress`, `scroll`, `shutdown`, richer listWindows, …) as agent needs evolve and we do NOT commit to wire compatibility with the upstream.

## 2. Goals / Non-goals

### Goals
- Give Claude Code agents semantic control of native macOS apps (starting with Obsidian, Finder, System Settings, Ghostty, cmux, Figma).
- Match the upstream tool surface (screenshot/click/type_text/wait) plus a small set of safe extensions (key_press, scroll, list_windows, get_frontmost_window, check_permissions).
- Default-secure: stealth-mode AX-first, allowlist-gated, audit-logged, rate-limited, secret-scanned, sensitive-app-redacted.
- Repo conventions mirror `mcp-consultant-tools` (Service-Tool-Prompt layering, CLI parity, npx publish, beta tag workflow).
- Architect the `NativeBridge` boundary so Windows can slot in later as a pure addition.

### Non-goals (v1)
- Windows or Linux support. Linux omitted permanently — no AX equivalent gives the semantic-first benefit.
- Mouse drag, double-click, right-click, triple-click, mouse-move, zoom. Add when actually needed.
- A clipboard tool (already covered by a separate MCP; avoid overlap).
- Cross-app scripting primitives (macros, sequences). Agents compose tool calls themselves.
- Per-call flag overrides. All behavior is env-driven + `PROFILE` presets; no runtime escalation.

## 3. Architecture

### Repo layout

```
~/Repo/mcp-computer-use/               # standalone, public GitHub, MIT + upstream attribution
├── src/
│   ├── index.ts                       # MCP server entry (stdio transport)
│   ├── cli.ts                         # Commander.js CLI entry
│   ├── context-factory.ts             # createServiceContext() — shared by MCP + CLI
│   ├── types.ts                       # ServiceContext interface
│   ├── tool-examples.ts               # descWithExamples() helper + examples
│   ├── config.ts                      # Env → Config (single source of truth for flags)
│   ├── native/
│   │   ├── bridge-interface.ts        # NativeBridge — platform-agnostic contract
│   │   ├── macos-bridge.ts            # Spawns + speaks to Swift helper (JSON over stdio)
│   │   └── factory.ts                 # Picks backend by process.platform
│   ├── services/
│   │   ├── index.ts
│   │   ├── screenshot-service.ts
│   │   ├── input-service.ts           # click, type_text, key_press, scroll
│   │   ├── window-service.ts          # list_windows, get_frontmost_window
│   │   ├── wait-service.ts
│   │   ├── safety-service.ts          # allowlist, rate limit, secret scan, redaction dispatch
│   │   ├── audit-service.ts           # JSONL audit log, rotation
│   │   └── permission-service.ts      # AX + Screen Recording status
│   ├── tools/
│   │   ├── index.ts                   # registerAllTools(server, ctx) — honors READONLY + PROFILE
│   │   ├── screenshot-tools.ts
│   │   ├── input-tools.ts
│   │   ├── window-tools.ts
│   │   ├── wait-tools.ts
│   │   └── permission-tools.ts
│   ├── cli/
│   │   ├── output.ts
│   │   └── commands/
│   │       ├── index.ts
│   │       └── {domain}-commands.ts
│   └── models/
│       └── api-types.ts               # Request/response types matching Swift helper protocol
├── native/
│   └── macos/
│       └── bridge.swift               # Copied from upstream with attribution
├── scripts/
│   ├── build-native.mjs               # xcrun swiftc wrapper; macOS-only, no-op elsewhere
│   └── setup-helper.mjs               # Postinstall: compile + install to ~/.mcp-computer-use/bridge
├── docs/
│   ├── superpowers/specs/             # this spec lives here
│   ├── technical/COMPUTER_USE_TECHNICAL.md   # Agent-facing full reference (XML-tagged)
│   ├── documentation/computer-use.md         # Short user-facing config doc
│   └── release-notes/
├── CLAUDE.md                          # Project guidance, mirrors mcp-consultant-tools patterns
├── README.md
├── LICENSE                            # MIT: both copyrights
├── NOTICE                             # Upstream attribution + commit hash
├── .env.example
├── package.json                       # name: @mcp-consultant-tools/computer-use
├── tsconfig.json
└── .gitignore
```

### Layering (Service–Tool–Prompt pattern, adapted)

1. **Native bridge** (`src/native/`) — spawns and talks to the Swift helper via JSON-over-stdio. Implements `NativeBridge` interface. Windows gets its own implementation later.
2. **Services** (`src/services/`) — business logic. One class per domain. Call `ctx.bridge.*`. No MCP or CLI concerns.
3. **Tools** (`src/tools/`) — thin MCP wrappers. Call services. Apply tool-registration gating (READONLY mode, PROFILE).
4. **CLI** (`src/cli/`) — Commander.js wrappers over the same services. Every MCP tool has a CLI command.
5. **Safety pipeline** — every write-tool passes through: allowlist → rate-limit → secret-scan (type_text only) → audit-log (before) → bridge call → redact screenshot on return → audit-log (after).

### NativeBridge interface

```ts
export interface NativeBridge {
  screenshot(opts: { app?: string; windowTitle?: string }): Promise<ScreenshotResult>;
  click(opts: { x: number; y: number; captureId: string }): Promise<void>;
  typeText(text: string): Promise<void>;
  keyPress(key: string, modifiers?: Modifier[]): Promise<void>;
  scroll(direction: 'up'|'down'|'left'|'right', amount: number, captureId?: string): Promise<void>;
  listWindows(bundleId?: string): Promise<WindowInfo[]>;
  getFrontmostWindow(): Promise<WindowInfo>;
  checkPermissions(): Promise<PermissionStatus>;
  shutdown(): Promise<void>;
}

export type Modifier = 'cmd' | 'opt' | 'ctrl' | 'shift';
```

Services depend only on this interface. `factory.ts` chooses the backend by `process.platform`; on unsupported platforms throws a clear setup error (no silent fallback).

### ServiceContext (lazy init, matches monorepo pattern)

```ts
export interface ServiceContext {
  readonly config: Config;
  readonly bridge: NativeBridge;
  readonly screenshot: ScreenshotService;
  readonly input: InputService;
  readonly window: WindowService;
  readonly wait: WaitService;
  readonly safety: SafetyService;
  readonly audit: AuditService;
  readonly permission: PermissionService;
}
```

## 4. Tool surface (v1)

| Tool | Kind | Gated by | Notes |
|---|---|---|---|
| `screenshot` | read | redaction (no allowlist) | Returns `{ capture_id, png_base64, window_info, scale }`. `capture_id` anchors coord-bound follow-ups. Reads are never allowlist-gated — the allowlist restricts actions, not observation. Sensitive-app content still passes through the redaction pipeline. |
| `click` | write | allowlist, rate-limit | Required: `x`, `y`, `capture_id`. If `capture_id` is stale, reject. |
| `type_text` | write | allowlist, rate-limit, secret-scan | Rejects obvious secrets with a structured error. |
| `key_press` | write | allowlist, rate-limit | `key` + optional `modifiers` array. Named keys only (no raw keycodes). |
| `scroll` | write | allowlist, rate-limit | `direction`, `amount`, optional `capture_id` to scope. |
| `wait` | neutral | rate-limit | Pause + auto-refresh screenshot. Returns fresh `capture_id`. |
| `list_windows` | read | — | Visible windows with title, bundle ID, pid, frame. |
| `get_frontmost_window` | read | — | Current frontmost app + window. Safe default before any action. |
| `check_permissions` | read | — | AX + Screen Recording status. For agent self-diagnosis. |

`READONLY=1` mode registers only: `screenshot`, `list_windows`, `get_frontmost_window`, `check_permissions`. Write tools are never exposed to the client — the agent literally cannot see them.

All parameter descriptions use `descWithExamples()` (same helper pattern as `mcp-consultant-tools/core`) with 2–4 concrete examples per complex field.

## 5. Safety model

### Flag reference

| Feature | Default | Env var | Values |
|---|---|---|---|
| Strict-AX mode | ON | `MCP_CU_STRICT_AX` | `0` disables; any non-zero or unset = ON |
| Per-app allowlist | ON, default list | `MCP_CU_ALLOWED_APPS` / `MCP_CU_ALLOW_ALL` | Comma-separated bundle IDs; `ALLOW_ALL=1` bypasses |
| Audit log | ON | `MCP_CU_AUDIT_LOG` / `MCP_CU_AUDIT_PATH` | `0` disables; path overrides location |
| Rate limit | ON, 250ms | `MCP_CU_RATE_LIMIT_MS` | Integer ms; `0` disables |
| Type-text secret scan | ON | `MCP_CU_SECRET_SCAN` | `0` disables |
| Sensitive-app redaction | ON | `MCP_CU_REDACT` | `0` disables |
| Confirm-before-act | OFF | `MCP_CU_CONFIRM` | `1` enables |
| Read-only mode | OFF | `MCP_CU_READONLY` | `1` enables |
| Profile preset | — | `MCP_CU_PROFILE` | `stealth` / `permissive` / `readonly` / `confirm` (sugar for flag combinations) |

**Default allowlist:** `md.obsidian, com.apple.finder, com.apple.systempreferences, com.mitchellh.ghostty, dev.cmux.app, com.figma.Desktop`. Extend via `MCP_CU_ALLOWED_APPS`.

**Profile presets** (set flags in bulk; explicit flags still win):

| Profile | Expands to |
|---|---|
| `stealth` (= default, no env needed) | Strict-AX ON, allowlist ON, audit ON, rate-limit 250ms, secret-scan ON, redact ON, confirm OFF, readonly OFF |
| `permissive` | `ALLOW_ALL=1`, `STRICT_AX=0`, audit ON, secret-scan ON, redact OFF, confirm OFF |
| `readonly` | `READONLY=1`, allowlist ON, audit ON |
| `confirm` | `stealth` + `CONFIRM=1` |

### Safety pipeline (every write-tool)

```
tool handler
  ├→ safety.assertAllowed(targetBundleId)     # allowlist (skipped in permissive)
  ├→ safety.rateLimit()                        # 250ms gap
  ├→ safety.scanForSecrets(text)               # type_text only
  ├→ audit.logBeforeDispatch(tool, params-redacted)
  ├→ bridge.doAction(...)                      # may return screenshot
  ├→ safety.redactScreenshot(result, app)      # if sensitive + redact ON
  └→ audit.logAfterDispatch(result-summary)
```

### Audit log

- Path: `~/.local/state/mcp-computer-use/audit.log` (configurable).
- Format: JSONL, one event per line. Fields: `ts`, `tool`, `target` (bundle ID + window title + pid), `params` (redacted), `strategy` (`ax` / `cg`), `result` (`ok` / `error`), `error_code`, `duration_ms`.
- Rotation: daily, `audit-YYYY-MM-DD.log`, keep 30 days.
- Params redaction: `type_text.text` replaced with `[redacted, len=N, sha256-prefix=XXXX]`.

### Sensitive-app redaction

- Bundle ID set (extensible via `MCP_CU_REDACT_APPS`):
  - `com.apple.mail`, `com.tinyspeck.slackmacgap`, `com.apple.MobileSMS`, `com.1password.1password8`, `com.apple.keychainaccess`
- Region maps live in `src/services/redaction-regions.ts` (simple JSON). Per-app rectangles in logical coords; Swift applies Gaussian blur before PNG encode. Start with simple "blur the whole window body, show title bar only" for unknown sensitive windows.
- Redaction happens Swift-side for zero-dependency speed (no `sharp` install).

### Type-text secret scan

Regexes reject on match, returning structured error `{ code: "SECRET_DETECTED", pattern: "..." }`:
- `sk-[a-zA-Z0-9]{20,}` (OpenAI / Anthropic-style)
- `ghp_[a-zA-Z0-9]{36}` (GitHub PAT)
- `AKIA[0-9A-Z]{16}` (AWS access key)
- `xoxb-[0-9a-zA-Z-]+` (Slack bot token)
- `[A-Za-z0-9+/]{40,}={0,2}` (long base64, likely token) — tune threshold with a `--min-entropy` bit later

### Rate limit

- Token bucket, 1 token per `MCP_CU_RATE_LIMIT_MS` ms, burst = 1.
- Applied only to write tools + `wait`. Reads are unthrottled.
- On hit: wait `remainingMs`, then proceed. No rejection; just serialization.

## 6. IPC protocol (Node ↔ Swift helper)

Seeded from upstream, owned and extended here. Node spawns the helper binary, sends newline-delimited JSON requests on stdin, receives newline-delimited JSON responses on stdout. One request at a time (serialized by Node side). **Command names are camelCase (matches the Swift helper as authored).** Extensions (`keyPress`, `scroll`, `shutdown`, …) are introduced as needed.

Request shape (simplified):
```json
{ "id": "uuid", "cmd": "click", "args": { "x": 123, "y": 456 } }
```

Response shape:
```json
{ "id": "uuid", "ok": true, "data": { ... } }
```
or
```json
{ "id": "uuid", "ok": false, "error": { "code": "PERM_DENIED", "message": "..." } }
```

Node-side `MacosBridge` owns the process lifecycle: spawn on first call, keep warm, shutdown on server stdio close.

## 7. Release pipeline

### Versioning
- Start at `0.1.0-beta.1`. `npm version prerelease --preid=beta` for iteration.
- Promote with `npm dist-tag add @mcp-consultant-tools/computer-use@X.Y.Z latest`.
- Semver: breaking changes to tool shape or env-var names = major bump.

### Publish flow
- Pre-publish: `npm run build` → `npm pack` → smoke-test the tarball with `npx ./tarball.tgz`.
- `npm publish --tag beta`.
- User testing required before latest-tag promotion.

### Binary distribution
- **No prebuilt binaries shipped.** Compile from source on install.
- `postinstall` → `scripts/setup-helper.mjs`:
  1. Detect platform; macOS → continue, else → warn + no-op.
  2. Check for `xcrun` (Xcode Command Line Tools). If missing, print install command and exit 0 (non-fatal so npm install doesn't hard-fail).
  3. Run `scripts/build-native.mjs` → `xcrun swiftc` compile to `~/.mcp-computer-use/bridge`.
  4. `chmod +x` the binary.
  5. Call `check_permissions` equivalent; print AX + Screen Recording status with macOS settings deep-link if not granted.
- Binary installed to `~/.mcp-computer-use/bridge` (not `/usr/local/bin`; no sudo).

### MCP server registration

```json
{
  "mcpServers": {
    "computer-use": {
      "command": "npx",
      "args": ["-y", "--package=@mcp-consultant-tools/computer-use@beta", "mcp-cu"],
      "env": {
        "MCP_CU_ALLOWED_APPS": "md.obsidian,com.apple.finder,dev.cmux.app,com.figma.Desktop"
      }
    }
  }
}
```

### CLI

```
mcp-cu-cli [--json] [--env-file <path>] <command> [args]

Commands:
  screenshot [--app <bundle-id>] [--window <title>]
  click <x> <y> --capture-id <id>
  type-text <text>
  key-press <key> [--modifiers cmd,shift]
  scroll <direction> <amount> [--capture-id <id>]
  wait [--ms <n>]
  list-windows [--app <bundle-id>]
  get-frontmost-window
  check-permissions
```

Output: summary to stdout; full JSON cached to `.context/.mcp-cu-cache/`.

### Binary mapping

| Binary | Purpose |
|---|---|
| `mcp-cu` | MCP server (stdio) |
| `mcp-cu-cli` | CLI |

## 8. Attribution + licensing

- `LICENSE`: MIT with both copyright holders:
  - `Copyright (c) 2026 Zane Chee` (upstream, original author of the Swift seed)
  - `Copyright (c) 2026 Klemens Stelk` (this project)
- `NOTICE`: credits the upstream as the seed, makes clear this project extends and owns the file now, and does not promise wire compatibility.
- README "Acknowledgements" section: one paragraph explaining what was seeded and why.
- Keep upstream license headers in the seeded file for continuity.

## 9. Upstream relationship

- **No auto-sync, no wire-compat commitment.** The file started as a copy of upstream commit `96434a7` and is extended here as agent needs evolve.
- We may pull individual fixes from upstream ad hoc, but the protocol, command surface, and response shapes are owned here going forward.

## 10. Windows v2 sketch (informational)

Not part of v1 implementation. Documented so v1 abstractions are built in the right shape.

- `native/windows/` with either:
  - **C# (.NET)** — idiomatic UI Automation access via `System.Windows.Automation` + `Windows.Graphics.Capture` for screenshots. Requires `dotnet publish` in `build-native.mjs`.
  - **Rust** — `windows-rs` crate for UIA + Graphics Capture. Single static binary, no runtime.
- `src/native/windows-bridge.ts` wraps the binary with the same JSON-over-stdio protocol.
- `factory.ts` adds a `case 'win32'` branch.
- Stealth mode = UIA `InvokePattern` (no cursor takeover). Non-stealth = `SendInput`.
- Allowlist uses AppUserModelID instead of bundle ID.

## 11. Open items tracked for implementation

None blocking. These are surface-level:

- Confirm exact bundle IDs on this machine for the default allowlist (`mdls -name kMDItemCFBundleIdentifier`). Bundle IDs above are best-guesses; verify during setup.
- `cmux` bundle ID: `dev.cmux.app` is a guess. Confirm against running app.
- Default redaction regions: start with "entire window body" for the sensitive set; refine with specific regions per-app over time as real usage surfaces what matters.

## 12. Success criteria for v1

- `screenshot Obsidian` from CLI returns a PNG in <1s.
- Agent can: screenshot Obsidian → click a file in sidebar → screenshot result → verify it opened. End-to-end.
- `MCP_CU_READONLY=1` truly hides write tools (verify via MCP inspector).
- `type_text "sk-fake..."` is rejected with `SECRET_DETECTED`.
- Clicking an app not on the allowlist is rejected with `APP_NOT_ALLOWED` + the offending bundle ID.
- Audit log records every action with timestamp + redacted params.
- `npx -y --package=@mcp-consultant-tools/computer-use@beta mcp-cu` works end-to-end on a fresh M1 with Xcode CLT installed.

---

## Decisions log

- 2026-04-22: Standalone repo (not monorepo package).
- 2026-04-22: Mac v1 with `NativeBridge` abstraction; Windows v2 as additive work.
- 2026-04-22: Full spec in v1 (core + extensions + full safety layer incl. redaction).
- 2026-04-22: Env-only config + `PROFILE` presets (no per-call overrides).
- 2026-04-22: Tool-registration filter for READONLY (write tools never exposed).
- 2026-04-22: npm scope `@mcp-consultant-tools/computer-use`.
- 2026-04-22: Public GitHub repo.
- 2026-04-22: ~~Copy-with-attribution for Swift helper (not fork-with-history).~~ **Superseded** — see 2026-04-22b.
- 2026-04-22: No prebuilt binaries — compile from source on install.
- **2026-04-22b: Swift helper is derived-from-and-owned-here, NOT wire-compatible-with-upstream.** During implementation we discovered the upstream helper does not implement `keyPress` or `scroll` (critical v1 tools). The original "copy-with-attribution, preserve wire compat" call traded extensibility for cheap upstream diffs — the wrong trade for a greenfield MCP server whose entire purpose is full computer control. The file is now OUR code: we extend it as needed (keyPress, scroll, shutdown, richer listWindows) and drop the auto-sync commitment. Attribution to Zane Chee remains; divergence is expected.
