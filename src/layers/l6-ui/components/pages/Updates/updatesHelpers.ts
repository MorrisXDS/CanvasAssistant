/**
 * Helper utilities for the UpdatesPage component
 *
 * - formatChangeSubtitle: formats old -> new value change text
 * - isUpdatedSinceCreation: checks if update was modified after creation
 * - UpdatedBadge: small badge component for updated items
 */

import React from 'react';
import { RefreshCcw } from 'lucide-react';
import { formatFieldValue } from '../../../constants';
import { FIELD_LABELS, UPDATE_LABELS } from './updatesPageConstants';
import { styles } from './updatesPageStyles';
import type { SyncUpdate } from '../../../../l5-presentation/types';

/**
 * Format the change subtitle showing old -> new values
 */
export function formatChangeSubtitle(update: SyncUpdate): string {
  const field = update.changedField;

  // If no field info, fall back to original subtitle
  if (!field) {
    return update.subtitle || UPDATE_LABELS[update.entityType];
  }

  const fieldLabel = FIELD_LABELS[field] || field;
  const newFormatted = formatFieldValue(field, update.newValue);

  // Handle created (no old value) - no arrow needed
  if (
    update.oldValue === null ||
    update.oldValue === undefined ||
    update.oldValue === ''
  ) {
    return `${fieldLabel}: Created ${newFormatted}`;
  }

  const oldFormatted = formatFieldValue(field, update.oldValue);

  // Handle removed value
  if (
    update.newValue === null ||
    update.newValue === undefined ||
    update.newValue === ''
  ) {
    return `${fieldLabel}: ${oldFormatted} → (removed)`;
  }

  return `${fieldLabel}: ${oldFormatted} → ${newFormatted}`;
}

/**
 * Helper to check if an update has been modified since creation
 * (i.e., Canvas changed the value after we first detected it)
 */
export function isUpdatedSinceCreation(update: SyncUpdate): boolean {
  if (!update.updatedAt || !update.createdAt) return false;
  return new Date(update.updatedAt).getTime() > new Date(update.createdAt).getTime();
}

/**
 * Updated badge component - shows a small "UPDATED" indicator
 */
export function UpdatedBadge(): React.ReactElement {
  return React.createElement(
    'span',
    { style: styles.updatedBadge },
    React.createElement(RefreshCcw, { size: 10 }),
    'UPDATED'
  );
}

/**
 * Helper to get icon background color by entity type
 */
export function getIconStyle(entityType: string): React.CSSProperties {
  switch (entityType) {
    case 'task':
      return {
        backgroundColor: 'var(--color-primary-bg, #dbeafe)',
        color: 'var(--color-navy)',
      };
    case 'grade':
      return {
        backgroundColor: 'var(--color-success-bg, #dcfce7)',
        color: 'var(--color-success)',
      };
    case 'file':
      return {
        backgroundColor: 'var(--color-info-bg, #e0f2fe)',
        color: 'var(--color-info)',
      };
    case 'page':
      return {
        backgroundColor: 'rgba(168, 85, 247, 0.15)',
        color: '#a855f7',
      };
    case 'announcement':
      return {
        backgroundColor: 'var(--color-warning-bg, #fef3c7)',
        color: 'var(--color-warning)',
      };
    default:
      return { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };
  }
}
