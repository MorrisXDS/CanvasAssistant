/**
 * Rich Text Editor Styles
 * CSS-in-JS styles for TipTap editor
 */

import type React from 'react';

export const editorStyles: Record<string, React.CSSProperties> = {
  container: {
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    overflow: 'hidden',
  },
  containerFocused: {
    borderColor: 'var(--color-blue)',
    boxShadow: '0 0 0 2px var(--color-blue-light)',
  },
  containerDisabled: {
    opacity: 0.6,
    pointerEvents: 'none' as const,
    backgroundColor: 'var(--color-gray-50)',
  },
  toolbar: {
    display: 'flex',
    gap: 'var(--space-1)',
    padding: 'var(--space-2)',
    borderBottom: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-app)',
    flexWrap: 'wrap' as const,
  },
  toolbarButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },
  toolbarButtonActive: {
    backgroundColor: 'var(--color-navy)',
    color: 'white',
  },
  toolbarButtonHover: {
    backgroundColor: 'var(--bg-card-hover)',
  },
  toolbarDivider: {
    width: '1px',
    height: '20px',
    backgroundColor: 'var(--border-default)',
    margin: '0 var(--space-1)',
    alignSelf: 'center' as const,
  },
  editorContent: {
    padding: 'var(--space-3)',
    outline: 'none',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--leading-relaxed)',
    color: 'var(--text-primary)',
  },
  linkInput: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2)',
    borderTop: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-app)',
  },
  linkInputField: {
    flex: 1,
    padding: 'var(--space-2)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  linkInputButton: {
    padding: 'var(--space-2) var(--space-3)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },
  linkInputConfirm: {
    backgroundColor: 'var(--color-navy)',
    color: 'white',
  },
  linkInputCancel: {
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
  },
};

// Prosemirror content styles - injected into document
export const prosemirrorStyles = `
.ProseMirror {
  outline: none;
}

.ProseMirror p {
  margin-bottom: var(--space-3);
}

.ProseMirror p:last-child {
  margin-bottom: 0;
}

.ProseMirror strong {
  font-weight: var(--font-semibold);
}

.ProseMirror em {
  font-style: italic;
}

.ProseMirror a {
  color: var(--color-blue);
  text-decoration: underline;
  cursor: pointer;
}

.ProseMirror ul,
.ProseMirror ol {
  padding-left: var(--space-6);
  margin-bottom: var(--space-3);
}

.ProseMirror li {
  margin-bottom: var(--space-1);
}

.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
  pointer-events: none;
  float: left;
  height: 0;
}
`;
