# Upstream sync ritual — `BackgroundComputerUseKit`

The Swift helper at `~/.mcp-computer-use/bridge` is built from a SwiftPM
workspace under `native/macos/` that depends on
[`actuallyepic/background-computer-use`](https://github.com/actuallyepic/background-computer-use)
(MIT-licensed, © cam + anupam / dubdubdub labs). Upstream has no tagged
releases (only commits to `main`), so we pin by full commit SHA in
`native/macos/Package.swift`.

This file documents how to bump that pin.

## Current pin

`dcf55a3feee557ebdcda4afa6241c82dc6abdd8c` (captured 2026-04-29).

The pin is enforced in two places:
- `native/macos/Package.swift` — `revision: "<SHA>"` on the dependency.
- `NOTICE` — attribution paragraph references the same SHA.

Both must move together.

## Local upstream checkout

Klemens keeps a local clone at:

```
~/Repo/3rd party repos/background-computer-use/
```

Useful for reading source, comparing diffs, and capturing a known-good SHA
before bumping. Not required — `swift package update` resolves directly from
GitHub.

## Bump procedure

1. **Decide the target SHA.** Either:
   - Pull the local checkout and capture HEAD:
     ```bash
     cd "/Users/klemensstelk/Repo/3rd party repos/background-computer-use"
     git pull
     NEW_SHA=$(git rev-parse HEAD)
     echo "$NEW_SHA"
     ```
   - Or browse https://github.com/actuallyepic/background-computer-use/commits/main
     and copy the desired commit's full SHA.

2. **Edit the pin.** In `native/macos/Package.swift`, replace the existing
   `revision: "..."` value with `NEW_SHA`. Single line change.

3. **Resolve.** From the repo root:
   ```bash
   swift package update --package-path native/macos
   ```
   This rewrites `native/macos/Package.resolved` (also committed). Inspect
   the diff — only the `revision` and (likely) `version`/`branch` fields
   under the `background-computer-use` package entry should move.

4. **Rebuild + reinstall the helper.** Either:
   ```bash
   npm run build:native    # builds and copies to ~/.mcp-computer-use/bridge
   ```
   or
   ```bash
   node scripts/build-native.mjs --output /tmp/mcp-cu-bridge-test
   echo '{"id":"smoke","cmd":"shutdown"}' | /tmp/mcp-cu-bridge-test
   # expect: {"ok":true,"result":{"ok":true},"id":"smoke"}
   ```
   if you want to validate before overwriting the production binary.

5. **Run the test suite.**
   ```bash
   npm run build && npm test
   ```
   Expect 46/46 green. The 5 integration tests under
   `tests/integration/macos-helper.test.ts` exercise the real binary at
   `~/.mcp-computer-use/bridge` — they are the canonical "did the bump
   break anything" check.

6. **Smoke-test the read-only CLI commands.** Fast, side-effect-free:
   ```bash
   node build/cli.js check-permissions
   node build/cli.js get-frontmost-window
   node build/cli.js list-windows | head
   ```

7. **Update `NOTICE`.** Replace the SHA in the attribution paragraph with
   `NEW_SHA`. Keep the rest of the wording.

8. **Commit.** Logical message:
   ```
   chore(deps): bump BackgroundComputerUseKit pin to <short-sha>
   ```
   Include `Package.swift`, `Package.resolved`, and `NOTICE` in the same
   commit so the pin moves atomically.

## When upstream breaks the wire shape

The wrapper at `native/macos/Sources/McpComputerUseHelper/ProtocolBridge.swift`
translates upstream DTOs to our existing JSON wire shape. If upstream renames
a field, removes a method, or changes a DTO's types, the wrapper must adapt
to keep our wire shape stable for the TypeScript layer.

Symptoms after a bump:
- `swift build` fails with type-mismatch errors → upstream changed a method
  signature or DTO shape. Update `ProtocolBridge.swift` to match.
- Build succeeds but `npm test` fails on integration tests → upstream
  changed runtime behaviour. Use `tests/fixtures/mock-helper.mjs` as the
  canonical wire shape; the wrapper output must match it byte-for-byte.

The Phase 0 Findings in `docs/superpowers/plans/2026-04-29-bg-computer-use-migration.md`
document the exact upstream API shape we depend on (DTO field names,
optional vs. required, error throwing semantics). Re-read it when in doubt.

## Future: tagged releases

Upstream has no git tags as of the initial pin. Track
[upstream issues](https://github.com/actuallyepic/background-computer-use/issues)
for a tagged-release cut; once available, switch the pin from
`revision: "<sha>"` to `from: "x.y.z"` (or `exact: "x.y.z"`) and remove the
SHA-bump step from this ritual.

## Larger upstream upgrades

Surfacing new upstream capabilities (semantic targeting, AX tree exposure,
verifier classification, window motion, `set_value`, `perform_secondary_action`)
is **not** part of the bump procedure above — that's separate v0.3.0 work
tracked in
[`docs/superpowers/plans/2026-04-29-expose-new-capabilities.md`](docs/superpowers/plans/2026-04-29-expose-new-capabilities.md).
The bump ritual is for keeping the existing wire shape working against
upstream patches; capability surfacing is a deliberate scope expansion.
