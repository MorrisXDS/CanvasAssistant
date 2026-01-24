/**
 * AdaptiveLearningOrchestrator - Coordinates Adaptive Weight Learning with Database
 *
 * This class orchestrates the adaptive learning process:
 * 1. Records learning outcomes from task completions
 * 2. Calls pure domain functions from AdaptiveWeightService
 * 3. Persists weight adjustments to database
 * 4. Applies adjustments to priority calculations
 * 5. Emits events for monitoring
 */

import { EventEmitter } from 'events';
import { Database } from '../../l1-persistence/Database';
import {
  calculateAdaptiveWeights,
  applyAdaptiveWeights,
  detectWeightDrift,
  buildAdaptiveWeights,
  getAdjustmentSummary,
  createLearningInput,
} from '../domain/AdaptiveWeightService';
import {
  LearningInput,
  LearningOutcome,
  WeightAdjustment,
  AdaptiveWeights,
  PriorityFactors,
  TaskCompletionEvent,
} from '../types';

/**
 * Raw weight adjustment from database
 */
interface WeightAdjustmentRow {
  id: number;
  factor_name: string;
  course_id: number | null;
  task_type: string | null;
  weight_multiplier: number;
  adjustment_reason: string | null;
  sample_size: number;
  last_updated_at: string;
}

/**
 * Configuration for AdaptiveLearningOrchestrator
 */
export interface AdaptiveLearningOrchestratorConfig {
  /** How often to recalculate weights in milliseconds (default: 24 hours) */
  recalculateIntervalMs?: number;
  /** Minimum sample size before learning (default: 10) */
  minSampleSize?: number;
  /** Maximum learning inputs to keep (default: 500) */
  maxLearningInputs?: number;
  /** Whether to auto-recalculate (default: true) */
  autoRecalculate?: boolean;
}

const DEFAULT_CONFIG: Required<AdaptiveLearningOrchestratorConfig> = {
  recalculateIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
  minSampleSize: 10,
  maxLearningInputs: 500,
  autoRecalculate: true,
};

/**
 * AdaptiveLearningOrchestrator manages adaptive weight learning lifecycle
 *
 * Events:
 * - 'weights-updated': Emitted when weights are recalculated
 * - 'outcome-recorded': Emitted when a learning outcome is recorded
 * - 'drift-detected': Emitted when weight drift is detected
 * - 'error': Emitted on errors
 */
export class AdaptiveLearningOrchestrator extends EventEmitter {
  private db: Database;
  private config: Required<AdaptiveLearningOrchestratorConfig>;
  private recalculateTimer: NodeJS.Timeout | null = null;
  private cachedWeights: AdaptiveWeights | null = null;
  private learningInputs: LearningInput[] = [];

  constructor(db: Database, config?: AdaptiveLearningOrchestratorConfig) {
    super();
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Load existing learning inputs from completion events
    this.loadLearningInputs();

    if (this.config.autoRecalculate) {
      this.startAutoRecalculate();
    }
  }

  /**
   * Start auto-recalculate timer
   */
  private startAutoRecalculate(): void {
    if (this.recalculateTimer) {
      clearInterval(this.recalculateTimer);
    }

    this.recalculateTimer = setInterval(() => {
      try {
        this.recalculateWeights();
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.recalculateIntervalMs);
  }

  /**
   * Stop auto-recalculate timer
   */
  stop(): void {
    if (this.recalculateTimer) {
      clearInterval(this.recalculateTimer);
      this.recalculateTimer = null;
    }
  }

  /**
   * Load learning inputs from completion events
   */
  private loadLearningInputs(): void {
    const events = this.fetchCompletionEvents();

    // Convert completion events to learning inputs
    // Note: This is a simplified conversion - in a full implementation,
    // we would store priority factors at completion time
    this.learningInputs = events.map((event) => {
      const defaultFactors: PriorityFactors = {
        urgency: 50,
        weight: event.pointsPossible ? Math.min(50, event.pointsPossible / 2) : 10,
        courseGap: 15,
        policyAdjustment: 0,
        dependency: 0,
        taskTypeBoost: 0,
        lockTimeUrgency: 0,
        graceTokenFactor: 0,
        submissionFactor: 0,
      };

      return createLearningInput(
        event.taskId,
        event.courseId,
        event.taskType,
        50, // Placeholder priority score
        defaultFactors,
        event.wasLate,
        event.daysBeforeDue
      );
    });
  }

  /**
   * Fetch completion events from database
   */
  private fetchCompletionEvents(): TaskCompletionEvent[] {
    const rows = this.db.executeRead<{
      id: number;
      task_id: number;
      course_id: number;
      task_type: string;
      started_at: string | null;
      completed_at: string;
      due_at: string | null;
      time_to_complete_minutes: number | null;
      day_of_week: number;
      hour_of_day: number;
      days_before_due: number | null;
      was_late: number;
      score_achieved: number | null;
      points_possible: number | null;
    }>(`SELECT * FROM task_completion_events ORDER BY completed_at DESC LIMIT ?`,
      [this.config.maxLearningInputs]
    );

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      courseId: row.course_id,
      taskType: row.task_type,
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: new Date(row.completed_at),
      dueAt: row.due_at ? new Date(row.due_at) : null,
      timeToCompleteMinutes: row.time_to_complete_minutes,
      dayOfWeek: row.day_of_week,
      hourOfDay: row.hour_of_day,
      daysBeforeDue: row.days_before_due,
      wasLate: Boolean(row.was_late),
      scoreAchieved: row.score_achieved,
      pointsPossible: row.points_possible,
    }));
  }

  /**
   * Record a learning outcome
   */
  recordOutcome(
    taskId: number,
    courseId: number,
    taskType: string,
    priorityScore: number,
    factors: PriorityFactors,
    wasLate: boolean,
    daysBeforeDue: number | null
  ): void {
    const input = createLearningInput(
      taskId,
      courseId,
      taskType,
      priorityScore,
      factors,
      wasLate,
      daysBeforeDue
    );

    this.learningInputs.push(input);

    // Keep only most recent inputs
    if (this.learningInputs.length > this.config.maxLearningInputs) {
      this.learningInputs = this.learningInputs.slice(-this.config.maxLearningInputs);
    }

    this.emit('outcome-recorded', input);

    // Check for drift
    const drifts = detectWeightDrift(this.learningInputs);
    if (drifts.length > 0) {
      this.emit('drift-detected', drifts);
    }
  }

  /**
   * Recalculate adaptive weights from learning inputs
   */
  recalculateWeights(): AdaptiveWeights {
    const adjustments = calculateAdaptiveWeights(
      this.learningInputs,
      this.config.minSampleSize
    );

    // Save adjustments to database
    for (const adj of adjustments) {
      this.saveWeightAdjustment(adj);
    }

    // Build full adaptive weights
    this.cachedWeights = buildAdaptiveWeights(
      this.learningInputs,
      this.config.minSampleSize
    );

    this.emit('weights-updated', this.cachedWeights);

    return this.cachedWeights;
  }

  /**
   * Save weight adjustment to database
   */
  private saveWeightAdjustment(adjustment: WeightAdjustment): void {
    this.db.executeWrite(
      `INSERT INTO adaptive_weight_adjustments (
        factor_name, course_id, task_type, weight_multiplier,
        adjustment_reason, sample_size, last_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(factor_name, course_id, task_type)
      DO UPDATE SET
        weight_multiplier = ?,
        adjustment_reason = ?,
        sample_size = ?,
        last_updated_at = CURRENT_TIMESTAMP`,
      [
        adjustment.factorName,
        adjustment.courseId,
        adjustment.taskType,
        adjustment.weightMultiplier,
        adjustment.adjustmentReason,
        adjustment.sampleSize,
        adjustment.weightMultiplier,
        adjustment.adjustmentReason,
        adjustment.sampleSize,
      ],
      'adaptive_weight_adjustments'
    );
  }

  /**
   * Get all weight adjustments from database
   */
  getWeightAdjustments(): WeightAdjustment[] {
    const rows = this.db.executeRead<WeightAdjustmentRow>(`
      SELECT * FROM adaptive_weight_adjustments
      ORDER BY factor_name, course_id, task_type
    `);

    return rows.map((row) => ({
      factorName: row.factor_name,
      courseId: row.course_id,
      taskType: row.task_type,
      weightMultiplier: row.weight_multiplier,
      adjustmentReason: row.adjustment_reason || '',
      sampleSize: row.sample_size,
      lastUpdatedAt: new Date(row.last_updated_at),
    }));
  }

  /**
   * Get weight adjustments for a specific factor
   */
  getAdjustmentsForFactor(factorName: string): WeightAdjustment[] {
    const rows = this.db.executeRead<WeightAdjustmentRow>(`
      SELECT * FROM adaptive_weight_adjustments
      WHERE factor_name = ?
      ORDER BY course_id, task_type
    `, [factorName]);

    return rows.map((row) => ({
      factorName: row.factor_name,
      courseId: row.course_id,
      taskType: row.task_type,
      weightMultiplier: row.weight_multiplier,
      adjustmentReason: row.adjustment_reason || '',
      sampleSize: row.sample_size,
      lastUpdatedAt: new Date(row.last_updated_at),
    }));
  }

  /**
   * Get weight adjustments for a specific course
   */
  getAdjustmentsForCourse(courseId: number): WeightAdjustment[] {
    const rows = this.db.executeRead<WeightAdjustmentRow>(`
      SELECT * FROM adaptive_weight_adjustments
      WHERE course_id = ? OR course_id IS NULL
      ORDER BY factor_name, task_type
    `, [courseId]);

    return rows.map((row) => ({
      factorName: row.factor_name,
      courseId: row.course_id,
      taskType: row.task_type,
      weightMultiplier: row.weight_multiplier,
      adjustmentReason: row.adjustment_reason || '',
      sampleSize: row.sample_size,
      lastUpdatedAt: new Date(row.last_updated_at),
    }));
  }

  /**
   * Apply adaptive weights to priority factors
   */
  applyWeights(
    baseFactors: PriorityFactors,
    courseId: number,
    taskType: string
  ): PriorityFactors {
    const adjustments = this.getWeightAdjustments();
    return applyAdaptiveWeights(baseFactors, adjustments, courseId, taskType);
  }

  /**
   * Get cached adaptive weights
   */
  getCachedWeights(): AdaptiveWeights | null {
    return this.cachedWeights;
  }

  /**
   * Get adjustment summary for display
   */
  getSummary(): string[] {
    const adjustments = this.getWeightAdjustments();
    return getAdjustmentSummary(adjustments);
  }

  /**
   * Get learning statistics
   */
  getStatistics(): {
    totalInputs: number;
    adjustmentCount: number;
    outcomeDistribution: Record<LearningOutcome, number>;
    avgPriorityByOutcome: Record<LearningOutcome, number>;
  } {
    const outcomeDistribution: Record<LearningOutcome, number> = {
      completed_early: 0,
      completed_ontime: 0,
      completed_late: 0,
      missed: 0,
    };

    const prioritySums: Record<LearningOutcome, number> = {
      completed_early: 0,
      completed_ontime: 0,
      completed_late: 0,
      missed: 0,
    };

    for (const input of this.learningInputs) {
      outcomeDistribution[input.outcome]++;
      prioritySums[input.outcome] += input.priorityScore;
    }

    const avgPriorityByOutcome: Record<LearningOutcome, number> = {
      completed_early: outcomeDistribution.completed_early > 0
        ? prioritySums.completed_early / outcomeDistribution.completed_early
        : 0,
      completed_ontime: outcomeDistribution.completed_ontime > 0
        ? prioritySums.completed_ontime / outcomeDistribution.completed_ontime
        : 0,
      completed_late: outcomeDistribution.completed_late > 0
        ? prioritySums.completed_late / outcomeDistribution.completed_late
        : 0,
      missed: outcomeDistribution.missed > 0
        ? prioritySums.missed / outcomeDistribution.missed
        : 0,
    };

    const adjustments = this.getWeightAdjustments();

    return {
      totalInputs: this.learningInputs.length,
      adjustmentCount: adjustments.length,
      outcomeDistribution,
      avgPriorityByOutcome,
    };
  }

  /**
   * Reset all adaptive weights
   */
  resetWeights(): void {
    this.db.executeWrite(
      `DELETE FROM adaptive_weight_adjustments`,
      [],
      'adaptive_weight_adjustments'
    );

    this.learningInputs = [];
    this.cachedWeights = null;

    this.emit('weights-updated', null);
  }

  /**
   * Get learning input count
   */
  getLearningInputCount(): number {
    return this.learningInputs.length;
  }
}
