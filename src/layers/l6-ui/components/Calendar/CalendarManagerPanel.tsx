/**
 * Calendar Manager Panel
 * Lists imported calendars with visibility toggles and management options
 */

import React, { useState } from 'react';
import { Eye, EyeOff, Trash2, Edit2, Check, X, Calendar } from 'lucide-react';
import type { ImportedCalendar } from '../../../l5-presentation/types';
import { CALENDAR_COLORS } from '../../constants';
import { ColorPicker } from '../primitives';
import { ConfirmDialog } from '../shared';

interface CalendarManagerPanelProps {
  calendars: ImportedCalendar[];
  onToggleVisibility: (id: number, visible: boolean) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number, updates: { name?: string; color?: string }) => void;
}

export function CalendarManagerPanel({
  calendars,
  onToggleVisibility,
  onDelete,
  onEdit,
}: CalendarManagerPanelProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [calendarToDelete, setCalendarToDelete] = useState<ImportedCalendar | null>(null);

  const startEditing = (calendar: ImportedCalendar) => {
    setEditingId(calendar.id);
    setEditName(calendar.name);
    setEditColor(calendar.color);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const saveEditing = (id: number) => {
    onEdit(id, { name: editName, color: editColor });
    cancelEditing();
  };

  const confirmDelete = () => {
    if (calendarToDelete) {
      onDelete(calendarToDelete.id);
      setCalendarToDelete(null);
    }
  };

  if (calendars.length === 0) {
    return (
      <div style={styles.emptyState}>
        <Calendar size={32} color="var(--text-muted)" />
        <p style={styles.emptyText}>No imported calendars</p>
        <p style={styles.emptyHint}>Drag and drop an ICS file to import</p>
      </div>
    );
  }

  return (
    <>
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>My Calendars</h3>
          <span style={styles.count}>{calendars.length}</span>
        </div>

        <div style={styles.calendarList}>
        {calendars.map((calendar) => (
          <div key={calendar.id} style={styles.calendarItem}>
            {editingId === calendar.id ? (
              // Edit mode
              <div style={styles.editMode}>
                <div style={styles.editRow}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={styles.editInput}
                    autoFocus
                  />
                </div>
                <ColorPicker
                  value={editColor}
                  onChange={setEditColor}
                  presets={CALENDAR_COLORS}
                  allowCustom={true}
                  swatchSize={20}
                  compact={true}
                />
                <div style={styles.editActions}>
                  <button
                    style={styles.saveButton}
                    onClick={() => saveEditing(calendar.id)}
                  >
                    <Check size={14} />
                  </button>
                  <button style={styles.cancelButton} onClick={cancelEditing}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              // Normal view
              <>
                <button
                  style={styles.visibilityButton}
                  onClick={() => onToggleVisibility(calendar.id, !calendar.isVisible)}
                  title={calendar.isVisible ? 'Hide calendar' : 'Show calendar'}
                >
                  {calendar.isVisible ? (
                    <Eye size={16} color="var(--text-secondary)" />
                  ) : (
                    <EyeOff size={16} color="var(--text-muted)" />
                  )}
                </button>

                <div
                  style={{
                    ...styles.colorIndicator,
                    backgroundColor: calendar.color,
                    opacity: calendar.isVisible ? 1 : 0.4,
                  }}
                />

                <div
                  style={{
                    ...styles.calendarInfo,
                    opacity: calendar.isVisible ? 1 : 0.6,
                  }}
                >
                  <div style={styles.calendarName}>{calendar.name}</div>
                  <div style={styles.calendarMeta}>
                    {calendar.eventCount} event{calendar.eventCount !== 1 ? 's' : ''}
                  </div>
                </div>

                <div style={styles.calendarActions}>
                  <button
                    style={styles.actionButton}
                    onClick={() => startEditing(calendar)}
                    title="Edit calendar"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    style={styles.actionButton}
                    onClick={() => setCalendarToDelete(calendar)}
                    title="Delete calendar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={calendarToDelete !== null}
        title="Delete Calendar?"
        message={`Are you sure you want to delete "${calendarToDelete?.name}"?`}
        type="danger"
        confirmText="Delete Calendar"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setCalendarToDelete(null)}
      >
        <div style={styles.deleteDetails}>
          <p style={styles.deleteDetailText}>This will permanently remove:</p>
          <ul style={styles.deleteDetailList}>
            <li>{calendarToDelete?.eventCount || 0} calendar event{(calendarToDelete?.eventCount || 0) !== 1 ? 's' : ''}</li>
            <li>All recurring event instances</li>
          </ul>
          <p style={styles.deleteWarning}>This action cannot be undone.</p>
        </div>
      </ConfirmDialog>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  title: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  count: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    backgroundColor: 'var(--bg-app)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
  },

  calendarList: {
    maxHeight: '300px',
    overflowY: 'auto',
  },

  calendarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
    transition: 'background-color var(--transition-fast)',
  },

  visibilityButton: {
    background: 'none',
    border: 'none',
    padding: 'var(--space-1)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },

  colorIndicator: {
    width: '12px',
    height: '12px',
    borderRadius: '3px',
    flexShrink: 0,
  },

  calendarInfo: {
    flex: 1,
    minWidth: 0,
  },

  calendarName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  calendarMeta: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  calendarActions: {
    display: 'flex',
    gap: 'var(--space-1)',
    opacity: 0.5,
    transition: 'opacity var(--transition-fast)',
  },

  actionButton: {
    background: 'none',
    border: 'none',
    padding: 'var(--space-1)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Edit mode styles
  editMode: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  editRow: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  editInput: {
    flex: 1,
    padding: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
  },

  colorRow: {
    display: 'flex',
    gap: 'var(--space-1)',
    flexWrap: 'wrap',
  },

  colorDot: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: 0,
  },

  editActions: {
    display: 'flex',
    gap: 'var(--space-2)',
    justifyContent: 'flex-end',
  },

  saveButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-success)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  },

  cancelButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  },

  // Delete dialog detail styles
  deleteDetails: {
    marginTop: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-light)',
  },

  deleteDetailText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: '0 0 var(--space-2) 0',
  },

  deleteDetailList: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    margin: '0 0 var(--space-2) 0',
    paddingLeft: 'var(--space-4)',
  },

  deleteWarning: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-warning)',
    margin: 0,
    fontWeight: 'var(--font-medium)',
  },

  // Empty state
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-8) var(--space-4)',
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginTop: 'var(--space-3)',
    marginBottom: 'var(--space-1)',
  },

  emptyHint: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },
};

export default CalendarManagerPanel;
