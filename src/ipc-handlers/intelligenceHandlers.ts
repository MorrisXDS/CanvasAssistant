/**
 * Intelligence IPC Handlers
 * Handlers for L3 Intelligence layer operations:
 * - Priority calculation
 * - Recommendations
 * - Insights
 * - Workload analysis
 * - Behavior tracking
 * - Adaptive learning
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './IpcContext';

/**
 * Register all intelligence-related IPC handlers
 */
export function registerIntelligenceHandlers(ctx: IpcContext): void {
  const logger = ctx.getLogger();
  const database = ctx.getDatabase();

  // ============ Priority Handlers ============

  ipcMain.handle('priorities:calculate', () => {
    const priorityOrchestrator = ctx.getPriorityOrchestrator();
    if (!priorityOrchestrator) {
      return { success: false, error: 'Priority system not initialized' };
    }
    try {
      const result = priorityOrchestrator.calculateAll();
      return { success: true, data: result };
    } catch (error) {
      logger.error('Priority calculation failed', error as Error);
      return { success: false, error: 'Priority calculation failed' };
    }
  });

  ipcMain.handle('priorities:refresh', () => {
    const priorityOrchestrator = ctx.getPriorityOrchestrator();
    if (!priorityOrchestrator) {
      return { success: false, error: 'Priority system not initialized' };
    }
    try {
      priorityOrchestrator.calculateAll();
      return { success: true };
    } catch (error) {
      logger.error('Priority refresh failed', error as Error);
      return { success: false, error: 'Priority refresh failed' };
    }
  });

  ipcMain.handle('priorities:getExplanation', (_event, params: { taskId: number }) => {
    const priorityOrchestrator = ctx.getPriorityOrchestrator();
    if (!priorityOrchestrator) {
      return { success: false, error: 'Priority system not initialized' };
    }
    try {
      const explanation = priorityOrchestrator.getExplanation(params.taskId);
      if (!explanation) {
        return { success: false, error: 'Task not found' };
      }
      return { success: true, data: explanation };
    } catch (error) {
      logger.error('Failed to get priority explanation', error as Error);
      return { success: false, error: 'Failed to get priority explanation' };
    }
  });

  // Recalculate priorities when relevant tables change
  database.on('commit', (tableName: string) => {
    if (['tasks', 'courses', 'course_policies', 'grace_tokens'].includes(tableName)) {
      // Debounce recalculation to avoid excessive computation
      setTimeout(() => {
        const priorityOrchestrator = ctx.getPriorityOrchestrator();
        if (!priorityOrchestrator) return;
        try {
          priorityOrchestrator.calculateAll();
        } catch (error) {
          logger.error('Auto priority recalculation failed', error as Error);
        }
      }, 500);
    }
  });

  // ============ Intelligence - Recommendations ============

  ipcMain.handle('intelligence:getActiveRecommendations', () => {
    const recommendationOrchestrator = ctx.getRecommendationOrchestrator();
    if (!recommendationOrchestrator) {
      return [];
    }
    try {
      const recommendations = recommendationOrchestrator.getActiveRecommendations();
      return recommendations.map((r) => ({
        ...r,
        validFrom: r.validFrom.toISOString(),
        validUntil: r.validUntil.toISOString(),
        dismissedAt: r.dismissedAt?.toISOString() ?? null,
        actedOnAt: r.actedOnAt?.toISOString() ?? null,
        createdAt: r.createdAt?.toISOString(),
      }));
    } catch (error) {
      logger.error('Failed to get active recommendations', error as Error);
      return [];
    }
  });

  ipcMain.handle(
    'intelligence:generateRecommendations',
    (_event, params?: { availableMinutes?: number }) => {
      const recommendationOrchestrator = ctx.getRecommendationOrchestrator();
      if (!recommendationOrchestrator) {
        return [];
      }
      try {
        const recommendations = recommendationOrchestrator.generateRecommendations(
          params?.availableMinutes
        );
        return recommendations.map((r) => ({
          ...r,
          validFrom: r.validFrom.toISOString(),
          validUntil: r.validUntil.toISOString(),
          dismissedAt: r.dismissedAt?.toISOString() ?? null,
          actedOnAt: r.actedOnAt?.toISOString() ?? null,
          createdAt: r.createdAt?.toISOString(),
        }));
      } catch (error) {
        logger.error('Failed to generate recommendations', error as Error);
        return [];
      }
    }
  );

  ipcMain.handle(
    'intelligence:dismissRecommendation',
    (_event, recommendationId: number) => {
      const recommendationOrchestrator = ctx.getRecommendationOrchestrator();
      if (!recommendationOrchestrator) {
        return { success: false, error: 'Recommendation system not initialized' };
      }
      try {
        const dismissed = recommendationOrchestrator.dismissRecommendation(recommendationId);
        return { success: dismissed };
      } catch (error) {
        logger.error('Failed to dismiss recommendation', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle(
    'intelligence:actOnRecommendation',
    (_event, recommendationId: number) => {
      const recommendationOrchestrator = ctx.getRecommendationOrchestrator();
      if (!recommendationOrchestrator) {
        return { success: false, error: 'Recommendation system not initialized' };
      }
      try {
        const acted = recommendationOrchestrator.markRecommendationActed(recommendationId);
        return { success: acted };
      } catch (error) {
        logger.error('Failed to mark recommendation as acted', error as Error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('intelligence:getRecommendationStats', () => {
    const recommendationOrchestrator = ctx.getRecommendationOrchestrator();
    if (!recommendationOrchestrator) {
      return { totalGenerated: 0, totalDismissed: 0, totalActedOn: 0, activeCount: 0 };
    }
    try {
      return recommendationOrchestrator.getStatistics();
    } catch (error) {
      logger.error('Failed to get recommendation stats', error as Error);
      return { totalGenerated: 0, totalDismissed: 0, totalActedOn: 0, activeCount: 0 };
    }
  });

  // ============ Intelligence - Insights ============

  ipcMain.handle('intelligence:getActiveInsights', () => {
    const insightOrchestrator = ctx.getInsightOrchestrator();
    if (!insightOrchestrator) {
      return [];
    }
    try {
      const insights = insightOrchestrator.getActiveInsights();
      return insights.map((i) => ({
        ...i,
        acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
        expiresAt: i.expiresAt?.toISOString() ?? null,
        createdAt: i.createdAt?.toISOString(),
      }));
    } catch (error) {
      logger.error('Failed to get active insights', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:generateInsights', () => {
    const insightOrchestrator = ctx.getInsightOrchestrator();
    if (!insightOrchestrator) {
      return [];
    }
    try {
      const insights = insightOrchestrator.generateInsights();
      return insights.map((i) => ({
        ...i,
        acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
        expiresAt: i.expiresAt?.toISOString() ?? null,
        createdAt: i.createdAt?.toISOString(),
      }));
    } catch (error) {
      logger.error('Failed to generate insights', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:acknowledgeInsight', (_event, insightId: number) => {
    const insightOrchestrator = ctx.getInsightOrchestrator();
    if (!insightOrchestrator) {
      return { success: false, error: 'Insight system not initialized' };
    }
    try {
      const acknowledged = insightOrchestrator.acknowledgeInsight(insightId);
      return { success: acknowledged };
    } catch (error) {
      logger.error('Failed to acknowledge insight', error as Error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('intelligence:acknowledgeAllInsights', () => {
    const insightOrchestrator = ctx.getInsightOrchestrator();
    if (!insightOrchestrator) {
      return { success: false, error: 'Insight system not initialized' };
    }
    try {
      const count = insightOrchestrator.acknowledgeAllInsights();
      return { success: true, data: { count } };
    } catch (error) {
      logger.error('Failed to acknowledge all insights', error as Error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('intelligence:getInsightStats', () => {
    const insightOrchestrator = ctx.getInsightOrchestrator();
    if (!insightOrchestrator) {
      return {
        totalGenerated: 0,
        totalAcknowledged: 0,
        activeCount: 0,
        bySeverity: { info: 0, warning: 0, critical: 0 },
        byType: {},
      };
    }
    try {
      return insightOrchestrator.getStatistics();
    } catch (error) {
      logger.error('Failed to get insight stats', error as Error);
      return {
        totalGenerated: 0,
        totalAcknowledged: 0,
        activeCount: 0,
        bySeverity: { info: 0, warning: 0, critical: 0 },
        byType: {},
      };
    }
  });

  // ============ Intelligence - Suppression (Never Show Again) ============

  ipcMain.handle('intelligence:suppressRecommendation', (_event, id: number) => {
    const recommendationOrchestrator = ctx.getRecommendationOrchestrator();
    if (!recommendationOrchestrator) {
      return { success: false, error: 'Recommendation system not initialized' };
    }
    try {
      const suppressed = recommendationOrchestrator.suppressRecommendationForever(id);
      return { success: suppressed };
    } catch (error) {
      logger.error('Failed to suppress recommendation', error as Error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('intelligence:suppressInsight', (_event, id: number) => {
    const insightOrchestrator = ctx.getInsightOrchestrator();
    if (!insightOrchestrator) {
      return { success: false, error: 'Insight system not initialized' };
    }
    try {
      const suppressed = insightOrchestrator.suppressInsightForever(id);
      return { success: suppressed };
    } catch (error) {
      logger.error('Failed to suppress insight', error as Error);
      return { success: false, error: String(error) };
    }
  });

  // ============ Intelligence - Workload ============

  ipcMain.handle(
    'intelligence:getWorkloadDistribution',
    (_event, params?: { startDate?: string; endDate?: string }) => {
      const workloadOrchestrator = ctx.getWorkloadOrchestrator();
      if (!workloadOrchestrator) {
        return null;
      }
      try {
        const startDate = params?.startDate ? new Date(params.startDate) : new Date();
        const endDate = params?.endDate ? new Date(params.endDate) : undefined;
        const distribution = workloadOrchestrator.analyzeWorkload(startDate, endDate);

        return {
          startDate: distribution.startDate.toISOString(),
          endDate: distribution.endDate.toISOString(),
          dailySnapshots: distribution.dailySnapshots.map((s) => ({
            snapshotDate: s.snapshotDate.toISOString(),
            totalTasksDue: s.totalTasksDue,
            totalEstimatedMinutes: s.totalEstimatedMinutes,
            tasksByCourse: s.tasksByCourse,
            tasksByUrgency: s.tasksByUrgency,
            deadlineClusteringScore: s.deadlineClusteringScore,
          })),
          peakDay: distribution.peakDay?.toISOString() ?? null,
          peakMinutes: distribution.peakMinutes,
          avgDailyMinutes: distribution.avgDailyMinutes,
          clusteringScore: distribution.clusteringScore,
          balanceScore: distribution.balanceScore,
        };
      } catch (error) {
        logger.error('Failed to get workload distribution', error as Error);
        return null;
      }
    }
  );

  ipcMain.handle('intelligence:getDailyPlan', (_event, params?: { date?: string }) => {
    const workloadOrchestrator = ctx.getWorkloadOrchestrator();
    if (!workloadOrchestrator) {
      return [];
    }
    try {
      const date = params?.date ? new Date(params.date) : new Date();
      const plan = workloadOrchestrator.generateDailyPlan(date);
      return plan.map((entry) => ({
        ...entry,
        dueAt: entry.dueAt?.toISOString() ?? null,
        recommendedStartTime: entry.recommendedStartTime?.toISOString() ?? null,
      }));
    } catch (error) {
      logger.error('Failed to generate daily plan', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:getEffortEstimate', (_event, taskId: number) => {
    const workloadOrchestrator = ctx.getWorkloadOrchestrator();
    if (!workloadOrchestrator) {
      return null;
    }
    try {
      return workloadOrchestrator.getEffortEstimate(taskId);
    } catch (error) {
      logger.error('Failed to get effort estimate', error as Error);
      return null;
    }
  });

  ipcMain.handle(
    'intelligence:getClusteringScore',
    (_event, params?: { windowDays?: number }) => {
      const workloadOrchestrator = ctx.getWorkloadOrchestrator();
      if (!workloadOrchestrator) {
        return 0;
      }
      try {
        return workloadOrchestrator.getClusteringScore(params?.windowDays);
      } catch (error) {
        logger.error('Failed to get clustering score', error as Error);
        return 0;
      }
    }
  );

  ipcMain.handle(
    'intelligence:getNeglectedCourses',
    (_event, params?: { windowDays?: number }) => {
      const workloadOrchestrator = ctx.getWorkloadOrchestrator();
      if (!workloadOrchestrator) {
        return [];
      }
      try {
        return workloadOrchestrator.getNeglectedCourses(params?.windowDays ?? 14);
      } catch (error) {
        logger.error('Failed to get neglected courses', error as Error);
        return [];
      }
    }
  );

  ipcMain.handle(
    'intelligence:getDeadlineClusters',
    (_event, params?: { windowHours?: number }) => {
      const workloadOrchestrator = ctx.getWorkloadOrchestrator();
      if (!workloadOrchestrator) {
        return [];
      }
      try {
        return workloadOrchestrator.getDeadlineClusters(params?.windowHours ?? 48);
      } catch (error) {
        logger.error('Failed to get deadline clusters', error as Error);
        return [];
      }
    }
  );

  ipcMain.handle('intelligence:getCourseBalanceScore', () => {
    const workloadOrchestrator = ctx.getWorkloadOrchestrator();
    if (!workloadOrchestrator) {
      return 0;
    }
    try {
      return workloadOrchestrator.getCourseBalanceScore();
    } catch (error) {
      logger.error('Failed to get course balance score', error as Error);
      return 0;
    }
  });

  ipcMain.handle(
    'intelligence:getWorkloadSnapshots',
    (_event, params?: { days?: number }) => {
      const workloadOrchestrator = ctx.getWorkloadOrchestrator();
      if (!workloadOrchestrator) {
        return [];
      }
      try {
        return workloadOrchestrator.getHistoricalSnapshots(params?.days ?? 30);
      } catch (error) {
        logger.error('Failed to get workload snapshots', error as Error);
        return [];
      }
    }
  );

  // ============ Intelligence - Behavior Tracking ============

  ipcMain.handle('intelligence:getWeeklyRhythm', () => {
    const behaviorTrackingOrchestrator = ctx.getBehaviorTrackingOrchestrator();
    if (!behaviorTrackingOrchestrator) {
      return null;
    }
    try {
      const rhythm = behaviorTrackingOrchestrator.getWeeklyRhythm();
      return {
        productiveDays: rhythm.productiveDays,
        productiveHours: rhythm.productiveHours,
        peakDay: rhythm.peakDay,
        peakHour: rhythm.peakHour,
        sampleSize: rhythm.sampleSize,
        confidence: rhythm.confidence,
      };
    } catch (error) {
      logger.error('Failed to get weekly rhythm', error as Error);
      return null;
    }
  });

  ipcMain.handle('intelligence:getCoursePerformance', () => {
    const behaviorTrackingOrchestrator = ctx.getBehaviorTrackingOrchestrator();
    if (!behaviorTrackingOrchestrator) {
      return [];
    }
    try {
      return behaviorTrackingOrchestrator.getCoursePerformance();
    } catch (error) {
      logger.error('Failed to get course performance', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:getStrugglePatterns', () => {
    const behaviorTrackingOrchestrator = ctx.getBehaviorTrackingOrchestrator();
    if (!behaviorTrackingOrchestrator) {
      return [];
    }
    try {
      return behaviorTrackingOrchestrator.getStrugglePatterns();
    } catch (error) {
      logger.error('Failed to get struggle patterns', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:getCompletionTiming', () => {
    const behaviorTrackingOrchestrator = ctx.getBehaviorTrackingOrchestrator();
    if (!behaviorTrackingOrchestrator) {
      return null;
    }
    try {
      return behaviorTrackingOrchestrator.getCompletionTiming();
    } catch (error) {
      logger.error('Failed to get completion timing', error as Error);
      return null;
    }
  });

  ipcMain.handle('intelligence:getBehaviorEventCount', () => {
    const behaviorTrackingOrchestrator = ctx.getBehaviorTrackingOrchestrator();
    if (!behaviorTrackingOrchestrator) {
      return 0;
    }
    try {
      return behaviorTrackingOrchestrator.getEventCount();
    } catch (error) {
      logger.error('Failed to get behavior event count', error as Error);
      return 0;
    }
  });

  // ============ Intelligence - Adaptive Learning ============

  ipcMain.handle('intelligence:getAdaptiveWeights', () => {
    const adaptiveLearningOrchestrator = ctx.getAdaptiveLearningOrchestrator();
    if (!adaptiveLearningOrchestrator) {
      return null;
    }
    try {
      return adaptiveLearningOrchestrator.getCachedWeights();
    } catch (error) {
      logger.error('Failed to get adaptive weights', error as Error);
      return null;
    }
  });

  ipcMain.handle('intelligence:getWeightAdjustments', () => {
    const adaptiveLearningOrchestrator = ctx.getAdaptiveLearningOrchestrator();
    if (!adaptiveLearningOrchestrator) {
      return [];
    }
    try {
      return adaptiveLearningOrchestrator.getWeightAdjustments();
    } catch (error) {
      logger.error('Failed to get weight adjustments', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:getAdaptiveSummary', () => {
    const adaptiveLearningOrchestrator = ctx.getAdaptiveLearningOrchestrator();
    if (!adaptiveLearningOrchestrator) {
      return [];
    }
    try {
      return adaptiveLearningOrchestrator.getSummary();
    } catch (error) {
      logger.error('Failed to get adaptive summary', error as Error);
      return [];
    }
  });

  ipcMain.handle('intelligence:getAdaptiveStatistics', () => {
    const adaptiveLearningOrchestrator = ctx.getAdaptiveLearningOrchestrator();
    if (!adaptiveLearningOrchestrator) {
      return null;
    }
    try {
      return adaptiveLearningOrchestrator.getStatistics();
    } catch (error) {
      logger.error('Failed to get adaptive statistics', error as Error);
      return null;
    }
  });

  ipcMain.handle('intelligence:recalculateAdaptiveWeights', () => {
    const adaptiveLearningOrchestrator = ctx.getAdaptiveLearningOrchestrator();
    if (!adaptiveLearningOrchestrator) {
      return { success: false, error: 'Adaptive learning not initialized' };
    }
    try {
      const weights = adaptiveLearningOrchestrator.recalculateWeights();
      return { success: true, data: weights };
    } catch (error) {
      logger.error('Failed to recalculate adaptive weights', error as Error);
      return { success: false, error: 'Failed to recalculate weights' };
    }
  });
}
