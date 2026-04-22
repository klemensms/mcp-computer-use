#!/bin/bash
# Install git hooks for secret scanning
# Run this after cloning the repository

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SOURCE_HOOKS="$SCRIPT_DIR/hooks"

echo "Installing git hooks..."

# Install pre-commit hook
if [ -f "$SOURCE_HOOKS/pre-commit" ]; then
    cp "$SOURCE_HOOKS/pre-commit" "$HOOKS_DIR/pre-commit"
    chmod +x "$HOOKS_DIR/pre-commit"
    echo "✅ Installed pre-commit hook (secret scanning)"
else
    echo "❌ pre-commit hook not found in $SOURCE_HOOKS"
    exit 1
fi

echo ""
echo "Done! Git hooks installed."
echo "The pre-commit hook will scan for secrets before each commit."
