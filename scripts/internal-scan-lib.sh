#!/bin/bash
# SOURCE OF TRUTH: mcp-consultant-tools/scripts/internal-scan-lib.sh — mirrored to sibling repos verbatim.
# Shared internal-identifier scanning functions.
# Consumers: scripts/hooks/pre-commit, scripts/hooks/commit-msg, scripts/scan-tarball.sh
#
# This is a PUBLIC repo developed against internal client projects. Secrets are not the
# only leak class — client identifiers (org names, environment URLs, file keys, work-item
# IDs) must never be committed either. Two pattern sources:
#
#   1. .internal-strings.local (repo root) — PRIVATE denylist of known client/internal
#      identifiers. Untracked by design (gitignored via *.local); restore it from the
#      private claude-config repo if missing. Sections:
#        [SUBSTRING] — extended regex, matched case-insensitively anywhere
#        [WORD]      — whole-word match, case-sensitive (for short codes)
#      Denylist hits are NEVER false positives — do not bypass.
#
#   2. .internal-scan-placeholders (repo root, committed) — sanctioned placeholder tokens.
#      Endpoint-heuristic hits containing one of these tokens are allowed.

INTERNAL_LIST="${INTERNAL_LIST:-$REPO_ROOT/.internal-strings.local}"
PLACEHOLDER_LIST="${PLACEHOLDER_LIST:-$REPO_ROOT/.internal-scan-placeholders}"

# Real-looking internal endpoints (committable heuristics — work even without the private list)
ENDPOINT_PATTERNS='([a-z0-9-]+\.crm[0-9]*\.dynamics\.com|dev\.azure\.com/[A-Za-z0-9_-]+|[a-z0-9-]+\.sharepoint\.com|figma\.com/(board|file|design)/[A-Za-z0-9]{20,24}|[a-z0-9-]+\.b2clogin\.com|[a-z0-9-]+\.servicebus\.windows\.net|[a-z0-9-]+\.azurewebsites\.net)'

_internal_section() {
    # $1 = list file, $2 = section name → prints that section's patterns
    awk -v sec="[$2]" '$0==sec{on=1;next} /^\[/{on=0} on && !/^#/ && NF {print}' "$1"
}

_placeholder_filter() {
    # stdin (one extracted endpoint per line) → stdout, dropping lines matching a
    # sanctioned placeholder pattern (extended regex, case-insensitive, anchorable)
    if [ -f "$PLACEHOLDER_LIST" ]; then
        grep -viE -f <(grep -v '^#' "$PLACEHOLDER_LIST" | grep -v '^$') 2>/dev/null || true
    else
        cat
    fi
}

_warn_missing_denylist() {
    echo "⚠️  $INTERNAL_LIST not found — internal-identifier denylist scan SKIPPED." >&2
    echo "   Restore it from the private claude-config repo (it is intentionally untracked)." >&2
}

internal_scan() {
    # Scan stdin text. $1 = label for messages. Returns 1 on any hit.
    local label="$1" found=0 text subs words hits ep
    text=$(cat)
    [ -z "$text" ] && return 0

    if [ ! -f "$INTERNAL_LIST" ]; then
        _warn_missing_denylist
    else
        subs=$(_internal_section "$INTERNAL_LIST" SUBSTRING)
        words=$(_internal_section "$INTERNAL_LIST" WORD)
        hits=$(
            { [ -n "$subs" ] && printf '%s\n' "$text" | grep -iE -f <(printf '%s\n' "$subs");
              [ -n "$words" ] && printf '%s\n' "$text" | grep -wE -f <(printf '%s\n' "$words"); } 2>/dev/null | sort -u
        ) || true
        if [ -n "$hits" ]; then
            echo "🛑 INTERNAL IDENTIFIER detected in $label:"
            printf '%s\n' "$hits" | head -10 | sed 's/^/     /'
            found=1
        fi
    fi

    ep=$(printf '%s\n' "$text" | grep -oiE "$ENDPOINT_PATTERNS" 2>/dev/null | sort -u | _placeholder_filter)
    if [ -n "$ep" ]; then
        echo "🛑 REAL-LOOKING INTERNAL ENDPOINT in $label (use sanctioned placeholders — CLAUDE.md → Public Repo Hygiene):"
        printf '%s\n' "$ep" | head -10 | sed 's/^/     /'
        found=1
    fi
    return $found
}

internal_scan_dir() {
    # Scan a directory tree (text files only). $1 = dir, $2 = label. Returns 1 on any hit.
    local dir="$1" label="$2" found=0 subs words hits ep
    if [ ! -f "$INTERNAL_LIST" ]; then
        _warn_missing_denylist
    else
        subs=$(_internal_section "$INTERNAL_LIST" SUBSTRING)
        words=$(_internal_section "$INTERNAL_LIST" WORD)
        hits=$(
            { [ -n "$subs" ] && grep -rinIE -f <(printf '%s\n' "$subs") "$dir";
              [ -n "$words" ] && grep -rnwIE -f <(printf '%s\n' "$words") "$dir"; } 2>/dev/null | sort -u
        ) || true
        if [ -n "$hits" ]; then
            echo "🛑 INTERNAL IDENTIFIER detected in $label:"
            printf '%s\n' "$hits" | head -10 | sed 's/^/     /'
            found=1
        fi
    fi

    ep=$(grep -rhoiIE "$ENDPOINT_PATTERNS" "$dir" 2>/dev/null | sort -u | _placeholder_filter)
    if [ -n "$ep" ]; then
        echo "🛑 REAL-LOOKING INTERNAL ENDPOINT in $label (use sanctioned placeholders — CLAUDE.md → Public Repo Hygiene):"
        printf '%s\n' "$ep" | head -10 | sed 's/^/     /'
        found=1
    fi
    return $found
}
