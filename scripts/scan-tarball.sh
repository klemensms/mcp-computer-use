#!/bin/bash
# SOURCE OF TRUTH: mcp-consultant-tools/scripts/scan-tarball.sh — mirrored to sibling repos verbatim.
# Scan the npm tarball a package would publish (i.e. the compiled build/ output that
# actually ships) for internal/client identifiers and forbidden files.
#
# Why: pre-commit scans source diffs, but identifiers baked into examples compile into
# build/ output and ship to npm — this gate catches that class. MANDATORY before every
# `npm publish` (wired into /release_workflow and /release_workflow_beta).
#
# Usage: ./scripts/scan-tarball.sh packages/figma
# Exit 0 = clean, 1 = findings (ABORT the release), 2 = usage/pack error.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

PKG="${1:-}"
if [ -z "$PKG" ]; then
    echo "Usage: $0 <package-dir>  (e.g. $0 packages/figma)" >&2
    exit 2
fi
ABS_PKG=$(cd "$REPO_ROOT/$PKG" 2>/dev/null && pwd) || ABS_PKG=$(cd "$PKG" 2>/dev/null && pwd) || {
    echo "❌ Package dir not found: $PKG" >&2
    exit 2
}

# shellcheck source=internal-scan-lib.sh
source "$REPO_ROOT/scripts/internal-scan-lib.sh"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "📦 Packing $PKG ..."
(cd "$TMP" && npm pack "$ABS_PKG" --silent >/dev/null 2>"$TMP/pack-err.log" && tar -xzf ./*.tgz) || {
    echo "❌ npm pack failed for $PKG:" >&2
    cat "$TMP/pack-err.log" >&2
    exit 2
}

FOUND=0

# Forbidden files in the tarball
BAD_FILES=$(find "$TMP/package" \( -name '.env*' -o -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' -o -name '.npmrc' \) ! -name '.env.example' 2>/dev/null || true)
if [ -n "$BAD_FILES" ]; then
    echo "🛑 Forbidden file(s) inside the tarball:"
    printf '%s\n' "$BAD_FILES" | sed "s|$TMP/||; s/^/     /"
    FOUND=1
fi

# Internal identifiers + endpoint heuristics over everything that would ship
if ! internal_scan_dir "$TMP/package" "tarball of $PKG"; then
    FOUND=1
fi

if [ $FOUND -eq 1 ]; then
    echo ""
    echo "🛑 TARBALL SCAN FAILED for $PKG — do NOT publish. Fix the source, rebuild, re-scan."
    exit 1
fi

echo "✅ Tarball clean: $PKG"
exit 0
