---
name: secret-scan
description: Scan git-tracked / staged files for plaintext secrets — API keys, bearer tokens, Canvas access tokens, cloud keys, private keys, and hardcoded credentials — before they get committed or pushed. Use as a gate inside commit-and-push, or on demand when the user says "scan for secrets", "check for leaked keys/credentials", "any API keys committed?".
---

# Secret Scan

Catch plaintext credentials **inside the repo's tracked content** before they're committed or
pushed. This is a heuristic net plus human/model judgment — not a guarantee — but it stops the
common, costly mistake of committing a real key.

Project rule (CLAUDE.md §6): tokens must live in the OS keychain via `CredentialManager`, never
in code. So **any hardcoded Canvas/API token is a definite finding.**

## Scope

- **Staged mode (default, for the commit gate):** only the changes about to be committed.
- **Tracked mode (full audit):** all files tracked by git.
- **Never** scan gitignored files (`.env`, `database/`, `.config/`, etc.) — they're out of scope
  and legitimately hold local secrets; flagging them is noise.

## Step 1 — Collect candidates

**Staged (added lines only):**

```bash
git diff --cached --no-color | grep -E '^\+' | grep -inE \
 -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
 -e 'AKIA[0-9A-Z]{16}' \
 -e 'AIza[0-9A-Za-z_-]{35}' \
 -e 'gh[pousr]_[0-9A-Za-z]{36}' \
 -e 'github_pat_[0-9A-Za-z_]{40,}' \
 -e 'xox[baprs]-[0-9A-Za-z-]{10,}' \
 -e 'sk_live_[0-9A-Za-z]{16,}' \
 -e '[0-9]{3,6}~[0-9A-Za-z]{30,}' \
 -e 'bearer[[:space:]]+[0-9A-Za-z._-]{20,}' \
 -e '(api[_-]?key|secret|access[_-]?token|client[_-]?secret|password|passwd)["'"'"' ]*[:=]["'"'"' ]*[0-9A-Za-z_./+-]{16,}'
```

**Tracked (full audit):** same patterns via `git grep`:

```bash
git grep -nIE -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -e 'AKIA[0-9A-Z]{16}' \
 -e 'AIza[0-9A-Za-z_-]{35}' -e 'gh[pousr]_[0-9A-Za-z]{36}' -e 'github_pat_[0-9A-Za-z_]{40,}' \
 -e 'sk_live_[0-9A-Za-z]{16,}' -e '[0-9]{3,6}~[0-9A-Za-z]{30,}'
# add case-insensitive assignment/bearer patterns with: git grep -niIE -e '...'
```

What each pattern catches: private-key blocks · AWS · Google · GitHub PAT/OAuth · Slack · Stripe ·
**Canvas access tokens (`<id>~<40+ chars>`)** · `Bearer <token>` · generic `key/secret/token =
"<value>"` assignments.

## Step 2 — Triage each hit (judgment, not blind blocking)

A hit is **NOT** a real secret if it is clearly one of:

- a **placeholder/example**: `your-…`, `<token>`, `xxxx`, `changeme`, `example`, `dummy`,
  `REDACTED`, all-zeros, or lives in `*.example` / sample docs;
- a **regex / pattern literal** — e.g. this repo's `Logger` PII-redaction code contains
  `Bearer\s+[A-Za-z0-9_-]+` and token-shaped patterns on purpose;
- a **name, not a value**: an env-var name, a TS type/interface field, a doc string;
- a **hash / integrity / UUID**: `package-lock.json` `sha512-…`, content hashes, etc.

Treat as a **finding** only if it looks like a real, live credential value.

## Step 3 — Report and gate

- **Real secret found → STOP.** Report `file:line` + the kind of secret, with the value **masked**
  (show only first/last few chars). Do **not** commit/push. Recommend, in order:
  1. Remove the literal from the code; load it from `CredentialManager` / env instead.
  2. If the file should never be tracked, add it to `.gitignore` and `git rm --cached` it.
  3. **If it was already committed in history, the key is compromised — rotate it** (revoke in
     Canvas/provider, issue a new one), then scrub history if needed (`git filter-repo`).
- **Only false positives, or nothing → pass.** Report "no plaintext secrets detected" and proceed.

## Notes

- Heuristic, not exhaustive. For stronger, maintained coverage, wire `gitleaks` or `trufflehog`
  as a real pre-commit hook — this skill is the lightweight, no-install gate.
- Tune patterns per project; add provider-specific key formats as needed.
