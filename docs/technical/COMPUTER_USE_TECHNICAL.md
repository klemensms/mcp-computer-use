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

The Swift helper at `native/macos/bridge.swift` was seeded from
[injaneity/pi-computer-use](https://github.com/injaneity/pi-computer-use)
(MIT © Zane Chee, commit `96434a7`) and extended here with `keyPress`, `scroll`,
`shutdown`, and a richer `listWindows(bundleId:)`. This project owns the helper going
forward — see `NOTICE` and spec §8 revision 2026-04-22b. No wire-compat commitment
with upstream.

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
              │  stdio (newline-delimited JSON)
              ▼
  ┌─────────────────────────┐
  │ bridge (Swift)          │   native/macos/bridge.swift
  │  - AX API               │   (compiled to ~/.mcp-computer-use/bridge)
  │  - ScreenCaptureKit     │
  │  - CGEvent              │
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
- **`native/macos/bridge.swift`** — the Swift helper. Owned and extended here;
  seeded from upstream with attribution.

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

**Returns**
```json
{
  "capture_id": "cap_8f2a1c9e",
  "png_base64": "iVBORw0KGgo...",
  "window_info": {
    "title": "Calculator",
    "bundle_id": "com.apple.calculator",
    "pid": 42881,
    "frame": { "x": 0, "y": 38, "width": 300, "height": 400 }
  },
  "scale": 2
}
```

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

**Returns** `WindowInfo[]`.

```json
[
  {
    "title": "Calculator",
    "bundle_id": "com.apple.calculator",
    "pid": 42881,
    "frame": { "x": 0, "y": 38, "width": 300, "height": 400 }
  }
]
```

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

Currently exposed by `native/macos/bridge.swift`:

- `checkPermissions` — AX + Screen Recording status.
- `listApps` — all running applications.
- `listWindows` — optional `bundleId` or `pid` filter.
- `getFrontmost` — frontmost app only (not enriched).
- `screenshot` — capture app / window to PNG.
- `mouseClick` — `{x, y}` in screenshot pixel space.
- `typeText` — string into frontmost editable.
- `keyPress` — `{key, modifiers[]}`.
- `scroll` — `{direction, amount}`.
- `shutdown` — clean helper exit.
- AX helpers (not yet surfaced as MCP tools; v1.1): `axPressAtPoint`,
  `axDescribeAtPoint`, `axFindTextInput`, `axSetFocus`.

Command names are camelCase, matching the Swift helper as authored. Owned here;
no upstream wire-compat commitment (spec §8 revision 2026-04-22b).

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
| `Swift helper not installed at ~/.mcp-computer-use/bridge` | Run `npm run build:native` (or re-run the postinstall). Requires Xcode Command Line Tools: `xcode-select --install`. |
| `Failed to start mcp-computer-use` / AX errors on first call | System Settings → Privacy & Security → Accessibility **and** Screen Recording → add and enable `~/.mcp-computer-use/bridge`. Both are required. |
| `APP_NOT_ALLOWED: com.some.app` | Add the bundle ID to `MCP_CU_ALLOWED_APPS` (preferred), or `MCP_CU_ALLOW_ALL=1` (discouraged), or `MCP_CU_PROFILE=permissive`. |
| `SECRET_DETECTED` on a string you know is safe | The text matched one of the regexes (likely the long-base64 catch-all). Set `MCP_CU_SECRET_SCAN=0` for the session, or rewrite the string. |
| `stale_capture_id` | Take a fresh `screenshot` before the next `click` / `scroll`. Capture IDs age out — the bridge keeps ~20 most recent. |
| `typeText requires pid in non-intrusive mode` | Shouldn't happen in the current build. If seen, the installed helper is stale — rebuild with `npm run build:native`. |
| Helper compile fails with `xcrun: error` | Install Xcode Command Line Tools: `xcode-select --install`. Full Xcode is not required. |
| Nothing happens, no error | Check `~/.local/state/mcp-computer-use/audit.log` — actions are recorded even when the target app swallows them silently. |

</troubleshooting>

<limits>

Known v1 limitations (tracked for v1.1 / v2):

- **Multi-instance pid heuristic.** `listWindows(bundleId)` attributes all
  returned windows to the first pid matching the bundle ID. Apps like Chrome
  that run multiple top-level processes will surface correct windows but with
  the wrong pid field.
- **Sensitive-app redaction is a stub.** The redaction pipeline is wired end to
  end, but the Swift-side blur is a no-op placeholder. A `redact_screenshot`
  helper will ship in v1.1 with per-app region maps.
- **No drag, double-click, right-click, triple-click in v1.** Omitted until
  actually needed — an agent can usually achieve the same result via AX
  semantic actions. Add when warranted.
- **macOS 14+ required.** ScreenCaptureKit is the capture backend.
- **No per-call flag overrides.** Behaviour is env-driven. An agent cannot
  escalate privileges mid-session.

</limits>

<roadmap>

## v1.1 (post-beta)

- Surface richer AX tools as MCP commands: `axPressAtPoint`, `axFindTextInput`,
  `axDescribeAtPoint`. The Swift helper already implements them.
- Proper sensitive-app redaction pipeline (region maps + Gaussian blur Swift-side).
- `confirm` profile polish — wire a proper user-facing confirmation channel
  (currently the preset exists but falls back to audit-only).
- `UPSTREAM_SYNC.md` — only created if we ever pull a targeted fix from
  upstream. Not created pre-emptively (spec §8 rev 2026-04-22b).

## v2

- **Windows backend.** `native/windows/` with either Rust (`windows-rs`) or
  C# (.NET) — UIA + `Windows.Graphics.Capture`. Slots in behind the existing
  `NativeBridge` interface via a `case 'win32'` branch in `factory.ts`.
- `AppUserModelID`-based allowlist.
- Stealth mode = UIA `InvokePattern`; non-stealth = `SendInput`.

</roadmap>
