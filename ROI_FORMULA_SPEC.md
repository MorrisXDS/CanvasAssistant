# ROI Priority Scoring - Implementation Specification

**Version:** 1.0
**Layer:** L3 (Intelligence)
**Purpose:** Calculate assignment priority scores for ROI-based dashboard sorting
**Last Updated:** January 21, 2026

---

## Overview

The **ROI Priority Score** determines which assignments students should focus on first by balancing:
1. **Impact on final grade** (weight)
2. **Gap to target grade** (target_delta)
3. **Grade volatility risk** (uncertainty in course performance)

**Formula:**
```
priority_score = (weight × target_delta) / log(max(v_eff, 0.1) + 1)
```

Where:
- `weight`: Assignment's % contribution to final grade (e.g., 15.0 for 15%)
- `target_delta`: Gap between student's target and assessed grade
- `v_eff`: Effective grade volatility (STDDEV of grade changes with exponential decay)
- `0.1`: Minimum floor to prevent division by zero

---

## Mathematical Definition

### Variables

| Variable | Type | Range | Source | Description |
|----------|------|-------|--------|-------------|
| `weight` | REAL | 0-100 | `assignments.weight` | % of final grade (e.g., 15.0 = 15%) |
| `target_grade` | REAL | 0-100 | `courses.target_grade` | Student's goal (default: 85.0) |
| `assessed_grade` | REAL | 0-100 | Calculated | Grade from completed work only |
| `current_grade` | REAL | 0-100 | `courses.current_grade` | Canvas API value (includes partial credit) |
| `grade_volatility` | REAL | 0-50 | `courses.grade_volatility` | STDDEV of grade_history (last 10 records) |
| `v_eff` | REAL | 0.1-50 | Calculated | max(grade_volatility, 0.1) |
| `target_delta` | REAL | 0-100 | Calculated | Average needed on remaining work |

### Formula Breakdown

**Step 1: Calculate Assessed Grade**
```typescript
assessed_grade = SUM(grade × weight WHERE is_completed = TRUE)
```

Example:
- Assignment 1: 85% grade, 10% weight → contributes 8.5%
- Assignment 2: 90% grade, 15% weight → contributes 13.5%
- **Assessed Grade = 8.5 + 13.5 = 22.0%**

**Step 2: Calculate Remaining Weight**
```typescript
remaining_weight = 100 - SUM(weight WHERE is_completed = TRUE)
```

Example:
- Total weight from completed work = 25%
- **Remaining Weight = 100 - 25 = 75%**

**Step 3: Calculate Target Delta**
```typescript
if (remaining_weight === 0) {
  target_delta = max(0, target_grade - assessed_grade);
} else {
  target_delta = max(0, (target_grade - assessed_grade) / remaining_weight);
}
```

Example:
- Target Grade = 85%
- Assessed Grade = 22%
- Remaining Weight = 75%
- **Target Delta = max(0, (85 - 22) / 75) = 84.0%**

(Student needs 84% average on remaining work to hit 85% goal)

**Step 4: Calculate Effective Volatility**
```typescript
v_eff = max(grade_volatility, 0.1)
```

Example:
- Grade volatility (STDDEV of last 10 grade changes) = 5.2
- **v_eff = max(5.2, 0.1) = 5.2**

**Step 5: Calculate Priority Score**
```typescript
priority_score = (weight × target_delta) / log(v_eff + 1)
```

Example:
- Weight = 15%
- Target Delta = 84%
- v_eff = 5.2
- **priority_score = (15 × 84) / log(5.2 + 1) = 1260 / log(6.2) = 1260 / 1.825 = 690.4**

---

## Rule-Based Importance Boost

After calculating the base priority score, apply keyword-based multipliers:

### Multipliers

| Condition | Multiplier | Rationale |
|-----------|------------|-----------|
| Title contains "exam", "midterm", "final" | 1.5x | High-stakes assessments |
| Weight > 15% | 1.2x | Major coursework |
| Due within 48 hours | 1.3x | Urgent deadline |

**Application:**
```typescript
let score = (weight × target_delta) / log(max(v_eff, 0.1) + 1);

// Apply keyword boost
if (/exam|midterm|final/i.test(assignment.title)) {
  score *= 1.5;
}

// Apply weight boost
if (assignment.weight > 15) {
  score *= 1.2;
}

// Apply urgency boost
const hoursUntilDue = (assignment.due_at - Date.now()) / (1000 * 60 * 60);
if (hoursUntilDue < 48) {
  score *= 1.3;
}

return score;
```

---

## Implementation (TypeScript)

### File: `src/layers/l3-intelligence/PriorityEngine.ts`

```typescript
import { Assignment, Course } from '../l1-persistence/types';
import { Database } from '../l1-persistence/Database';

export class PriorityEngine {
  constructor(private db: Database) {}

  /**
   * Calculate ROI priority score for a single assignment
   */
  calculatePriorityScore(assignment: Assignment, course: Course): number {
    // Step 1: Calculate target delta (average needed on remaining work)
    const targetDelta = this.calculateTargetDelta(course);

    // Step 2: Get effective volatility (with floor at 0.1)
    const vEff = Math.max(course.grade_volatility || 0, 0.1);

    // Step 3: Base ROI formula
    const weight = assignment.weight || 0;
    let score = (weight * targetDelta) / Math.log(vEff + 1);

    // Step 4: Apply rule-based boosts
    score = this.applyImportanceBoosts(assignment, score);

    return score;
  }

  /**
   * Calculate average grade needed on remaining work to hit target
   */
  private calculateTargetDelta(course: Course): number {
    // If total_weight !== 100%, return 0 (100% Guardrail)
    if (Math.abs(course.total_weight - 100) > 0.01) {
      return 0;
    }

    const assessedGrade = course.assessed_grade || 0;
    const targetGrade = course.target_grade || 85.0;

    // Get remaining weight
    const completedWeight = this.db.query<{ total: number }>(
      `SELECT SUM(weight) as total FROM assignments
       WHERE course_id = ? AND is_completed = TRUE`,
      [course.id]
    ).total || 0;

    const remainingWeight = 100 - completedWeight;

    // If no remaining work, just check if target is met
    if (remainingWeight === 0) {
      return Math.max(0, targetGrade - assessedGrade);
    }

    // Calculate average needed on remaining work
    const delta = (targetGrade - assessedGrade) / remainingWeight;
    return Math.max(0, delta);
  }

  /**
   * Apply keyword-based and heuristic importance boosts
   */
  private applyImportanceBoosts(assignment: Assignment, baseScore: number): number {
    let score = baseScore;

    // Keyword boost: High-stakes assessments
    const highStakesKeywords = /exam|midterm|final/i;
    if (highStakesKeywords.test(assignment.title)) {
      score *= 1.5;
    }

    // Weight boost: Major coursework (>15% of final grade)
    if ((assignment.weight || 0) > 15) {
      score *= 1.2;
    }

    // Urgency boost: Due within 48 hours
    if (assignment.due_at) {
      const hoursUntilDue = (new Date(assignment.due_at).getTime() - Date.now())
                            / (1000 * 60 * 60);
      if (hoursUntilDue > 0 && hoursUntilDue < 48) {
        score *= 1.3;
      }
    }

    return score;
  }

  /**
   * Recalculate priority scores for all assignments in a course
   * Called after sync or when course data changes
   */
  updateCoursePriorities(courseId: number): void {
    const course = this.db.getCourse(courseId);
    if (!course) return;

    const assignments = this.db.getAssignments(courseId);

    this.db.transaction(() => {
      for (const assignment of assignments) {
        const score = this.calculatePriorityScore(assignment, course);
        this.db.updateAssignment(assignment.id, { priority_score: score });
      }
    });
  }
}
```

---

## Grade Volatility Calculation

**Purpose:** Measure stability of student's performance over time

**Formula:**
```sql
SELECT STDEV(grade) FROM (
  SELECT grade FROM grade_history
  WHERE course_id = ?
  ORDER BY recorded_at DESC
  LIMIT 10
)
```

**Implementation:**

```typescript
export class GradeAnalytics {
  constructor(private db: Database) {}

  /**
   * Calculate grade volatility (standard deviation of recent grades)
   */
  calculateVolatility(courseId: number): number {
    const history = this.db.query<{ grade: number }[]>(
      `SELECT grade FROM grade_history
       WHERE course_id = ?
       ORDER BY recorded_at DESC
       LIMIT 10`,
      [courseId]
    );

    if (history.length < 2) {
      return 0; // Not enough data
    }

    const mean = history.reduce((sum, row) => sum + row.grade, 0) / history.length;
    const variance = history.reduce((sum, row) => {
      return sum + Math.pow(row.grade - mean, 2);
    }, 0) / history.length;

    return Math.sqrt(variance);
  }

  /**
   * Update volatility for a course after grade change
   */
  updateVolatility(courseId: number): void {
    const volatility = this.calculateVolatility(courseId);
    this.db.query(
      `UPDATE courses SET grade_volatility = ? WHERE id = ?`,
      [volatility, courseId]
    );
  }
}
```

---

## Assessed Grade Calculation

**Purpose:** Calculate grade from completed work only (excludes pending assignments)

**Formula:**
```
assessed_grade = Σ(grade × weight) WHERE is_completed = TRUE
```

**Implementation:**

```typescript
export class GradeAnalytics {
  /**
   * Calculate assessed grade (from completed work only)
   */
  calculateAssessedGrade(courseId: number): number {
    const result = this.db.query<{ assessed: number }>(
      `SELECT SUM(grade * weight / 100.0) as assessed
       FROM assignments
       WHERE course_id = ? AND is_completed = TRUE`,
      [courseId]
    );

    return result.assessed || 0;
  }

  /**
   * Update assessed grade for a course
   * Called after assignment completion or grade update
   */
  updateAssessedGrade(courseId: number): void {
    const assessedGrade = this.calculateAssessedGrade(courseId);
    this.db.query(
      `UPDATE courses SET assessed_grade = ? WHERE id = ?`,
      [assessedGrade, courseId]
    );
  }
}
```

---

## Total Weight Calculation

**Purpose:** Sum all assignment weights to enable 100% Guardrail

**Formula:**
```
total_weight = Σ(weight) for all assignments in course
```

**Implementation:**

```typescript
export class GradeAnalytics {
  /**
   * Calculate total weight of all assignments in course
   */
  calculateTotalWeight(courseId: number): number {
    const result = this.db.query<{ total: number }>(
      `SELECT SUM(weight) as total
       FROM assignments
       WHERE course_id = ?`,
      [courseId]
    );

    return result.total || 0;
  }

  /**
   * Update total weight for a course
   * Called after sync or assignment weight change
   */
  updateTotalWeight(courseId: number): void {
    const totalWeight = this.calculateTotalWeight(courseId);
    this.db.query(
      `UPDATE courses SET total_weight = ? WHERE id = ?`,
      [totalWeight, courseId]
    );
  }
}
```

---

## Integration with Sync Engine (L2)

When L2 syncs assignments from Canvas:

```typescript
// File: src/layers/l2-daemon/SyncEngine.ts

import { PriorityEngine } from '../l3-intelligence/PriorityEngine';
import { GradeAnalytics } from '../l3-intelligence/GradeAnalytics';

export class SyncEngine {
  constructor(
    private db: Database,
    private priorityEngine: PriorityEngine,
    private analytics: GradeAnalytics
  ) {}

  async syncCourse(courseId: number): Promise<void> {
    // 1. Fetch assignments from Canvas API
    const assignments = await this.canvasClient.getAssignments(courseId);

    // 2. Upsert to database
    this.db.transaction(() => {
      for (const assignment of assignments) {
        this.db.upsertAssignment(assignment);
      }
    });

    // 3. Update analytics
    this.analytics.updateTotalWeight(courseId);
    this.analytics.updateAssessedGrade(courseId);
    this.analytics.updateVolatility(courseId);

    // 4. Recalculate priorities
    this.priorityEngine.updateCoursePriorities(courseId);

    // 5. Emit commit event (triggers UI update via L5)
    this.db.emit('commit', { table: 'assignments' });
  }
}
```

---

## Edge Cases & Validation

### Edge Case 1: Division by Zero
**Problem:** If `v_eff = 0`, `log(0 + 1) = 0` causes division by zero

**Solution:** Floor `v_eff` at 0.1
```typescript
const vEff = Math.max(course.grade_volatility || 0, 0.1);
```

### Edge Case 2: Negative Target Delta
**Problem:** If assessed grade exceeds target, delta becomes negative

**Solution:** Floor target_delta at 0
```typescript
return Math.max(0, delta);
```

### Edge Case 3: Total Weight ≠ 100%
**Problem:** Cannot calculate accurate target_delta if weights are incomplete

**Solution:** Return 0 for target_delta, hide analytics in UI (100% Guardrail)
```typescript
if (Math.abs(course.total_weight - 100) > 0.01) {
  return 0; // Analytics unavailable
}
```

### Edge Case 4: Assignment with No Weight
**Problem:** Canvas API may not provide weight for ungraded items

**Solution:** Default weight to 0, score becomes 0
```typescript
const weight = assignment.weight || 0;
```

### Edge Case 5: Past Due Assignments
**Problem:** Urgency boost doesn't make sense for overdue work

**Solution:** Only apply urgency boost if `hoursUntilDue > 0`
```typescript
if (hoursUntilDue > 0 && hoursUntilDue < 48) {
  score *= 1.3;
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// File: tests/l3-intelligence/PriorityEngine.test.ts

import { PriorityEngine } from '../../src/layers/l3-intelligence/PriorityEngine';

describe('PriorityEngine', () => {
  test('calculates base score correctly', () => {
    const assignment = {
      id: 1,
      weight: 15,
      title: 'Assignment 1',
      due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    };

    const course = {
      id: 1,
      target_grade: 85,
      assessed_grade: 22,
      total_weight: 100,
      grade_volatility: 5.2
    };

    const engine = new PriorityEngine(mockDb);
    const score = engine.calculatePriorityScore(assignment, course);

    // Expected: (15 × 84) / log(5.2 + 1) ≈ 690.4
    expect(score).toBeCloseTo(690.4, 1);
  });

  test('applies keyword boost for exams', () => {
    const assignment = { ...baseAssignment, title: 'Midterm Exam' };
    const score = engine.calculatePriorityScore(assignment, course);

    // Should be 1.5x base score
    expect(score).toBeCloseTo(690.4 * 1.5, 1);
  });

  test('floors volatility at 0.1', () => {
    const course = { ...baseCourse, grade_volatility: 0 };
    const score = engine.calculatePriorityScore(assignment, course);

    // Should use v_eff = 0.1, not 0
    expect(score).toBeGreaterThan(0);
  });

  test('returns 0 for incomplete weight', () => {
    const course = { ...baseCourse, total_weight: 75 }; // Not 100%
    const score = engine.calculatePriorityScore(assignment, course);

    expect(score).toBe(0); // 100% Guardrail
  });
});
```

---

## Performance Considerations

### Database Indexing
```sql
CREATE INDEX idx_assignments_completed ON assignments(course_id, is_completed);
CREATE INDEX idx_grade_history_course ON grade_history(course_id, recorded_at DESC);
```

### Caching
- Cache calculated values in `courses` table:
  - `assessed_grade`
  - `total_weight`
  - `grade_volatility`
- Only recalculate on sync or user edits

### Batch Processing
- Recalculate all priorities in a single transaction:
```typescript
this.db.transaction(() => {
  for (const assignment of assignments) {
    const score = this.calculatePriorityScore(assignment, course);
    this.db.updateAssignment(assignment.id, { priority_score: score });
  }
});
```

---

## UI Display

### Dashboard Priority List

Assignments sorted by `priority_score DESC`:

```
┌─────────────────────────────────────────────────────────────┐
│  Assignment                | Course    | Due   | Score | 🎯 │
├─────────────────────────────────────────────────────────────┤
│  Final Project Report      | ECE314   | 2d    | 1245  | 🔴 │
│  Midterm Exam              | CSC373   | 5d    | 892   | 🟠 │
│  Lab 3 - Circuit Analysis  | ECE212   | 1w    | 547   | 🟠 │
│  Problem Set 4             | MAT237   | 2w    | 312   | 🟢 │
└─────────────────────────────────────────────────────────────┘
```

**Color Coding:**
- 🔴 Critical (score > 750): Crimson Red (#DC2626)
- 🟠 High (score > 400): Amber (#D97706)
- 🟢 Normal (score ≤ 400): Emerald (#059669)

### Course Analytics

```
┌─────────────────────────────────────────────────────────────┐
│  ECE314 - Fundamentals of Electrical Engineering           │
├─────────────────────────────────────────────────────────────┤
│  Grade Reality Gauge:                                       │
│  ████████████████████░░░░░░░░░░  Assessed: 22%             │
│  ██████████████████████████████████████████  Current: 85%   │
│                                                             │
│  Target Delta: You need 84% average on remaining work      │
│  to reach your 85% goal.                                    │
│                                                             │
│  Volatility: ▁▂▃▅▄▃▂▁ (Low - Stable performance)          │
└─────────────────────────────────────────────────────────────┘
```

---

## Conclusion

The ROI Priority Scoring system provides:
- **Actionable Intelligence:** Students know which assignments to prioritize
- **Risk-Aware:** Accounts for grade volatility (unpredictable courses)
- **Goal-Oriented:** Focuses on gap between current and target performance
- **Adaptive:** Recalculates automatically after every sync

**Status:** READY FOR IMPLEMENTATION
**Next Steps:** Implement `PriorityEngine.ts` in Week 3 (MVP Roadmap)

---

**Formula Reference:**
```
priority_score = (weight × target_delta) / log(max(v_eff, 0.1) + 1)

where:
  target_delta = max(0, (target - assessed) / remaining_weight)
  v_eff = max(grade_volatility, 0.1)
```
