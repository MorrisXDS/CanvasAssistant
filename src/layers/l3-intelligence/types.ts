/**
 * L3 Intelligence - Type Definitions
 *
 * Core types for the priority calculation system including
 * explanations, factors, and submission windows.
 */

/**
 * Task queues for priority categorization
 */
export type TaskQueue = 'pinned' | 'active' | 'overdue' | 'deadlines';

/**
 * A factor contributing to the priority score
 */
export interface PriorityFactor {
  /** Factor identifier */
  id: string;
  /** Display name */
  name: string;
  /** Icon for UI display */
  icon: string;
  /** Numerical impact on score (positive or negative) */
  impact: number;
  /** Human-readable description */
  description: string;
  /** Optional actionable recommendation */
  recommendation?: string;
}

/**
 * A submission window with deadline and consequences
 */
export interface SubmissionWindow {
  /** Type of window */
  type: 'on_time' | 'grace_token' | 'late_penalty' | 'cutoff';
  /** Deadline timestamp */
  deadline: Date;
  /** Hours from now */
  hoursRemaining: number;
  /** Human-readable label */
  label: string;
  /** Cost in grace tokens (if applicable) */
  tokenCost?: number;
  /** Penalty percentage (if applicable) */
  penaltyPercent?: number;
  /** Whether this window is still available */
  available: boolean;
}

/**
 * Grade impact analysis for a task
 */
export interface GradeImpact {
  /** Current course grade */
  currentGrade: number;
  /** Target grade for the course */
  targetGrade: number;
  /** Gap between current and target */
  gapToTarget: number;
  /** Projected grade if task is skipped */
  gradeIfSkipped: number;
  /** Projected grade if task scored at average */
  gradeIfAverage: number;
  /** Minimum score needed to reach target */
  minScoreForTarget: number | null;
  /** Risk level if task is not completed */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Complete priority explanation for a task
 */
export interface PriorityExplanation {
  /** Task ID */
  taskId: number;
  /** Final calculated score */
  finalScore: number;
  /** Which queue this task belongs to */
  queue: TaskQueue;
  /** All contributing factors */
  factors: PriorityFactor[];
  /** Available submission windows */
  submissionWindows: SubmissionWindow[];
  /** Grade impact analysis */
  gradeImpact: GradeImpact;
  /** One-line summary for quick display */
  summary: string;
  /** When this explanation was calculated */
  calculatedAt: Date;
  /** When this should be recalculated */
  expiresAt: Date;
}

/**
 * Task data needed for priority calculation
 */
export interface TaskForPriority {
  id: number;
  courseId: number;
  title: string;
  dueAt: Date | null;
  unlockAt: Date | null;
  pointsPossible: number | null;
  weight: number | null;
  isCompleted: boolean;
  isPinned: boolean;
  grade: number | null;
  submittedAt: Date | null;
}

/**
 * Course data needed for priority calculation
 */
export interface CourseForPriority {
  id: number;
  code: string;
  name: string;
  currentGrade: number | null;
  targetGrade: number;
  totalWeight: number;
}

/**
 * Policy data needed for priority calculation
 */
export interface PolicyForPriority {
  id: number;
  courseId: number;
  policyType: string;
  policyName: string;
  policyConfig: Record<string, unknown>;
  isActive: boolean;
}

/**
 * Module dependency information
 */
export interface ModuleDependency {
  taskId: number;
  moduleId: number;
  moduleName: string;
  position: number;
  prerequisiteModuleIds: number[];
  prerequisitesMet: boolean;
  blockedReason?: string;
}

/**
 * Result of priority calculation for multiple tasks
 */
export interface PriorityCalculationResult {
  /** Tasks sorted by priority within each queue */
  queues: {
    pinned: PriorityExplanation[];
    active: PriorityExplanation[];
    overdue: PriorityExplanation[];
    deadlines: PriorityExplanation[];
  };
  /** Timestamp of calculation */
  calculatedAt: Date;
  /** Next scheduled recalculation */
  nextRefreshAt: Date;
  /** Any warnings or notices */
  notices: Array<{
    taskId: number;
    type: 'estimated_submission' | 'token_expiring' | 'dependency_blocked';
    message: string;
    dismissible: boolean;
  }>;
}

/**
 * User preferences for priority display
 */
export interface PriorityPreferences {
  /** Tasks user wants hidden from notices */
  dismissedNotices: Map<number, Set<string>>;
  /** Tasks user has manually pinned */
  pinnedTaskIds: Set<number>;
  /** Whether to show estimated submission notices */
  showEstimatedSubmissions: boolean;
}
