# Master Development Plan

> Created: 2026-02-03 | Status: Active

---

## Priority 1: Bug Fixes ✅ COMPLETE

### 1.1 Downloaded Files Metadata Sync ✅

**Problem**: Files appear as downloaded in database even when they don't exist on disk.
**Status**: Fixed - clears `local_path` fields during backup import.

### 1.2 Back Button Navigation ✅

**Problem**: Back button doesn't redirect to where user came from.
**Status**: Fixed - proper navigation history tracking implemented.

### 1.3 Timezone Handling ✅

**Problem**: Time changes not handled properly in certain time zones.
**Status**: Fixed - using Luxon with IANA timezone database for DST-aware handling.

---

## Priority 2: App Uninstall Support ✅ COMPLETE

Implemented in-app uninstall feature (see `docs/UNINSTALL_FEATURE_PLAN.md`):

- [x] Clean up app data directory (`{userData}/CanvasAssistant`)
- [x] Remove credentials from OS keychain (via CredentialManager)
- [x] Clear downloaded files directory (`{downloads}/CanvasAssistant`) - optional/prompt user
- [x] Windows: In-app button launches NSIS uninstaller
- [x] macOS: In-app button shows app in Finder (user drags to Trash)
- [x] Linux: Shows terminal command + opens file manager

---

## Priority 3: L3 Intelligence Integration

**Status**: Architecture complete, needs integration verification.

The L3 layer already has:

- `PriorityEngine.ts` - Full implementation (1,137 lines)
- `domain/PriorityCalculator.ts` - Pure functions (671 lines)
- `orchestration/PriorityOrchestrator.ts` - Coordinates domain + DB (617 lines)
- 6 orchestrators (Priority, Behavior, Workload, Recommendation, Insight, AdaptiveLearning)
- Domain services: GradeCalculation, GraceToken, BehaviorAnalytics, EffortEstimator, etc.

### Integration Tasks

- [ ] Verify PriorityEngine/PriorityOrchestrator is correctly wired in ServiceRegistry
- [ ] Verify IPC handlers expose priority calculation to renderer
- [ ] Verify UI components consume priority data correctly
- [ ] Find and document any gaps between L3 services and actual usage
- [ ] Remove any dead code (old PolicyEngine.ts, duplicate implementations)

---

## Priority 4: Code Cleanup

### 4.1 Remove Unused/Dead Code

- [ ] Unused imports (e.g., mapAssignment, mapAnnouncement in SyncEngine.ts)
- [ ] Unused functions and variables
- [ ] Commented-out code blocks
- [ ] Deprecated features
- [ ] Orphaned components

### 4.2 Check Centralization Violations

| Violation Type             | Should Use                          |
| -------------------------- | ----------------------------------- |
| Local storage keys         | `STORAGE_KEYS` from settings module |
| Local date/time formatters | `formatters.ts`                     |
| Inline database row types  | `DatabaseRowTypes.ts`               |
| Magic numbers in L3        | `Constants.ts`                      |
| Local visibility filtering | `VisibleDataProvider`               |
| Custom modals/buttons      | UI primitives from `primitives/`    |

### 4.3 UI Improvements

- [ ] Improve field labels and placeholders
- [ ] Improve button text and tooltips
- [ ] Improve error messages and confirmations
- [ ] Improve empty state messages

### 4.4 Drag and Drop Fixes

- [ ] Restrict drop zones to section header rows only
- [ ] Prevent accidental drops in section content

---

## Completed

- [x] REFACTOR_ROADMAP - All 20 files assessed (72% line reduction achieved)
- [x] HTML Offline Viewing - Feature implemented and working

---

## Notes

### L3 Features Already Implemented

- Task type weight multipliers (final: 30, midterm: 25, exam: 20, etc.)
- Unlock time filtering ("upcoming" queue)
- Lock time critical boost
- Grace token salvage factor
- Submission status handling (-100 for graded, -50 for submitted, etc.)
