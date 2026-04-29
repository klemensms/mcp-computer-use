# v0.2.0 Migration: replace `bridge.swift` with SwiftPM-consumed `BackgroundComputerUseKit`

**Status:** approved 2026-04-29. Phases 0 + 1 complete; Phase 2 not yet started. Phase 1 work is uncommitted on the feature branch — awaiting review before commit.

**Branch:** `feat/swap-to-bg-computer-use-kit`

**Upstream pin (initial):** `dcf55a3feee557ebdcda4afa6241c82dc6abdd8c` (captured 2026-04-29 from `~/Repo/3rd party repos/background-computer-use/` HEAD).

**Toolchain:** Swift 6.2.4, target arm64-apple-macosx26.0.

## Context

Klemens captured `actuallyepic/background-computer-use` in the Obsidian inbox on 2026-04-29 and asked whether it overlapped with this project. A research agent compared both codebases and concluded:

- They are **not competitors** — they built the OS-capability layer (semantic targeting, AX projected tree, read-act-read verifier, window motion, signed-app permission stability, multi-agent cursor sessions); we built the policy layer (allowlist, secret-scan, audit, redaction, READONLY mode, profile presets, MCP-native integration).
- Their `Package.swift` exposes `BackgroundComputerUseKit` as an explicit `library` product (see `SWIFT_PACKAGE_EXPOSURE_PLAN.md`) — designed for exactly this consumption pattern.
- License is MIT; we can lift their work as a SwiftPM dependency. `swift package update` then pulls upstream improvements automatically.

**Decision (already documented in `~/Obsidian/inbox/actuallyepicbackground-computer-use.md`):** hybrid migration. Keep our entire TypeScript stack — MCP server, `safety-service.ts`, `audit-service.ts`, `config.ts`, all 9 MCP tools, the `NativeBridge` interface, the sensitive-app redact list. Throw away `native/macos/bridge.swift` (1,549 lines, vendored from injaneity/pi-computer-use). Replace it with a small Swift wrapper that imports `BackgroundComputerUseKit` and translates our existing JSON-stdio protocol to upstream's public Swift API.

This plan covers the **v0.2.0 release** — pure swap, no expansion of MCP tool surface, no signed `.app` bundle. Those are v0.3.0+ work.

## Approach

```
┌─────────────────────────────────────────────────────┐
│  TypeScript MCP server (UNCHANGED)                  │
│  - src/services/* (safety, audit, config, etc.)     │
│  - src/tools/* (9 MCP tools)                        │
│  - src/native/macos-bridge.ts (JSON-stdio client)   │
└──────────────────────┬──────────────────────────────┘
                       │ JSON-over-stdio (unchanged wire format)
                       ▼
┌─────────────────────────────────────────────────────┐
│  NEW Swift wrapper (~800 lines, this plan)          │
│  - main.swift           NDJSON loop                 │
│  - ProtocolBridge.swift dispatch + translation      │
│  - LocalScroll.swift    legacy CGEvent scroll only  │
│  - ErrorMapping.swift   upstream errors → our codes │
└──────────────────────┬──────────────────────────────┘
                       │ direct Swift API calls
                       ▼
┌─────────────────────────────────────────────────────┐
│  BackgroundComputerUseKit (SwiftPM dependency)      │
│  pinned to commit SHA in Package.swift              │
└─────────────────────────────────────────────────────┘
```

Wire protocol (TS ↔ wrapper) stays byte-identical to today, so `src/native/macos-bridge.ts`, `src/native/bridge-interface.ts`, `tests/unit/macos-bridge.test.ts`, and `tests/fixtures/mock-helper.mjs` all keep working unchanged.

## Decisions to validate

These are surfaced for review — defaults reflect my recommendation. Tell me if any should flip.

1. **Pin strategy.** Upstream has zero git tags (`git tag -l` empty; commits straight to `main`). **Recommended:** pin to a specific commit SHA in `Package.swift` via `.package(url:, revision: "<sha>")`. Document the upgrade ritual in `UPSTREAM_SYNC.md`. Separately open an issue on their repo asking for tagged releases.

2. **Scroll handling.** Upstream's `scroll(_:)` requires a semantic `ActionTargetRequestDTO` — no pixel-coord scroll. Three options:
   - (a) **[Recommended]** Keep our existing CGEvent-based scroll code as a small local `LocalScroll.swift` (~50 lines, lifted from the old bridge.swift `scroll(_:)` impl at `native/macos/bridge.swift:1087-1124`). Document it as legacy; replace in v0.3.0 when we expose semantic targeting.
   - (b) Resolve a window-wide semantic target before each scroll via `getWindowState`. Adds latency, complexity, and breaks the "no UI changes" promise of v0.2.0.
   - (c) Drop scroll from v0.2.0 entirely. No.

3. **Signed-app bundle.** Upstream's `script/bootstrap_signing_identity.sh` solves TCC re-prompts on rebuild. **Recommended:** defer to v0.3.0. v0.2.0 produces an unsigned binary at `~/.mcp-computer-use/bridge` — same TCC story we have today, no regression. Klemens already has permissions granted to that path; he'll need to re-grant once when the binary identity changes.

4. **Surface upstream's new capabilities (AX tree, semantic targeting, verifier classification, window motion, `set_value`, `perform_secondary_action`).** **Recommended:** defer to v0.3.0 as a separate plan. v0.2.0 is a pure swap to validate the dependency model. v0.3.0 is where we earn the agent-quality wins.

5. **Fate of `native/macos/bridge.swift`.** **Recommended:** delete on swap. Update `NOTICE` to attribute background-computer-use instead of pi-computer-use. Git history preserves the old file for archeology. Exception: lift the ~50 lines of `scroll(_:)` impl into `LocalScroll.swift` per decision 2(a).

6. **Minimum macOS version.** Upstream's `Package.swift` declares `platforms: [.macOS(.v14)]`. **Recommended:** match it. Update README and release notes. Klemens is on macOS 25 (Tahoe), so this is a non-issue locally; it's only a constraint for hypothetical other users.

## Critical risk: API gap analysis

Upstream covers **6 of our 9 commands directly**, **2 with simple wrapper logic**, and **1 with a workaround**:

| Our cmd            | Upstream method                | Wrapper work needed                                              |
|--------------------|--------------------------------|------------------------------------------------------------------|
| `checkPermissions` | `permissions()`                | None — direct call. Translate DTO shape.                         |
| `listWindows`      | `listWindows(_:)`              | None — direct call. Translate DTO shape.                         |
| `getFrontmost`     | _(missing)_                    | Composite: `listApps()` → `frontmostApp.bundleID` → `listWindows(.init(app:))` → pick best window. |
| `screenshot`       | `getWindowState(_:)`           | Need windowId resolution first if request specifies app+title.  |
| `mouseClick`       | `click(_:)` with x/y           | Direct — `ClickRequest` accepts raw x/y. Translate captureWidth/Height into their coordinate-mapping shape. |
| `typeText`         | `typeText(_:)`                 | Need windowId from captureId state (currently TS-only).         |
| `keyPress`         | `pressKey(_:)`                 | Serialize `{key, modifiers[]}` → `"cmd+shift+q"` string.        |
| `scroll`           | _(semantic-target only)_       | Use local CGEvent impl (decision 2(a)).                          |
| `shutdown`         | _(no upstream method)_         | Local: `exit(0)` from main.swift. No upstream call.              |

**No blocking gaps.** All 9 commands can be implemented. Two require composite logic (`getFrontmost`, `keyPress`), one requires a small local code chunk (`scroll`), one is purely process-local (`shutdown`).

## File plan

```
native/macos/                                # CHANGED: SwiftPM workspace
├── Package.swift                            # NEW: declares dependency on BackgroundComputerUseKit
├── Package.resolved                         # NEW: committed pin lockfile
├── Sources/
│   └── McpComputerUseHelper/
│       ├── main.swift                       # NEW: NDJSON stdio loop, ~80 lines
│       ├── ProtocolBridge.swift             # NEW: cmd dispatch + DTO translation, ~500 lines
│       ├── LocalScroll.swift                # NEW: CGEvent scroll, ~50 lines (lifted from old bridge.swift:1087-1124)
│       └── ErrorMapping.swift               # NEW: upstream errors → our codes, ~80 lines
├── README.md                                # NEW: build instructions, attribution
└── bridge.swift                             # DELETE (1,549 lines)

scripts/
├── build-native.mjs                         # MODIFIED: xcrun swiftc → swift build
└── setup-helper.mjs                         # MODIFIED: same swap; postinstall

src/                                         # NO CHANGES TO ANY FILE
tests/                                       # NO CHANGES (mock-helper still passes)

UPSTREAM_SYNC.md                             # NEW: upgrade ritual + pin record
NOTICE                                       # MODIFIED: pi-computer-use → background-computer-use
README.md                                    # MODIFIED: SwiftPM dependency; macOS 14+ note
docs/release-notes/v0.2.0-beta.1.md          # NEW
docs/technical/COMPUTER_USE_TECHNICAL.md     # MODIFIED: rewrite IPC + Swift sections
package.json                                 # MODIFIED: version bump 0.1.0-beta.1 → 0.2.0-beta.1
                                             #           files[] add Sources/, drop bridge.swift
```

## Phases

### Phase 0 — Pre-flight (1-2h)

- [x] **0.1** Re-read upstream API once more with fresh eyes — confirm DTO field names by reading `RouteRequestContracts.swift`, `WindowStateContracts.swift`, `BootstrapContracts.swift`, `ClickActionContracts.swift`, `TextActionContracts.swift`, `PressKeyActionContracts.swift`, `DiscoveryContracts.swift`. The summary table above is from a research agent; verify against source before writing wrapper code. **→ Done; canonical field names recorded in "Phase 0 — Findings" section below.**
- [x] **0.2** Capture upstream HEAD: `cd "/Users/klemensstelk/Repo/3rd party repos/background-computer-use" && git rev-parse HEAD`. Record the full SHA in this plan and use it as the initial pin. **→ `dcf55a3feee557ebdcda4afa6241c82dc6abdd8c`.**
- [x] **0.3** Branch this repo: `git checkout -b feat/swap-to-bg-computer-use-kit`. **→ Done; currently checked out.**
- [x] **0.4** Verify SwiftPM toolchain: `swift --version` (need 6.x; comes with full Xcode, not just CLT). If only CLT installed, document the new requirement and verify CI/postinstall path. **→ Swift 6.2.4, arm64-apple-macosx26.0.**

### Phase 1 — SwiftPM scaffolding (2-3h)

- [x] **1.1** Write `native/macos/Package.swift`:
  - `swift-tools-version: 6.2`
  - `platforms: [.macOS(.v14)]`
  - dependency: `.package(url: "https://github.com/actuallyepic/background-computer-use.git", revision: "<SHA from 0.2>")`
  - executable target `McpComputerUseHelper` linking `BackgroundComputerUseKit`
- [x] **1.2** Write `native/macos/Sources/McpComputerUseHelper/main.swift`:
  - Initialize `BackgroundComputerUseRuntime()` (visual cursor disabled by default — explicit in upstream docs)
  - Read NDJSON from stdin line-by-line
  - Dispatch each request to `ProtocolBridge.handle(_:runtime:)`
  - Write `{id, ok, result|error}` JSON line to stdout
  - On `cmd: shutdown`, reply `ok` then schedule `exit(0)` after 25ms (matches current bridge.swift:1126-1132 behavior)
  - Errors caught at this level wrap to `{ok: false, error: {code: "internal_error", message: "..."}}`
- [x] **1.3** Write `native/macos/Sources/McpComputerUseHelper/ProtocolBridge.swift`:
  - `static func handle(_ req: [String: Any], runtime: BackgroundComputerUseRuntime) throws -> [String: Any]`
  - Switch on `req["cmd"] as? String`:
    - `"checkPermissions"` → call `runtime.permissions()`, translate DTO to `{accessibility: Bool, screenRecording: Bool}` (drop `promptable` and `checkedAt` for now — not in our wire shape)
    - `"listWindows"` → if `bundleId` provided, call `runtime.listWindows(.init(app: bundleId))`; if `pid` provided, resolve pid→bundleId via `listApps()` first (since upstream takes app, not pid); if neither, iterate `listApps()` regular apps. Translate `WindowDTO` array to our shape with `windowRef`, `title`, `framePoints`, `scaleFactor`, `isMinimized`, `isOnscreen`, `isMain`, `isFocused`, `windowId`.
    - `"getFrontmost"` → `listApps()` → take `frontmostApp` → `listWindows(.init(app: bundleId))` → pick window with same window-scoring heuristic as old bridge.swift:309-334 (prefer focused, then main, then onscreen)
    - `"screenshot"` → caller passes `windowId`. Build `GetWindowStateRequest(window: windowRef, imageMode: .base64, ...)` — note: upstream uses `windowRef` strings, our protocol uses `windowId` UInt32. Need a windowId↔windowRef translation table populated by listWindows responses. Translate response to `{pngBase64, width, height, scaleFactor}`.
    - `"mouseClick"` → translate captureWidth/captureHeight + x/y into upstream's `ClickRequest` with raw x/y target. Map captureId state via the windowRef the helper already issued.
    - `"typeText"` → `TypeTextRequest(window: <windowRef from frontmost>, text: text, target: nil, focusAssistMode: nil)`. Question: do we need to resolve target window? Today our bridge.swift just types into whatever has focus — answer is to call upstream with the frontmost windowRef.
    - `"keyPress"` → join modifiers + key into `"cmd+shift+q"` style string. Build `PressKeyRequest(window: <frontmost windowRef>, key: joined)`. Modifier names: cmd→cmd, opt→opt, ctrl→ctrl, shift→shift (matches upstream's vocabulary; verify in 0.1).
    - `"scroll"` → DO NOT call upstream. Call `LocalScroll.scroll(direction:amount:pid:)`. Returns `{ok: true, direction, amount}` to match current shape.
    - `"shutdown"` → return `{ok: true}`; `main.swift` schedules exit.
    - default → throw `BridgeError(code: "unknown_cmd", message: "...")`
- [x] **1.4** Write `native/macos/Sources/McpComputerUseHelper/LocalScroll.swift`:
  - Lift the body of `scroll(_:)` from old `native/macos/bridge.swift:1087-1124`
  - Drop the JSON-shape glue (the wrapper in main.swift handles that)
  - Keep just: direction → CGEvent xDelta/yDelta, post via `.cghidEventTap` or to specific pid
- [x] **1.5** Write `native/macos/Sources/McpComputerUseHelper/ErrorMapping.swift`:
  - Catch upstream throws; map to our error codes:
    - `RuntimeError.windowNotFound` → `"window_not_found"`
    - `RuntimeError.permissionDenied` → `"accessibility_denied"` or `"screen_recording_denied"`
    - `RuntimeError.captureTimeout` → `"screenshot_timeout"`
    - everything else → `"helper_error"` with the message preserved
  - Real error type names need verification in 0.1 — these are placeholders.
- [x] **1.6** `swift build -c release --package-path native/macos` — verify it compiles. Binary lands at `native/macos/.build/<arch>-apple-macosx/release/McpComputerUseHelper`. **→ Build succeeds in 1.96s. Mach-O 64-bit arm64 binary, 6.3 MB.**

### Phase 2 — Build pipeline (1-2h)

- [ ] **2.1** Modify `scripts/build-native.mjs`:
  - Replace `xcrun swiftc ...` with `swift build -c release --package-path native/macos`
  - Copy `.build/<arch>-apple-macosx/release/McpComputerUseHelper` → `~/.mcp-computer-use/bridge`
  - Detect arch via `process.arch === "arm64" ? "arm64-apple-macosx" : "x86_64-apple-macosx"`
- [ ] **2.2** Modify `scripts/setup-helper.mjs`:
  - Same build command swap
  - Same copy step
  - Update the "On first run" message to mention permissions will likely re-prompt once because the binary identity has changed
- [ ] **2.3** Modify `package.json`:
  - Bump `version` to `0.2.0-beta.1`
  - `files[]`: add `"native/macos/Package.swift"`, `"native/macos/Package.resolved"`, `"native/macos/Sources"`; remove `"native/macos/bridge.swift"`
  - Add a note in scripts that `swift` (full Xcode) is required, not just Xcode CLT
- [ ] **2.4** Run `node scripts/setup-helper.mjs` end-to-end — confirm a working binary lands at `~/.mcp-computer-use/bridge`.

### Phase 3 — Wire-compat verification (2-3h)

- [ ] **3.1** Run `npm test` — every existing unit test must pass unchanged. The `tests/fixtures/mock-helper.mjs` simulates the wire protocol; if any test fails it means we changed the wire shape (regression).
- [ ] **3.2** Run integration test: `npm test -- integration` — exercises the real new binary. May need permission re-grant to `~/.mcp-computer-use/bridge`.
- [ ] **3.3** Manual round-trip via CLI:
  - `node build/cli.js check-permissions`
  - `node build/cli.js list-windows`
  - `node build/cli.js get-frontmost-window`
  - `node build/cli.js screenshot --app md.obsidian --out /tmp/test.png`
  - Click in Obsidian: `node build/cli.js click 100 100 --capture-id <id>`
  - Type into Obsidian: `node build/cli.js type-text "hello"`
  - Cmd+S: `node build/cli.js key-press s --modifiers cmd`
  - Scroll: `node build/cli.js scroll down 3` (validates LocalScroll path)
- [ ] **3.4** Audit log validation — confirm `~/.local/state/mcp-computer-use/audit.log` records every action with redaction unchanged.
- [ ] **3.5** Smoke-test from Claude Code as the actual MCP client (the real workflow that motivates the project).

### Phase 4 — Docs + release prep (1-2h)

- [ ] **4.1** Write `UPSTREAM_SYNC.md` — upgrade ritual:
  ```
  cd "/Users/klemensstelk/Repo/3rd party repos/background-computer-use"
  git pull
  NEW_SHA=$(git rev-parse HEAD)
  cd ~/Repo/mcp-computer-use
  # Edit native/macos/Package.swift, replace pinned revision with NEW_SHA
  swift package update --package-path native/macos
  npm test  # full unit + integration
  # Smoke test (Phase 3.3 commands)
  git commit ...
  ```
- [ ] **4.2** Modify `NOTICE`:
  - Remove pi-computer-use attribution paragraph
  - Add background-computer-use attribution: "This product depends on `BackgroundComputerUseKit` (https://github.com/actuallyepic/background-computer-use), MIT-licensed, © cam + anupam (dubdubdub labs). Pinned to commit `<SHA>`."
- [ ] **4.3** Modify `README.md`:
  - Update "Status" line: macOS 14+ required (was unspecified)
  - Replace any "Swift helper" prose mentioning pi-computer-use with a paragraph describing the SwiftPM dependency
  - Note the `swift` (full Xcode) toolchain requirement
- [ ] **4.4** Modify `docs/technical/COMPUTER_USE_TECHNICAL.md`:
  - Rewrite `<ipc-protocol>` section: same wire shape but call out which commands hit upstream vs. local
  - Rewrite `<architecture>` section: TS layer → wrapper → BackgroundComputerUseKit
  - Add `<upgrading-upstream>` section pointing to `UPSTREAM_SYNC.md`
- [ ] **4.5** Write `docs/release-notes/v0.2.0-beta.1.md`:
  - Highlight: replaced helper internals with `BackgroundComputerUseKit` SwiftPM dependency
  - Breaking: macOS 14+ required (was unspecified, effectively macOS 13+ before)
  - Breaking: full Xcode required for postinstall build (was Xcode CLT only)
  - Migration note: TCC permissions re-prompt once on first run after upgrade (binary identity changed)
  - No MCP tool changes; no API changes; no behavior changes for existing use cases
  - Followup: v0.3.0 will surface upstream's new capabilities (semantic targeting, AX tree, verifier, window motion) and ship a signed `.app` for permission stability
- [ ] **4.6** Stub `docs/superpowers/plans/2026-04-29-expose-new-capabilities.md` — empty draft listing v0.3.0 work items so we don't lose track.
- [ ] **4.7** Move this plan from `~/.claude/plans/cozy-strolling-lynx.md` → `docs/superpowers/plans/2026-04-29-bg-computer-use-migration.md` (post-approval).

### Phase 5 — Cleanup + commit (30m)

- [ ] **5.1** `git rm native/macos/bridge.swift`
- [ ] **5.2** Run `npm run build && npm test && npm pack --dry-run` — verify packaged tarball includes Swift sources, excludes old bridge.swift, excludes `.build/`.
- [ ] **5.3** Commit on the feature branch in logical chunks (one per phase):
  - `chore(native): scaffold SwiftPM workspace with BackgroundComputerUseKit dependency`
  - `feat(native): wrap BackgroundComputerUseKit, preserve JSON-stdio wire protocol`
  - `chore(build): switch helper build to swift build`
  - `chore: delete vendored bridge.swift; update NOTICE`
  - `docs: v0.2.0 release notes, upstream sync ritual, technical reference rewrite`
- [ ] **5.4** Open PR for review — do NOT merge automatically; Klemens reviews diff.

## Verification (success criteria)

- [ ] `npm test` passes with zero changes to test files
- [ ] Integration test passes against the new helper
- [ ] All 9 manual smoke commands round-trip correctly
- [ ] Audit log records every action with redaction working
- [ ] Claude Code MCP smoke test (a real action like "screenshot Obsidian and click on the first daily note") works end-to-end
- [ ] Net diff: ~+800 lines / −1,549 lines (delete bridge.swift, add ~800 lines of wrapper Swift + Package.swift)
- [ ] Tarball from `npm pack --dry-run` contains `native/macos/Package.swift` and `native/macos/Sources/`, does NOT contain `native/macos/bridge.swift` or `.build/`

## Risks & open questions

- **Upstream `pid`-based listWindows.** Today we accept `{pid: <int>}` to list windows for a pid (used by `getFrontmost`'s enrichment path). Upstream's `listWindows` takes `app: String` (bundle ID). Resolution: every windowRef→pid mapping must come from `listApps()`. Phase 0.1 must verify this works for apps without a bundleId (helper apps, etc.).

- **`captureId` ↔ `windowRef`.** Today, captureId state is TS-side: `{windowId, pid, bundleId, appName, windowTitle, captureWidth, captureHeight}`. Our wrapper's click handler receives `{windowId, pid, x, y, captureWidth, captureHeight}` — but upstream uses `windowRef: String` not `windowId: UInt32`. Resolution: maintain a windowId→windowRef table in the wrapper, populated whenever we hand back listWindows or screenshot results. This is wrapper-internal state; doesn't change the wire protocol. Phase 1.3 must implement this carefully or click will silently target wrong windows.

- **Modifier vocabulary.** Our protocol uses `cmd|opt|ctrl|shift`. Upstream's keyName parser may use `cmd|alt|ctrl|shift` or `command|option|control|shift`. Phase 0.1 must verify the canonical names by reading upstream's `PressKeyRequest` parsing code.

- **`pressKey` without windowRef.** Today our `keyPress` doesn't require any window context — it sends keystrokes to whatever has focus. Upstream's `PressKeyRequest` requires `window: String`. Resolution: resolve to `getFrontmost()` windowRef inside the wrapper before each call. Slight latency increase (one extra upstream call per keypress), but keeps semantics. Alternative: add an optional `pid` field to our protocol and have TS pass it; deferred unless latency becomes a problem.

- **TCC re-prompt.** First run after upgrade will re-prompt for Accessibility + Screen Recording because the binary identity has changed. Document loudly in release notes. Klemens will need to re-grant once.

- **Macos 14+ requirement.** Upstream targets macOS 14+. Our previous helper compiled with `xcrun swiftc` against ScreenCaptureKit, which is also macOS 12.3+. Net effect: probably a 14+ requirement now is fine for us, but check that upstream's `Package.swift platforms: [.macOS(.v14)]` is hard-required vs. soft-suggested.

- **`swift build` toolchain.** `swift` ships with full Xcode but not with Xcode Command Line Tools alone. This raises the floor for installation. Document the requirement and update setup-helper.mjs to detect it gracefully.

- **No upstream tags.** Pin by SHA in v0.2.0. Open issue with upstream asking for tagged releases. Switch to tag-based pinning in a future point release once they comply.

## Estimated effort

- Phase 0: 1-2h (audit + branch + toolchain check)
- Phase 1: 4-6h (write Swift wrapper carefully)
- Phase 2: 1-2h (build pipeline swap)
- Phase 3: 2-3h (debug wire-shape mismatches; this is where the surprises will surface)
- Phase 4: 1-2h (docs)
- Phase 5: 30m (cleanup + commit + PR)

**Total: 1-2 days focused work.**

## What this plan explicitly does NOT do

- Does not surface upstream's new capabilities as MCP tools (semantic targeting, AX tree exposure, verifier classification, window motion, `set_value`, `perform_secondary_action`, `focusAssistMode`) — that's v0.3.0.
- Does not ship a signed `.app` bundle for permission stability — that's v0.3.0.
- Does not change any TypeScript code under `src/`. `src/native/macos-bridge.ts` and the wire protocol are untouched.
- Does not change the MCP tool list, parameter shapes, or response shapes seen by clients (Claude Code etc.).
- Does not bump major version. v0.2.0 is opaque to MCP consumers; the only user-visible change is the macOS 14+ + full Xcode toolchain requirement, called out in release notes.

---

## Phase 0 — Findings (2026-04-29)

Verified upstream API specifics by reading the source. The research-agent summary that informed the plan was directionally correct but wrong on several field names and one subtle parser quirk; record canonical names here so Phase 1 doesn't re-walk the audit.

### Public facade (`Sources/BackgroundComputerUse/App/BackgroundComputerUseRuntime.swift:16-77`)

`BackgroundComputerUseRuntime` is a `final class` with these public methods:

```swift
public func permissions() -> RuntimePermissionsDTO
public func listApps() -> ListAppsResponse                            // sync, no throws
public func listWindows(_:) throws -> ListWindowsResponse
public func getWindowState(_:) throws -> GetWindowStateResponse
public func click(_:) throws -> ClickResponse
public func scroll(_:) throws -> ScrollResponse
public func performSecondaryAction(_:) throws -> PerformSecondaryActionResponse
public func drag(_:) throws -> DragResponse
public func resize(_:) throws -> ResizeResponse
public func setWindowFrame(_:) throws -> SetWindowFrameResponse
public func typeText(_:) throws -> TypeTextResponse
public func pressKey(_:) throws -> PressKeyResponse
public func setValue(_:) throws -> SetValueResponse
```

Init: `BackgroundComputerUseRuntime(options: BackgroundComputerUseRuntimeOptions = .init())`. Default `visualCursor: .disabled` — perfect for our wrapper.

### `WindowDTO` field names — corrected vs. research summary

`Sources/BackgroundComputerUse/Contracts/DiscoveryContracts.swift:36-50`:

```swift
public struct WindowDTO: Encodable, Sendable {
    public let windowID: String         // upstream's identifier (NOT "windowRef")
    public let title: String
    public let bundleID: String
    public let pid: Int32
    public let launchDate: String?
    public let role: String?
    public let subrole: String?
    public let windowNumber: Int        // corresponds to OUR windowId: UInt32
    public let frameAppKit: RectDTO     // NOT "framePoints"
    public let isFocused: Bool
    public let isMain: Bool
    public let isMinimized: Bool
    public let isOnScreen: Bool         // capital S — "isOnScreen", not "isOnscreen"
}
```

Our protocol's `windowId: UInt32` maps to `windowNumber: Int`. Wrapper must maintain a `windowNumber → windowID` table populated whenever it returns listWindows or getWindowState results to TS, so subsequent click/typeText/pressKey/setValue calls can translate windowId→windowID.

### Permissions — drill through `.granted`

`Sources/BackgroundComputerUse/Contracts/BootstrapContracts.swift:75-85`:

```swift
public struct PermissionStatusDTO: Encodable, Sendable {
    public let granted: Bool
    public let promptable: Bool
}
public struct RuntimePermissionsDTO: Encodable, Sendable {
    public let accessibility: PermissionStatusDTO
    public let screenRecording: PermissionStatusDTO
    public let checkedAt: String
    public let checkMs: Double
}
```

Our wire shape: `{accessibility: Bool, screenRecording: Bool}`. Translation: `{accessibility: dto.accessibility.granted, screenRecording: dto.screenRecording.granted}`. Drop `promptable`, `checkedAt`, `checkMs` — not surfaced through our protocol.

### `listWindows` requires bundleID — pid filter not supported

`ListWindowsRequest(app: String)` — `app` is the bundleID, no optional fields. To handle our protocol's optional `{pid: <int>}` form (used by `getFrontmost`'s window-enrichment path):

1. Call `runtime.listApps()` → look up `RunningAppDTO` with matching `pid` → take its `bundleID`
2. Call `runtime.listWindows(.init(app: bundleID))`

For our `bundleId`-filtered form: pass through directly. For the no-filter form: iterate `listApps().runningApps` (regular apps only) and call `listWindows` per app, accumulate.

### `frontmostApp` is optional

`ListAppsResponse.frontmostApp: RunningAppDTO?` — could be nil if no app is frontmost. Wrapper must return `{code: "frontmost_unavailable", message: ...}` matching current bridge.swift:309-312 behavior.

### Click coordinate space — confirmed

`ClickRequest` has two mutually-exclusive init forms:

```swift
public init(window: String, ..., target: ActionTargetRequestDTO, ...)   // semantic
public init(window: String, ..., x: Double, y: Double, ...)             // pixel coords
```

For our wrapper: use the pixel-coord init. **The x/y are in modelFacingScreenshot space** — i.e., the same pixel space as the `pixelWidth`/`pixelHeight` returned by getWindowState's screenshot.image. Our protocol's captureWidth/captureHeight match this 1:1; we pass x/y through unchanged.

`ClickRequest.stateToken: String?` is optional. Wrapper should cache `windowID → latest stateToken` from getWindowState responses and pass it on subsequent click calls for freshness verification (and to avoid an extra read).

### Screenshot — `getWindowState` is the only path

There's no "screenshot a window by name" shorthand. Workflow:

1. Resolve target window → windowID (via listWindows or via the wrapper's windowNumber→windowID cache)
2. Call `runtime.getWindowState(GetWindowStateRequest(window: windowID, imageMode: .base64))`
3. Translate response: `{pngBase64: response.screenshot.image?.imageBase64, width: image.pixelWidth, height: image.pixelHeight, scaleFactor: image.pixelWidth / response.window.frameAppKit.width}`

Note `screenshot.image: ScreenshotImageDTO?` is optional — handle the nil case.

`ImageMode` enum: `.path | .base64 | .omit` (from `Contracts/CommonContracts.swift:3-7`). We use `.base64`.

Capture the `stateToken: String` from the response and store in `windowID → stateToken` cache.

### `pressKey` input format — `+`-joined chord

`PressKeyRequest.key: String` — parsed by `PressKeyParser.parse` at `Actions/PressKey/PressKeyRouteService.swift:636-674`:

- Tokens split on `+`; last token is the key, all earlier tokens are modifiers
- Modifier vocabulary (case-insensitive): `cmd | command | super | meta`, `ctrl | control`, `alt | option`, `shift`
- Our `cmd | opt | ctrl | shift` map to: cmd→"cmd", opt→"option", ctrl→"ctrl", shift→"shift" — all valid

Wrapper translation: `[modifiers, key].joined(separator: "+")`. Examples:
- `{key: "s", modifiers: ["cmd"]}` → `"cmd+s"`
- `{key: "return", modifiers: []}` → `"return"`
- `{key: "f", modifiers: ["cmd", "shift"]}` → `"cmd+shift+f"`

**`backspace` parser bug** (line 697 of PressKeyRouteService.swift): the parser accepts `"BackSpace"` and `"back_space"` (normalizing to `"backspace"`), but throws `unsupportedKey` if the input is the lowercase `"backspace"` directly. Wrapper must remap any incoming `backspace` to `BackSpace` before joining.

### `pressKey` requires window — wrapper resolves to frontmost

`PressKeyRequest.window: String` is required. Today our `keyPress` doesn't carry window context — it sends keystrokes to whatever has focus. Wrapper resolves to `runtime.listApps().frontmostApp` → `listWindows(...)` → pick best window each call. Slight latency cost; acceptable for v0.2.0.

### `typeText` — window required, target optional

`TypeTextRequest(window: String, target: ActionTargetRequestDTO? = nil, text: String, focusAssistMode: TypeTextFocusAssistModeDTO? = nil)`. Our protocol doesn't supply target or focusAssistMode — pass nil for both. Resolve window via frontmost (same pattern as pressKey).

### `scroll` — semantic target only, no pixel scroll

Confirmed: `ScrollRequest.target: ActionTargetRequestDTO` is required (non-optional, line 330 of RouteRequestContracts.swift). Decision 2(a) holds: wrapper does NOT call upstream scroll. Use `LocalScroll.swift` lifted from old bridge.swift:1087-1124.

### `shutdown` — process-local

No upstream method. Wrapper's main.swift handles `cmd: shutdown`: reply `{ok: true}`, schedule `exit(0)` after 25ms (matches existing bridge.swift:1126-1132).

### Wrapper internal state requirements

The wrapper, despite being command-driven, must maintain two in-memory caches:

```swift
class WrapperState {
    var windowNumberToID: [Int: String] = [:]              // populated by listWindows + getWindowState
    var windowIDToStateToken: [String: String] = [:]       // populated by getWindowState
}
```

Neither is surfaced through the wire protocol — both are internal optimization to translate our protocol's identifiers and to enable stateToken passing on actions.

### Phase 0 task status

- [x] **0.1** Upstream API audit complete — DTO field names verified, gaps identified
- [x] **0.2** Upstream HEAD captured: `dcf55a3feee557ebdcda4afa6241c82dc6abdd8c`
- [x] **0.3** Branch created: `feat/swap-to-bg-computer-use-kit`
- [x] **0.4** Swift toolchain verified: 6.2.4, arm64-apple-macosx26.0

---

## Phase 1 — Findings (2026-04-29)

Phase 1 was executed by a forked subagent against the Phase 0 Findings spec. All 5 wrapper files written; `swift build -c release` succeeds in 1.96s. Total wrapper code: **620 lines**, vs old `bridge.swift` 1,549 — net ~−929 once Phase 5 deletes the legacy file.

### Files written (uncommitted, on feature branch `feat/swap-to-bg-computer-use-kit`)

| Path | Lines | Role |
|---|---|---|
| `native/macos/Package.swift` | 25 | SwiftPM manifest, pinned to `dcf55a3f…` |
| `native/macos/Sources/McpComputerUseHelper/main.swift` | 103 | NDJSON stdio loop, stderr-only logging, shutdown exit |
| `native/macos/Sources/McpComputerUseHelper/ProtocolBridge.swift` | 404 | 10-cmd dispatch + DTO translation + WrapperState caches |
| `native/macos/Sources/McpComputerUseHelper/LocalScroll.swift` | 47 | CGEvent scroll, lifted from old `bridge.swift:1087-1124` |
| `native/macos/Sources/McpComputerUseHelper/ErrorMapping.swift` | 41 | String-heuristic for upstream's package-internal error enums |

Build artifacts (also untracked): `native/macos/.build/` and `native/macos/Package.resolved`.

### Wire-shape verification

Cross-checked wrapper responses against `tests/fixtures/mock-helper.mjs` per cmd. Match across the board. Key shapes:

- `checkPermissions` → `{accessibility, screenRecording}` (drilled through `.granted`)
- `listApps` → `[{appName, pid, bundleId}]` filtered to `activationPolicy == "regular"`
- `listWindows` → `[{windowId, windowRef, title, framePoints:{x,y,w,h}, isMinimized, isOnscreen, isMain, isFocused}]`
- `getFrontmost` → `{appName, pid, bundleId, windowTitle, windowId, windowRef}` (with focused→main→onScreen→first heuristic)
- `screenshot` → `{pngBase64, width, height, scaleFactor}` where `scaleFactor = pixelWidth / frameAppKit.width`
- `mouseClick` → `{clicked: true}`
- `typeText` → `{typed: true}`
- `keyPress` → `{ok, key, keycode, modifiers}` (keycode from `response.parsedKey?.keyCode ?? 0`)
- `scroll` → `{ok, direction, amount}`
- `shutdown` → `{ok: true}` then 25ms-delayed `exit(0)`

The mock fixture has `scaleFactor: 2` on `MOCK_WINDOW` (listWindows path), but `mapWindowItem` in `src/native/macos-bridge.ts:178` does NOT consume it. The wrapper omits it from listWindows responses — fine, it's a no-op field on the TS side.

### Deviations from the original plan (all sensible — record so reviewers don't re-question them)

1. **Added 10th cmd `listApps`.** Plan said 9 cmds. `src/native/macos-bridge.ts:161` and `tests/fixtures/mock-helper.mjs:38` both use it internally for pid→bundleId resolution. The wrapper had to implement it or `getFrontmostWindow`'s enrichment path would break.

2. **Field-name translation upstream→wire.** Phase 0 Findings cautioned about upstream's `windowID`/`frameAppKit`/`isOnScreen`. The wrapper translates these to our existing wire-shape names (`windowRef`/`framePoints:{x,y,w,h}`/`isOnscreen`) per `mock-helper.mjs` and `mapWindowItem`. Both `windowId` (Int) and `windowRef` (String) included in every window response so TS can use either. See `ProtocolBridge.swift:108-124` (`translateWindowDTO`).

3. **Throw on `response.ok == false`.** Upstream's `ClickResponse`/`TypeTextResponse`/`PressKeyResponse` carry `ok: Bool` even when no error is thrown (e.g. unsupported, effect_not_verified). The wrapper throws `BridgeError(code: "click_failed" | "type_text_failed" | "key_press_failed", message: response.summary)` when `ok == false`. Old `bridge.swift` semantics were "no throw = success", so this preserves intent and gives TS-side a meaningful error code.

4. **`postStateToken` cached on action responses.** Plan only mentioned caching from `getWindowState`, but `ClickResponse`/`TypeTextResponse`/`PressKeyResponse` all expose `postStateToken: String?`. Wrapper updates `state.windowIDToStateToken[windowID]` from those when present, so the next click's stateToken is fresh without an extra `getWindowState` round-trip.

5. **`DispatchQueue.global()` for shutdown exit.** Plan referenced `DispatchQueue.main.asyncAfter`, but a CLI binary blocking on stdin doesn't pump the main RunLoop — `.main.asyncAfter` may never fire. Used `DispatchQueue.global().asyncAfter` so the 25ms-delayed `exit(0)` actually runs. TS-side sends SIGTERM after 2s anyway; this just ensures self-exit happens during normal shutdown.

6. **Per-app failure tolerance in `listWindows` no-filter mode.** When iterating all regular apps, if `runtime.listWindows(.init(app: bundleID))` throws for one app (e.g. AX permission edge case), the wrapper continues with the rest instead of failing the whole call. Matches old `bridge.swift:1150-1157`. See `ProtocolBridge.swift:80-83`.

7. **Module name vs product name.** Upstream's Package.swift declares product `BackgroundComputerUseKit` over target `BackgroundComputerUse`. Swift `import` uses the *target/module* name → `import BackgroundComputerUse` (not `BackgroundComputerUseKit`). The `.product(name: "BackgroundComputerUseKit", ...)` in our Package.swift is correct as the SwiftPM dependency declaration.

8. **Swift 6 actor isolation.** Top-level globals (`runtime`, `wrapperState`) are implicitly `@MainActor`. `handleLine` annotated `@MainActor` to satisfy isolation; the stdin read loop runs at top level (already MainActor-isolated implicitly).

### Open questions surfaced — none blocking, all need Phase 3 attention

1. **`activationPolicy` serialization format.** Upstream's `RunningAppDTO.activationPolicy` is a `String` (not enum) per the inferred Codable shape. Wrapper filters by `== "regular"`. Not 100% confirmed that upstream serializes `NSRunningApplication.ActivationPolicy.regular.rawValue` as the literal `"regular"` (vs. `.regular`, `0`, etc.). **First thing to check if `listApps` returns empty during Phase 3 testing.**

2. **`scaleFactor` derivation under Retina.** Plan said `image.pixelWidth / response.window.frameAppKit.width`. `frameAppKit` is in AppKit logical points, `pixelWidth` is raw pixels — gives 1.0 on non-Retina, 2.0 on Retina. Matches mock's `scaleFactor: 2`. Worth confirming on a real Retina display in Phase 3.

3. **ErrorMapping is string-heuristic only.** Upstream's actual error enums (`DiscoveryError`, `PressKeyParserError`, etc.) are declared *internal* to the package — not `public` — so the wrapper can't pattern-match them from outside. Falls back to `String(describing: error)` and substring matching against `unsupportedKey`/`windowNotFound`/`accessibilityDenied`/etc. (See `ErrorMapping.swift:13-40`.) The mapping is best-effort; specific upstream error messages may not match the heuristic verbatim. Phase 3 will surface any mismatches → adjust the heuristic.

4. **`Package.resolved` materialization.** SwiftPM wrote `native/macos/Package.resolved` at the package root after the first build. Recommend committing it (this is an executable target, not a library — lockfiles in git are right for binaries).

5. **`.gitignore` cleanup.** `native/macos/.build/` is currently untracked and clutters `git status`. Add to `.gitignore` before the Phase 1 commit. Existing `.gitignore` already ignores `.context/`, `coverage/`, `node_modules/`, `build/` — match that style.

### What's NOT done in Phase 1 (for clarity)

- Nothing committed yet. Phase 1 work sits uncommitted on `feat/swap-to-bg-computer-use-kit`. Two earlier commits this session: `1193f2f` (docs commit — plan + Phase 0 findings) and `66021ad` (allowlist patch — git-SHA + project-path patterns).
- `scripts/build-native.mjs` and `scripts/setup-helper.mjs` still run `xcrun swiftc` (Phase 2 work).
- `package.json` still says `0.1.0-beta.1` (Phase 2 work — bump to `0.2.0-beta.1`).
- `native/macos/bridge.swift` still present (Phase 5 deletes it; until then it's reference for any cross-check work).
- No tests run yet (Phase 3).

**Next:** Phase 2 (build pipeline swap — modify `scripts/build-native.mjs` + `scripts/setup-helper.mjs` to use `swift build`, bump `package.json` version, update `files[]`). Estimated 1-2h. Phase 1 commit + .gitignore + Package.resolved decision either lands first or bundles into the Phase 2 commit set per Klemens's preference.
