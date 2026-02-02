# Refactoring Plan

## 1. Re-evaluate Refactoring Plan

Review and update any existing refactoring plans given recent changes:
- Location field with bidirectional sync (tasks ↔ calendar events)
- New task types (Meeting, Presentation, Writing, Performing)
- ScheduleCard improvements (removed maxItems limit)
- CourseDetail inline edit enhancements
- EventFormModal coursework editing fixes

Identify completed items, stale assumptions, and new priorities.

---

## 2. Improve UI Wordings

Audit and improve text across the application:
- Field labels and placeholders
- Button text and tooltips
- Error messages and confirmations
- Empty state messages
- Section headers and descriptions

Goal: Natural, consistent, user-friendly language throughout.

---

## 3. Remove Unused/Dead Code

Clean up accumulated dead code:
- Unused imports (e.g., `mapAssignment`, `mapAnnouncement`, `mapModule` in SyncEngine.ts)
- Unused functions and variables
- Commented-out code blocks
- Deprecated features no longer in use
- Orphaned components or utilities

---

## 4. Adjust Drag and Drop Areas

Restrict drag and drop zones:
- Drop zones should only apply to section header rows
- Prevent accidental drops when interacting with section content
- Improve drag interaction predictability

---

## 5. Check for Centralization Principle Violations

Audit codebase for violations of centralized module usage:

| Violation Type | Should Use |
|----------------|------------|
| Local storage keys | `STORAGE_KEYS` from settings module |
| Local date/time formatters | `formatters.ts` |
| Inline database row types | `DatabaseRowTypes.ts` |
| Magic numbers in L3 | `Constants.ts` |
| Local visibility filtering | `VisibleDataProvider` |
| Custom modals/buttons | UI primitives from `primitives/` |

---

## Status

| Task | Status |
|------|--------|
| 1. Re-evaluate refactoring plan | Pending |
| 2. Improve UI wordings | Pending |
| 3. Remove unused/dead code | Pending |
| 4. Adjust drag and drop areas | Pending |
| 5. Check centralization violations | Pending |
