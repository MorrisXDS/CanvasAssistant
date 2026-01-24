# L3 Intelligence Layer: Domain-Driven Refactor Plan

> **Status**: Approved | **Priority**: Critical | **Owner**: TBD

## Decision Summary

| Question | Decision |
|----------|----------|
| Architecture | **Option B: Domain-Driven Refactor** |
| Testing | **Mandatory tests for all changes** |
| Urgency | **Critical path** - Priority UI is broken |
| New Rules | **All rules together** - unlock_at, task_type, grace tokens, submission status |
| Schema | **Yes** - Add lock_at migration |

---

## Phase 1: Critical Fix (Unblocks UI)

**Goal**: Fix PriorityEngine initialization so priority list renders.

### 1.1 Fix ServiceRegistry → PriorityEngine

**File**: `src/layers/l0-utilities/ServiceRegistry.ts`

```typescript
// Current (BROKEN):
this.register('priorityEngine', () => {
  const { PriorityEngine } = require('../l3-intelligence/PriorityEngine');
  return new PriorityEngine();  // Missing db!
});

// Fixed:
this.register('priorityEngine', () => {
  const { PriorityEngine } = require('../l3-intelligence/PriorityEngine');
  const db = this.get('database');
  return new PriorityEngine(db);
});
```

### 1.2 Inject PriorityEngine into CommandDispatcher

**File**: `src/layers/l0-utilities/ServiceRegistry.ts`

```typescript
this.register('commandDispatcher', () => {
  const { CommandDispatcher } = require('../l4-controller/CommandDispatcher');
  return new CommandDispatcher({
    db: this.get('database'),
    priorityEngine: this.get('priorityEngine'),  // ADD THIS
  });
});
```

### 1.3 Write Test for Initialization

**File**: `tests/l0-utilities/ServiceRegistry.test.ts` (new)

```typescript
describe('ServiceRegistry', () => {
  it('should initialize priorityEngine without error', () => {
    const registry = new ServiceRegistry();
    expect(() => registry.get('priorityEngine')).not.toThrow();
  });
});
```

---

## Phase 1.5: Schema Update

**Goal**: Add lock_at field and sync from Canvas.

### 1.5.1 Add Migration v27

**File**: `src/layers/l1-persistence/MigrationRunner.ts`

```sql
-- Migration v27
ALTER TABLE tasks ADD COLUMN lock_at TEXT;
CREATE INDEX idx_tasks_lock_at ON tasks(lock_at);
```

### 1.5.2 Update DataMappers

**File**: `src/layers/l2-daemon/DataMappers.ts`

```typescript
export function mapAssignment(canvas: CanvasAssignment, localCourseId: number): LocalTask {
  return {
    // ... existing fields
    lock_at: canvas.lock_at,  // ADD THIS
  };
}
```

---

## Phase 2: Domain-Driven Refactor

**Goal**: Extract pure business logic into testable domain services.

### Target Structure

```
src/layers/l3-intelligence/
  domain/                        # Pure functions (NO database)
    GradeCalculationService.ts   # ✓ EXISTS
    GraceTokenService.ts         # ✓ EXISTS
    PriorityCalculator.ts        # NEW: Pure priority scoring
    PolicyEvaluator.ts           # NEW: Pure policy evaluation
    DependencyChecker.ts         # NEW: Pure dependency logic
  orchestration/                 # Coordinates domain + DB
    PriorityOrchestrator.ts      # Replaces PriorityEngine
  config/
    PriorityConfig.ts            # ✓ EXISTS (move magic numbers here)
  types.ts
  index.ts
```

### 2.1 Create PriorityCalculator (Pure Function)

**File**: `src/layers/l3-intelligence/domain/PriorityCalculator.ts`

Extracts from PriorityEngine:
- `calculateUrgencyScore()`
- `calculateWeightScore()`
- `calculateCourseGapFactor()`
- `calculatePolicyAdjustment()`
- `calculateFinalScore()`

**Signature**:
```typescript
export interface PriorityInput {
  task: TaskForPriority;
  course: CourseForPriority;
  policies: PolicyForPriority[];
  config: PriorityConfigData;
  now: Date;
}

export function calculatePriority(input: PriorityInput): PriorityResult {
  // Pure calculation - no DB access
}
```

### 2.2 Create PriorityOrchestrator

**File**: `src/layers/l3-intelligence/orchestration/PriorityOrchestrator.ts`

```typescript
export class PriorityOrchestrator extends EventEmitter {
  constructor(
    private taskRepo: TaskRepository,
    private courseRepo: CourseRepository,
    private policyRepo: PolicyRepository,
    private config: PriorityConfig,
    private featureFlags?: FeatureFlags,
  ) {}

  calculateAll(now: Date = new Date()): PriorityCalculationResult {
    // 1. Fetch data via repositories
    const tasks = this.taskRepo.findIncomplete();
    const courses = this.courseRepo.findAll();
    const policies = this.policyRepo.findActive();

    // 2. Call pure domain function
    const results = tasks.map(task =>
      calculatePriority({ task, course, policies, config: this.config.data, now })
    );

    // 3. Persist scores
    results.forEach(r => this.taskRepo.updatePriorityScore(r.taskId, r.score));

    // 4. Emit event
    this.emit('priorities-calculated', results);
    return results;
  }
}
```

### 2.3 Migrate PolicyEvaluator to Domain

**File**: `src/layers/l3-intelligence/domain/PolicyEvaluator.ts`

Extract pure functions:
- `evaluateGraceToken(task, policy)` → `{ canUse, tokensNeeded, extension }`
- `evaluateLatePenalty(task, policy)` → `{ penaltyPercent, windows }`
- `evaluateDropLowest(task, policy)` → `{ wouldBeDropped, priorityAdjustment }`

Delete: `PolicyEngine.ts` (consolidate into domain `PolicyEvaluator.ts`)

### 2.4 Activate DependencyChecker

**File**: `src/layers/l3-intelligence/domain/DependencyChecker.ts`

Extract from `DependencyResolver`:
- `checkPrerequisites(task, completedItems)` → `{ blocked, blockers[] }`

Wire into `PriorityOrchestrator.calculateAll()`.

---

## Phase 3: Repository Adoption

**Goal**: Replace direct SQL with repository methods.

### 3.1 Update PriorityOrchestrator Dependencies

```typescript
// Instead of:
const rows = this.db.prepare('SELECT * FROM tasks WHERE ...').all();

// Use:
const tasks = this.taskRepo.findIncompleteByCourseId(courseId);
```

### 3.2 Add Missing Repository Methods

**File**: `src/layers/l1-persistence/repositories/TaskRepository.ts`

```typescript
findIncompleteWithPriority(): TaskForPriority[] {
  return this.db.prepare(`
    SELECT t.*, c.target_grade, c.current_grade
    FROM tasks t
    JOIN courses c ON t.course_id = c.id
    WHERE t.is_completed = 0
  `).all();
}

updatePriorityScore(taskId: number, score: number): void {
  this.db.prepare('UPDATE tasks SET priority_score = ? WHERE id = ?').run(score, taskId);
}
```

---

## Phase 4: IPC Contract & Event Wiring

### 4.1 Add Priority IPC Channels

**File**: `src/shared/ipc-contract.ts`

```typescript
export const IPCContract = {
  // ... existing channels ...

  'priorities:calculate': {
    params: z.void(),
    result: PriorityCalculationResultSchema,
  },
  'priorities:refresh': {
    params: z.void(),
    result: z.void(),
  },
  'priorities:getExplanation': {
    params: z.object({ taskId: z.number() }),
    result: PriorityExplanationSchema,
  },
};
```

### 4.2 Wire Event Listeners

**File**: `src/main.ts`

```typescript
const priorityOrchestrator = registry.get('priorityOrchestrator');

// Recalculate priorities on db commit
database.on('commit', (tableName) => {
  if (['tasks', 'courses', 'policies'].includes(tableName)) {
    priorityOrchestrator.calculateAll();
  }
});
```

---

## Phase 5: Dead Code Removal

| File | Action |
|------|--------|
| `PolicyEngine.ts` | DELETE (consolidated into domain/PolicyEvaluator) |
| `RefreshScheduler.ts` | KEEP but move to orchestration/ and wire up |
| `DependencyResolver.ts` | DELETE (replaced by domain/DependencyChecker) |
| `PriorityEngine.ts` | DELETE after PriorityOrchestrator is working |

---

## New Priority Calculation Rules

### Task Type Weight Multipliers

From `global_task_types` table (M22):

```typescript
const TASK_TYPE_WEIGHTS: Record<string, number> = {
  final: 30,      // Highest impact
  midterm: 25,
  exam: 20,
  project: 15,
  assignment: 10,
  lab: 10,
  quiz: 5,
  discussion: 5,
  attendance: 5,
  other: 5,
};

function calculateTaskTypeBoost(taskType: string): number {
  const weight = TASK_TYPE_WEIGHTS[taskType] ?? 10;
  return (weight - 10) * 0.5;  // -2.5 to +10 point adjustment
}
```

### Unlock Time Filtering

```typescript
function calculatePriority(input: PriorityInput): PriorityResult {
  const { task, now } = input;

  // NEW: Check if task is locked
  if (task.unlockAt && new Date(task.unlockAt) > now) {
    return {
      queue: 'upcoming',  // NEW QUEUE
      score: 0,
      reason: `Unlocks ${formatRelativeTime(task.unlockAt)}`,
    };
  }

  // ... existing calculation
}
```

### Lock Time Critical Boost

```typescript
function calculateLockTimeUrgency(task: TaskForPriority, now: Date): number {
  if (!task.lockAt) return 0;

  const hoursUntilLock = (new Date(task.lockAt).getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilLock <= 6) return 50;   // CRITICAL: Lock imminent
  if (hoursUntilLock <= 24) return 30;  // HIGH: Locks today
  if (hoursUntilLock <= 72) return 15;  // MEDIUM: Locks soon
  return 0;
}
```

### Grace Token Salvage Factor

```typescript
function calculateGraceTokenFactor(
  task: TaskForPriority,
  policy: GraceTokenPolicy | null,
  tokensRemaining: number
): number {
  if (!policy || tokensRemaining === 0) return 0;
  if (task.isCompleted) return 0;

  const hoursOverdue = calculateOverdueHours(task);
  if (hoursOverdue <= 0) return 0;  // Not overdue

  const tokensNeeded = Math.ceil(hoursOverdue / policy.hoursPerToken);

  if (tokensNeeded <= tokensRemaining) {
    // Salvageable with tokens - boost priority
    return 20 - (tokensNeeded * 5);  // Fewer tokens needed = more boost
  }

  return -10;  // Not salvageable - lower priority
}
```

### Submission Status Handling

```typescript
type SubmissionStatus = 'unsubmitted' | 'submitted' | 'graded' | 'late' | 'missing';

function calculateSubmissionFactor(status: SubmissionStatus | null): number {
  switch (status) {
    case 'missing':
      return -30;  // Already marked missing - recovery focus
    case 'late':
      return -10;  // Submitted late - lower priority
    case 'submitted':
      return -50;  // Already submitted - much lower
    case 'graded':
      return -100; // Done - effectively remove from active
    default:
      return 0;    // unsubmitted or null - normal priority
  }
}
```

### Updated Priority Formula

```typescript
function calculateFinalScore(factors: PriorityFactors): number {
  const {
    urgency,           // 0-100 (time-based)
    weight,            // 0-50 (grade impact)
    courseGap,         // 0-30 (distance from target)
    policyAdjustment,  // -100 to +20
    dependency,        // -50 or 0
    // NEW FACTORS:
    taskTypeBoost,     // -2.5 to +10
    lockTimeUrgency,   // 0-50
    graceTokenFactor,  // -10 to +20
    submissionFactor,  // -100 to 0
  } = factors;

  return (
    urgency +
    weight +
    courseGap +
    policyAdjustment +
    dependency +
    taskTypeBoost +
    lockTimeUrgency +
    graceTokenFactor +
    submissionFactor
  );
}
```

### New Queue: "Upcoming"

```typescript
type PriorityQueue = 'pinned' | 'active' | 'overdue' | 'deadlines' | 'upcoming';

function assignQueue(task: TaskForPriority, now: Date): PriorityQueue {
  if (task.isPinned) return 'pinned';
  if (task.unlockAt && new Date(task.unlockAt) > now) return 'upcoming';  // NEW
  if (isOverdue(task, now)) return 'overdue';
  if (task.weight === 0) return 'deadlines';
  return 'active';
}
```

---

## Critical Files to Modify

| Phase | File | Change |
|-------|------|--------|
| 1 | `src/layers/l0-utilities/ServiceRegistry.ts` | Fix PriorityEngine init |
| 1.5 | `src/layers/l1-persistence/MigrationRunner.ts` | Add v27: lock_at column |
| 1.5 | `src/layers/l2-daemon/DataMappers.ts` | Sync lock_at from Canvas |
| 2 | `src/layers/l3-intelligence/domain/PriorityCalculator.ts` | NEW - all priority rules |
| 2 | `src/layers/l3-intelligence/orchestration/PriorityOrchestrator.ts` | NEW |
| 2 | `src/layers/l3-intelligence/domain/PolicyEvaluator.ts` | REFACTOR |
| 2 | `src/layers/l3-intelligence/types.ts` | Add lockAt, taskType, submissionStatus |
| 3 | `src/layers/l1-persistence/repositories/TaskRepository.ts` | Add methods |
| 4 | `src/shared/ipc-contract.ts` | Add priority channels + lockAt field |
| 4 | `src/main.ts` | Wire event listeners |
| 5 | `src/layers/l3-intelligence/PriorityEngine.ts` | DELETE (after Phase 2) |
| 5 | `src/layers/l3-intelligence/PolicyEngine.ts` | DELETE |

---

## Implementation Order

1. **Phase 1** (Critical) - Fix ServiceRegistry initialization → **Unblocks UI**
2. **Phase 1.5** (Schema) - Add lock_at migration + update DataMappers → **Enable new fields**
3. **Phase 2.1-2.2** - Create PriorityCalculator + PriorityOrchestrator with ALL new rules → **Core refactor**
   - Unlock time filtering (new "upcoming" queue)
   - Task type weighting (from global_task_types)
   - Lock time critical boost
   - Grace token salvage factor
   - Submission status handling
4. **Phase 3** - Repository adoption → **Clean data access**
5. **Phase 2.3-2.4** - Migrate PolicyEvaluator, DependencyChecker → **Complete domain**
6. **Phase 4** - IPC + Events → **Full integration**
7. **Phase 5** - Delete dead code → **Cleanup**

---

## Verification Plan

### Automated
```bash
npm test -- --testPathPattern=l3-intelligence
npm test -- --testPathPattern=integration
```

### Manual Smoke Test
1. `npm run dev`
2. Navigate to Tasks page → Priority list should render
3. Complete a task → Priorities should recalculate
4. Use a grace token → Extension should apply
5. Check console → No PriorityEngine initialization errors
