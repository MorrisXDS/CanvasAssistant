#!/usr/bin/env sh
#
# Pre-commit secret scan — blocks commits that ADD a plaintext credential.
#
# Deterministic, high-precision patterns only (low false-positive rate) so it can
# safely block. The broader, judgment-based net lives in the `secret-scan` Claude
# Code skill (.claude/skills/secret-scan).
#
# Scans only added lines in the staged diff, excluding the scanner's own files
# (which contain these patterns as literals).
#
# Bypass for a CONFIRMED false positive:  git commit --no-verify

matches=$(git diff --cached --no-color -- . \
    ':(exclude)scripts/secret-scan.sh' \
    ':(exclude).husky/pre-commit' \
    ':(exclude).claude/skills/secret-scan/SKILL.md' \
  | grep -E '^\+' | grep -vE '^\+\+\+' | grep -E \
    -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
    -e 'AKIA[0-9A-Z]{16}' \
    -e 'AIza[0-9A-Za-z_-]{35}' \
    -e 'gh[pousr]_[0-9A-Za-z]{36}' \
    -e 'github_pat_[0-9A-Za-z_]{40,}' \
    -e 'sk_live_[0-9A-Za-z]{16,}' \
    -e 'xox[baprs]-[0-9A-Za-z-]{10,}' \
    -e '[0-9]{3,6}~[0-9A-Za-z]{40,}')

if [ -n "$matches" ]; then
  echo ""
  echo "✖ Secret scan: possible plaintext credential(s) in staged changes:"
  echo "$matches" | sed 's/^+//'
  echo ""
  echo "  Remove the secret and load it from the OS keychain / env instead, then re-stage."
  echo "  If this is a false positive, bypass with:  git commit --no-verify"
  echo ""
  exit 1
fi

exit 0
