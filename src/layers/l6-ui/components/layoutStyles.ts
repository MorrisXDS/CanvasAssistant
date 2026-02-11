/**
 * Layout Component Styles
 * Extracted from Layout.tsx for maintainability
 */

import type React from 'react';

export const TITLE_BAR_HEIGHT = 32;

export const layoutStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    minHeight: `calc(100vh - ${TITLE_BAR_HEIGHT}px)`,
    height: `calc(100vh - ${TITLE_BAR_HEIGHT}px)`,
    marginTop: `${TITLE_BAR_HEIGHT}px`,
    overflow: 'hidden',
    backgroundColor: 'var(--bg-app)',
  },

  // Sidebar - extends full height; no app-region set so the TitleBar's
  // drag region (z-9999) works unobstructed over the top padding area
  sidebar: {
    backgroundColor: 'var(--bg-sidebar)',
    color: 'var(--text-inverse)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    paddingTop: `${TITLE_BAR_HEIGHT}px`,
    zIndex: 100,
    transition: 'width 250ms cubic-bezier(0.33, 1, 0.68, 1)',
    overflow: 'hidden',
    minWidth: 64, // Prevent sidebar from shrinking below minimum
    userSelect: 'none', // Prevent text selection on double-click
  },

  profileSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    paddingLeft: '12px', // Fixed left padding to keep avatar position stable
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    minHeight: '72px',
    overflow: 'hidden',
  },

  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
    border: '2px solid rgba(255, 255, 255, 0.2)',
  },

  avatarPlaceholder: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: 'rgba(255, 255, 255, 0.6)',
  },

  profileInfo: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  userName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-inverse)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  userEmail: {
    fontSize: 'var(--text-xs)',
    color: 'rgba(255, 255, 255, 0.5)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  profileDropdown: {
    position: 'absolute',
    top: '100%',
    left: 'var(--space-2)',
    right: 'var(--space-2)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    padding: 'var(--space-2)',
    zIndex: 500,
    marginTop: 'var(--space-1)',
  },

  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  nav: {
    flex: 1,
    padding: 'var(--space-4) 0',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    // Remove gap - use borders for separation like right panel cards
  },

  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-5)',
    color: 'rgba(255, 255, 255, 0.7)',
    textDecoration: 'none',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
    boxShadow: 'inset 3px 0 0 transparent',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },

  navLinkActive: {
    color: 'var(--text-inverse)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    boxShadow: 'inset 3px 0 0 var(--color-blue)',
  },

  dragHandle: {
    color: 'rgba(255, 255, 255, 0.3)',
    flexShrink: 0,
    marginRight: 'var(--space-1)',
    transition: 'color var(--transition-fast)',
  },

  collapseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    margin: '0 auto var(--space-2)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  sidebarFooter: {
    padding: 'var(--space-3) var(--space-4)',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  syncStatusCentered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
  },

  syncText: {
    fontSize: 'var(--text-xs)',
    color: 'rgba(255, 255, 255, 0.6)',
  },

  // Main content - fills available space and scales with viewport
  main: {
    flex: 1,
    backgroundColor: 'var(--bg-app)',
    height: `calc(100vh - ${TITLE_BAR_HEIGHT}px)`,
    padding: 'var(--space-4) var(--space-6) var(--space-6) var(--space-6)',
    overflowY: 'scroll',
    overflowX: 'hidden',
    transition: 'margin-left 250ms cubic-bezier(0.33, 1, 0.68, 1)',
    display: 'flex',
    flexDirection: 'column',
  } as React.CSSProperties,
};
