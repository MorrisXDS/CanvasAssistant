/**
 * CourseDetail Page Styles
 * Extracted from CourseDetail.tsx for maintainability
 */

import type React from 'react';

export const courseDetailStyles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    flex: 1,
  },

  page: {
    width: '100%',
    maxWidth: 'min(1400px, calc(100vw - var(--sidebar-width) - var(--space-12)))',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    paddingBottom: 'var(--space-8)',
    flex: 1,
  },

  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'none',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
  },

  headerCard: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
  },

  headerColorBar: {
    height: '6px',
  },

  headerContent: {
    padding: 'var(--space-6)',
  },

  headerMain: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-5)',
  },

  headerInfo: {
    flex: '1 1 250px',
    minWidth: 0,
  },

  courseCodeBadge: {
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '4px 10px',
    borderRadius: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
    marginBottom: 'var(--space-2)',
  },

  courseName: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
    lineHeight: 'var(--leading-snug)',
  },

  fullCode: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },

  archivedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    backgroundColor: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-bold)',
    borderRadius: 'var(--radius-md)',
    marginLeft: 'var(--space-2)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  archivedWarningBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap' as const,
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    marginBottom: 'var(--space-4)',
    backgroundColor: 'var(--color-warning-bg)',
    border: '1px solid var(--color-warning)',
    borderRadius: 'var(--radius-lg)',
  },

  archivedWarningContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    color: 'var(--color-warning)',
  },

  archivedWarningText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
  },

  archivedWarningActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
  },

  archivedWarningCheckbox: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  archivedWarningButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-warning)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  gradeSummary: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    flexShrink: 0,
  },

  gradeItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    textAlign: 'center',
    minHeight: '72px',
  },

  gradeLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-1)',
  },

  gradeValue: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
  },

  gradeSubtext: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },

  syllabusValue: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    maxWidth: '140px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  },

  contextMenuOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },

  contextMenu: {
    position: 'fixed',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    padding: 'var(--space-1)',
    minWidth: '160px',
    zIndex: 1001,
  },

  contextMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    textAlign: 'left',
    transition: 'background-color var(--transition-fast)',
  },

  gradeDivider: {
    width: '1px',
    height: '40px',
    backgroundColor: 'var(--border-light)',
  },

  editableValue: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
  },

  editTargetRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-1)',
  },

  targetInput: {
    width: '60px',
    padding: 'var(--space-1) var(--space-2)',
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-bold)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    textAlign: 'center',
  },

  editIconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
  },

  settingsButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    padding: 0,
    background: 'none',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },

  settingsPanel: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    marginTop: 'var(--space-4)',
  },

  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },

  settingsField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  settingsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-3)',
  },

  settingsLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-1)',
  },

  settingsInput: {
    width: '100%',
    height: '36px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
  },

  colorPicker: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  colorOption: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'transform var(--transition-fast)',
  },

  visibilityButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    height: '36px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },

  archiveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    height: '36px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--color-warning-50)',
    border: '1px solid var(--color-warning)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--color-warning)',
  },

  settingsDivider: {
    height: '1px',
    backgroundColor: 'var(--border-light)',
    margin: 'var(--space-4) 0',
  },

  settingsActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-4)',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--border-light)',
  },

  cancelButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },

  saveButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    backgroundColor: 'var(--color-navy)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'white',
  },

  progressSection: {
    marginBottom: 'var(--space-3)',
  },

  noProgressSection: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-3)',
    textAlign: 'center',
  },

  noProgressText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },

  progressBar: {
    position: 'relative',
    height: '8px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: '4px',
    overflow: 'visible',
    marginBottom: 'var(--space-2)',
  },

  progressFillBackground: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    borderRadius: '4px',
    backgroundColor: 'var(--color-gray-300)',
    transition: 'width 0.3s ease',
  },

  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },

  targetMarker: {
    position: 'absolute',
    top: '-4px',
    width: '2px',
    height: '16px',
    backgroundColor: 'var(--color-navy)',
    transform: 'translateX(-50%)',
  },

  progressLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  targetLabel: {
    color: 'var(--color-navy)',
    fontWeight: 'var(--font-medium)',
  },

  progressLegend: {
    display: 'flex',
    gap: 'var(--space-4)',
  },

  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },

  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },

  syncInfo: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textAlign: 'right',
  },

  twoColumn: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) clamp(280px, 30%, 380px)',
    gap: 'var(--space-4)',
    alignItems: 'start',
  },

  mainColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    minWidth: 0,
  },

  sideColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    minWidth: 0,
    alignSelf: 'stretch',
  },

  // Wrapper for sidebar cards to enable equal height distribution
  sidebarCardWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },

  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  cardTitle: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  cardHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  sectionDragHandle: {
    color: 'var(--text-muted)',
    cursor: 'grab',
    flexShrink: 0,
    opacity: 0.5,
    transition: 'opacity var(--transition-fast)',
  },

  addTaskButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  viewAllButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    color: 'var(--color-blue)',
    border: '1px solid var(--color-blue)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  addTaskForm: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    borderBottom: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  addTaskInput: {
    padding: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
  },

  addTaskTextarea: {
    padding: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    resize: 'vertical',
    fontFamily: 'inherit',
  },

  addTaskRow: {
    display: 'flex',
    gap: 'var(--space-3)',
  },

  addTaskInputSmall: {
    flex: 1,
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
  },

  addTaskSelect: {
    flex: 1,
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    cursor: 'pointer',
  },

  addTaskDateGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
  },

  addTaskDateLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    fontWeight: 'var(--font-medium)',
  },

  addTaskDateInput: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
  },

  addTaskSelectWithLabel: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    cursor: 'pointer',
    width: '100%',
  },

  addTaskActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-2)',
  },

  taskList: {
    display: 'flex',
    flexDirection: 'column',
  },

  taskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
    userSelect: 'none',
  },

  taskIcon: {
    flexShrink: 0,
  },

  taskInfo: {
    flex: 1,
    minWidth: 0,
  },

  taskTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: '2px',
  },

  taskMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  taskWeight: {
    padding: '1px 6px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-sm)',
  },

  taskLocation: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: 'var(--text-secondary)',
  },

  taskScore: {
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-success)',
    cursor: 'help',
  },

  guessedBadge: {
    marginLeft: '4px',
    fontStyle: 'italic',
    color: 'var(--color-blue)',
    cursor: 'help',
  },

  unknownTimeBadge: {
    marginLeft: '4px',
    fontStyle: 'italic',
    color: 'var(--text-muted)',
    cursor: 'help',
  },

  unsetWeightBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '1px 6px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    cursor: 'help',
  },

  taskActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  duplicateButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    background: 'none',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    transition: 'all var(--transition-fast)',
  },

  taskItemWrapper: {
    display: 'flex',
    flexDirection: 'column',
  },

  taskCheckbox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    borderRadius: '50%',
    transition: 'transform 0.15s ease, background-color 0.15s ease',
  },

  taskActionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    borderRadius: 'var(--radius-sm)',
  },

  taskDetailPanel: {
    padding: 'var(--space-4)',
    paddingLeft: 'var(--space-12)',
    backgroundColor: 'var(--bg-app)',
    borderTop: '1px solid var(--border-light)',
  },

  taskDetailContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  taskDetailRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  taskDetailText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    lineHeight: 1.5,
    margin: 0,
    maxHeight: '200px',
    overflowY: 'scroll',
    wordBreak: 'break-word' as const,
  },

  taskDetailGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  taskDetailView: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  taskDescription: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },

  taskDetailMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  taskDetailItem: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  taskDetailLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  taskDetailValue: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  taskDetailActions: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-2)',
  },

  editButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  deleteButtonSmall: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-error)',
    cursor: 'pointer',
  },

  taskEditForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  taskEditRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  taskEditRowGroup: {
    display: 'flex',
    gap: 'var(--space-3)',
  },

  taskEditRowHalf: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  taskEditLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
  },

  taskEditInput: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
  },

  taskEditTextarea: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    resize: 'vertical',
    fontFamily: 'inherit',
  },

  taskEditHint: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: 'var(--space-1)',
  },

  taskEditSelect: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    cursor: 'pointer',
    width: '100%',
  },

  taskEditActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'var(--space-2)',
  },

  taskEditActionsRight: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  deleteButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-error)',
    cursor: 'pointer',
  },

  emptySection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-6)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
  },

  emptySideSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-4)',
    textAlign: 'center',
    flex: 1,
  },

  emptySideText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },

  showMore: {
    padding: 'var(--space-3) var(--space-4)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    borderTop: '1px solid var(--border-light)',
  },

  policyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  policyItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
  },

  policyIcon: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
  },

  policyInfo: {
    flex: 1,
    minWidth: 0,
  },

  policyName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  policyType: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  policyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },

  policySectionTitle: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  addPolicyBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  policyActions: {
    display: 'flex',
    gap: 'var(--space-1)',
  },

  policyActionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    borderRadius: 'var(--radius-sm)',
  },

  announcementList: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0 var(--space-4) var(--space-4) var(--space-4)',
  },

  announcementItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--border-light)',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
  },

  announcementTitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    marginRight: 'var(--space-2)',
  },

  announcementDate: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    flexShrink: 0,
  },

  pagesList: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0 var(--space-4) var(--space-4) var(--space-4)',
  },

  pageItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--border-light)',
  },

  pageInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flex: 1,
    minWidth: 0,
  },

  pageDetails: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },

  pageTitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  pageType: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  downloadButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    transition: 'all var(--transition-fast)',
    flexShrink: 0,
  },

  viewAllLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-3) 0',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-blue)',
    cursor: 'pointer',
    textDecoration: 'none',
  },

  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-1) 0',
  },

  historyGrade: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  historyDate: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-12)',
    color: 'var(--text-secondary)',
  },

  notFound: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: 'var(--space-12)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
  },

  notFoundTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginTop: 'var(--space-4)',
    marginBottom: 'var(--space-2)',
  },

  notFoundText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
  },

  backLinkNotFound: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    color: 'var(--color-navy)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    textDecoration: 'none',
  },
};
