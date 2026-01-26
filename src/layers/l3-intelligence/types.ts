/**
 * L3 Intelligence - Type Definitions
 *
 * Core types for the priority calculation system including
 * explanations, factors, and submission windows.
 */

/**
 * Task queues for priority categorization
 */
export type TaskQueue = 'pinned' | 'active' | 'overdue' | 'deadlines' | 'upcoming';

/**
 * Submission status from Canvas
 */
export type SubmissionStatus =
  | 'unsubmitted'
  | 'submitted'
  | 'graded'
  | 'late'
  | 'missing'
  | null;

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
  lockAt: Date | null;
  pointsPossible: number | null;
  weight: number | null;
  isCompleted: boolean;
  isPinned: boolean;
  grade: number | null;
  submittedAt: Date | null;
  taskType: string;
  taskGroupId: number | null;
  submissionStatus: SubmissionStatus;
  /** Source of each field value: 'canvas', 'user', or 'guessed' */
  fieldSources?: Record<string, 'canvas' | 'user' | 'guessed'>;
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
    upcoming: PriorityExplanation[];
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

/**
 * Grace token policy configuration
 */
export interface GraceTokenPolicy {
  totalTokens: number;
  tokensRemaining: number;
  hoursPerToken: number;
  maxTokensPerTask: number;
}

// ============================================================================
// Behavioral Analytics Types
// ============================================================================

/**
 * Task completion event for pattern analysis
 */
export interface TaskCompletionEvent {
  id?: number;
  taskId: number;
  courseId: number;
  taskType: string;
  startedAt: Date | null;
  completedAt: Date;
  dueAt: Date | null;
  timeToCompleteMinutes: number | null;
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  hourOfDay: number; // 0-23
  daysBeforeDue: number | null;
  wasLate: boolean;
  scoreAchieved: number | null;
  pointsPossible: number | null;
}

/**
 * Aggregated user behavior pattern
 */
export interface UserBehaviorPattern {
  id?: number;
  patternType:
    | 'weekly_rhythm'
    | 'course_difficulty'
    | 'task_type_performance'
    | 'optimal_work_time';
  patternKey: string;
  patternValue: string;
  sampleSize: number;
  confidence: number;
  lastUpdatedAt: Date;
}

/**
 * Weekly rhythm analysis result
 */
export interface WeeklyRhythm {
  productiveDays: Array<{
    dayOfWeek: number;
    dayName: string;
    completionCount: number;
    avgScore: number;
  }>;
  productiveHours: Array<{
    hour: number;
    completionCount: number;
    avgScore: number;
  }>;
  peakDay: number;
  peakHour: number;
  sampleSize: number;
  confidence: number;
}

/**
 * Course difficulty/performance ranking
 */
export interface CoursePerformance {
  courseId: number;
  courseCode: string;
  courseName: string;
  avgScore: number;
  onTimeRate: number;
  lateRate: number;
  missedRate: number;
  totalTasks: number;
  struggleScore: number; // 0-100, higher = more struggle
}

/**
 * Struggle pattern for a task type
 */
export interface StrugglePattern {
  taskType: string;
  avgScore: number;
  onTimeRate: number;
  avgDaysEarly: number;
  struggleScore: number;
  sampleSize: number;
}

// ============================================================================
// Effort Estimation Types
// ============================================================================

/**
 * Effort estimation for a task
 */
export interface EffortEstimate {
  taskId: number;
  courseId: number;
  taskType: string;
  pointsPossible: number | null;
  estimatedMinutes: number;
  actualMinutes: number | null;
  estimationMethod: 'default' | 'historical' | 'calibrated' | 'hybrid';
  confidence: number; // 0-1
}

/**
 * Effort estimation context for more accurate predictions
 */
export interface EffortEstimationContext {
  taskType: string;
  pointsPossible: number | null;
  courseId: number;
  historicalAverageMinutes: number | null;
  courseMultiplier: number;
  taskTypeMultiplier: number;
}

/**
 * Calibration data for improving estimates
 */
export interface EffortCalibrationInput {
  taskId: number;
  taskType: string;
  courseId: number;
  estimatedMinutes: number;
  actualMinutes: number;
}

// ============================================================================
// Workload Analysis Types
// ============================================================================

/**
 * Workload snapshot for a specific date
 */
export interface WorkloadSnapshot {
  snapshotDate: Date;
  totalTasksDue: number;
  totalEstimatedMinutes: number;
  tasksByCourse: Record<number, number>;
  tasksByUrgency: Record<string, number>;
  deadlineClusteringScore: number; // 0-1, higher = more clustered
}

/**
 * Full workload distribution analysis
 */
export interface WorkloadDistribution {
  startDate: Date;
  endDate: Date;
  dailySnapshots: WorkloadSnapshot[];
  peakDay: Date | null;
  peakMinutes: number;
  avgDailyMinutes: number;
  clusteringScore: number;
  balanceScore: number; // 0-100, higher = more balanced
}

/**
 * Task redistribution suggestion
 */
export interface RedistributionSuggestion {
  taskId: number;
  taskTitle: string;
  currentDueDate: Date;
  suggestedDate: Date;
  reason: string;
  timeGained: number; // minutes
}

/**
 * Neglected course detection result
 */
export interface NeglectedCourse {
  courseId: number;
  courseCode: string;
  courseName: string;
  daysSinceActivity: number;
  pendingTaskCount: number;
  upcomingDeadlines: number;
  neglectScore: number; // 0-100, higher = more neglected
}

// ============================================================================
// Recommendation Types
// ============================================================================

/**
 * Recommendation type enum
 *
 * Note: All recommendations are based on observable data (due dates, submission
 * history, grades). We avoid claims about procrastination or study habits since
 * we don't track when users start working or how they study.
 */
export type RecommendationType =
  | 'work_now'
  | 'start_early'
  | 'take_break'
  | 'course_focus'
  | 'redistribute'
  | 'preemptive_start'
  | 'focus_at_risk';

/**
 * A generated recommendation
 */
export interface Recommendation {
  id?: number;
  type: RecommendationType;
  taskId: number | null;
  courseId: number | null;
  title: string;
  description: string;
  reasoning: string;
  priorityScore: number;
  validFrom: Date;
  validUntil: Date;
  dismissedAt: Date | null;
  actedOnAt: Date | null;
  createdAt?: Date;
}

/**
 * Context for generating recommendations
 */
export interface RecommendationContext {
  currentTime: Date;
  availableMinutes: number;
  recentActivity: TaskCompletionEvent[];
  userPatterns: UserBehaviorPattern[];
}

// ============================================================================
// Insight Types
// ============================================================================

/**
 * Insight type enum
 *
 * Note: All insights are based on observable data (submission timing, grades,
 * task due dates). We avoid claims about study habits, procrastination, or
 * time spent working since we don't have that data.
 */
export type InsightType =
  | 'deadline_pattern'
  | 'course_struggle'
  | 'productivity_window'
  | 'workload_warning'
  | 'streak'
  | 'improvement'
  | 'data_completeness'
  | 'grade_at_risk'
  | 'grade_trend'
  | 'crunch_period'
  | 'unset_weight'
  | 'guessed_due_date';

/**
 * Insight severity level
 */
export type InsightSeverity = 'info' | 'warning' | 'critical';

/**
 * A generated user insight
 */
export interface Insight {
  id?: number;
  type: InsightType;
  title: string;
  description: string;
  severity: InsightSeverity;
  data: Record<string, unknown>;
  acknowledgedAt: Date | null;
  expiresAt: Date | null;
  createdAt?: Date;
}

// ============================================================================
// Adaptive Weight Types
// ============================================================================

/**
 * Learning outcome for weight adjustment
 */
export type LearningOutcome =
  | 'completed_early'
  | 'completed_ontime'
  | 'completed_late'
  | 'missed';

/**
 * Learning input for adaptive weights
 */
export interface LearningInput {
  taskId: number;
  courseId: number;
  taskType: string;
  priorityScore: number;
  factors: PriorityFactors;
  outcome: LearningOutcome;
  daysFromDeadline: number;
}

/**
 * Weight adjustment record
 */
export interface WeightAdjustment {
  factorName: string;
  courseId: number | null;
  taskType: string | null;
  weightMultiplier: number;
  adjustmentReason: string;
  sampleSize: number;
  lastUpdatedAt: Date;
}

/**
 * Adaptive weights configuration
 */
export interface AdaptiveWeights {
  baseWeights: PriorityFactors;
  adjustments: WeightAdjustment[];
  globalMultipliers: Record<string, number>;
}

// ============================================================================
// Enhanced Priority Types
// ============================================================================

/**
 * Enhanced priority explanation with adaptive learning data
 */
export interface EnhancedPriorityExplanation extends PriorityExplanation {
  effortEstimate: EffortEstimate | null;
  adaptiveAdjustments: WeightAdjustment[];
  behavioralInsights: {
    optimalWorkTime: { dayOfWeek: number; hourOfDay: number } | null;
    historicalPerformance: { avgScore: number; onTimeRate: number } | null;
    courseStruggleScore: number | null;
  };
}

/**
 * Daily plan entry
 */
export interface DailyPlanEntry {
  taskId: number;
  taskTitle: string;
  courseCode: string;
  dueAt: Date | null;
  estimatedMinutes: number;
  priorityScore: number;
  recommendedStartTime: Date | null;
  reason: string;
}

/**
 * Input for the pure priority calculation function
 */
export interface PriorityInput {
  task: TaskForPriority;
  course: CourseForPriority;
  policies: PolicyForPriority[];
  graceTokenPolicy: GraceTokenPolicy | null;
  now: Date;
}

/**
 * All factors contributing to priority score
 */
export interface PriorityFactors {
  /** 0-100: Time-based urgency */
  urgency: number;
  /** 0-50: Grade impact (weight) */
  weight: number;
  /** 0-30: Distance from target grade */
  courseGap: number;
  /** -100 to +20: Policy adjustments */
  policyAdjustment: number;
  /** -50 or 0: Dependency blocking */
  dependency: number;
  /** -2.5 to +10: Task type weighting */
  taskTypeBoost: number;
  /** 0-50: Lock time critical boost */
  lockTimeUrgency: number;
  /** -10 to +20: Grace token salvage factor */
  graceTokenFactor: number;
  /** -100 to 0: Submission status handling */
  submissionFactor: number;
}

/**
 * Result of a single task priority calculation
 */
export interface PriorityResult {
  taskId: number;
  queue: TaskQueue;
  score: number;
  factors: PriorityFactors;
  reason: string;
  explanation: PriorityExplanation;
}
