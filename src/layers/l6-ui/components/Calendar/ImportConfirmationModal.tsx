/**
 * Import Confirmation Modal
 * Shows a preview of ICS events before importing
 */

import React, { useState } from 'react';
import {
  X,
  Calendar,
  AlertTriangle,
  Repeat,
  MapPin,
  ChevronDown,
  Clock,
  FileText,
} from 'lucide-react';
import type { ICSImportPreview, ParsedICSEvent } from '../../../l5-presentation/types';
import { CALENDAR_COLORS } from '../../constants';
import { ColorPicker } from '../primitives';

interface ImportConfirmationModalProps {
  isOpen: boolean;
  preview: ICSImportPreview | null;
  onConfirm: (options: { name: string; color: string }) => void;
  onCancel: () => void;
}

export function ImportConfirmationModal({
  isOpen,
  preview,
  onConfirm,
  onCancel,
}: ImportConfirmationModalProps) {
  const [calendarName, setCalendarName] = useState(preview?.calendarName || '');
  const [selectedColor, setSelectedColor] = useState<string>(CALENDAR_COLORS[0]);

  // Update name when preview changes
  React.useEffect(() => {
    if (preview) {
      setCalendarName(preview.calendarName);
    }
  }, [preview]);

  if (!isOpen || !preview) return null;

  const handleConfirm = () => {
    onConfirm({
      name: calendarName.trim() || preview.calendarName,
      color: selectedColor,
    });
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const _formatTime = (date: Date | null) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <Calendar size={24} color="var(--color-blue)" />
            <h2 style={styles.title}>Import Calendar</h2>
          </div>
          <button style={styles.closeButton} onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        {/* Summary */}
        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>File:</span>
            <span style={styles.summaryValue}>{preview.filename}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Events:</span>
            <span style={styles.summaryValue}>{preview.events.length}</span>
          </div>
          {preview.dateRange && (
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Date Range:</span>
              <span style={styles.summaryValue}>
                {formatDate(preview.dateRange.start)} -{' '}
                {formatDate(preview.dateRange.end)}
              </span>
            </div>
          )}
          {preview.hasRecurringEvents && (
            <div style={styles.recurringBadge}>
              <Repeat size={14} />
              Contains recurring events
            </div>
          )}
        </div>

        {/* Warnings */}
        {preview.warnings.length > 0 && (
          <div style={styles.warnings}>
            <AlertTriangle size={16} color="var(--color-warning)" />
            <div style={styles.warningsList}>
              {preview.warnings.map((warning, i) => (
                <div key={i} style={styles.warningItem}>
                  {warning}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Calendar Name */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Calendar Name</label>
          <input
            type="text"
            value={calendarName}
            onChange={(e) => setCalendarName(e.target.value)}
            style={styles.input}
            placeholder="Enter calendar name"
          />
        </div>

        {/* Color Picker */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Calendar Color</label>
          <ColorPicker
            value={selectedColor}
            onChange={setSelectedColor}
            presets={CALENDAR_COLORS}
            allowCustom={true}
            swatchSize={28}
          />
        </div>

        {/* Events Preview */}
        <EventsPreviewSection events={preview.events} color={selectedColor} />

        {/* Actions */}
        <div style={styles.actions}>
          <button style={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.confirmButton} onClick={handleConfirm}>
            Import {preview.events.length} Events
          </button>
        </div>
      </div>
    </div>
  );
}

function EventsPreviewSection({
  events,
  color,
}: {
  events: ParsedICSEvent[];
  color: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const INITIAL_SHOW_COUNT = 5;
  const displayedEvents = isExpanded ? events : events.slice(0, INITIAL_SHOW_COUNT);
  const hasMoreEvents = events.length > INITIAL_SHOW_COUNT;

  return (
    <div style={styles.eventsSection}>
      <div style={styles.eventsHeader}>
        <label style={styles.label}>Events Preview ({events.length} total)</label>
        {hasMoreEvents && (
          <button
            style={{
              ...styles.expandToggle,
              backgroundColor: isExpanded ? 'var(--color-info-bg)' : 'transparent',
            }}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Show less' : `Show all ${events.length}`}
            <ChevronDown
              size={14}
              style={{
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 150ms ease',
              }}
            />
          </button>
        )}
      </div>
      <div
        style={{
          ...styles.eventsList,
          maxHeight: isExpanded ? '400px' : '200px',
        }}
      >
        {displayedEvents.map((event, index) => (
          <EventPreviewItem
            key={event.uid || index}
            event={event}
            color={color}
            isExpanded={expandedEventId === event.uid}
            onToggleExpand={() =>
              setExpandedEventId(expandedEventId === event.uid ? null : event.uid)
            }
          />
        ))}
      </div>
    </div>
  );
}

function EventPreviewItem({
  event,
  color,
  isExpanded,
  onToggleExpand,
}: {
  event: ParsedICSEvent;
  color: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const formatDateTime = (date: Date | null, includeTime: boolean) => {
    if (!date) return 'Unknown';
    const d = new Date(date);
    const dateStr = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (!includeTime) return dateStr;
    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${dateStr} at ${timeStr}`;
  };

  const formatRRule = (rrule: string | null) => {
    if (!rrule) return null;
    // Parse common RRULE patterns
    if (rrule.includes('FREQ=DAILY')) return 'Repeats daily';
    if (rrule.includes('FREQ=WEEKLY')) {
      const byday = rrule.match(/BYDAY=([A-Z,]+)/);
      if (byday) {
        const days = byday[1]
          .split(',')
          .map((d) => {
            const map: Record<string, string> = {
              MO: 'Mon',
              TU: 'Tue',
              WE: 'Wed',
              TH: 'Thu',
              FR: 'Fri',
              SA: 'Sat',
              SU: 'Sun',
            };
            return map[d] || d;
          })
          .join(', ');
        return `Repeats weekly on ${days}`;
      }
      return 'Repeats weekly';
    }
    if (rrule.includes('FREQ=MONTHLY')) return 'Repeats monthly';
    if (rrule.includes('FREQ=YEARLY')) return 'Repeats yearly';
    return 'Recurring event';
  };

  return (
    <div
      style={{
        ...styles.eventItem,
        cursor: 'pointer',
        backgroundColor: isExpanded ? 'var(--bg-hover)' : 'transparent',
      }}
      onClick={onToggleExpand}
    >
      <div style={{ ...styles.eventColor, backgroundColor: color }} />
      <div style={styles.eventContent}>
        <div style={styles.eventHeader}>
          <div style={styles.eventTitle}>{event.summary || 'Untitled Event'}</div>
          <ChevronDown
            size={14}
            style={{
              color: 'var(--text-secondary)',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
              flexShrink: 0,
            }}
          />
        </div>
        <div style={styles.eventMeta}>
          {event.dtstart && (
            <span>
              {new Date(event.dtstart).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
              {!event.allDay &&
                ` at ${new Date(event.dtstart).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}`}
            </span>
          )}
          {event.rrule && (
            <span style={styles.recurringIcon}>
              <Repeat size={12} />
            </span>
          )}
          {event.location && (
            <span style={styles.locationMeta}>
              <MapPin size={12} />
              {event.location.length > 20
                ? event.location.slice(0, 20) + '...'
                : event.location}
            </span>
          )}
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div style={styles.eventDetails}>
            {/* Full date/time */}
            <div style={styles.detailRow}>
              <Clock size={14} color="var(--text-secondary)" />
              <div style={styles.detailContent}>
                <div>
                  {event.allDay ? 'All day' : formatDateTime(event.dtstart, true)}
                </div>
                {event.dtend && !event.allDay && (
                  <div style={styles.detailSecondary}>
                    to {formatDateTime(event.dtend, true)}
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            {event.location && (
              <div style={styles.detailRow}>
                <MapPin size={14} color="var(--text-secondary)" />
                <span>{event.location}</span>
              </div>
            )}

            {/* Recurring info */}
            {event.rrule && (
              <div style={styles.detailRow}>
                <Repeat size={14} color="var(--color-blue)" />
                <span>{formatRRule(event.rrule)}</span>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div style={styles.detailRow}>
                <FileText size={14} color="var(--text-secondary)" />
                <div style={styles.description}>
                  {event.description.length > 300
                    ? event.description.slice(0, 300) + '...'
                    : event.description}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },

  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    width: '100%',
    maxWidth: '560px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-lg)',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-6)',
    borderBottom: '1px solid var(--border-default)',
  },

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  title: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  closeButton: {
    background: 'none',
    border: 'none',
    padding: 'var(--space-2)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  summary: {
    padding: 'var(--space-4) var(--space-6)',
    backgroundColor: 'var(--bg-app)',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
    alignItems: 'center',
  },

  summaryItem: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  summaryLabel: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  summaryValue: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  recurringBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-blue)',
    backgroundColor: 'var(--color-info-bg)',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-full)',
  },

  warnings: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-6)',
    backgroundColor: 'var(--color-warning-bg)',
    borderBottom: '1px solid var(--color-warning)',
  },

  warningsList: {
    flex: 1,
  },

  warningItem: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-warning)',
  },

  formGroup: {
    padding: 'var(--space-4) var(--space-6)',
  },

  label: {
    display: 'block',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  input: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-base)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
  },

  colorPicker: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  colorOption: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'transform var(--transition-fast)',
  },

  eventsSection: {
    padding: '0 var(--space-6) var(--space-4)',
    flex: 1,
    minHeight: 0,
  },

  eventsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-2)',
  },

  expandToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    fontWeight: '500',
    color: 'var(--color-blue)',
    background: 'none',
    border: '1px solid var(--border-light)',
    cursor: 'pointer',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-full)',
    transition: 'background-color 150ms ease, border-color 150ms ease',
  },

  eventsList: {
    maxHeight: '200px',
    overflowY: 'auto',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    transition: 'max-height 200ms ease',
  },

  eventItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    borderBottom: '1px solid var(--border-light)',
    transition: 'background-color 150ms ease',
  },

  eventHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
  },

  eventColor: {
    width: '4px',
    height: '100%',
    minHeight: '32px',
    borderRadius: '2px',
    flexShrink: 0,
  },

  eventContent: {
    flex: 1,
    minWidth: 0,
  },

  eventTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  eventMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  },

  recurringIcon: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-blue)',
  },

  locationMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  eventDetails: {
    marginTop: 'var(--space-3)',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  detailRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
  },

  detailContent: {
    flex: 1,
  },

  detailSecondary: {
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
  },

  description: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
  },

  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-3)',
    padding: 'var(--space-4) var(--space-6)',
    borderTop: '1px solid var(--border-default)',
  },

  cancelButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  confirmButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'white',
    backgroundColor: 'var(--color-blue)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },
};

export default ImportConfirmationModal;
