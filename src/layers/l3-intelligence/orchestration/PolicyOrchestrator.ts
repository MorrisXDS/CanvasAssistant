/**
 * PolicyOrchestrator - Coordinates Policy Operations with Database
 *
 * This class orchestrates policy-related operations:
 * 1. Grace token consumption and tracking
 * 2. Policy retrieval with context
 * 3. Token usage history
 * 4. Staleness warnings based on syllabus review dates
 */

import { EventEmitter } from 'events';
import { Database } from '../../l1-persistence/Database';
import { PolicyRepository } from '../../l1-persistence/repositories/PolicyRepository';
import {
  GraceTokenUsageRepository,
  TokenUsageRecord,
  TokenUsageWithContext,
} from '../../l1-persistence/repositories/GraceTokenUsageRepository';
import { GraceTokenService } from '../domain/GraceTokenService';
import type { Policy, Task } from '../../../shared/ipc-contract';

/**
 * Grace token row in database
 */
interface GraceTokenRow {
  id: number;
  course_id: number;
  policy_id: number;
  total_tokens: number;
  tokens_remaining: number;
  hours_per_token: number;
  max_tokens_per_task: number;
  created_at: string;
  updated_at: string;
}

/**
 * Syllabus row for staleness checking
 */
interface CourseSyllabusRow {
  id: number;
  course_id: number;
  resource_id: number;
  resource_updated_at: string | null;
  last_reviewed_at: string;
  change_detected_at: string | null;
}

/**
 * Policy with staleness info
 */
export interface PolicyWithStaleness extends Policy {
  /** Whether the syllabus was updated after this policy was entered */
  isStale: boolean;
  /** When the policy was entered relative to syllabus */
  basedOnSyllabusReviewedAt: string | null;
  /** When the syllabus was last reviewed */
  syllabusLastReviewedAt: string | null;
  /** When syllabus change was detected */
  syllabusChangeDetectedAt: string | null;
}

/**
 * Token usage summary for UI
 */
export interface TokenUsageSummary {
  policyId: number;
  courseId: number;
  courseCode: string;
  totalTokens: number;
  usedTokens: number;
  remainingTokens: number;
  hoursPerToken: number;
  maxTokensPerTask: number;
  usageHistory: TokenUsageWithContext[];
  warnings: string[];
}

/**
 * Result of using a grace token
 */
export interface UseGraceTokenResult {
  success: boolean;
  error?: string;
  tokensUsed: number;
  remainingTokens: number;
  newDeadline: Date | null;
  hoursExtended: number;
  usageRecord?: TokenUsageRecord;
}

/**
 * Configuration for PolicyOrchestrator
 */
export interface PolicyOrchestratorConfig {
  /** Warn when only this many tokens remain (default: 1) */
  lowTokenWarningThreshold?: number;
}

const DEFAULT_CONFIG: Required<PolicyOrchestratorConfig> = {
  lowTokenWarningThreshold: 1,
};

/**
 * Orchestrator for policy-related operations.
 */
export class PolicyOrchestrator extends EventEmitter {
  private db: Database;
  private config: Required<PolicyOrchestratorConfig>;
  private policyRepo: PolicyRepository;
  private usageRepo: GraceTokenUsageRepository;
  private tokenService: GraceTokenService;

  constructor(db: Database, config: PolicyOrchestratorConfig = {}) {
    super();
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.policyRepo = new PolicyRepository(db);
    this.usageRepo = new GraceTokenUsageRepository(db);
    this.tokenService = new GraceTokenService();
  }

  // =========================================================================
  // Grace Token Operations
  // =========================================================================

  /**
   * Use grace tokens for a task.
   *
   * @param courseId The course ID
   * @param taskId The task to apply tokens to
   * @param tokensToUse Number of tokens to use
   * @param notes Optional notes for the usage record
   */
  async useGraceToken(
    courseId: number,
    taskId: number,
    tokensToUse: number,
    notes?: string
  ): Promise<UseGraceTokenResult> {
    // 1. Load grace token policy and grace_tokens record
    const graceTokenRecord = this.getGraceTokenRecord(courseId);
    if (!graceTokenRecord) {
      return {
        success: false,
        error: 'No grace token policy found for this course',
        tokensUsed: 0,
        remainingTokens: 0,
        newDeadline: null,
        hoursExtended: 0,
      };
    }

    // 2. Load policy for full config
    const policy = this.policyRepo.findGraceTokenPolicy(courseId);
    if (!policy) {
      return {
        success: false,
        error: 'Grace token policy not found',
        tokensUsed: 0,
        remainingTokens: graceTokenRecord.tokens_remaining,
        newDeadline: null,
        hoursExtended: 0,
      };
    }

    // 3. Load task
    const task = this.getTask(taskId);
    if (!task) {
      return {
        success: false,
        error: 'Task not found',
        tokensUsed: 0,
        remainingTokens: graceTokenRecord.tokens_remaining,
        newDeadline: null,
        hoursExtended: 0,
      };
    }

    // 4. Check availability via GraceTokenService
    const checkResult = this.tokenService.checkAvailability(policy, task, tokensToUse);
    if (!checkResult.canUse) {
      return {
        success: false,
        error: checkResult.error,
        tokensUsed: 0,
        remainingTokens: checkResult.availableTokens,
        newDeadline: null,
        hoursExtended: 0,
      };
    }

    // 5. Calculate application via GraceTokenService
    const application = this.tokenService.calculateApplication(
      policy.policyConfig,
      task,
      tokensToUse
    );

    if (!application.success) {
      return {
        success: false,
        error: application.error,
        tokensUsed: 0,
        remainingTokens: graceTokenRecord.tokens_remaining,
        newDeadline: null,
        hoursExtended: 0,
      };
    }

    // 6. Persist changes in a transaction
    try {
      this.db.transaction(() => {
        // Update grace_tokens table
        this.db.executeWrite(
          `UPDATE grace_tokens
           SET tokens_remaining = tokens_remaining - ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [tokensToUse, graceTokenRecord.id],
          'grace_tokens'
        );

        // Update policy config (tokens_used)
        this.policyRepo.updateConfig(policy.id, application.updatedConfig);

        // Record usage
        this.usageRepo.recordUsage({
          graceTokenId: graceTokenRecord.id,
          taskId,
          tokensUsed: tokensToUse,
          hoursExtended: application.hoursExtended,
          notes,
        });
      });

      // 7. Emit event
      this.emit('token-used', {
        courseId,
        taskId,
        tokensUsed: tokensToUse,
        remainingTokens: application.remainingTokens,
        newDeadline: application.newDeadline,
      });

      // Get the usage record
      const usageRecord = this.usageRepo.findByTaskId(taskId) ?? undefined;

      return {
        success: true,
        tokensUsed: tokensToUse,
        remainingTokens: application.remainingTokens,
        newDeadline: application.newDeadline,
        hoursExtended: application.hoursExtended,
        usageRecord,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to apply grace token: ${message}`,
        tokensUsed: 0,
        remainingTokens: graceTokenRecord.tokens_remaining,
        newDeadline: null,
        hoursExtended: 0,
      };
    }
  }

  /**
   * Get token usage summary for a course.
   */
  getTokenUsageSummary(courseId: number): TokenUsageSummary | null {
    const graceTokenRecord = this.getGraceTokenRecord(courseId);
    if (!graceTokenRecord) return null;

    const policy = this.policyRepo.findGraceTokenPolicy(courseId);
    if (!policy) return null;

    const course = this.getCourse(courseId);
    if (!course) return null;

    const usageHistory = this.usageRepo.findByCourseId(courseId);
    const warnings = this.generateTokenWarnings(graceTokenRecord);

    return {
      policyId: policy.id,
      courseId,
      courseCode: course.code,
      totalTokens: graceTokenRecord.total_tokens,
      usedTokens: graceTokenRecord.total_tokens - graceTokenRecord.tokens_remaining,
      remainingTokens: graceTokenRecord.tokens_remaining,
      hoursPerToken: graceTokenRecord.hours_per_token,
      maxTokensPerTask: graceTokenRecord.max_tokens_per_task,
      usageHistory,
      warnings,
    };
  }

  /**
   * Get remaining tokens for a course.
   */
  getRemainingTokens(courseId: number): number {
    const record = this.getGraceTokenRecord(courseId);
    return record?.tokens_remaining ?? 0;
  }

  /**
   * Get token usage history for a course.
   */
  getTokenUsageHistory(courseId: number): TokenUsageWithContext[] {
    return this.usageRepo.findByCourseId(courseId);
  }

  // =========================================================================
  // Policy Staleness
  // =========================================================================

  /**
   * Get policies for a course with staleness information.
   */
  getPoliciesWithStaleness(courseId: number): PolicyWithStaleness[] {
    const policies = this.policyRepo.findByCourseId(courseId);
    const syllabus = this.getCourseSyllabus(courseId);

    return policies.map((policy) => {
      const basedOnSyllabusReviewedAt = this.getPolicyBasedOnDate(policy.id);
      let isStale = false;

      // Policy is stale if syllabus was updated after the policy was entered
      if (syllabus && basedOnSyllabusReviewedAt && syllabus.change_detected_at) {
        const policyDate = new Date(basedOnSyllabusReviewedAt);
        const changeDate = new Date(syllabus.change_detected_at);
        isStale = changeDate > policyDate;
      }

      return {
        ...policy,
        isStale,
        basedOnSyllabusReviewedAt,
        syllabusLastReviewedAt: syllabus?.last_reviewed_at ?? null,
        syllabusChangeDetectedAt: syllabus?.change_detected_at ?? null,
      };
    });
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Get grace_tokens record for a course.
   */
  private getGraceTokenRecord(courseId: number): GraceTokenRow | null {
    return (
      this.db.executeReadOne<GraceTokenRow>(
        `SELECT gt.*
       FROM grace_tokens gt
       JOIN course_policies cp ON gt.policy_id = cp.id
       WHERE cp.course_id = ? AND cp.is_active = 1`,
        [courseId]
      ) ?? null
    );
  }

  /**
   * Get task by ID.
   */
  private getTask(taskId: number): Task | null {
    interface TaskRow {
      id: number;
      external_id: string;
      course_id: number;
      title: string;
      description: string | null;
      due_at: string | null;
      weight: number;
      grade: number | null;
      points_possible: number | null;
      is_completed: number;
      is_optional: number;
      completed_at: string | null;
      task_type: string | null;
      task_group_id: number | null;
      submission_status: string | null;
    }

    const row = this.db.executeReadOne<TaskRow>('SELECT * FROM tasks WHERE id = ?', [
      taskId,
    ]);

    if (!row) return null;

    return {
      id: row.id,
      externalId: row.external_id,
      courseId: row.course_id,
      title: row.title,
      description: row.description,
      dueAt: row.due_at,
      weight: row.weight,
      grade: row.grade,
      pointsPossible: row.points_possible,
      isCompleted: Boolean(row.is_completed),
      isOptional: Boolean(row.is_optional),
      completedAt: row.completed_at,
      priorityScore: 0,
      taskType: row.task_type,
      taskGroupId: row.task_group_id,
      submissionStatus: row.submission_status,
    };
  }

  /**
   * Get course by ID.
   */
  private getCourse(courseId: number): { id: number; code: string; name: string } | null {
    return (
      this.db.executeReadOne<{ id: number; code: string; name: string }>(
        'SELECT id, code, name FROM courses WHERE id = ?',
        [courseId]
      ) ?? null
    );
  }

  /**
   * Get course syllabus record.
   */
  private getCourseSyllabus(courseId: number): CourseSyllabusRow | null {
    return (
      this.db.executeReadOne<CourseSyllabusRow>(
        'SELECT * FROM course_syllabuses WHERE course_id = ?',
        [courseId]
      ) ?? null
    );
  }

  /**
   * Get policy based_on_syllabus_reviewed_at date.
   */
  private getPolicyBasedOnDate(policyId: number): string | null {
    const row = this.db.executeReadOne<{ based_on_syllabus_reviewed_at: string | null }>(
      'SELECT based_on_syllabus_reviewed_at FROM course_policies WHERE id = ?',
      [policyId]
    );
    return row?.based_on_syllabus_reviewed_at ?? null;
  }

  /**
   * Generate warnings for low token counts.
   */
  private generateTokenWarnings(record: GraceTokenRow): string[] {
    const warnings: string[] = [];

    if (record.tokens_remaining === 0) {
      warnings.push('No grace tokens remaining');
    } else if (record.tokens_remaining <= this.config.lowTokenWarningThreshold) {
      warnings.push(
        `Only ${record.tokens_remaining} grace token${record.tokens_remaining === 1 ? '' : 's'} remaining`
      );
    }

    return warnings;
  }
}
