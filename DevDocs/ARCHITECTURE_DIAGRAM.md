# Canvas Integration Dashboard - Architecture Diagram

**Version:** 2.0 (Revised from v4.0 spec)
**Date:** January 21, 2026
**Changes:** Sequential L0-L6 numbering, L0 simplified to utilities

---

## Overview

The Canvas Integration Dashboard uses a **7-layer isolation architecture** with **unidirectional data flow**. Each layer has a single responsibility and communicates through strict contracts.

**Key Principles:**
- **Unidirectional Flow:** Data flows down (user actions), state flows up (commit events)
- **Event-Driven:** UI reacts to database changes via event emitters, not polling
- **Idempotency:** All operations can be safely retried
- **Offline-First:** System remains functional during network failures

---

## Layer Diagram (L0-L6)

```text
┌─────────────────────────────────────────────────────────────┐
│                   L6: UI LAYER (React)                      │
│  ┌──────────────┬──────────────┬──────────────────────────┐ │
│  │  Dashboard   │  Calendar    │  Course  │ Notifs │ Files│ │
│  │              │              │  Detail  │        │      │ │
│  └──────────────┴──────────────┴──────────────────────────┘ │
│                                                               │
│  • Virtual lists (react-window) for performance             │
│  • Keyboard-centric navigation (Alt+1-5, j/k)               │
│  • Theme support (light/dark/system)                        │
└─────────────────────────────────────────────────────────────┘
                           ↓ Props (read-only)
                           ↑ User Events (clicks, keyboard)
┌─────────────────────────────────────────────────────────────┐
│              L5: PRESENTATION LAYER (Zustand)               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Global State Store                                  │   │
│  │  • courses[]                                         │   │
│  │  • assignments[] (sorted by priority_score)          │   │
│  │  • notifications[]                                   │   │
│  │  • syncStatus: 'idle' | 'syncing' | 'error'          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  • Subscribes to L1 commit events                           │
│  • Computes view models on database changes                 │
│  • Example: DashboardViewModel { priorityQueue, stats }     │
└─────────────────────────────────────────────────────────────┘
                           ↓ dispatch(command)
                           ↑ state changes (events)
┌─────────────────────────────────────────────────────────────┐
│          L4: CONTROLLER LAYER (Command Dispatcher)          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Command Pattern                                     │   │
│  │  • UpdateAssignmentGradeCommand                      │   │
│  │  • DismissNotificationCommand                        │   │
│  │  • CreateEventCommand                                │   │
│  │  • TriggerSyncCommand                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  • Validates user commands before execution                 │
│  • Ensures atomic transactions (via L1)                     │
│  • Handles conflict resolution logic                        │
│  • Invokes L3 for calculations when needed                  │
└─────────────────────────────────────────────────────────────┘
                           ↓ calculation requests
                           ↑ computed values
┌─────────────────────────────────────────────────────────────┐
│         L3: INTELLIGENCE LAYER (Priority Engine)            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Pure Functions (No Side Effects)                    │   │
│  │  • calculatePriorityScore(assignment, course)        │   │
│  │  • calculateAssessedGrade(assignments[])             │   │
│  │  • calculateTargetDelta(assessed, target, remaining) │   │
│  │  • calculateVolatility(gradeHistory[])               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  • ROI scoring with custom formula                          │
│  • Grade analytics (assessed vs current)                    │
│  • Volatility calculation (STDDEV of history)               │
│  • Rule-based importance (keywords, weights)                │
└─────────────────────────────────────────────────────────────┘
                           ↓ raw Canvas data
                           ↑ calculated fields to persist
┌─────────────────────────────────────────────────────────────┐
│          L2: DAEMON LAYER (Adaptive Sync Engine)            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Canvas API Client                                   │   │
│  │  • Rate-limited queue (max 3 concurrent)             │   │
│  │  • Conditional GET with ETag caching                 │   │
│  │  • Exponential backoff on 429/5xx errors             │   │
│  │  • Pagination support (Link header)                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Endpoints:                                                  │
│  • /api/v1/courses → courses table                          │
│  • /api/v1/courses/:id/assignments → assignments table      │
│  • /api/v1/courses/:id/discussion_topics → notifications    │
│  • /api/v1/courses/:id/files → resources table              │
│                                                               │
│  • Stream-based JSON parsing for large payloads             │
│  • Atomic transactions per course (all-or-nothing)          │
│  • Adaptive polling based on L0 system state                │
└─────────────────────────────────────────────────────────────┘
                           ↓ upsert/insert operations
                           ↑ commit events
┌─────────────────────────────────────────────────────────────┐
│         L1: PERSISTENCE LAYER (SQLite WAL)                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Database (better-sqlite3)                           │   │
│  │  • courses (7 columns)                               │   │
│  │  • assignments (14 columns)                          │   │
│  │  • calendar_events (13 columns)                      │   │
│  │  • notifications (10 columns)                        │   │
│  │  • resources (13 columns)                            │   │
│  │  • grade_history (4 columns)                         │   │
│  │  • user_preferences (4 columns)                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Configuration:                                              │
│  • PRAGMA journal_mode = WAL                                │
│  • PRAGMA synchronous = NORMAL                              │
│  • PRAGMA foreign_keys = ON                                 │
│                                                               │
│  • Idempotent upserts via external_id (from Canvas)         │
│  • Emits commit events after transactions                   │
│  • Target: <1ms write latency                               │
│  • Migration system with automatic rollback                 │
└─────────────────────────────────────────────────────────────┘
                           ↓ system state queries
                           ↑ monitoring data
┌─────────────────────────────────────────────────────────────┐
│          L0: UTILITIES (Environment Services)               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SystemMonitor                                       │   │
│  │  • powerSource: 'battery' | 'ac'                     │   │
│  │  • batteryLevel: 0-100                               │   │
│  │  • windowFocused: boolean                            │   │
│  │  • isFullscreen: boolean                             │   │
│  │  • Polls max once per 5 seconds                      │   │
│  │  • Emits events only on state changes                │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Logger (Winston)                                    │   │
│  │  • PII redaction (never log tokens/emails)           │   │
│  │  • Log rotation at 10MB, keep 5 files                │   │
│  │  • Levels: error, warn, info, debug                  │   │
│  │  • Output: logs/cid.log                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  • NOT a full "layer" - simplified utility modules          │
│  • Controls L2 polling behavior based on system state       │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Examples

### Example 1: User Dismisses Notification

```text
1. User clicks "Dismiss" button in L6 (UI)
                       ↓
2. L6 dispatches event: onClick={() => dispatch(dismissNotification(id))}
                       ↓
3. L5 (Presentation) forwards to L4 (Controller)
                       ↓
4. L4 validates DismissNotificationCommand:
   - Check notification exists
   - Check not already dismissed
                       ↓
5. L4 executes command via L1:
   UPDATE notifications SET dismissed_at = NOW() WHERE id = ?
                       ↓
6. L1 commits transaction, emits event:
   eventBus.emit('db:update', { table: 'notifications' })
                       ↓
7. L5 listens to event, re-fetches notifications from L1
                       ↓
8. L5 updates state: setState({ notifications: fetchNotifications() })
                       ↓
9. L6 receives new props, re-renders automatically (React)
```

### Example 2: Automatic Sync Triggered

```text
1. L0 SystemMonitor detects: powerSource = 'ac' && windowFocused = true
                       ↓
2. L0 emits event: eventBus.emit('system:state-change', { canSync: true })
                       ↓
3. L2 Daemon listens, checks last sync time
   - If >15 minutes ago, trigger sync
                       ↓
4. L2 fetches from Canvas API:
   GET /api/v1/courses/:id/assignments
   Headers: If-None-Match: "<etag>"
                       ↓
5. Canvas responds 200 OK (new data) or 304 Not Modified
                       ↓
6. If 200, L2 parses JSON, invokes L3 for priority calculation:
   priorityScore = L3.calculatePriorityScore(assignment, course)
                       ↓
7. L2 writes to L1 via atomic transaction:
   BEGIN TRANSACTION;
   INSERT OR REPLACE INTO assignments (...) VALUES (...);
   UPDATE courses SET last_synced_at = NOW() WHERE id = ?;
   COMMIT;
                       ↓
8. L1 emits commit event (same as Example 1, triggers UI update)
```

### Example 3: ROI Priority Calculation

```text
1. L2 syncs new assignment from Canvas API
                       ↓
2. L2 extracts: { weight: 15%, points_possible: 100, due_at: ... }
                       ↓
3. L2 requests priority score from L3:
   score = L3.calculatePriorityScore(assignment, course)
                       ↓
4. L3 executes pure function:
   - targetDelta = max(0, targetGrade - assessedGrade)
   - vEff = max(gradeVolatility, 0.1)
   - score = (weight × targetDelta) / log(vEff + 1)
   - If title contains "exam": score *= 1.5
                       ↓
5. L3 returns: { priority_score: 42.7 }
                       ↓
6. L2 writes to L1:
   UPDATE assignments SET priority_score = 42.7 WHERE id = ?
                       ↓
7. L1 commits, emits event → L5 updates state → L6 re-renders
```

---

## Layer Responsibilities

### L6: UI (React)
**Purpose:** Render views and capture user input

**Responsibilities:**
- Display data from L5 (read-only props)
- Capture user events (clicks, keyboard, mouse)
- Dispatch actions to L5 (commands)
- Virtual list rendering for performance
- Accessibility (ARIA labels, keyboard focus)

**Communication:**
- **Receives:** Props from L5 (courses, assignments, notifications)
- **Sends:** User events to L5 (dispatch actions)

**Files:**
- `src/layers/l6-ui/components/Dashboard.tsx`
- `src/layers/l6-ui/components/Calendar.tsx`
- `src/layers/l6-ui/components/CourseDetail.tsx`

---

### L5: Presentation (Zustand Store)
**Purpose:** Manage global application state and view models

**Responsibilities:**
- Subscribe to L1 commit events
- Compute view models (DashboardViewModel, CourseViewModel)
- Expose reactive state to L6
- Forward user commands to L4

**Communication:**
- **Receives:** L1 commit events, user commands from L6
- **Sends:** State updates to L6, commands to L4

**Files:**
- `src/layers/l5-presentation/store.ts`
- `src/layers/l5-presentation/viewModels/DashboardViewModel.ts`

---

### L4: Controller (Command Dispatcher)
**Purpose:** Validate and execute user commands

**Responsibilities:**
- Implement command pattern for all user actions
- Validate command preconditions
- Ensure atomic transactions via L1
- Handle conflict resolution
- Invoke L3 for calculations when needed

**Communication:**
- **Receives:** Commands from L5
- **Sends:** Validated operations to L1, calculation requests to L3

**Files:**
- `src/layers/l4-controller/commands/UpdateAssignmentGradeCommand.ts`
- `src/layers/l4-controller/commands/DismissNotificationCommand.ts`
- `src/layers/l4-controller/ConflictResolver.ts`

---

### L3: Intelligence (Priority Engine)
**Purpose:** Calculate ROI scores and grade analytics

**Responsibilities:**
- Implement ROI priority formula
- Calculate assessed grade from completed work
- Compute target delta (average needed on remaining work)
- Calculate grade volatility (STDDEV of history)
- Rule-based importance boost (keywords, weights)

**Communication:**
- **Receives:** Calculation requests from L4 or L2
- **Sends:** Computed values (priority_score, assessed_grade, etc.)

**Files:**
- `src/layers/l3-intelligence/PriorityEngine.ts`
- `src/layers/l3-intelligence/GradeAnalytics.ts`

**Key Formula:**
```typescript
priority_score = (weight × targetDelta) / log(max(vEff, 0.1) + 1)
```

---

### L2: Daemon (Adaptive Sync Engine)
**Purpose:** Sync data from Canvas API to local database

**Responsibilities:**
- Fetch data from Canvas API endpoints
- Rate limiting (max 3 concurrent, respect X-Rate-Limit-Remaining)
- ETag-based conditional GET (304 handling)
- Exponential backoff on errors
- Atomic transactions per course
- Invoke L3 for priority calculations
- Adaptive polling based on L0 system state

**Communication:**
- **Receives:** System state from L0, manual sync triggers from L4
- **Sends:** Raw Canvas data + calculated fields to L1

**Files:**
- `src/layers/l2-daemon/CanvasClient.ts`
- `src/layers/l2-daemon/SyncEngine.ts`
- `src/layers/l2-daemon/RateLimiter.ts`

---

### L1: Persistence (SQLite)
**Purpose:** Store all application data locally

**Responsibilities:**
- Provide CRUD operations for all tables
- Emit commit events after transactions
- Enforce foreign key constraints
- Handle migrations with automatic rollback
- Maintain <1ms write latency (WAL mode)
- Backup database before migrations

**Communication:**
- **Receives:** Write operations from L2, L4
- **Sends:** Commit events to L5, data queries to all layers

**Files:**
- `src/layers/l1-persistence/Database.ts`
- `src/layers/l1-persistence/migrations/001_initial.sql`

**Schema:**
- `courses` (external_id UNIQUE)
- `assignments` (external_id UNIQUE, course_id FK)
- `calendar_events` (external_id UNIQUE nullable)
- `notifications` (source_type + source_id UNIQUE)
- `resources` (external_id UNIQUE)
- `grade_history` (course_id FK, recorded_at)
- `user_preferences` (key PRIMARY KEY)

---

### L0: Utilities (Environment Services)
**Purpose:** Monitor system state and provide logging

**Responsibilities:**
- Monitor battery level, power source
- Detect window focus and fullscreen state
- Emit events only on state changes (not on every poll)
- Provide PII-redacted logging via Winston
- Log rotation and retention

**Communication:**
- **Receives:** Polling timer (max once per 5 seconds)
- **Sends:** System state events to L2 (controls adaptive polling)

**Files:**
- `src/layers/l0-utilities/SystemMonitor.ts`
- `src/layers/l0-utilities/Logger.ts`

---

## Conflict Resolution Flow

When local edits conflict with Canvas updates:

```text
1. L2 Daemon detects conflict during sync:
   - Canvas updated_at > local updated_at
   - AND local_modified_at IS NOT NULL
                       ↓
2. L2 pauses sync for this entity, emits conflict event:
   eventBus.emit('conflict:detected', { type: 'assignment', id, localData, remoteData })
                       ↓
3. L4 Controller listens, shows Conflict Resolution UI (via L5 → L6)
                       ↓
4. User chooses:
   - "Keep Mine" → L4 clears local_modified_at, keeps local data
   - "Use Canvas" → L4 overwrites local data, updates updated_at
                       ↓
5. L4 logs resolution to audit trail (L0 Logger)
                       ↓
6. L2 resumes sync
```

---

## Performance Optimizations

### Memory Management
- **Virtual Lists:** L6 uses `react-window` for >100 item lists
- **V8 Heap Limit:** `--max-old-space-size=256` (300MB cap)
- **Database Indexing:**
  ```sql
  CREATE INDEX idx_assignments_priority ON assignments(priority_score DESC);
  CREATE INDEX idx_assignments_due_date ON assignments(due_at);
  CREATE INDEX idx_notifications_dismissed ON notifications(dismissed_at);
  ```

### Network Efficiency
- **ETag Caching:** 99% of incremental syncs return 304 Not Modified
- **Stream Parsing:** Large JSON responses parsed in chunks
- **Adaptive Polling:**
  - On battery + unfocused: Poll every 60 minutes
  - On AC + focused: Poll every 15 minutes

### Database Performance
- **WAL Mode:** `PRAGMA journal_mode = WAL` for concurrent reads during writes
- **Prepared Statements:** All queries use parameterized statements
- **Batch Inserts:** Assignments synced in bulk transactions

---

## Testing Strategy

### Unit Tests (Jest)
- L3: ROI formula with known inputs/outputs
- L2: Rate limiter timing and backoff logic
- L1: Upsert idempotency

### Integration Tests
- Full sync workflow (L2 → L3 → L1)
- Conflict resolution (L2 → L4 → L1)
- Database migrations with rollback

### UI Tests (React Testing Library)
- Dashboard rendering with mock data
- Keyboard navigation (Alt+1-5, j/k)
- Theme switching

### End-to-End Tests (Playwright)
- First-run setup flow
- Manual sync trigger
- Offline access to cached data

---

## Deployment Architecture

```text
┌─────────────────────────────────────────────────┐
│  Electron Main Process                         │
│  • Manages L0, L1, L2, L3, L4                  │
│  • IPC with renderer (HMAC-signed messages)    │
│  • Auto-updater (electron-updater)             │
└─────────────────────────────────────────────────┘
           ↕ IPC (contextBridge)
┌─────────────────────────────────────────────────┐
│  Electron Renderer Process                     │
│  • Manages L5, L6                              │
│  • React app with Zustand                      │
│  • Sandboxed (nodeIntegration: false)          │
└─────────────────────────────────────────────────┘
```

**Security:**
- API tokens stored in OS keychain (keytar)
- Database file permissions: chmod 600
- IPC messages signed with HMAC
- Code signing for updates (macOS/Windows)

---

## Conclusion

This architecture provides:
- **Testability:** Each layer is independently testable
- **Maintainability:** Clear boundaries, single responsibilities
- **Performance:** <300MB memory, <1ms writes, 60fps UI
- **Reliability:** Offline-first, atomic transactions, conflict resolution
- **Scalability:** Designed for 6+ courses, 100+ assignments, 1000+ files

**Status:** READY FOR IMPLEMENTATION
**Next Steps:** See `MVP_IMPLEMENTATION_ROADMAP.md` Week 1
