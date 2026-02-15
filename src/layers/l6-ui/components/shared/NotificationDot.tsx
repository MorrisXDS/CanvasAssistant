/**
 * NotificationDot Component
 * A small colored dot indicator for unseen updates
 * Used in sidebar, course cards, and folder headers
 */

import React from 'react';
import { formatFieldValue } from '../../constants';

/**
 * Update type for notification dots
 * Priority: conflict > grade_changed > updated > new
 */
export type UpdateType = 'new' | 'updated' | 'grade_changed' | 'conflict';

/**
 * Colors for each update type
 * Used at item/field level for type-specific indicators
 */
export const UPDATE_TYPE_COLORS: Record<UpdateType, string> = {
  new: '#22C55E', // Green
  updated: '#3B82F6', // Blue
  grade_changed: '#F97316', // Orange
  conflict: '#EF4444', // Red
};

/**
 * Human-readable labels for update types
 */
export const UPDATE_TYPE_LABELS: Record<UpdateType, string> = {
  new: 'New',
  updated: 'Updated',
  grade_changed: 'Grade changed',
  conflict: 'Conflict',
};

/**
 * Get priority value for update type comparison
 * Higher priority types should be shown when multiple types exist
 */
export function getUpdateTypePriority(type: UpdateType): number {
  switch (type) {
    case 'conflict':
      return 4;
    case 'grade_changed':
      return 3;
    case 'updated':
      return 2;
    case 'new':
      return 1;
    default:
      return 0;
  }
}

/**
 * Get the higher priority update type between two types
 */
export function getPriorityUpdateType(
  current: UpdateType | null,
  incoming: UpdateType
): UpdateType {
  if (!current) return incoming;
  return getUpdateTypePriority(incoming) > getUpdateTypePriority(current)
    ? incoming
    : current;
}

export interface NotificationDotProps {
  /** Course color (hex string) - used for container-level dots */
  color?: string;
  /** Update type - when provided, uses type-specific color instead of course color */
  updateType?: UpdateType;
  /** Dot size: 'sm' (6px) or 'md' (8px) */
  size?: 'sm' | 'md';
  /** Animate with pulse for action-required items */
  pulse?: boolean;
  /** Tooltip text on hover */
  title?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
}

const SIZE_MAP = {
  sm: 6,
  md: 8,
} as const;

/**
 * NotificationDot - A colored circle indicator for unseen updates
 *
 * Two modes:
 * 1. Container level (sidebar, course cards): Pass `color` for course color
 * 2. Item/field level (task items, fields): Pass `updateType` for type-specific color
 *
 * If both are provided, `updateType` takes precedence.
 */
export function NotificationDot({
  color,
  updateType,
  size = 'sm',
  pulse = false,
  title,
  style,
}: NotificationDotProps) {
  const dotSize = SIZE_MAP[size];

  // Use type color if updateType provided, otherwise use course color
  const backgroundColor = updateType ? UPDATE_TYPE_COLORS[updateType] : color || '#666';

  // Auto-generate title if not provided and updateType is set
  const displayTitle = title || (updateType ? UPDATE_TYPE_LABELS[updateType] : undefined);

  // Conflicts should always pulse
  const shouldPulse = pulse || updateType === 'conflict';

  return (
    <span
      title={displayTitle}
      style={{
        display: 'inline-block',
        width: dotSize,
        height: dotSize,
        borderRadius: '50%',
        backgroundColor,
        flexShrink: 0,
        animation: shouldPulse ? 'notificationPulse 2s ease-in-out infinite' : undefined,
        ...style,
      }}
    />
  );
}

/**
 * NotificationDotGroup - Renders multiple dots with overflow indicator
 * Shows up to maxDots dots, then "+N" for remaining
 */
export interface NotificationDotGroupProps {
  /** Array of { color, hasActionRequired } for each course with updates */
  dots: Array<{ color: string; hasActionRequired?: boolean }>;
  /** Maximum dots to show before overflow indicator */
  maxDots?: number;
  /** Dot size */
  size?: 'sm' | 'md';
  /** Gap between dots in pixels */
  gap?: number;
}

export function NotificationDotGroup({
  dots,
  maxDots = 5,
  size = 'sm',
  gap = 3,
}: NotificationDotGroupProps) {
  if (dots.length === 0) return null;

  const visibleDots = dots.slice(0, maxDots);
  const overflowCount = dots.length - maxDots;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${gap}px`,
        marginLeft: 'var(--space-2)',
      }}
    >
      {visibleDots.map((dot, index) => (
        <NotificationDot
          key={index}
          color={dot.color}
          size={size}
          pulse={dot.hasActionRequired}
        />
      ))}
      {overflowCount > 0 && (
        <span
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            fontWeight: 500,
            lineHeight: 1,
          }}
        >
          +{overflowCount}
        </span>
      )}
    </span>
  );
}

/**
 * Field name to display label mapping
 */
export const FIELD_DISPLAY_LABELS: Record<string, string> = {
  due_at: 'Due date',
  points_possible: 'Points',
  weight: 'Weight',
  grade: 'Grade',
  title: 'Title',
  description: 'Description',
};

/**
 * FieldNotificationDot - A dot for specific field changes with old → new tooltip
 *
 * Used next to individual fields (due date, weight, etc.) to show what changed
 */
export interface FieldNotificationDotProps {
  /** The update type (determines color) */
  updateType: UpdateType;
  /** The field that changed (e.g., 'due_at', 'weight') */
  fieldName: string;
  /** The old value (before change) */
  oldValue?: string | null;
  /** The new value (after change) */
  newValue?: string | null;
  /** Dot size */
  size?: 'sm' | 'md';
  /** Additional inline styles */
  style?: React.CSSProperties;
}

export function FieldNotificationDot({
  updateType,
  fieldName,
  oldValue,
  newValue,
  size = 'sm',
  style,
}: FieldNotificationDotProps) {
  // Build tooltip with field name and old → new values
  const fieldLabel = FIELD_DISPLAY_LABELS[fieldName] || fieldName;
  let tooltip = `${fieldLabel}: ${UPDATE_TYPE_LABELS[updateType]}`;

  if (oldValue !== undefined && newValue !== undefined && oldValue !== newValue) {
    const oldDisplay = formatFieldValue(fieldName, oldValue);
    const newDisplay = formatFieldValue(fieldName, newValue);
    tooltip = `${fieldLabel}: ${oldDisplay} → ${newDisplay}`;
  }

  return (
    <NotificationDot updateType={updateType} size={size} title={tooltip} style={style} />
  );
}

// CSS keyframes for pulse animation (add to global styles or inject)
const pulseKeyframes = `
@keyframes notificationPulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.15);
  }
}
`;

// Inject keyframes into document head (only once)
if (typeof document !== 'undefined') {
  const styleId = 'notification-dot-keyframes';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = pulseKeyframes;
    document.head.appendChild(style);
  }
}
