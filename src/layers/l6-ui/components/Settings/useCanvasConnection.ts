/**
 * useCanvasConnection - Canvas connection state and handlers
 *
 * Manages connection checking, reconnecting, disconnecting,
 * token validation, and token replacement flows.
 */

import { useState, useRef } from 'react';
import { STORAGE_KEYS, settingsManager } from '../../../l5-presentation/settings';
import type { TokenValidationResult, NewTokenValidation } from './settingsContextTypes';
import { createLogger } from '../../utils/rendererLogger';

const logger = createLogger('CanvasConnection');

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized.replace(/\/+$/, '');
}

export function useCanvasConnection() {
  // Canvas connection
  const [canvasUrl, setCanvasUrl] = useState('');
  const canvasUrlInitializedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // ADR-0013: tri-state token validity for the AccountSection badge. This is
  // connection-UI-ephemeral state (not domain data duplicated from the store),
  // sourced read-only from auth:getStatus — it does NOT piggyback on
  // handleValidateToken's reconnect side-effect.
  const [tokenValidity, setTokenValidity] = useState<
    'valid' | 'invalid' | 'unknown' | null
  >(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  // Token validation
  const [isValidatingToken, setIsValidatingToken] = useState(false);
  const [tokenValidationResult, setTokenValidationResult] =
    useState<TokenValidationResult>({
      status: null,
      message: null,
    });

  // Token replacement
  const [showTokenReplaceModal, setShowTokenReplaceModal] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [isValidatingNewToken, setIsValidatingNewToken] = useState(false);
  const [newTokenValidation, setNewTokenValidation] = useState<NewTokenValidation>({
    valid: null,
    userName: null,
    error: null,
  });
  const [isReplacingToken, setIsReplacingToken] = useState(false);

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const checkCanvasConnection = async () => {
    try {
      const hasCredential = await window.api.hasCredential();
      const savedUrl = settingsManager.get(STORAGE_KEYS.CANVAS_URL) ?? '';
      if (!canvasUrlInitializedRef.current) {
        setCanvasUrl(savedUrl);
        canvasUrlInitializedRef.current = true;
      }
      setIsConnected(hasCredential && !!savedUrl);

      // ADR-0013: read tri-state validity (read-only) for the three-state badge.
      try {
        const statusResult = await window.api.getAuthStatus();
        if (statusResult.success && statusResult.data) {
          setTokenValidity(statusResult.data.validity);
          setLastCheckedAt(statusResult.data.lastCheckedAt);
        }
      } catch (statusError) {
        logger.error(
          'Failed to fetch auth status',
          statusError instanceof Error ? statusError : undefined
        );
      }
    } catch {
      setIsConnected(false);
    }
  };

  const handleReconnect = async () => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const normalizedUrl = normalizeUrl(canvasUrl);
      const result = await window.api.connectCanvas(normalizedUrl);
      if (result.success) {
        setIsConnected(true);
        setCanvasUrl(normalizedUrl);
        settingsManager.set(STORAGE_KEYS.CANVAS_URL, normalizedUrl);
      } else {
        setConnectionError(result.error || 'Failed to connect');
      }
    } catch (e) {
      setConnectionError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.api.deleteCredential();
      setIsConnected(false);
      settingsManager.remove(STORAGE_KEYS.CANVAS_URL);
      setCanvasUrl('');
    } catch (e) {
      logger.error('Failed to disconnect', e instanceof Error ? e : undefined);
    }
  };

  const handleValidateToken = async () => {
    if (!canvasUrl) return;
    setIsValidatingToken(true);
    setTokenValidationResult({ status: null, message: null });
    try {
      const normalizedUrl = normalizeUrl(canvasUrl);
      const result = await window.api.connectCanvas(normalizedUrl);
      if (result.success) {
        setTokenValidationResult({
          status: 'success',
          message: 'Token is valid and working',
        });
      } else {
        setTokenValidationResult({
          status: 'error',
          message: result.error || 'Token validation failed',
        });
      }
    } catch (e) {
      setTokenValidationResult({
        status: 'error',
        message: e instanceof Error ? e.message : 'Validation failed',
      });
    } finally {
      setIsValidatingToken(false);
    }
  };

  const handleOpenTokenReplace = () => {
    setNewToken('');
    setNewTokenValidation({ valid: null, userName: null, error: null });
    setShowTokenReplaceModal(true);
  };

  const handleValidateNewToken = async () => {
    if (!newToken || !canvasUrl) return;
    setIsValidatingNewToken(true);
    setNewTokenValidation({ valid: null, userName: null, error: null });
    try {
      const normalizedUrl = normalizeUrl(canvasUrl);
      const result = await window.api.validateToken(newToken, normalizedUrl);
      if (result.valid) {
        setNewTokenValidation({
          valid: true,
          userName: result.user?.name || null,
          error: null,
        });
      } else {
        setNewTokenValidation({
          valid: false,
          userName: null,
          error: result.error || 'Invalid token',
        });
      }
    } catch (e) {
      setNewTokenValidation({
        valid: false,
        userName: null,
        error: e instanceof Error ? e.message : 'Validation failed',
      });
    } finally {
      setIsValidatingNewToken(false);
    }
  };

  const handleReplaceToken = async () => {
    if (!newTokenValidation.valid || !newToken) return;
    setIsReplacingToken(true);
    try {
      const storeResult = await window.api.storeCredential(newToken);
      if (storeResult.success) {
        const normalizedUrl = normalizeUrl(canvasUrl);
        const connectResult = await window.api.connectCanvas(normalizedUrl);
        if (connectResult.success) {
          setShowTokenReplaceModal(false);
          setNewToken('');
          setNewTokenValidation({ valid: null, userName: null, error: null });
          setTokenValidationResult({
            status: 'success',
            message: 'Token replaced successfully',
          });
        } else {
          setNewTokenValidation({
            valid: false,
            userName: null,
            error: connectResult.error || 'Failed to reconnect with new token',
          });
        }
      } else {
        setNewTokenValidation({
          valid: false,
          userName: null,
          error: 'Failed to store new token',
        });
      }
    } catch (e) {
      setNewTokenValidation({
        valid: false,
        userName: null,
        error: e instanceof Error ? e.message : 'Replacement failed',
      });
    } finally {
      setIsReplacingToken(false);
    }
  };

  /**
   * Reset the URL initialization ref (call when modal closes).
   */
  const resetUrlInitialized = () => {
    canvasUrlInitializedRef.current = false;
  };

  return {
    // Canvas connection state
    canvasUrl,
    setCanvasUrl,
    isConnected,
    isConnecting,
    connectionError,
    tokenValidity,
    lastCheckedAt,
    checkCanvasConnection,
    handleReconnect,
    handleDisconnect,
    resetUrlInitialized,

    // Token validation
    isValidatingToken,
    tokenValidationResult,
    handleValidateToken,

    // Token replacement
    showTokenReplaceModal,
    setShowTokenReplaceModal,
    newToken,
    setNewToken,
    isValidatingNewToken,
    newTokenValidation,
    setNewTokenValidation,
    isReplacingToken,
    handleOpenTokenReplace,
    handleValidateNewToken,
    handleReplaceToken,
  };
}
