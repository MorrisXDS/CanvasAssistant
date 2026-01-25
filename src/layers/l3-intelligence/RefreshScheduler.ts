/**
 * L3 Intelligence - Refresh Scheduler
 *
 * Manages hierarchical refresh timing for priority recalculation.
 * Tasks closer to deadline get refreshed more frequently.
 */

import { EventEmitter } from 'events';
import { PriorityConfig } from './PriorityConfig';
import { PriorityEngine } from './PriorityEngine';
import { PriorityCalculationResult } from './types';

/**
 * Scheduled refresh job
 */
interface ScheduledJob {
  id: string;
  taskId: number | null; // null for full refresh
  scheduledAt: Date;
  tier: string;
  timeout: NodeJS.Timeout;
}

/**
 * Refresh statistics
 */
export interface RefreshStats {
  totalRefreshes: number;
  lastFullRefresh: Date | null;
  taskRefreshes: Map<number, number>;
  tierCounts: Map<string, number>;
  coalesced: number; // Requests that were coalesced
  timedOut: number; // Requests that timed out
}

/**
 * Backpressure configuration
 */
interface BackpressureConfig {
  maxJobQueueSize: number; // Maximum scheduled jobs
  calculationTimeoutMs: number; // Timeout for calculation
  coalescingWindowMs: number; // Window for coalescing requests
}

/**
 * Refresh Scheduler
 *
 * Schedules and manages priority recalculation based on
 * task urgency tiers.
 */
export class RefreshScheduler extends EventEmitter {
  private config: PriorityConfig;
  private engine: PriorityEngine;
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private isRunning: boolean = false;
  private isCalculating: boolean = false; // Backpressure: prevent concurrent calculations
  private lastCalculationRequestTime: number = 0; // For coalescing
  private stats: RefreshStats = {
    totalRefreshes: 0,
    lastFullRefresh: null,
    taskRefreshes: new Map(),
    tierCounts: new Map(),
    coalesced: 0,
    timedOut: 0,
  };
  private lastResult: PriorityCalculationResult | null = null;

  // Backpressure settings
  private readonly backpressure: BackpressureConfig = {
    maxJobQueueSize: 50, // Max 50 scheduled jobs
    calculationTimeoutMs: 5000, // 5 second timeout
    coalescingWindowMs: 100, // 100ms coalescing window
  };

  constructor(config: PriorityConfig, engine: PriorityEngine) {
    super();
    this.config = config;
    this.engine = engine;

    // Listen for config changes
    this.config.on('refresh-tier-changed', () => this.rescheduleAll());
    this.config.on('config-reset', () => this.rescheduleAll());
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit('started');

    // Initial full calculation
    this.scheduleFullRefresh(0);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Clear all scheduled jobs
    for (const job of this.scheduledJobs.values()) {
      clearTimeout(job.timeout);
    }
    this.scheduledJobs.clear();

    this.emit('stopped');
  }

  /**
   * Schedule a full refresh with coalescing
   */
  scheduleFullRefresh(delayMs: number = 0): void {
    const jobId = 'full-refresh';
    const now = Date.now();

    // Backpressure: Coalesce requests within window
    if (delayMs === 0 && this.scheduledJobs.has(jobId)) {
      const existingJob = this.scheduledJobs.get(jobId)!;
      const timeUntilExisting = existingJob.scheduledAt.getTime() - now;

      // If existing job is scheduled within coalescing window, skip this request
      if (timeUntilExisting <= this.backpressure.coalescingWindowMs) {
        this.stats.coalesced++;
        this.emit('refresh-coalesced', { reason: 'within-window', existingJobId: jobId });
        return;
      }
    }

    // Cancel existing full refresh if scheduled
    this.cancelJob(jobId);

    const scheduledAt = new Date(now + delayMs);
    const timeout = setTimeout(() => this.executeFullRefresh(), delayMs);

    this.scheduledJobs.set(jobId, {
      id: jobId,
      taskId: null,
      scheduledAt,
      tier: 'full',
      timeout,
    });

    this.lastCalculationRequestTime = now;
    this.emit('job-scheduled', { jobId, scheduledAt, tier: 'full' });
  }

  /**
   * Execute full refresh with timeout protection
   */
  private executeFullRefresh(): void {
    if (!this.isRunning) return;

    // Backpressure: Skip if already calculating
    if (this.isCalculating) {
      this.stats.coalesced++;
      this.emit('refresh-coalesced', { reason: 'calculation-in-progress' });
      return;
    }

    this.isCalculating = true;
    const startTime = Date.now();
    const now = new Date();

    try {
      // Execute calculation with timeout protection
      const result = this.executeWithTimeout(
        () => this.engine.calculateAll(now),
        this.backpressure.calculationTimeoutMs
      );

      if (result === null) {
        // Calculation timed out
        this.stats.timedOut++;
        this.emit('refresh-timeout', {
          durationMs: Date.now() - startTime,
          timeoutMs: this.backpressure.calculationTimeoutMs,
        });
      } else {
        this.lastResult = result;
        this.stats.totalRefreshes++;
        this.stats.lastFullRefresh = now;
        this.incrementTierCount('full');

        this.emit('refresh-complete', {
          type: 'full',
          result: this.lastResult,
          timestamp: now,
          durationMs: Date.now() - startTime,
        });
      }
    } finally {
      this.isCalculating = false;
    }

    // Remove the job
    this.scheduledJobs.delete('full-refresh');

    // Schedule next refresh based on result
    this.scheduleNextRefresh();
  }

  /**
   * Execute a function with timeout protection
   * Returns null if timed out (note: in JS we can't truly cancel sync code)
   */
  private executeWithTimeout<T>(fn: () => T, timeoutMs: number): T | null {
    const startTime = Date.now();
    const result = fn();
    const elapsed = Date.now() - startTime;

    // Log warning if calculation took too long (even though we can't cancel it)
    if (elapsed > timeoutMs) {
      this.emit('calculation-slow', { durationMs: elapsed, thresholdMs: timeoutMs });
    }

    return result;
  }

  /**
   * Schedule the next refresh based on current task states
   */
  private scheduleNextRefresh(): void {
    if (!this.lastResult || !this.isRunning) return;

    // Find the task with the earliest expiration
    let earliestExpiration = Infinity;
    let earliestTaskId: number | null = null;

    for (const queue of Object.values(this.lastResult.queues)) {
      for (const explanation of queue) {
        const expiresIn = explanation.expiresAt.getTime() - Date.now();
        if (expiresIn < earliestExpiration && expiresIn > 0) {
          earliestExpiration = expiresIn;
          earliestTaskId = explanation.taskId;
        }
      }
    }

    if (earliestExpiration < Infinity) {
      // Schedule based on the earliest expiring task
      const tier = this.getTierForDelay(earliestExpiration);

      if (earliestTaskId !== null) {
        this.scheduleTaskRefresh(earliestTaskId, earliestExpiration, tier);
      } else {
        this.scheduleFullRefresh(earliestExpiration);
      }
    } else {
      // No urgent tasks, schedule daily refresh
      const dailyMs = 24 * 60 * 60 * 1000;
      this.scheduleFullRefresh(dailyMs);
    }
  }

  /**
   * Schedule refresh for a specific task with queue bounds
   */
  scheduleTaskRefresh(taskId: number, delayMs: number, tier: string): void {
    const jobId = `task-${taskId}`;

    // Backpressure: Check queue size (exclude existing job for this task)
    const currentQueueSize = this.scheduledJobs.size - (this.scheduledJobs.has(jobId) ? 1 : 0);
    if (currentQueueSize >= this.backpressure.maxJobQueueSize) {
      this.emit('queue-full', {
        queueSize: this.scheduledJobs.size,
        maxSize: this.backpressure.maxJobQueueSize,
        droppedJobId: jobId,
      });
      return;
    }

    // Cancel existing job for this task
    this.cancelJob(jobId);

    const scheduledAt = new Date(Date.now() + delayMs);
    const timeout = setTimeout(() => this.executeTaskRefresh(taskId, tier), delayMs);

    this.scheduledJobs.set(jobId, {
      id: jobId,
      taskId,
      scheduledAt,
      tier,
      timeout,
    });

    this.emit('job-scheduled', { jobId, taskId, scheduledAt, tier });
  }

  /**
   * Execute task-specific refresh
   */
  private executeTaskRefresh(taskId: number, tier: string): void {
    if (!this.isRunning) return;

    const now = new Date();
    const explanation = this.engine.getTaskExplanation(taskId, now);

    if (explanation) {
      // Update the task in the last result
      if (this.lastResult) {
        this.updateTaskInResult(explanation);
      }

      this.stats.totalRefreshes++;
      const currentCount = this.stats.taskRefreshes.get(taskId) || 0;
      this.stats.taskRefreshes.set(taskId, currentCount + 1);
      this.incrementTierCount(tier);

      this.emit('refresh-complete', {
        type: 'task',
        taskId,
        explanation,
        timestamp: now,
      });

      // Schedule next refresh for this task
      const nextDelay = explanation.expiresAt.getTime() - now.getTime();
      if (nextDelay > 0) {
        const nextTier = this.getTierForDelay(nextDelay);
        this.scheduleTaskRefresh(taskId, nextDelay, nextTier);
      }
    }

    // Remove the job
    this.scheduledJobs.delete(`task-${taskId}`);
  }

  /**
   * Update a task in the cached result
   */
  private updateTaskInResult(explanation: NonNullable<ReturnType<PriorityEngine['getTaskExplanation']>>): void {
    if (!this.lastResult) return;

    for (const queue of Object.values(this.lastResult.queues)) {
      const index = queue.findIndex((e) => e.taskId === explanation.taskId);
      if (index !== -1) {
        // Remove from old queue
        queue.splice(index, 1);
        break;
      }
    }

    // Add to correct queue
    this.lastResult.queues[explanation.queue].push(explanation);

    // Re-sort the queue
    this.lastResult.queues[explanation.queue].sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Get tier name for a delay
   */
  private getTierForDelay(delayMs: number): string {
    const hours = delayMs / (1000 * 60 * 60);
    const tiers = this.config.getRefreshTiers();

    for (const tier of [...tiers].sort((a, b) => b.minHoursUntilDue - a.minHoursUntilDue)) {
      if (hours >= tier.minHoursUntilDue) {
        return tier.name;
      }
    }

    return tiers[tiers.length - 1].name;
  }

  /**
   * Cancel a scheduled job
   */
  private cancelJob(jobId: string): void {
    const job = this.scheduledJobs.get(jobId);
    if (job) {
      clearTimeout(job.timeout);
      this.scheduledJobs.delete(jobId);
      this.emit('job-cancelled', { jobId });
    }
  }

  /**
   * Reschedule all jobs (after config change)
   */
  private rescheduleAll(): void {
    // Cancel all current jobs
    for (const job of this.scheduledJobs.values()) {
      clearTimeout(job.timeout);
    }
    this.scheduledJobs.clear();

    // Trigger full refresh to reschedule
    if (this.isRunning) {
      this.scheduleFullRefresh(0);
    }
  }

  /**
   * Increment tier count in stats
   */
  private incrementTierCount(tier: string): void {
    const current = this.stats.tierCounts.get(tier) || 0;
    this.stats.tierCounts.set(tier, current + 1);
  }

  /**
   * Force immediate refresh
   */
  forceRefresh(): PriorityCalculationResult {
    const now = new Date();
    this.lastResult = this.engine.calculateAll(now);

    this.stats.totalRefreshes++;
    this.stats.lastFullRefresh = now;
    this.incrementTierCount('forced');

    this.emit('refresh-complete', {
      type: 'forced',
      result: this.lastResult,
      timestamp: now,
    });

    // Reschedule based on new result
    this.scheduleNextRefresh();

    return this.lastResult;
  }

  /**
   * Get the last calculation result
   */
  getLastResult(): PriorityCalculationResult | null {
    return this.lastResult;
  }

  /**
   * Get current statistics
   */
  getStats(): RefreshStats {
    return { ...this.stats };
  }

  /**
   * Get scheduled jobs
   */
  getScheduledJobs(): ScheduledJob[] {
    return Array.from(this.scheduledJobs.values());
  }

  /**
   * Check if scheduler is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Notify scheduler that a task was modified
   */
  notifyTaskModified(taskId: number): void {
    if (!this.isRunning) return;

    // Schedule immediate refresh for this task
    this.scheduleTaskRefresh(taskId, 0, 'modified');
  }

  /**
   * Notify scheduler that tasks were synced
   */
  notifySyncComplete(): void {
    if (!this.isRunning) return;

    // Schedule full refresh
    this.scheduleFullRefresh(0);
  }
}
