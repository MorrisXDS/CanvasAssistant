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
import { CALENDAR_COLORS, getNextCalendarColor } from '../../constants';
import { ColorPicker } from '../primitives';
import { styles } from './ImportConfirmationModal.styles';
import { useStore } from '../../../l5-presentation/store';
import { formatTimeInEffectiveTimezone } from '../../../l5-presentation/settings';

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
  // Get existing calendar count for golden angle color selection
  const importedCalendars = useStore((state) => state.importedCalendars);
  const existingCount = importedCalendars.length;

  const [calendarName, setCalendarName] = useState(preview?.calendarName || '');
  const [selectedColor, setSelectedColor] = useState<string>(() =>
    getNextCalendarColor(existingCount)
  );

  // Update name and color when preview changes (new import)
  React.useEffect(() => {
    if (preview) {
      setCalendarName(preview.calendarName);
      // Use golden angle to pick optimal next color
      setSelectedColor(getNextCalendarColor(existingCount));
    }
  }, [preview, existingCount]);

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

        {/* Scrollable body */}
        <div style={styles.body}>
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
        </div>

        {/* Actions - pinned at bottom */}
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
    // Use effective timezone for time display
    const timeStr = formatTimeInEffectiveTimezone(d.toISOString());
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
                ` at ${formatTimeInEffectiveTimezone(new Date(event.dtstart).toISOString())}`}
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

export default ImportConfirmationModal;
