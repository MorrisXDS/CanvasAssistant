/**
 * Courses Page Styles
 * Extracted styles for the Courses page components
 */

import type React from 'react';

export const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-6)',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minWidth: 0,
  },

  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },

  searchIcon: {
    position: 'absolute',
    left: '12px',
    pointerEvents: 'none',
  },

  searchInput: {
    width: '220px',
    height: '36px',
    paddingLeft: '36px',
    paddingRight: '32px',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    outline: 'none',
    transition: 'border-color var(--transition-fast)',
  },

  clearSearch: {
    position: 'absolute',
    right: '8px',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-app)',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    color: 'var(--text-muted)',
  },

  filterButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    border: '1px solid',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  filterBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '8px',
    height: '8px',
    backgroundColor: 'var(--color-navy)',
    borderRadius: '50%',
  },

  filterPanel: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    marginBottom: 'var(--space-4)',
    boxShadow: 'var(--shadow-card)',
  },

  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  filterLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
    marginRight: 'var(--space-1)',
  },

  filterChips: {
    display: 'flex',
    gap: 'var(--space-1)',
    flexWrap: 'wrap',
  },

  filterSelect: {
    height: '28px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    cursor: 'pointer',
    outline: 'none',
  },

  filterChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    height: '28px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    border: '1px solid',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
  },

  clearFiltersBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    height: '28px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-error)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    marginLeft: 'auto',
  },

  clearFiltersLarge: {
    marginTop: 'var(--space-4)',
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'white',
    backgroundColor: 'var(--color-navy)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  viewToggle: {
    display: 'flex',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  viewButton: {
    width: '40px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  archiveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    height: '36px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  archiveDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 'var(--space-1)',
    width: '280px',
    maxHeight: '320px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 100,
    overflow: 'hidden',
  },

  archiveDropdownHeader: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-light)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  archiveDropdownEmpty: {
    padding: 'var(--space-4)',
    textAlign: 'center' as const,
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  },

  archiveDropdownList: {
    maxHeight: '280px',
    overflowY: 'auto' as const,
  },

  archiveDropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background-color var(--transition-fast)',
  },

  archiveDropdownCode: {
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
    flexShrink: 0,
  },

  archiveDropdownName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },

  resetOrderButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    height: '36px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    cursor: 'grab',
    opacity: 0,
    transition: 'opacity var(--transition-fast)',
  },

  // Grid View Styles
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(280px, 20vw, 400px), 1fr))',
    gap: 'clamp(16px, 2vw, 24px)',
    alignItems: 'stretch',
    flex: 1,
  },

  gridCard: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
    transition: 'box-shadow var(--transition-fast), transform var(--transition-fast)',
    cursor: 'pointer',
    display: 'grid',
    gridTemplateRows: 'auto auto 1fr auto auto',
    height: '100%',
    minHeight: 'clamp(200px, 18vw, 280px)',
  },

  colorBar: {
    height: '4px',
  },

  colorPickerPopup: {
    position: 'absolute',
    top: '100%',
    left: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    padding: 'var(--space-3)',
    zIndex: 100,
    minWidth: '200px',
  },

  colorPresets: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },

  colorPresetBtn: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'transform var(--transition-fast)',
  },

  hexInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    borderTop: '1px solid var(--border-light)',
    paddingTop: 'var(--space-3)',
  },

  hexLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
  },

  hexInput: {
    flex: 1,
    height: '28px',
    padding: '0 var(--space-2)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--font-mono)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
  },

  nativeColorPicker: {
    width: '28px',
    height: '28px',
    padding: 0,
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  colorPickerPopupList: {
    position: 'absolute',
    top: '50%',
    left: 'calc(100% + var(--space-2))',
    transform: 'translateY(-50%)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    padding: 'var(--space-3)',
    zIndex: 100,
    minWidth: '200px',
  },

  gridCardContent: {
    display: 'contents',
  },

  gridCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding:
      'clamp(12px, 1.5vw, 20px) clamp(12px, 1.5vw, 20px) clamp(6px, 0.8vw, 12px) clamp(12px, 1.5vw, 20px)',
  },

  courseCodeBadge: {
    fontSize: 'clamp(10px, 0.85vw, 13px)',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: 'clamp(2px, 0.3vw, 5px) clamp(6px, 0.6vw, 10px)',
    borderRadius: 'clamp(3px, 0.3vw, 5px)',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  },

  pinButton: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  gridCourseName: {
    fontSize: 'clamp(14px, 1.1vw, 18px)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    lineHeight: 'var(--leading-snug)',
    padding: '0 clamp(12px, 1.5vw, 20px)',
  },

  fullCode: {
    fontSize: 'clamp(10px, 0.8vw, 13px)',
    color: 'var(--text-muted)',
    display: 'block',
    padding: 'clamp(4px, 0.4vw, 8px) clamp(12px, 1.5vw, 20px) 0 clamp(12px, 1.5vw, 20px)',
    alignSelf: 'start',
  },

  gridStats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'clamp(6px, 0.8vw, 12px)',
    padding: 'clamp(8px, 1vw, 12px) clamp(10px, 1.2vw, 16px)',
    borderTop: '1px solid var(--border-light)',
    marginTop: 'auto',
  },

  gridStatItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'clamp(2px, 0.3vw, 4px)',
  },

  gridStatLabel: {
    fontSize: 'clamp(10px, 0.8vw, 13px)',
    color: 'var(--text-muted)',
  },

  gridStatValue: {
    fontSize: 'clamp(12px, 1vw, 16px)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding:
      '0 clamp(12px, 1.5vw, 20px) clamp(12px, 1.5vw, 20px) clamp(12px, 1.5vw, 20px)',
  },

  syncTime: {
    fontSize: 'clamp(10px, 0.8vw, 13px)',
    color: 'var(--text-muted)',
  },

  // List View Styles
  list: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },

  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  listColorDot: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    flexShrink: 0,
    padding: 0,
    transition: 'transform var(--transition-fast)',
  },

  listInfo: {
    flex: 1,
    minWidth: 0,
  },

  listHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-1)',
  },

  listCodeBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '3px',
    textTransform: 'uppercase',
  },

  listFullCode: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  listCourseName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  listGrades: {
    display: 'flex',
    gap: 'var(--space-6)',
    flexShrink: 0,
  },

  listGradeItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },

  listGradeLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  listGradeValue: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  listActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexShrink: 0,
  },

  // Empty State
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-10)',
  },

  emptyTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  emptyText: {
    color: 'var(--text-secondary)',
  },

  // Archived Section
  archivedSection: {
    marginTop: 'var(--space-6)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  archivedHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: 'var(--space-4)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },

  archivedHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  archivedTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
  },

  archivedCount: {
    fontSize: 'var(--text-xs)',
    padding: '2px 6px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
  },

  archivedContent: {
    borderTop: '1px solid var(--border-light)',
  },

  archivedLoading: {
    padding: 'var(--space-6)',
    textAlign: 'center' as const,
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  },

  archivedEmpty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-6)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  },

  archivedList: {
    display: 'flex',
    flexDirection: 'column' as const,
  },

  archivedItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    borderTop: '1px solid var(--border-light)',
  },

  archivedColorBar: {
    width: '4px',
    height: '40px',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },

  archivedInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },

  archivedInfoClickable: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    cursor: 'pointer',
    padding: 'var(--space-1)',
    marginLeft: 'calc(-1 * var(--space-1))',
    borderRadius: 'var(--radius-sm)',
    transition: 'background-color var(--transition-fast)',
  },

  archivedCode: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
  },

  archivedName: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },

  unarchiveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-blue)',
    backgroundColor: 'var(--color-blue-50)',
    border: '1px solid var(--color-blue)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    flexShrink: 0,
  },

  unarchiveButtonDisabled: {
    color: 'var(--text-tertiary)',
    backgroundColor: 'var(--color-gray-100)',
    border: '1px solid var(--color-gray-300)',
    cursor: 'not-allowed',
    opacity: 0.6,
  },

  autoArchivedBadge: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
    backgroundColor: 'var(--color-gray-100)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
    marginLeft: 'var(--space-2)',
  },
};

// Inject hover styles for drag handle visibility
export function injectDragHandleStyles(): void {
  if (typeof document !== 'undefined') {
    const styleId = 'course-card-drag-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        [data-drag-handle] {
          opacity: 0 !important;
        }
        div:hover > div > div > [data-drag-handle],
        div:hover > div > [data-drag-handle] {
          opacity: 1 !important;
        }
      `;
      document.head.appendChild(style);
    }
  }
}
