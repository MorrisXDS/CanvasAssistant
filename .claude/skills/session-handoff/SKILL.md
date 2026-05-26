---
name: session-handoff
description: Capture the current session's work, decisions, and open threads into the user's project memory file (`~/.claude/projects/E--CanvasAssistant/memory/MEMORY.md`) so a fresh Claude session picks up where this one left off — the memory file is auto-loaded on session start. Use when the user says "session handoff", "end of session", "save context for next time", "I'm starting a fresh session", "carry over context", or at the end of a multi-PR work block before the user steps away.
---

# Session handoff

`MEMORY.md` at `C:\Users\ROG\.claude\projects\E--CanvasAssistant\memory\MEMORY.md`
is auto-loaded by Claude Code on every session start for this project.
Anything written there is the cheapest, highest-leverage way to carry
forward conversational context (the "why we did X" thread of reasoning,
recent decisions, in-flight work) without the next session having to
re-derive it from commit messages + CHANGELOG + FOLLOWUPS.

## When to use

- End of a multi-PR work block; the user is about to start a fresh
  session or step away.
- The user says any of the trigger phrases.
- A non-trivial decision was made that's worth preserving (e.g.
  "we tried X but went with Y because Z") that wouldn't survive in
  commit messages alone.

## Do not use when

- The work is trivial / one-off (a typo fix doesn't deserve a memory
  entry).
- The information is already captured in:
  - `CLAUDE.md` (durable architectural rules)
  - `docs/FOLLOWUPS.md` (cleanup work items)
  - `CHANGELOG.md` (user-facing changes)
  - The git history with descriptive commit messages
  - A plan file under `~/.claude/plans/`

  Duplicate captures are worse than no capture — they go stale.

## What auto-loads (don't re-state)

For context — these are already visible to a fresh session:

| Source                      | Contents                                                                 |
| --------------------------- | ------------------------------------------------------------------------ |
| `.claude/skills/`           | Every project skill + its trigger phrases                                |
| `CLAUDE.md`                 | Architectural rules (§2 SOPs, §7 testing, §8 visibility, §9 doc routing) |
| `MEMORY.md` itself          | Previous handoff entries                                                 |
| `docs/FOLLOWUPS.md`         | Open audit / cleanup work items                                          |
| `CHANGELOG.md [Unreleased]` | Recent user-facing changes                                               |
| `git log`                   | Commit messages (high-quality ones survive as docs)                      |

MEMORY.md is for **conversational context that doesn't fit elsewhere.**

## What to capture

Skip anything that's covered by the auto-loaded sources above. The
remaining signal worth preserving:

1. **Recent PRs by number with a one-line "why"** — git log has the
   commits, but a brief tying-together helps a fresh agent orient fast.
2. **Codified rules added this session** — point to the CLAUDE.md
   section by name (don't restate the rule).
3. **Open follow-ups by name** — point to `docs/FOLLOWUPS.md` sections;
   note which ones a future session should pick up first.
4. **Key gotchas / decisions** — the "we tried X but went with Y" stuff
   that lives only in conversation. Examples from past sessions:
   - "`var(--color-primary)` does NOT exist — use `--color-navy`."
   - "better-sqlite3 ABI flip — `npm test` vs `npm run dev` flip the ABI."
   - "`useHotkeys` attaches at document level; underlying page handlers
     still fire when a modal is open unless explicitly suppressed."

## How to write the entry

Append a new section to `MEMORY.md` before the closing line. Section
title: `## Recent session work (YYYY-MM-DD — <slug>)`. Use a tight,
scannable format with sub-headings like:

```md
## Recent session work (YYYY-MM-DD — <short slug>)

<one-paragraph "what we did this session, top-level">

### PRs landed

- **#N** (`<hash>`) — one line of _why_, not what (commit msg covers what).

### Codified rules added

- New SOP in CLAUDE.md §N — point to the section, don't restate.

### Open follow-ups

- Section name in docs/FOLLOWUPS.md — one line on next-step bias.

### Key gotchas

- Single-bullet items that aren't obvious from the codebase.
```

Then add additional sub-headings as needed (no template — capture
what's actually useful).

## How to write it conservatively

- **Be terse.** This file is auto-loaded into every future session —
  bloat costs context window. ~50 lines per session entry is plenty.
- **Don't restate** anything that's in CLAUDE.md / FOLLOWUPS.md /
  CHANGELOG.md / git log.
- **Point, don't paste.** "See PR #16 / CLAUDE.md §2 / FOLLOWUPS.md
  'state-duplication cleanup'" beats inlining the content.
- **Prune old entries** as they age out (more than ~2 months old and
  not referenced anymore? delete). Use the `consolidate-memory` skill
  (in `anthropic-skills:`) for a periodic reflective pass.

## Steps

1. Read the current `MEMORY.md` to know what's already there and what
   shape the existing entries take.
2. Identify what to capture per the criteria above. **Ask the user**
   if you're unsure whether a specific item is worth capturing — the
   user has more context on what they want to remember.
3. Compose the new section. Append before the last line of the file.
4. Save. Done — next session auto-loads it.

## After saving

Tell the user:

- That the handoff is saved to `MEMORY.md`.
- That a fresh session will see it immediately.
- One sentence reminding them of any urgent open thread captured
  (e.g. "PR #19 is still open and waiting on CI" if applicable).

Do NOT push, commit, or modify any other file — `MEMORY.md` lives in
the user's `~/.claude/projects/` directory, outside the repo.
