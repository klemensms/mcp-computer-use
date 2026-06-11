#!/bin/bash
# Install git hooks for secret + internal-identifier scanning
# Run this after cloning the repository

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SOURCE_HOOKS="$SCRIPT_DIR/hooks"

echo "Installing git hooks..."

for hook in pre-commit commit-msg; do
    if [ -f "$SOURCE_HOOKS/$hook" ]; then
        cp "$SOURCE_HOOKS/$hook" "$HOOKS_DIR/$hook"
        chmod +x "$HOOKS_DIR/$hook"
        echo "✅ Installed $hook hook"
    else
        echo "❌ $hook hook not found in $SOURCE_HOOKS"
        exit 1
    fi
done

if [ ! -f "$REPO_ROOT/.internal-strings.local" ]; then
    echo ""
    echo "⚠️  .internal-strings.local not found at repo root."
    echo "   The internal-identifier denylist scan will be skipped until you restore it"
    echo "   (it is intentionally untracked — maintainers sync it via a private repo)."
fi

echo ""
echo "Done! Hooks installed: pre-commit (secrets + internal identifiers in staged changes),"
echo "commit-msg (internal identifiers + credential-like strings in messages)."
