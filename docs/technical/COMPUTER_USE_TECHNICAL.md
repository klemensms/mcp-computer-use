# mcp-computer-use — Technical Reference

<overview>
`@mcp-consultant-tools/computer-use` is a macOS-only MCP server that gives any MCP client
(primarily Claude Code) semantic control over native desktop applications — screenshot,
click, type, keypress, scroll, window enumeration — via the macOS Accessibility API (AX)
and ScreenCaptureKit. The Node/TypeScript server talks to a tiny Swift helper over
newline-delimited JSON on stdio; the helper is the only platform-specific surface and is
swapped out behind a `NativeBridge` interface so Windows can slot in as a v2 addition
without touching the MCP layer.

A default-secure safety layer wraps every write action: per-app bundleId allowlist,
250ms rate limit, `type_text` secret scanning, JSONL audit log, and four PROFILE
presets (`stealth` / `permissive` / `readonly` / `confirm`). The agent cannot escalate
at call-time — all behaviour is env-driven.

As of v0.2.0, the Swift helper at `native/macos/Sources/McpComputerUseHelper/`
is a thin (~620-line) wrapper over
[`BackgroundComputerUseKit`](https://github.com/actuallyepic/background-computer-use)
(MIT © cam + anupam, dubdubdub labs), consumed via SwiftPM and pinned by
commit SHA in `native/macos/Package.swift`. The wrapper translates upstream's
Swift API into this project's existing JSON-over-stdio wire protocol — the
wire shape is unchanged from v0.1, so `src/native/macos-bridge.ts` and the
TypeScript safety/audit layer are untouched. See `NOTICE` for attribution and
[`UPSTREAM_SYNC.md`](../../UPSTREAM_SYNC.md) for the bump ritual.

Earlier releases (v0.1.x) shipped a vendored helper seeded from
[`injaneity/pi-computer-use`](https://github.com/injaneity/pi-computer-use);
the v0.2.0 release notes document the swap. The wrapper preserves the wire
shape verbatim, which is why the migration was opaque to MCP clients.

Design spec: [`docs/superpowers/specs/2026-04-22-mcp-computer-use-design.md`](../superpowers/specs/2026-04-22-mcp-computer-use-design.md).
</overview>

<architecture>

## Layering

```
  ┌─────────────────────────┐
  │ MCP client              │   Claude Code / MCP Inspector / Pi / etc.
  │ (Claude Code)           │
  └───────────┬─────────────┘
              │  stdio (MCP protocol)
              ▼
  ┌─────────────────────────┐
  │ mcp-cu (Node)           │   src/index.ts — MCP server
  │                         │   src/tools/*    thin MCP wrappers
  │                         │   src/services/* business logic + safety
  │                         │   src/native/*   NativeBridge + macOS impl
  └───────────┬─────────────┘
              │  stdio (newline-delimited JSON, unchanged from v0.1)
              ▼
  ┌─────────────────────────┐
  │ McpComputerUseHelper    │   native/macos/Sources/McpComputerUseHelper/
  │ (Swift wrapper, ~620L)  │   (compiled to ~/.mcp-computer-use/bridge
  │                         │    via `swift build`)
  │   main.swift            │   NDJSON stdio loop
  │   ProtocolBridge.swift  │   cmd dispatch + DTO translation + caches
  │   LocalScroll.swift     │   CGEvent scroll (legacy, local-only)
  │   ErrorMapping.swift    │   upstream errors → our error codes
  └───────────┬─────────────┘
              │  direct Swift API calls
              ▼
  ┌─────────────────────────┐
  │ BackgroundComputerUseKit│   SwiftPM dependency, pinned by SHA
  │  - AX projected tree    │   (see UPSTREAM_SYNC.md)
  │  - ScreenCaptureKit     │
  │  - CGEvent / CGWindow   │
  │  - read-act-read verifier│
  └─────────────────────────┘
```

## Source layout

- **`src/index.ts`** — MCP server entry point (stdio transport). Wires
  `registerAllTools(server, ctx)` with a lazy `ServiceContext`.
- **`src/cli.ts`** — Commander entry point for `mcp-cu-cli`. Shares the same
  `ServiceContext` factory as the MCP server.
- **`src/context-factory.ts`** — `createServiceContext(config)` — single source of
  truth that constructs the bridge + all services. Used by both MCP + CLI.
- **`src/config.ts`** — Env → `Config`. PROFILE presets expand to flag combinations
  here; explicit flags still win.
- **`src/native/bridge-interface.ts`** — `NativeBridge` contract
  (screenshot, click, typeText, keyPress, scroll, listWindows, getFrontmostWindow,
  checkPermissions, shutdown).
- **`src/native/macos-bridge.ts`** — Spawns `~/.mcp-computer-use/bridge`, manages the
  stdio JSON conversation, owns capture-state (the `capture_id` → bounds map used to
  reject stale clicks). Capture-state is bounded to the ~20 most recent entries.
- **`src/native/factory.ts`** — Picks the backend by `process.platform`. Throws a
  clear setup error on unsupported platforms (no silent fallback).
- **`src/services/*`** — business logic. `screenshot-service`, `input-service`
  (click/type_text/key_press/scroll), `window-service`, `wait-service`,
  `safety-service`, `audit-service`, `permission-service`.
- **`src/tools/*`** — thin MCP tool registrations. `registerAllTools` honours
  `READONLY` (write tools are skipped at registration time, not exposed to the
  client) and the active PROFILE.
- **`src/cli/commands/*`** — Commander commands that wrap the same services. CLI
  parity is enforced: every MCP tool has a matching CLI subcommand.
- **`native/macos/Package.swift`** — SwiftPM manifest. Declares
  `BackgroundComputerUseKit` as a dependency, pinned by full commit SHA.
- **`native/macos/Sources/McpComputerUseHelper/`** — the Swift wrapper.
  - `main.swift` — NDJSON stdio loop; reads request lines, dispatches to
    `ProtocolBridge.handle`, writes `{id, ok, result|error}` lines back.
  - `ProtocolBridge.swift` — command dispatch + DTO translation. Holds the
    in-memory `windowNumber → windowID` and `windowID → stateToken` caches
    that bridge our wire-shape's `windowId: UInt32` to upstream's
    `windowID: String`.
  - `LocalScroll.swift` — CGEvent-based scroll (lifted from the v0.1
    helper). Upstream's `scroll(_:)` requires a semantic target, so v0.2
    keeps a local impl until v0.3.0 surfaces semantic targeting.
  - `ErrorMapping.swift` — substring heuristics that translate upstream's
    package-internal error types into our public error codes. Heuristic
    because upstream's error enums are not `public`.

</architecture>

<tools>

All parameter descriptions are generated via `descWithExamples()` (same helper
pattern as `@mcp-consultant-tools/core`) with 2–4 concrete examples per complex
field. The Zod schemas live in `src/tools/*-tools.ts`.

## `screenshot` (read)

Capture a PNG of an app or a specific window. Returns an anchor (`capture_id`) that
is required by follow-up `click` / `scroll` calls — the bridge validates that the
screen state matches what the agent saw.

**Parameters**
- `app?` — bundle ID (e.g. `com.apple.calculator`). Optional; if omitted,
  captures the frontmost app.
- `windowTitle?` — exact window title string. Pairs with `app`.

**Returns** — two MCP content blocks: a JSON `text` block, and an `image`
block with the PNG (mime `image/png`). The text block:

```json
{
  "capture_id": "cap_8f2a1c9e",
  "target": {
    "appName": "Calculator",
    "bundleId": "com.apple.calculator",
    "pid": 42881,
    "windowTitle": "Calculator",
    "windowId": 12345
  },
  "size": { "width": 600, "height": 800, "scale": 2 }
}
```

Note the mixed casing: `capture_id` is snake_case (carried over from the
original v0.1 input/output convention for that field) while everything
else is camelCase. `WindowInfo`-shaped fields (`bundleId`, `windowTitle`,
`appName`, `windowId`) are camelCase throughout the v0.2 wire shape.

**Examples**

```json
{ "name": "screenshot", "arguments": { "app": "com.apple.calculator" } }
```

```json
{ "name": "screenshot", "arguments": { "app": "md.obsidian", "windowTitle": "Daily Note" } }
```

```json
{ "name": "screenshot", "arguments": {} }
```

**Errors**
- `app_not_found` — bundle ID isn't running.
- `window_not_found` — `windowTitle` didn't match.
- `PERM_DENIED` — Screen Recording permission not granted.

## `click` (write)

Send a mouse click at screenshot-pixel coordinates. **Always** pass the
`capture_id` from the screenshot the agent just saw — clicks without a valid,
fresh capture are rejected.

**Parameters**
- `x`, `y` — integers, in screenshot pixel space (not CG points).
- `capture_id` — anchor from a prior `screenshot` call.

**Returns** `{ "ok": true }`.

**Examples**

```json
{ "name": "click", "arguments": { "x": 50, "y": 180, "capture_id": "cap_8f2a1c9e" } }
```

```json
{ "name": "click", "arguments": { "x": 220, "y": 400, "capture_id": "cap_8f2a1c9e" } }
```

**Errors**
- `stale_capture_id` — capture aged out (keep last ~20) or the target window
  moved/closed since capture. Take a fresh screenshot.
- `APP_NOT_ALLOWED` — the window under the click belongs to a bundle ID that's
  not on the allowlist.
- `RATE_LIMITED` — serialised automatically (waits the remaining gap); surfaced
  only if the bridge is saturated.

## `type_text` (write)

Type a string into the frontmost editable field of the allowlisted app.

**Parameters**
- `text` — the string to type.

**Returns** `{ "ok": true }`.

**Examples**

```json
{ "name": "type_text", "arguments": { "text": "Hello, world" } }
```

```json
{ "name": "type_text", "arguments": { "text": "My meeting notes for 2026-04-22" } }
```

**Errors**
- `SECRET_DETECTED` — content matched a secret pattern. See the safety model
  below. If false-positive, set `MCP_CU_SECRET_SCAN=0`.
- `APP_NOT_ALLOWED` — frontmost app not on allowlist.

## `key_press` (write)

Send a single keystroke, optionally with modifiers.

**Parameters**
- `key` — one of:
  - Named keys: `return`, `escape`, `tab`, `space`, `delete`, `up`, `down`,
    `left`, `right`, `home`, `end`, `pageup`, `pagedown`, `f1`–`f12`.
  - Single chars: `a`–`z`, `0`–`9`.
- `modifiers?` — array of `cmd`, `opt` (alias `alt`), `ctrl`, `shift`, or
  `fn` (secondary fn layer).

**Returns** `{ "ok": true }`.

**Examples**

```json
{ "name": "key_press", "arguments": { "key": "return" } }
```

```json
{ "name": "key_press", "arguments": { "key": "s", "modifiers": ["cmd"] } }
```

```json
{ "name": "key_press", "arguments": { "key": "tab", "modifiers": ["cmd", "shift"] } }
```

**Errors**
- `APP_NOT_ALLOWED`
- `invalid_key` — unsupported key name.

## `scroll` (write)

Emit `.line`-unit `CGScrollWheel` events.

**Parameters**
- `direction` — `up` / `down` / `left` / `right`.
- `amount` — integer ticks (1 tick ≈ 1 line).
- `capture_id?` — optional, scopes the scroll to the captured window's frame.

**Returns** `{ "ok": true }`.

**Examples**

```json
{ "name": "scroll", "arguments": { "direction": "down", "amount": 3 } }
```

```json
{ "name": "scroll", "arguments": { "direction": "up", "amount": 10, "capture_id": "cap_8f2a1c9e" } }
```

**Errors**
- `APP_NOT_ALLOWED`
- `stale_capture_id` — only if `capture_id` was provided.

## `wait` (neutral)

Pause and auto-refresh: waits, takes a fresh screenshot of the currently
frontmost window, and returns a new `capture_id`. Useful after triggering an
action that has async UI settling time.

**Parameters**
- `ms?` — integer milliseconds. Default 500.

**Returns** same shape as `screenshot`.

**Examples**

```json
{ "name": "wait", "arguments": { "ms": 1000 } }
```

## `list_windows` (read)

List visible windows across the system, optionally filtered by bundle ID.

**Parameters**
- `bundleId?` — filter to a single app.

**Returns** `WindowInfo[]` — each entry has the full set of fields
emitted by `mapWindowItem` in `src/native/macos-bridge.ts`:

```json
[
  {
    "appName": "Calculator",
    "bundleId": "com.apple.calculator",
    "pid": 42881,
    "windowId": 12345,
    "title": "Calculator",
    "isFrontmost": true,
    "isMinimized": false,
    "isOnscreen": true,
    "frame": { "x": 0, "y": 38, "width": 300, "height": 400 }
  }
]
```

`isFrontmost` is derived from upstream's `isFocused || isMain`. The
no-filter call mode misattributes `pid`/`bundleId` to the frontmost app
across all entries (carried over from v0.1; slated for v0.3.0). Pass
`bundleId` explicitly for correct attribution.

**Examples**

```json
{ "name": "list_windows", "arguments": {} }
```

```json
{ "name": "list_windows", "arguments": { "bundleId": "md.obsidian" } }
```

## `get_frontmost_window` (read)

Return the frontmost app's front window as a composed `WindowInfo`. Internally
calls `listWindows(pid)` to enrich the NSWorkspace frontmost-app result with
window frame/title.

**Parameters** none.

**Returns** `WindowInfo` (same shape as `list_windows` items).

**Examples**

```json
{ "name": "get_frontmost_window", "arguments": {} }
```

## `check_permissions` (read)

Agent self-diagnosis. Reports whether the helper binary has the two macOS
permissions it needs.

**Parameters** none.

**Returns**

```json
{ "accessibility": true, "screenRecording": false }
```

**Examples**

```json
{ "name": "check_permissions", "arguments": {} }
```

</tools>

<safety-model>

## Flag reference

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
| Profile preset | — | `MCP_CU_PROFILE` | `stealth` / `permissive` / `readonly` / `confirm` |

## Profile presets

Presets set flags in bulk. Explicit env flags still win over presets.

| Profile | Expands to |
|---|---|
| `stealth` (= default) | Strict-AX ON, allowlist ON, audit ON, rate-limit 250ms, secret-scan ON, redact ON, confirm OFF, readonly OFF |
| `permissive` | `ALLOW_ALL=1`, `STRICT_AX=0`, audit ON, secret-scan ON, redact OFF |
| `readonly` | `READONLY=1`, allowlist ON, audit ON |
| `confirm` | `stealth` + `CONFIRM=1` |

## Pipeline

```
  MCP tool handler
    │
    ├─ safety.assertAllowed(bundleId)    # allowlist — skipped in permissive
    │                                    # throws APP_NOT_ALLOWED on miss
    │
    ├─ safety.rateLimit()                # 250ms default gap; serialises, no reject
    │
    ├─ safety.scanForSecrets(text)       # type_text only
    │                                    # throws SECRET_DETECTED on match
    │
    ├─ audit.logBeforeDispatch(tool, params-redacted)
    │
    ├─ bridge.doAction(...)              # may return a screenshot
    │
    ├─ safety.redactScreenshot(result)   # if target app is sensitive + redact ON
    │                                    # (v1: Swift stub; v1.1 pipeline)
    │
    └─ audit.logAfterDispatch(summary)
```

## Default allowlist

Bundle IDs:

- `md.obsidian`
- `com.apple.finder`
- `com.apple.systempreferences`
- `com.mitchellh.ghostty`
- `dev.cmux.app`
- `com.figma.Desktop`
- `com.apple.calculator`

Extend via `MCP_CU_ALLOWED_APPS` (comma-separated). `MCP_CU_ALLOW_ALL=1`
bypasses entirely (discouraged — prefer being explicit).

## Audit log

- Path: `~/.local/state/mcp-computer-use/audit.log` (overridable via
  `MCP_CU_AUDIT_PATH`).
- Format: JSONL, one line per event.
- Fields: `ts`, `tool`, `target` (bundle ID + window title + pid),
  `params` (redacted), `strategy` (`ax` / `cg`), `result` (`ok` / `error`),
  `error_code`, `duration_ms`.
- Rotation: daily, `audit-YYYY-MM-DD.log`, keep 30 days.
- `type_text.text` is replaced with
  `[redacted, len=N, sha256-prefix=XXXX]` — never stored verbatim.

## Type-text secret scan

Regexes reject on match:

- `sk-[a-zA-Z0-9]{20,}` — OpenAI / Anthropic-style API keys
- `ghp_[a-zA-Z0-9]{36}` — GitHub Personal Access Token
- `AKIA[0-9A-Z]{16}` — AWS access key ID
- `xoxb-[0-9a-zA-Z-]+` — Slack bot token
- `[A-Za-z0-9+/]{40,}={0,2}` — long base64 (likely token)

Error shape: `{ "code": "SECRET_DETECTED", "pattern": "sk-..." }`.

If false-positive (e.g. a long English string that happens to match base64),
`MCP_CU_SECRET_SCAN=0` disables the check for the whole session.

## Error shapes (quick reference)

| Code | Raised by | Meaning |
|---|---|---|
| `APP_NOT_ALLOWED` | allowlist | Target bundle ID not on the allowlist. |
| `SECRET_DETECTED` | secret scan | `type_text` text matched a secret regex. |
| `stale_capture_id` | bridge | Capture aged out or target window changed. |
| `RATE_LIMITED` | rate limit | Bridge saturated beyond `RATE_LIMIT_MS`. |
| `READONLY_MODE` | registration | Never raised at runtime — write tools aren't registered in the first place. |
| `PERM_DENIED` | bridge | AX or Screen Recording permission missing. |

</safety-model>

<ipc-protocol>

Newline-delimited JSON on stdin/stdout. One request at a time; Node serialises
the conversation.

## Request

```json
{ "id": "uuid", "cmd": "click", "args": { "x": 123, "y": 456 } }
```

## Response (success)

```json
{ "id": "uuid", "ok": true, "result": { "...": "..." } }
```

## Response (failure)

```json
{ "id": "uuid", "ok": false, "error": { "code": "PERM_DENIED", "message": "..." } }
```

## Swift command surface

Exposed by `ProtocolBridge.handle` in the wrapper. Command names are
camelCase, matching v0.1 verbatim — wire shape preserved across the
v0.2.0 swap.

| Wrapper cmd        | Backed by                                               |
|--------------------|---------------------------------------------------------|
| `checkPermissions` | upstream `permissions()` (drilled through `.granted`)   |
| `listApps`         | upstream `listApps()`, filtered to `activationPolicy == "regular"` |
| `listWindows`      | upstream `listWindows(.init(app: bundleID))` (per-app iteration when no filter) |
| `getFrontmost`     | composite: `listApps()` → `frontmostApp` → `listWindows(...)` → window-scoring heuristic |
| `screenshot`       | upstream `getWindowState(.init(window: windowID, imageMode: .base64))` |
| `mouseClick`       | upstream `click(.init(window:, x:, y:, stateToken:))` (cached stateToken from prior screenshot) |
| `typeText`         | upstream `typeText(.init(window: <frontmost>, text:))` |
| `keyPress`         | upstream `pressKey(.init(window: <frontmost>, key: "cmd+shift+s"))` |
| `scroll`           | **local-only** — CGEvent via `LocalScroll.swift` (upstream requires semantic target) |
| `shutdown`         | **local-only** — replies `{ok: true}` then `exit(0)` after 25ms |

The wrapper maintains two in-memory caches keyed off responses:
- `windowNumber → windowID` — populated by every listWindows / getWindowState
  response; lets clients refer to windows by our compact `windowId: UInt32`.
- `windowID → stateToken` — populated by getWindowState + every action
  response (`postStateToken`); lets the next click/typeText/pressKey carry
  a fresh stateToken without an extra round-trip.

Neither cache is exposed through the wire protocol.

Upstream's higher-quality primitives (semantic targeting, AX projected tree,
verifier classification, window motion, `set_value`,
`perform_secondary_action`) are reachable through the kit but **not
currently surfaced** as MCP tools — v0.3.0 work, tracked in
[`docs/superpowers/plans/2026-04-29-expose-new-capabilities.md`](../superpowers/plans/2026-04-29-expose-new-capabilities.md).

## Process lifecycle

`MacosBridge` in `src/native/macos-bridge.ts` spawns the helper lazily on first
call, keeps it warm for the server's lifetime, and sends a `shutdown` request
when the MCP stdio connection closes (or on SIGTERM).

</ipc-protocol>

<cli-architecture>

Every MCP tool has a matching CLI command. The CLI shares the same
`ServiceContext` factory as the MCP server — identical behaviour, identical
safety pipeline.

## Binary

`mcp-cu-cli` — exposed via `package.json` `bin` field.

## Command groups

- **`permission`** — `check-permissions`
- **`window`** — `list-windows`, `get-frontmost-window`
- **`screenshot`** — `screenshot`
- **`input`** — `click`, `type-text`, `key-press`, `scroll`
- **`wait`** — `wait`

## Global flags

Matches `@mcp-consultant-tools/core` CLI convention:

- `--json` — emit full JSON to stdout (instead of summary).
- `--no-cache` — skip writing to the cache dir.
- `--env-file <path>` — load env from a `.env` file.
- `--mcp-config <path>` — load config from an MCP config JSON (for picking up
  env from `.mcp.json` style files).
- `--mcp-server <name>` — which server entry to read from `--mcp-config`.

## Cache dir

`~/.claude/.context/mcp-cu-cache/` — per the `@mcp-consultant-tools/core`
convention. Large responses (screenshots, long `list_windows` results) are
written here and summarised on stdout.

## Example workflow

```bash
# Check permissions first
mcp-cu-cli check-permissions

# Take a screenshot, capture the ID from the output
mcp-cu-cli screenshot --app com.apple.calculator --out calc.png
# → { "capture_id": "cap_abc12345", "out": "calc.png", ... }

# Click a button using the capture
mcp-cu-cli click 50 50 --capture-id cap_abc12345

# Send a key
mcp-cu-cli key-press c

# Scroll
mcp-cu-cli scroll down 3
```

</cli-architecture>

<troubleshooting>

| Symptom | Fix |
|---|---|
| `Swift helper not installed at ~/.mcp-computer-use/bridge` | Run `npm run build:native` (or re-run the postinstall). Requires full Xcode (not just Xcode CLT): install from the App Store and run `xcode-select -s /Applications/Xcode.app`. |
| `Failed to start mcp-computer-use` / AX errors on first call | System Settings → Privacy & Security → Accessibility **and** Screen Recording → add and enable `~/.mcp-computer-use/bridge`. Both are required. After a v0.2.0 upgrade, grants usually persist (granted-by-path), but if not, remove and re-add the binary in both panes. |
| `APP_NOT_ALLOWED: com.some.app` | Add the bundle ID to `MCP_CU_ALLOWED_APPS` (preferred), or `MCP_CU_ALLOW_ALL=1` (discouraged), or `MCP_CU_PROFILE=permissive`. |
| `SECRET_DETECTED` on a string you know is safe | The text matched one of the regexes (likely the long-base64 catch-all). Set `MCP_CU_SECRET_SCAN=0` for the session, or rewrite the string. |
| `stale_capture_id` | Take a fresh `screenshot` before the next `click` / `scroll`. Capture IDs age out — the bridge keeps ~20 most recent. |
| Helper build fails with `error: unknown command 'build'` from `swift` | The system `swift` is the CLT shim, not the full Xcode toolchain. Install Xcode and run `xcode-select -s /Applications/Xcode.app`. |
| `swift package update` fails with network/auth errors | Upstream is hosted on GitHub. Verify network access; for private mirrors, set `GIT_TERMINAL_PROMPT=0` and ensure your SSH key is loaded. |
| Nothing happens, no error | Check `~/.local/state/mcp-computer-use/audit.log` — actions are recorded even when the target app swallows them silently. |
| `list_windows` shows all windows under one app's pid/bundleId | Pre-existing limitation in v0.2 (carried over from v0.1). Pass `bundleId` explicitly to scope the call. Slated for v0.3.0; see the v0.2.0 release notes. |

</troubleshooting>

<limits>

Known limitations (tracked for v0.3.0 / v1.1 / v2):

- **`list_windows` no-filter pid/bundleId misattribution.** When called
  without a `bundleId` filter, all returned windows display under the
  frontmost app's pid/bundleId. Pre-existing in v0.1; carried into v0.2
  unchanged because the swap preserved wire shape verbatim. Pass
  `bundleId` explicitly as a workaround. Cheap fix slated for v0.3.0
  (per-window pid emission in the wrapper).
- **Multi-instance pid heuristic.** `listWindows(bundleId)` attributes all
  returned windows to one pid even when an app spawns multiple top-level
  processes (e.g. Chrome). v0.3.0 will surface upstream's per-window pid.
- **Sensitive-app redaction is a stub.** The redaction pipeline is wired
  end to end, but the helper-side blur is a no-op placeholder. A
  `redact_screenshot` step will ship in v1.1 with per-app region maps.
- **No drag, double-click, right-click, triple-click in v0.2.** v0.3.0
  adds drag and `perform_secondary_action` (right-click via AX); double-
  and triple-click remain unscoped.
- **macOS 14+ required.** Upstream's `Package.swift` declares
  `platforms: [.macOS(.v14)]`.
- **Full Xcode required for postinstall build.** `swift build` ships with
  Xcode, not with Xcode Command Line Tools alone.
- **No per-call flag overrides.** Behaviour is env-driven. An agent
  cannot escalate privileges mid-session.

</limits>

<roadmap>

## v0.3.0

Surface the upstream capabilities that the v0.2 SwiftPM swap unlocked:

- Semantic targeting (`click_target` by role+label).
- AX projected tree exposure (`get_window_tree`).
- Verifier classification on action responses.
- Window motion (`move_window`, `resize_window`, `drag`).
- `set_value`, `perform_secondary_action`.
- Per-window `pid`/`bundleId` fix (eliminates the listWindows
  no-filter misattribution).
- Signed `.app` bundle for TCC stability across rebuilds.
- Tagged-release pinning once upstream cuts tags.

Full plan: [`docs/superpowers/plans/2026-04-29-expose-new-capabilities.md`](../superpowers/plans/2026-04-29-expose-new-capabilities.md).

## v1.1 (deferred — original v0.1 backlog)

- Proper sensitive-app redaction pipeline (region maps + Gaussian blur
  Swift-side).
- `confirm` profile polish — wire a proper user-facing confirmation
  channel (currently the preset exists but falls back to audit-only).

## v2

- **Windows backend.** `native/windows/` with either Rust (`windows-rs`) or
  C# (.NET) — UIA + `Windows.Graphics.Capture`. Slots in behind the existing
  `NativeBridge` interface via a `case 'win32'` branch in `factory.ts`.
- `AppUserModelID`-based allowlist.
- Stealth mode = UIA `InvokePattern`; non-stealth = `SendInput`.

</roadmap>

<upgrading-upstream>

The Swift helper depends on
[`actuallyepic/background-computer-use`](https://github.com/actuallyepic/background-computer-use)
pinned by full commit SHA. To bump the pin:

1. Decide the target SHA (browse upstream's commit log or pull a local
   checkout).
2. Edit the `revision: "..."` field in `native/macos/Package.swift`.
3. Run `swift package update --package-path native/macos` to refresh
   `native/macos/Package.resolved`.
4. Run `npm run build:native && npm test` to validate.
5. Update the SHA reference in `NOTICE`.
6. Commit `Package.swift`, `Package.resolved`, and `NOTICE` together.

Full ritual including troubleshooting and the policy on tagged releases is
in [`UPSTREAM_SYNC.md`](../../UPSTREAM_SYNC.md).

</upgrading-upstream>
