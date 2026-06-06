/**
 * Credential IPC Handlers
 * Handlers for credential and Canvas client management:
 * - Credential get/store/delete
 * - Canvas connection and validation
 * - User profile fetching (with daily caching)
 */

import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { CanvasClient } from '../../layers/l2-daemon';
import type { IpcContext } from './IpcContext';

// ============ Profile Cache ============
// Cache user profile (including avatar) for 3 hours to avoid repeated API calls

const PROFILE_CACHE_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

interface CachedProfile {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  time_zone?: string;
  cachedAt: number; // Timestamp in milliseconds
}

let profileCache: CachedProfile | null = null;

/**
 * Check if cached profile is still valid (within 3 hours)
 */
function isCacheValid(): boolean {
  if (!profileCache) return false;
  const now = Date.now();
  return now - profileCache.cachedAt < PROFILE_CACHE_DURATION_MS;
}

/**
 * Clear the profile cache (call when credentials change)
 */
export function clearProfileCache(): void {
  profileCache = null;
}

/**
 * Register all credential-related IPC handlers
 */
export function registerCredentialHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const metricsCollector = ctx.getMetricsCollector();
  const credentialManager = ctx.getCredentialManager();
  const getCanvasClient = ctx.getCanvasClient;
  const clearCanvasClient = ctx.clearCanvasClient;
  const initializeCanvasClient = ctx.initializeCanvasClient;

  // ============ Credential Management ============

  ipcMain.handle('credentials:get', async () => {
    const exists = await credentialManager.exists();
    return { hasCredential: exists };
  });

  ipcMain.handle('credentials:store', async (_event, token: string) => {
    const success = await credentialManager.store(token);
    if (success) {
      metricsCollector.increment('credentials.stored');
    }
    return { success };
  });

  ipcMain.handle('credentials:delete', async () => {
    const success = await credentialManager.delete();
    if (success) {
      clearCanvasClient();
      clearProfileCache(); // Clear cached profile when credentials are deleted
      credentialManager.stopBackgroundValidation();
      metricsCollector.increment('credentials.deleted');
    }
    return { success };
  });

  // Tri-state auth status pull (ADR-0013). Lets the renderer learn token
  // validity at startup race-free, rather than relying only on the lost
  // boot-time `token-invalid -> auth:expired` push. No DB access — credentials
  // live in keychain / encrypted file (ADR-0007 satisfied trivially).
  ipcMain.handle('auth:getStatus', async () => {
    const hasCredential = await credentialManager.exists();
    const status = credentialManager.getStatus();
    return {
      hasCredential,
      // `null` (never validated) maps to `unknown` — we simply don't know yet,
      // which must NOT prompt re-auth (only `invalid` does).
      validity: status.validity ?? 'unknown',
      lastCheckedAt: status.lastValidated ? status.lastValidated.toISOString() : null,
    };
  });

  // ============ Canvas Client Initialization ============

  ipcMain.handle('canvas:connect', async (_event, baseUrl: string) => {
    // Set base URL before retrieve() so token validation uses the correct endpoint
    credentialManager.setBaseUrl(baseUrl);

    const token = await credentialManager.retrieve();
    if (!token) {
      return { success: false, error: 'No credentials stored' };
    }

    // Unlock database in case it was locked from a previous reset
    if (database.isWriteLocked()) {
      database.unlockWrites();
      logger.info('Database unlocked for new connection');
    }

    const success = await initializeCanvasClient(token, baseUrl);

    // Persist the Canvas base URL so it survives restarts
    if (success) {
      try {
        const configDir = ctx.getConfigDir();
        const connectionConfigPath = path.join(configDir, 'canvas-connection.json');
        fs.writeFileSync(
          connectionConfigPath,
          JSON.stringify({ baseUrl }, null, 2),
          'utf-8'
        );
        logger.info(`Canvas base URL persisted to ${connectionConfigPath}`);
      } catch (error) {
        logger.error('Failed to persist Canvas base URL', error as Error);
      }
    }

    return { success, error: success ? undefined : 'Token validation failed' };
  });

  ipcMain.handle(
    'canvas:validateToken',
    async (_event, token: string, baseUrl: string) => {
      try {
        const client = new CanvasClient({ baseUrl, accessToken: token });
        const result = await client.validateToken();
        return result;
      } catch (error) {
        return { valid: false, error: String(error) };
      }
    }
  );

  // ============ User Profile (with daily caching) ============

  ipcMain.handle('canvas:getUserProfile', async () => {
    const canvasClient = getCanvasClient();
    logger.debug(`getUserProfile called, canvasClient available: ${!!canvasClient}`);

    // Return cached profile if valid (fetched today)
    if (isCacheValid()) {
      logger.debug('Returning cached user profile (fetched today)');
      return {
        name: profileCache!.name,
        email: profileCache!.email,
        avatarUrl: profileCache!.avatarUrl,
        time_zone: profileCache!.time_zone,
      };
    }

    if (!canvasClient) {
      logger.warn('getUserProfile: Canvas client not initialized');
      return null;
    }

    try {
      logger.debug('Fetching user profile from Canvas API (daily fetch)...');
      const profile = await canvasClient.getUserProfile();
      logger.debug(
        `User profile received: name=${profile.name}, hasAvatar=${!!profile.avatar_url}`
      );

      let avatarDataUrl: string | null = null;

      // Download avatar and convert to base64 data URL
      if (profile.avatar_url) {
        try {
          const axios = require('axios');

          logger.debug(`Downloading avatar from: ${profile.avatar_url}`);
          const imageResponse = await axios.get(profile.avatar_url, {
            responseType: 'arraybuffer',
            timeout: 10000,
          });

          // Get content type and convert to base64
          const contentType = imageResponse.headers['content-type'] || 'image/png';
          const base64 = Buffer.from(imageResponse.data).toString('base64');
          avatarDataUrl = `data:${contentType};base64,${base64}`;
          logger.debug(`Avatar converted to data URL (${base64.length} chars)`);
        } catch (avatarError) {
          logger.warn(`Failed to download avatar: ${avatarError}`);
        }
      }

      // Cache the profile for 3 hours
      profileCache = {
        name: profile.name,
        email: profile.email || profile.login_id || null,
        avatarUrl: avatarDataUrl,
        time_zone: profile.time_zone,
        cachedAt: Date.now(),
      };
      logger.debug(`User profile cached (valid for 3 hours)`);

      return {
        name: profileCache.name,
        email: profileCache.email,
        avatarUrl: profileCache.avatarUrl,
        time_zone: profileCache.time_zone,
      };
    } catch (error) {
      logger.error(`Failed to get user profile: ${error}`);
      return null;
    }
  });

  // ============ Debug API ============

  ipcMain.handle('canvas:debugFetch', async (_event, endpoint: string) => {
    // Only allow debug API access in development mode
    if (process.env.NODE_ENV !== 'development') {
      logger.warn('[canvas:debugFetch] Debug API blocked in production mode');
      return { success: false, error: 'Debug API only available in development mode' };
    }

    const canvasClient = getCanvasClient();
    if (!canvasClient) {
      return { success: false, error: 'Canvas client not initialized' };
    }

    try {
      logger.info(`[canvas:debugFetch] Calling endpoint: ${endpoint}`);
      const response = await canvasClient.get(endpoint);
      return { success: true, data: response.data };
    } catch (error) {
      logger.error(`[canvas:debugFetch] Failed: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // ============ Canvas Status ============

  ipcMain.handle('canvas:getStatus', () => {
    const canvasClient = getCanvasClient();
    return {
      connected: !!canvasClient,
      baseUrl: canvasClient?.getBaseUrl() || null,
    };
  });
}
