# v0.3.0 — Surface upstream capabilities + permission stability

**Status:** stub. Created 2026-04-30 alongside the v0.2.0 release to track
the v0.3.0 work surface that v0.2.0 deliberately deferred.

**Depends on:** v0.2.0 shipped (`feat/swap-to-bg-computer-use-kit` merged).

## Context

v0.2.0 swapped the helper internals from a vendored 1,549-line
`bridge.swift` to a 620-line wrapper over
[`BackgroundComputerUseKit`](https://github.com/actuallyepic/background-computer-use).
Wire shape unchanged; MCP tool surface unchanged. v0.3.0 is the first
release that *uses* what the swap unlocked.

## Goals

- Surface upstream's higher-quality primitives as new MCP tools.
- Fix the pre-existing `list_windows` pid-misattribution.
- Improve permission stability so TCC re-prompts go away.
- Tighten the upstream pinning model once tags become available.

## Non-goals

- Windows backend (still v2+).
- Major API redesign of existing tools — additive only.

## Work items

### 1. Per-window `pid` + `bundleId` (the listWindows fix)

Pre-existing limitation documented in v0.2.0 release notes. Each window
in `list_windows`'s no-filter mode currently inherits the frontmost app's
identity. Fix is cheap:

- **Swift** (`native/macos/Sources/McpComputerUseHelper/ProtocolBridge.swift`,
  `translateWindowDTO`): emit `pid: w.pid` and `bundleId: w.bundleID` as
  per-window fields. ~2 lines.
- **TypeScript** (`src/native/macos-bridge.ts`, `mapWindowItem`): prefer
  per-item `pid`/`bundleId` over `fallbackApp` when present. ~5 lines.
- **Tests:** add a fixture window with mismatched per-item identity to
  verify the path.

### 2. Semantic targeting

Instead of pixel-coord clicks against ScreenCaptureKit pixels, target an
AX-resolved element by role + label. Upstream supports this via
`ActionTargetRequestDTO`. Proposal:

- New MCP tool `click_target` (or expand `click` with a `target?` field).
  Args: `{role?, label?, identifier?}`. Returns the same shape as `click`
  on success; raises `target_not_found` on miss.
- Wrapper builds `ClickRequest(window:, target:)` instead of the pixel-coord
  variant.
- Audit log records the resolved target description.

### 3. AX projected tree exposure

Upstream's `getWindowState` returns more than a screenshot — it includes
a projected AX tree. Surface this through MCP so agents can reason about
*what's on screen* without parsing pixels.

- New MCP tool `get_window_tree` returning the projected tree (shape TBD;
  match upstream's DTO closely or flatten for token efficiency).
- Update `screenshot` to optionally include the tree (`includeTree: true`).
- Add a token-budget heuristic: large trees should summarise rather than
  dump.

### 4. Verifier classification

Upstream's read-act-read verifier surfaces whether an action had the
intended effect. Today our MCP responses don't expose this; agents can't
self-correct.

- Wire `ClickResponse.verifier` (and equivalents) through to TS as a new
  field on the success result.
- New MCP tool `verify_last_action` for explicit re-check after a wait.
- Document the failure modes in the technical reference.

### 5. Window motion

Add new MCP tools backed by upstream's existing methods:

- `move_window` → `setWindowFrame(_:)`
- `resize_window` → `resize(_:)`
- `drag` → `drag(_:)`

Apply the same allowlist + rate-limit + audit pipeline as `click`.

### 6. `set_value` and `perform_secondary_action`

Upstream primitives we don't currently surface:

- `set_value` — set the value of a control directly (avoids
  click-then-type for fields with native pickers).
- `perform_secondary_action` — equivalent of right-click on AX-targetable
  elements without simulating mouse.

Both behind `MCP_CU_ALLOWED_APPS` like the rest of the write surface.

### 7. Signed `.app` bundle for permission stability

Upstream ships `script/bootstrap_signing_identity.sh` which establishes a
local signing identity such that the helper binary's TCC grants persist
across rebuilds. Adopt:

- Either copy the script and adapt for our binary, or invoke upstream's
  script as a step in `setup-helper.mjs`.
- Document in README + v0.3.0 release notes that re-grants are no longer
  required after the first install.

### 8. Tagged-release pinning

`UPSTREAM_SYNC.md` calls out that upstream has no tags as of v0.2.0. Track
upstream's release cadence:

- File an issue on `actuallyepic/background-computer-use` requesting tags
  (or check if it already exists).
- Once tags appear, switch `Package.swift` from `revision: "<sha>"` to
  `from: "<x.y.z>"` (or `exact:`).
- Update `UPSTREAM_SYNC.md` to drop the SHA-bump step.

### 9. Bump release-note prose accordingly

v0.3.0 release notes should walk through each new MCP tool with at least
two example invocations (matching the `descWithExamples()` pattern used
elsewhere). Include a migration paragraph for users who relied on the
pixel-coord click pattern: it still works, but `click_target` is preferred
where the AX tree resolves cleanly.

## Open questions

- What's the right cardinality for `get_window_tree`? Always include or
  opt-in? Token budget?
- Do we want `verify_last_action` as a separate tool or inline as a field
  on every write response?
- Does upstream's signing script work without code-signing certs from
  Apple, or does it require a Developer ID? (Affects whether
  non-Klemens contributors can build locally.)

## Success criteria

- All seven new MCP tools surfaced with full CLI parity, audit logging,
  and allowlist gating.
- Per-window pid/bundleId fix validated against a multi-app `list_windows`
  call.
- Helper rebuild does not trigger TCC re-prompts on Klemens's machine
  (signing identity working).
- Upstream pin can be moved with a 1-line change once tags exist.
- v0.2 wire shape preserved as a strict superset — existing clients keep
  working without modification.

## Estimated effort

Each work item is ~half a day to a day. Total: ~1 week focused work,
spread over multiple PRs (one per work item to keep diffs reviewable).
