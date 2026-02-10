import path from 'path';
import os from 'os';

/**
 * Safe fallback base directory for when no explicit config is provided.
 * Uses os.homedir() because:
 * - process.cwd() is unreliable in packaged Electron apps
 * - Electron's app.getPath() is not available in framework-agnostic layers
 * - os.homedir() is always absolute and cross-platform
 *
 * In production, main.ts passes explicit paths derived from app.getPath('userData').
 * These defaults are only used when a class is instantiated without full config
 * (e.g., as a standalone fallback or in tests).
 */
const BASE = path.join(os.homedir(), '.canvas-assistant');

export const DEFAULT_PATHS = {
  base: BASE,
  logs: path.join(BASE, 'logs'),
  data: path.join(BASE, 'data'),
  credentials: path.join(BASE, 'data', '.credentials'),
  metricsDb: path.join(BASE, 'data', 'metrics.db'),
} as const;
