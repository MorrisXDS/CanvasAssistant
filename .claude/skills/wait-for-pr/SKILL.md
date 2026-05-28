---
name: wait-for-pr
description: Wait for a GitHub PR to merge, then continue the next queued task. Polls `gh pr view N --json state` every 30s in a backgrounded Bash and triggers one notification when state flips to MERGED. Use when the user says "wait for PR N to merge then do X", "wait for the merge", "WAIT AND THEN PROCEED", or any "wait until #N lands → next PR" handoff. Pairs with sequenced PR work (ADR-0007 migration train, dependent PRs, etc.).
---

# Wait for PR merge → proceed

The standardised wait-then-proceed action. One backgrounded poll, one
completion notification, then the next action runs.

## When to use

- A PR is open, CI not yet green, and the next task depends on it
  landing first (e.g., dependent migration PRs, rebase-on-main next).
- The user says any trigger phrase in the description.
- You'd otherwise be tempted to busy-poll `gh pr view` between turns,
  burning prompt-cache hits.

## Do not use when

- The PR is already merged (`gh pr view N --json state` shows MERGED).
  Skip the wait and proceed directly.
- The next task is independent and can start now (start it, branch from
  the PR's branch, rebase to main after merge).
- You'd need MULTIPLE notifications (state changes, comments, etc.) —
  Monitor with a poll loop is the right tool then.

## The pattern

One Bash call, `run_in_background: true`, with a tight `until` loop:

```bash
until [ "$(gh pr view <PR#> --json state -q .state 2>/dev/null)" = "MERGED" ]; do
  sleep 30
done
echo "PR #<PR#> MERGED"
```

- **30s poll interval** — `gh` API rate-limited; 30s is the existing
  Monitor docs' recommended cadence for remote API polling.
- **`2>/dev/null` on `gh`** — transient network failures don't kill the
  loop; the next iteration retries.
- **Exit on MERGED** — the harness notifies once when the background
  Bash exits.
- **`timeout` arg** — set high (`1800000` ms = 30 min) so a slow CI run
  doesn't time out the wait. Adjust upward for longer CI.

## Steps

1. Verify PR is open and not yet merged:

   ```
   gh pr view <PR#> --json state,mergeStateStatus -q '{state, merge: .mergeStateStatus}'
   ```

   If `state` is already `MERGED`, skip to step 3.

2. Fire the wait:

   ```
   Bash(
     command: 'until [ "$(gh pr view <PR#> --json state -q .state 2>/dev/null)" = "MERGED" ]; do sleep 30; done; echo "PR #<PR#> MERGED"',
     run_in_background: true,
     timeout: 1800000,
     description: "Wait until PR #<PR#> merged"
   )
   ```

3. When the notification arrives (or if step 1 said MERGED), resume the
   next action — typically:
   ```
   git checkout main && git pull --ff-only
   git branch -d <merged-branch-name>  # local cleanup
   git checkout -b <next-feature-branch>
   ```
   Then start the next PR's slice work.

## Edge cases

- **PR closed without merge.** The `until` loop never exits — the wait
  runs to timeout. Mitigation: include `closed` in the poll if the user
  signals "PR might be closed, not merged":
  ```bash
  state=$(gh pr view <PR#> --json state -q .state 2>/dev/null)
  if [ "$state" = "MERGED" ] || [ "$state" = "CLOSED" ]; then exit 0; fi
  ```
  Then check state again after the wait completes; if CLOSED, treat it
  as a user abort, not a green light.
- **CI green but auto-merge not enabled.** The wait will not terminate
  until someone clicks merge. Tell the user.
- **`gh` not installed / not authenticated.** First poll fails silently,
  loop spins forever. The pre-check in step 1 catches this — it'll
  show an error you can surface to the user.

## Cross-references

- `feedback_wait-for-pr-merge` in MEMORY.md — pattern memory.
- ScheduleWakeup is `/loop`-mode-only; cannot substitute here.
- Monitor tool is overkill for single-completion notifications.
