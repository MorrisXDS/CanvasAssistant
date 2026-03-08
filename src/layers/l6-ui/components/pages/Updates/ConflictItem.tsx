/**
 * ConflictItem - Sub-component for sync conflict items
 *
 * Renders a conflict with local vs Canvas values and resolution controls.
 */

import React, { useState, useMemo } from 'react';
import { formatFieldValue } from '../../../constants';
import { styles } from './updatesPageStyles';
import { EXPIRATION_OPTIONS } from './updatesPageConstants';
import { isUpdatedSinceCreation, UpdatedBadge } from './updatesHelpers';
import type { SyncUpdate } from '../../../../l5-presentation/types';
import { createLogger } from '../../../utils/rendererLogger';

const logger = createLogger('ConflictItem');

export interface ConflictItemProps {
  conflict: SyncUpdate;
  onResolve: (
    conflictId: string,
    useCanvasValue: boolean,
    rememberChoice: boolean,
    expiresAt: string | null
  ) => Promise<void>;
}

export function ConflictItem({ conflict, onResolve }: ConflictItemProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [expiration, setExpiration] = useState<string>('semester');
  const wasUpdated = isUpdatedSinceCreation(conflict);

  // Parse local and canvas values (safely handle invalid JSON)
  const localValue = useMemo(() => {
    if (!conflict.oldValue) return null;
    try {
      return JSON.parse(conflict.oldValue);
    } catch {
      return conflict.oldValue; // Return raw string if not valid JSON
    }
  }, [conflict.oldValue]);

  const canvasValue = useMemo(() => {
    if (!conflict.newValue) return null;
    try {
      return JSON.parse(conflict.newValue);
    } catch {
      return conflict.newValue; // Return raw string if not valid JSON
    }
  }, [conflict.newValue]);

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return 'Not set';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (val === 0 || val === 1) return val === 1 ? 'Completed' : 'Not completed';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return '[Object]';
      }
    }
    // Use field-aware formatting (handles dates, weights, etc.)
    if (conflict.conflictField) {
      return formatFieldValue(conflict.conflictField, String(val));
    }
    return String(val);
  };

  const getExpirationDate = (): string | null => {
    const option = EXPIRATION_OPTIONS.find((o) => o.value === expiration);
    if (!option || option.days === null) return null;
    const date = new Date();
    date.setDate(date.getDate() + option.days);
    return date.toISOString();
  };

  const handleResolve = async (useCanvasValue: boolean) => {
    setIsLoading(true);
    try {
      // externalId contains the conflict ID from SyncConflictResolver
      const conflictId = conflict.externalId || '';
      if (!conflictId) {
        logger.error('Conflict has no ID, cannot resolve');
        return;
      }
      const expiresAt = rememberChoice ? getExpirationDate() : null;
      await onResolve(conflictId, useCanvasValue, rememberChoice, expiresAt);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.conflictItem}>
      <div style={styles.conflictHeader}>
        <span style={styles.conflictTitle}>{conflict.title}</span>
        {wasUpdated && <UpdatedBadge />}
        <span style={styles.conflictField}>{conflict.conflictField}</span>
      </div>
      <div style={styles.conflictValues}>
        <div style={styles.conflictValueBox}>
          <div style={styles.conflictValueLabel}>Local Value</div>
          <div style={styles.conflictValueContent}>{formatValue(localValue)}</div>
          <button
            style={{ ...styles.conflictButton, ...styles.keepMineButton }}
            onClick={() => handleResolve(false)}
            disabled={isLoading}
          >
            Keep Local
          </button>
        </div>
        <div style={styles.conflictValueBox}>
          <div style={styles.conflictValueLabel}>Canvas Value</div>
          <div style={styles.conflictValueContent}>{formatValue(canvasValue)}</div>
          <button
            style={{ ...styles.conflictButton, ...styles.useCanvasButton }}
            onClick={() => handleResolve(true)}
            disabled={isLoading}
          >
            Use Canvas
          </button>
        </div>
      </div>
      <div style={styles.conflictOptions}>
        <label style={styles.conflictRemember}>
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
          />
          <span>Remember this choice for future syncs</span>
        </label>
        {rememberChoice && (
          <div style={styles.expirationSelect}>
            <span style={styles.expirationLabel}>For:</span>
            <select
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              style={styles.expirationDropdown}
              className="expiration-select"
            >
              {EXPIRATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
