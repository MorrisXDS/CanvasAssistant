---
name: branch-cleanup
description: Tidy local + remote git branches after PRs merge. Switches to main, fast-forward pulls, lists/deletes branches fully merged into main (locally and on origin), prunes stale tracking refs. Skips active worktree branches automatically. Use when the user says "clean up branches", "branch cleanup", "delete merged branches", "tidy branches", or "close out finished branches" after one or more PRs land.
---

# Branch cleanup

Post-merge tidying. Safe by construction — only deletes branches that are
**fully merged** into `main` (uses `git branch -d`, never `-D` /
`--force`). Skips branches checked out in another worktree (marked with
`+` in `git branch` output).

## When to use

- After one or more PRs merge to `main`.
- The user says any of the trigger phrases in the description.
- The branch list is getting cluttered.

## Do not use when

- The user wants to delete a _specific_ branch that hasn't been merged
  (use `git branch -D <name>` manually with their confirmation).
- There's uncommitted work on the current branch (commit or stash first).

## Steps

### 1. Snapshot current state

```bash
git status --short      # confirm clean working tree
git worktree list       # know which branches are in active worktrees (skip those)
```

If working tree isn't clean, **stop** — ask the user to commit/stash.

### 2. Switch to main + fast-forward

```bash
git checkout main
git pull --ff-only
git fetch --prune origin   # also removes refs for branches deleted upstream
```

### 3. Identify branches safe to delete

```bash
# Local merged (excludes main and worktree-marked + branches)
git branch --merged main | grep -v "^\* main$" | grep -v "^  main$" | grep -v "^+"

# Unmerged (just report — never delete)
git branch --no-merged main
```

Report any unmerged branches in the final summary so the user knows
they exist but were skipped.

### 4. Delete merged local branches

Pipe the merged list into `xargs -r -n1 git branch -d`:

```bash
git branch --merged main \
  | grep -v "^\* main$" \
  | grep -v "^  main$" \
  | grep -v "^+" \
  | xargs -r -n1 git branch -d
```

### 5. Delete merged remote branches

Some auto-delete on PR merge if the GitHub repo setting is on; check
what's left:

```bash
git branch -r --merged origin/main | grep -v "origin/main$" | grep -v "origin/HEAD"
```

Strip the `origin/` prefix and delete in one push:

```bash
git push origin --delete <name1> <name2> <name3>
```

Then prune stale tracking refs:

```bash
git remote prune origin
```

### 6. Report

| What               | Result        |
| ------------------ | ------------- |
| On branch          | `main`        |
| Up to date with    | `origin/main` |
| Local deleted      | (list)        |
| Remote deleted     | (list)        |
| Skipped (worktree) | (list)        |
| Skipped (unmerged) | (list)        |

## Edge cases

- **`Access is denied`** on remote delete → branch protection; user
  needs to lift it or push from a different account.
- **`branch not fully merged`** error from `git branch -d` → the branch
  has commits that didn't make it to main. Don't `-D` it without
  confirming with the user — they may need to cherry-pick.
- **Active worktree branch** (`+` marker) → skip silently; surface in
  the report.
