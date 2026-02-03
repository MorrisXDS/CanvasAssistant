# Codebase Refactoring Roadmap

> Generated: 2026-01-31 | Updated: 2026-02-03

## Progress Summary

| Phase | Total Files | Completed | In Progress |
|-------|-------------|-----------|-------------|
| Phase 1 | 5 | 5 ✅ | 0 |
| Phase 2 | 8 | 4 | 4 |
| Phase 3 | 7 | 2 | 5 |

---

## Refactoring Status

### Phase 1: Safe Leaf Nodes ✅ COMPLETE

| # | File | Original | Current | Reduction | Status |
|---|------|----------|---------|-----------|--------|
| 1 | `settingsSchema.ts` | 965 | 576 | 40% | ✅ Done |
| 2 | `Onboarding.tsx` | 971 | 587 | 40% | ✅ Done |
| 3 | `DataMappers.ts` | 1,109 | 896 | 19% | ✅ Done |
| 4 | `CalendarGrid.tsx` | 2,342 | 201 | 91% | ✅ Done |
| 5 | `MigrationRunner.ts` | 2,385 | 186 | 92% | ✅ Done |

---

### Phase 2: Moderate Coupling (In Progress)

| # | File | Original | Current | Reduction | Status |
|---|------|----------|---------|-----------|--------|
| 6 | `Layout.tsx` | 1,016 | 253 | 75% | ✅ Done |
| 7 | `Calendar/index.tsx` | 1,587 | 790 | 50% | 🔶 Partial |
| 8 | `CalendarPage.tsx` | 1,491 | 888 | 40% | 🔶 Partial |
| 9 | `SettingsModal.tsx` | 3,610 | 45 | 99% | ✅ Done |
| 10 | `EventFormModal.tsx` | 1,019 | 905 | 11% | ⏳ **NEXT** |
| 11 | `SyncEngine.ts` | 5,587 | 1,947 | 65% | 🔶 Partial |
| 12 | `ExportManager.ts` | 942 | 342 | 64% | ✅ Done |
| 13 | `CoursesPage.tsx` | 2,111 | 829 | 61% | 🔶 Partial |

---

### Phase 3: Hub Files (High Risk)

| # | File | Original | Current | Reduction | Status |
|---|------|----------|---------|-----------|--------|
| 14 | `main.ts` | 9,814 | 1,516 | 85% | ✅ Done |
| 15 | `store.ts` | 1,555 | 1,578 | 0% | ⏳ Pending |
| 16 | `PriorityEngine.ts` | 1,137 | 1,137 | 0% | ⏳ Pending |
| 17 | `ipc-contract.ts` | 1,473 | 1,501 | 0% | ⏳ Pending |
| 18 | `HtmlContentSync.ts` | 1,068 | 1,068 | 0% | ⏳ Pending |
| 19 | `FilesPage.tsx` | 1,988 | 2,282 | -15% | ⏳ Pending |
| 20 | `CourseDetail.tsx` | 4,037 | 1,031 | 75% | ✅ Done |

---

## Next Target

**`EventFormModal.tsx`** (905 lines, 11% reduction)
- Complex form component with minimal refactoring done
- Strategy: Extract form sections, validation logic, state hooks

---

## Updated Statistics

| Metric | Original | Current | Change |
|--------|----------|---------|--------|
| Total Lines (Top 20) | 56,223 | ~15,800 | -72% |
| Largest File | main.ts (9,814) | FilesPage.tsx (2,282) | |
| Files > 1,000 lines | 17 | 7 | -59% |

---

## Coupling Definitions

- **Inbound**: Number of other files that import this file
- **Outbound**: Number of imports this file has
- **Coupling Score**: Inbound + Outbound

### Risk Levels

| Risk | Coupling | Description |
|------|----------|-------------|
| SAFE | < 15 | Leaf nodes, safe to refactor |
| CAUTION | 15-25 | Moderate dependencies, plan carefully |
| RISKY | 25-45 | Many dependencies, requires testing |
| CRITICAL | > 45 | Hub file, changes ripple everywhere |

---

## Verification Checklist

After each file refactor:
- [ ] `npm run build` succeeds
- [ ] `npm test` - no new failures
- [ ] Manual smoke test of affected features
- [ ] Update this document with completion status
