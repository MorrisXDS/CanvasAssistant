#!/usr/bin/env sh

# scripts/test-deletion-check.sh
#
# Test-deletion correspondence check (PR-Gate-2 slice 2).
#
# Called from .husky/commit-msg AFTER commitlint passes. If any
# tests/**/*.test.{ts,tsx} file is deleted in the staged diff, the commit
# message MUST contain at least one `Test-deletion: <reason>` trailer.
#
# This does NOT verify the deletion semantically corresponds to a code
# change — that's genuinely hard to do mechanically (renames, consolidations,
# integration tests that cover many src files). It DOES force the author to
# explicitly acknowledge the deletion in writing — the acknowledgment IS
# the audit trail.
#
# Future maintenance: if the project adds new test file conventions
# (e.g. *.spec.ts, e2e fixtures under e2e/), extend the regex below.

set -e

MSG_FILE="$1"
if [ -z "$MSG_FILE" ] || [ ! -f "$MSG_FILE" ]; then
  # Hook called without arg or wrong file — pass. Let other tools fail
  # if the harness is broken; not our job to diagnose.
  exit 0
fi

# Find deleted test files in the staged diff. --diff-filter=D filters to
# "deleted only"; the awk pattern matches *.test.ts and *.test.tsx under
# tests/ (any depth).
DELETED_TESTS=$(git diff --cached --name-status --diff-filter=D \
  | awk '/^D\s+tests\/.*\.test\.(ts|tsx)$/ { print $2 }')

if [ -z "$DELETED_TESTS" ]; then
  # No test deletions in this commit — nothing to check.
  exit 0
fi

# At least one test deleted. Require a "Test-deletion:" trailer.
# Pattern: line starts with "Test-deletion:", then whitespace, then non-empty content.
if grep -qE '^Test-deletion:[[:space:]]+\S' "$MSG_FILE"; then
  exit 0
fi

# No trailer → block with a clear instruction.
echo "" >&2
echo "✗ Test deletion(s) require explicit acknowledgment." >&2
echo "" >&2
echo "Deleted test files in this commit:" >&2
echo "$DELETED_TESTS" | sed 's/^/  - /' >&2
echo "" >&2
echo "Add a trailer to your commit message explaining the deletion:" >&2
echo "  Test-deletion: <reason>" >&2
echo "" >&2
echo "Example:" >&2
echo "  refactor(calendar): retire unused calendar feature" >&2
echo "" >&2
echo "  Removes the slice and its IPC handlers." >&2
echo "" >&2
echo "  Test-deletion: paired with calendar slice retirement" >&2
echo "" >&2
exit 1
