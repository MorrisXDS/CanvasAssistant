# Contributing to Canvas Assistant

Thanks for your interest! First, two honest notes:

- **Maintenance status.** Canvas Assistant was built solo over the course of my degree as
  a tool I used daily. It's feature-complete for personal use and now in **portfolio /
  light-maintenance mode** — bug reports and small PRs are welcome, but large feature work
  has wound down. Please open an issue to discuss anything substantial before investing
  time in a PR.
- **License.** The project is [PolyForm Noncommercial 1.0.0](LICENSE) — free to use,
  modify, and share for **non-commercial** purposes. By contributing you agree your
  contributions are licensed under the same terms.

## Getting set up

**Prerequisites:** Node.js 20+ (22+ recommended). Windows, macOS, or Linux.

```bash
git clone https://github.com/MorrisXDS/CanvasAssistant.git
cd CanvasAssistant
npm install
npm run dev        # main + renderer + electron, watch mode
```

> **Native-module footgun (read this):** `better-sqlite3` is compiled for one ABI at a
> time. The app/e2e want **Electron** ABI (`npm run rebuild`); Jest wants **Node** ABI
> (its `pretest` rebuilds automatically). If you see a `NODE_MODULE_VERSION` mismatch,
> run the matching rebuild. Full details in [docs/TESTING.md](docs/TESTING.md).

## Before you open a PR

Run the gates locally:

```bash
npm run build      # tsc + vite — must pass
npm run lint       # eslint
npm test           # Jest (unit + integration); add tests for your change
npm run test:e2e   # Playwright (only if you touched UI / keyboard / visibility; local-only)
```

- **Tests are required** for behavior changes (new method → unit test; bug fix →
  regression test; new file → test file). CI enforces a **per-PR diff-coverage** gate:
  every added/modified `src/` line must be exercised by a test.
- **Branch → PR → green CI → merge.** Don't push to `main`. Keep PRs focused.
- **Conventional Commits.** Commit messages must match `type(scope): subject` where `type`
  is one of `feat`/`fix`/`refactor`/`perf`/`test`/`docs`/`style`/`chore`/`ci`/`build`/`revert`.
  A commit hook enforces this.

## Architecture & conventions

Please skim [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first — the codebase is a strict
**7-layer** stack with a few load-bearing invariants that are **enforced by tests** (they
fail CI if violated):

- **No upward imports** between layers; renderer ↔ main only via the typed IPC contract.
- **IPC handlers are thin** — no SQL; reads via L1 readers, writes via L4 commands ([ADR-0007](docs/adr/0007-ipc-handlers-thin-adapters.md)).
- **Course visibility** — every course-scoped query filters through the `VisibilityOracle`.
- **Single source of truth** — UI reads domain data from the Zustand store via selectors,
  not local `useState`.
- **Use the `Modal` primitive** for dialogs, and the **stack-aware hotkey** wrappers for
  keyboard ([ADR-0006](docs/adr/0006-modal-stack-aware-hotkey-suppression.md)) — raw
  `useHotkeys` / handwritten modals fail the fitness-function tests.

Significant or hard-to-reverse decisions get an [ADR](docs/adr/). If your change makes one,
add a new ADR (don't rewrite an old one — supersede it).

## Reporting bugs

Open an issue with: what you expected, what happened, your OS, and steps to reproduce.
Since the app is offline-first and local, a description of your local state (e.g. number of
courses, whether you were mid-sync) helps a lot.

Thanks for helping keep the project tidy.
