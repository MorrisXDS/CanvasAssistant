/**
 * IPC Handler Context
 * Provides dependencies to IPC handlers in a decoupled way
 */

import type { BrowserWindow } from 'electron';
import type { Database } from '../layers/l1-persistence';
import type { Logger } from '../layers/l0-utilities/Logger';
import type { MetricsCollector } from '../layers/l0-utilities/MetricsCollector';
import type { CredentialManager } from '../layers/l0-utilities/CredentialManager';
import type { FileDownloadManager } from '../layers/l0-utilities/FileDownloadManager';
import type { SyncEngine, CanvasClient } from '../layers/l2-daemon';
import type { PriorityOrchestrator } from '../layers/l3-intelligence/orchestration/PriorityOrchestrator';
import type { RecommendationOrchestrator } from '../layers/l3-intelligence/orchestration/RecommendationOrchestrator';
import type { InsightOrchestrator } from '../layers/l3-intelligence/orchestration/InsightOrchestrator';
import type { WorkloadOrchestrator } from '../layers/l3-intelligence/orchestration/WorkloadOrchestrator';
import type { BehaviorTrackingOrchestrator } from '../layers/l3-intelligence/orchestration/BehaviorTrackingOrchestrator';
import type { AdaptiveLearningOrchestrator } from '../layers/l3-intelligence/orchestration/AdaptiveLearningOrchestrator';
import type { CommandDispatcher } from '../layers/l4-controller';
import type { VisibleDataProvider } from '../layers/l1-persistence';

/**
 * Context object providing access to all dependencies needed by IPC handlers.
 * Uses getter functions to handle lazy initialization and nullable references.
 */
export interface IpcContext {
  // Window
  getMainWindow: () => BrowserWindow | null;

  // Core services
  getDatabase: () => Database;
  getLogger: () => Logger;
  getMetricsCollector: () => MetricsCollector;
  getCredentialManager: () => CredentialManager;
  getFileDownloadManager: () => FileDownloadManager;

  // L1 - Persistence
  getVisibleDataProvider: () => VisibleDataProvider | null;

  // L2 - Daemon
  getCanvasClient: () => CanvasClient | null;
  getSyncEngine: () => SyncEngine | null;

  // L3 - Intelligence
  getPriorityOrchestrator: () => PriorityOrchestrator | null;
  getRecommendationOrchestrator: () => RecommendationOrchestrator | null;
  getInsightOrchestrator: () => InsightOrchestrator | null;
  getWorkloadOrchestrator: () => WorkloadOrchestrator | null;
  getBehaviorTrackingOrchestrator: () => BehaviorTrackingOrchestrator | null;
  getAdaptiveLearningOrchestrator: () => AdaptiveLearningOrchestrator | null;

  // L4 - Controller
  getCommandDispatcher: () => CommandDispatcher | null;
}

/**
 * Helper type for handler registration functions
 */
export type IpcHandlerRegistrar = (ctx: IpcContext) => void;
