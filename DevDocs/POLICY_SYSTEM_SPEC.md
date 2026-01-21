# Course Policy System Specification

**Version:** 1.0
**Date:** January 21, 2026

---

## Overview

The policy system captures course-specific rules that affect task prioritization and deadline management. Policies are stored in a structured JSON format and can be:

1. **Auto-detected** from syllabus/course pages (future enhancement)
2. **Manually entered** by users via the UI
3. **Edited/overridden** at any time by users

---

## Database Schema

### `course_policies` Table

```sql
CREATE TABLE course_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  policy_type TEXT NOT NULL,        -- Category of policy
  policy_name TEXT NOT NULL,        -- User-friendly name
  policy_config TEXT NOT NULL,      -- JSON configuration
  raw_text TEXT,                    -- Original text from syllabus (reference)
  is_user_verified BOOLEAN,         -- User has confirmed accuracy
  is_active BOOLEAN,                -- Can be temporarily disabled
  created_at DATETIME,
  updated_at DATETIME,
  UNIQUE(course_id, policy_type, policy_name)
);
```

---

## Policy Types

### 1. Grace Tokens (`grace_tokens`)

Allows late submissions without penalty using a limited token budget.

```typescript
interface GraceTokenPolicy {
  type: 'grace_tokens';
  total_tokens: number;           // Total tokens for semester
  tokens_used: number;            // Tokens already consumed
  hours_per_token: number;        // Hours of extension per token
  max_tokens_per_task: number;    // Max tokens usable on single task
  applies_to: TaskType[];         // ['assignment', 'quiz', 'discussion']
  excludes: string[];             // Task titles/patterns to exclude
}
```

**Example:**
```json
{
  "type": "grace_tokens",
  "total_tokens": 5,
  "tokens_used": 2,
  "hours_per_token": 12,
  "max_tokens_per_task": 2,
  "applies_to": ["assignment", "quiz"],
  "excludes": ["Final Exam", "Midterm"]
}
```

**UI Display:** "3 grace tokens remaining (36 hours of extensions)"

---

### 2. Late Penalty (`late_penalty`)

Defines deductions for late submissions.

```typescript
interface LatePenaltyPolicy {
  type: 'late_penalty';
  penalty_type: 'percentage_per_day' | 'percentage_per_hour' | 'flat' | 'tiered';
  penalty_value: number;          // Percentage or flat amount
  grace_period_hours: number;     // No penalty within this window
  max_penalty: number;            // Cap on total deduction (0-100)
  cutoff_days: number | null;     // After this, no submission accepted
  applies_to: TaskType[];
}
```

**Example:**
```json
{
  "type": "late_penalty",
  "penalty_type": "percentage_per_day",
  "penalty_value": 5,
  "grace_period_hours": 24,
  "max_penalty": 50,
  "cutoff_days": 7,
  "applies_to": ["assignment"]
}
```

**UI Display:** "-5%/day after 24h grace period (max -50%, cutoff 7 days)"

---

### 3. Weight Transfer (`weight_transfer`)

Allows grade weight to shift between assessments.

```typescript
interface WeightTransferPolicy {
  type: 'weight_transfer';
  from_task: string;              // Task title or pattern
  to_task: string;                // Task title or pattern
  condition: 'if_higher' | 'if_lower' | 'always' | 'if_missed';
  max_transfer_percent: number;   // Maximum weight that can transfer
  transfer_ratio: number;         // 1.0 = full, 0.5 = half
}
```

**Example:**
```json
{
  "type": "weight_transfer",
  "from_task": "Midterm",
  "to_task": "Final Exam",
  "condition": "if_higher",
  "max_transfer_percent": 100,
  "transfer_ratio": 1.0
}
```

**UI Display:** "Midterm weight transfers to Final if Final is higher"

---

### 4. Drop Lowest (`drop_lowest`)

Automatically drops lowest scores from a category.

```typescript
interface DropLowestPolicy {
  type: 'drop_lowest';
  category: string;               // "Assignments", "Quizzes", etc.
  drop_count: number;             // Number of lowest to drop
  min_submissions: number;        // Must submit at least this many
}
```

**Example:**
```json
{
  "type": "drop_lowest",
  "category": "Weekly Quizzes",
  "drop_count": 2,
  "min_submissions": 10
}
```

**UI Display:** "Lowest 2 quiz grades dropped (min 10 submissions)"

---

### 5. Bonus Work (`bonus_work`)

Extra credit opportunities.

```typescript
interface BonusWorkPolicy {
  type: 'bonus_work';
  max_bonus_percent: number;      // Cap on bonus contribution
  applies_to: 'final_grade' | 'category' | 'specific_task';
  target_category?: string;       // If category-specific
}
```

**Example:**
```json
{
  "type": "bonus_work",
  "max_bonus_percent": 5,
  "applies_to": "final_grade"
}
```

---

### 6. Collaboration Policy (`collaboration`)

Defines allowed collaboration for academic integrity.

```typescript
interface CollaborationPolicy {
  type: 'collaboration';
  level: 'individual' | 'pairs' | 'groups' | 'open';
  max_group_size?: number;
  applies_to: string[];           // Task patterns
  notes: string;
}
```

---

### 7. Resubmission Policy (`resubmission`)

Allows corrections or resubmissions.

```typescript
interface ResubmissionPolicy {
  type: 'resubmission';
  allowed: boolean;
  max_attempts: number;
  grade_calculation: 'highest' | 'latest' | 'average' | 'weighted_average';
  penalty_per_resubmit: number;
  deadline_extension_hours: number;
}
```

---

### 8. Custom Policy (`custom`)

Catch-all for policies not covered by predefined types.

```typescript
interface CustomPolicy {
  type: 'custom';
  name: string;
  description: string;
  affects_priority: boolean;
  priority_modifier: number;      // Multiplier (1.0 = no change)
  conditions: string;             // Free-form conditions description
}
```

---

## L3 Intelligence Integration

### Priority Score Adjustment

```typescript
function adjustPriorityForPolicies(
  task: Task,
  course: Course,
  policies: CoursePolicy[]
): number {
  let score = task.priority_score;
  const now = new Date();
  const dueDate = new Date(task.due_at);
  const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isPastDue = hoursUntilDue < 0;

  for (const policy of policies) {
    if (!policy.is_active) continue;

    switch (policy.policy_type) {
      case 'grace_tokens': {
        const config = JSON.parse(policy.policy_config);
        const tokensRemaining = config.total_tokens - config.tokens_used;

        if (isPastDue && tokensRemaining > 0) {
          const hoursPastDue = Math.abs(hoursUntilDue);
          const tokensNeeded = Math.ceil(hoursPastDue / config.hours_per_token);

          if (tokensNeeded <= tokensRemaining && tokensNeeded <= config.max_tokens_per_task) {
            // Task is salvageable with grace tokens - BOOST priority!
            score *= 1.5;
          }
        }
        break;
      }

      case 'late_penalty': {
        const config = JSON.parse(policy.policy_config);

        if (isPastDue) {
          const hoursPastDue = Math.abs(hoursUntilDue);

          // Still in grace period
          if (hoursPastDue <= config.grace_period_hours) {
            score *= 1.3; // Urgent but no penalty yet
          }
          // Past cutoff - task is dead
          else if (config.cutoff_days && hoursPastDue > config.cutoff_days * 24) {
            score *= 0.1; // Drastically reduce priority
          }
          // Low penalty rate - less urgent
          else if (config.penalty_value <= 2) {
            score *= 0.9;
          }
        }
        break;
      }

      case 'drop_lowest': {
        const config = JSON.parse(policy.policy_config);
        // If this task category has drop policy and we have buffer, reduce priority
        if (task.category === config.category) {
          score *= 0.85; // Slightly lower priority
        }
        break;
      }

      case 'weight_transfer': {
        const config = JSON.parse(policy.policy_config);
        // If this task's weight can transfer elsewhere, adjust priority
        if (task.title.includes(config.from_task)) {
          score *= 0.9; // Slightly lower if weight can move
        }
        if (task.title.includes(config.to_task)) {
          score *= 1.1; // Slightly higher if it can absorb weight
        }
        break;
      }
    }
  }

  return score;
}
```

---

## User Interface Requirements

### Policy Management Screen

1. **List View:** Shows all policies for a course
   - Policy type icon
   - Policy name
   - Status badge (Active/Inactive/Unverified)
   - Quick toggle for active state

2. **Add/Edit Form:**
   - Policy type dropdown (pre-populates fields)
   - Type-specific form fields
   - Raw text input (optional, for reference)
   - "Mark as verified" checkbox

3. **Syllabus Reference Panel:**
   - Side panel showing syllabus HTML
   - Highlight detected policy-like text
   - "Create policy from selection" button

### Task Detail Integration

When viewing a task, show applicable policies:
- "Grace tokens: 3 remaining (can extend 36h)"
- "Late penalty: -5%/day after 24h grace"
- "Weight can transfer to Final if higher"

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ L2: Sync Engine                                             │
│ - Fetches syllabus_body from Canvas API                     │
│ - Stores in courses.syllabus_body                           │
│ - Syncs course pages to course_pages table                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ L6: UI - Policy Editor                                      │
│ - User reads syllabus in reference panel                    │
│ - User creates/edits policies via forms                     │
│ - Policies saved to course_policies table                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ L3: Intelligence - Priority Engine                          │
│ - Loads policies for each course                            │
│ - Adjusts priority_score based on policy rules              │
│ - Updates tasks.priority_score in database                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ L5: Presentation - Dashboard View Model                     │
│ - Subscribes to task/policy changes                         │
│ - Sorts tasks by adjusted priority                          │
│ - Shows policy indicators on task cards                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Future Enhancements (Phase 2+)

1. **NLP Policy Extraction:** Use LLM to parse syllabus and suggest policies
2. **Policy Templates:** Pre-built templates for common UofT courses
3. **Policy Sharing:** Export/import policies between users
4. **Conflict Detection:** Warn if policies contradict each other
5. **Historical Analysis:** Track policy effectiveness over semesters

---

## Checklist

- [x] Database schema for course_policies
- [x] Database schema for course_pages (syllabus storage)
- [x] Policy type definitions
- [x] L3 priority adjustment algorithm
- [ ] L2 syllabus sync implementation
- [ ] L6 policy editor UI
- [ ] Unit tests for policy scoring
- [ ] Integration tests for policy flow
