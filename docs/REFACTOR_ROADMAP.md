# Codebase Refactoring Roadmap

> Generated: 2026-01-31 | Quantitative analysis of file size and coupling

## Quantitative Analysis Results

### Top 20 Largest Files - Ordered by Coupling (Least to Most)

| Rank | File | Lines | Inbound | Outbound | Coupling | Risk |
|------|------|-------|---------|----------|----------|------|
| 1 | `l5-presentation/settings/settingsSchema.ts` | 965 | 3 | 1 | **4** | SAFE |
| 2 | `l6-ui/components/Onboarding.tsx` | 971 | 2 | 4 | **6** | SAFE |
| 3 | `l2-daemon/DataMappers.ts` | 1,109 | 6 | 2 | **8** | SAFE |
| 4 | `l6-ui/components/Calendar/CalendarGrid.tsx` | 2,342 | 9 | 2 | **11** | SAFE |
| 5 | `l1-persistence/MigrationRunner.ts` | 2,385 | 8 | 3 | **11** | SAFE |
| 6 | `l6-ui/components/Layout.tsx` | 1,016 | 2 | 11 | **13** | SAFE |
| 7 | `l6-ui/components/Calendar/index.tsx` | 1,587 | 4 | 11 | **15** | CAUTION |
| 8 | `l6-ui/components/pages/CalendarPage.tsx` | 1,491 | 12 | 7 | **19** | CAUTION |
| 9 | `l6-ui/components/SettingsModal.tsx` | 3,610 | 10 | 9 | **19** | CAUTION |
| 10 | `l6-ui/components/Calendar/EventFormModal.tsx` | 1,019 | 15 | 6 | **21** | CAUTION |
| 11 | `l2-daemon/SyncEngine.ts` | 5,587 | 7 | 14 | **21** | CAUTION |
| 12 | `l2-daemon/ExportManager.ts` | 942 | 12 | 10 | **22** | CAUTION |
| 13 | `l6-ui/components/pages/CoursesPage.tsx` | 2,111 | 12 | 11 | **23** | CAUTION |
| 14 | `main.ts` | 9,814 | 3 | 25 | **28** | RISKY |
| 15 | `l5-presentation/store.ts` | 1,555 | 26 | 4 | **30** | RISKY |
| 16 | `l3-intelligence/PriorityEngine.ts` | 1,137 | 27 | 8 | **35** | RISKY |
| 17 | `shared/ipc-contract.ts` | 1,473 | 34 | 1 | **35** | RISKY |
| 18 | `l2-daemon/HtmlContentSync.ts` | 1,068 | 32 | 7 | **39** | RISKY |
| 19 | `l6-ui/components/Files/FilesPage.tsx` | 1,988 | 27 | 16 | **43** | RISKY |
| 20 | `l6-ui/components/pages/CourseDetail.tsx` | 4,037 | 46 | 14 | **60** | CRITICAL |

---

## Refactoring Order (Start Here)

### Phase 1: Safe Leaf Nodes (Low Risk, High Value)

**File #1: `settingsSchema.ts`** (965 lines, coupling: 4)
- Why first: Lowest coupling, self-contained validation schemas
- Strategy: Split by settings domain (sync, display, notifications, etc.)
- Impact: Minimal - only 3 files import this

**File #2: `Onboarding.tsx`** (971 lines, coupling: 6)
- Why: Isolated onboarding flow, rarely touched by other code
- Strategy: Extract step components (welcome, API setup, course selection)
- Impact: Only 2 inbound imports

**File #3: `DataMappers.ts`** (1,109 lines, coupling: 8)
- Why: Pure transformation functions, well-isolated
- Strategy: Group mappers by entity type (course, task, notification)
- Impact: 6 inbound imports, all in L2 layer

**File #4: `CalendarGrid.tsx`** (2,342 lines, coupling: 11)
- Why: Large but isolated calendar rendering logic
- Strategy: Extract MonthView, WeekView, DayView sub-components
- Impact: 9 inbound imports, all within Calendar component

**File #5: `MigrationRunner.ts`** (2,385 lines, coupling: 11)
- Why: Database migrations, rarely modified after creation
- Strategy: Extract migration helpers, keep migration registry
- Impact: 8 inbound imports, all initialization code

---

### Phase 2: Moderate Coupling (Requires Care)

6. `Layout.tsx` (1,016 lines)
7. `Calendar/index.tsx` (1,587 lines)
8. `CalendarPage.tsx` (1,491 lines)
9. `SettingsModal.tsx` (3,610 lines) - **HIGH VALUE TARGET**
10. `EventFormModal.tsx` (1,019 lines)
11. `SyncEngine.ts` (5,587 lines) - **LARGEST IN PHASE**
12. `ExportManager.ts` (942 lines)
13. `CoursesPage.tsx` (2,111 lines)

---

### Phase 3: Hub Files (High Risk, Requires Testing)

14. `main.ts` (9,814 lines) - **LARGEST FILE IN CODEBASE**
    - Extract IPC handlers to `ipc-handlers/` directory
    - Move service initialization to ServiceRegistry
    - Split into lifecycle, handlers, window management

15. `store.ts` (1,555 lines)
    - Audit selector granularity
    - Consider slice-based architecture

16. `PriorityEngine.ts` (1,137 lines)
17. `ipc-contract.ts` (1,473 lines)
18. `HtmlContentSync.ts` (1,068 lines)
19. `FilesPage.tsx` (1,988 lines)
20. `CourseDetail.tsx` (4,037 lines) - **MOST COUPLED - DO LAST**

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Lines (Top 20) | 56,223 |
| Largest File | main.ts (9,814) |
| Most Coupled | CourseDetail.tsx (60) |
| Least Coupled | settingsSchema.ts (4) |
| Files > 3,000 lines | 4 |

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

## First Refactor Target

**Start with: `src/layers/l5-presentation/settings/settingsSchema.ts`**

- 965 lines, coupling score: 4
- Only 3 files depend on it
- Can be split into domain-specific schema files
- Low risk, sets pattern for future refactors

---

## Verification Checklist

After each file refactor:
- [ ] `npm run build` succeeds
- [ ] `npm test` - no new failures
- [ ] Manual smoke test of affected features
- [ ] Update this document with completion status
