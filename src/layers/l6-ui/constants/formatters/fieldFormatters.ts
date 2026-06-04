/**
 * Field Formatters - Field value formatting and urgency helpers
 */

/** Date fields that need timestamp-aware formatting */
const DATE_FIELDS = new Set([
  'due_at',
  'unlock_at',
  'lock_at',
  'completed_at',
  'published_at',
  'dismissed_at',
]);

/**
 * Format a sync field value for human-readable display
 */
export function formatFieldValue(
  field: string,
  value: string | null | undefined
): string {
  if (value === null || value === undefined || value === '') return '(none)';

  if (DATE_FIELDS.has(field)) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const isCurrentYear = date.getFullYear() === new Date().getFullYear();
        return date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: isCurrentYear ? undefined : 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      }
    } catch {
      /* fall through to raw value */
    }
  }

  switch (field) {
    case 'weight':
    case 'grade':
      return `${value}%`;
    case 'points_possible':
      return `${value} pts`;
    case 'is_completed':
      return value === '1' || value === 'true' ? 'Completed' : 'Not completed';
    case 'is_optional':
      return value === '1' || value === 'true' ? 'Optional' : 'Required';
    case 'is_hidden':
      return value === '1' || value === 'true' ? 'Hidden' : 'Visible';
    case 'is_read':
      return value === '1' || value === 'true' ? 'Read' : 'Unread';
    case 'submission_status':
      return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
    case 'title':
      return value.length > 30 ? `"${value.substring(0, 30)}..."` : `"${value}"`;
    default:
      return value;
  }
}

/**
 * Get urgency level from days until due (for CSS color mapping)
 */
export function getUrgencyLevel(
  daysUntilDue: number | null
): 'danger' | 'warning' | 'info' | 'default' {
  if (daysUntilDue === null) return 'default';
  if (daysUntilDue < 0) return 'danger';
  if (daysUntilDue === 0) return 'danger';
  if (daysUntilDue === 1) return 'warning';
  if (daysUntilDue <= 3) return 'warning';
  return 'info';
}

/**
 * Get badge urgency level from days until due (for Badge component)
 */
export function getBadgeUrgency(
  daysUntilDue: number | null
): 'critical' | 'high' | 'medium' | 'low' {
  if (daysUntilDue === null) return 'low';
  if (daysUntilDue < 0) return 'critical';
  if (daysUntilDue <= 1) return 'critical';
  if (daysUntilDue <= 3) return 'high';
  if (daysUntilDue <= 7) return 'medium';
  return 'low';
}
