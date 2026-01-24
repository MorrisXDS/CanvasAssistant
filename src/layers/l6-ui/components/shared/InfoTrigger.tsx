/**
 * InfoTrigger - Universal Contextual Disclosure Pattern
 *
 * Provides two levels of information disclosure:
 * - Level 1 (Hover): Quick tooltip with summary text
 * - Level 2 (Click): Full modal with detailed information
 *
 * Use this component to add contextual help to any complex UI element.
 */

import React, { useState, useRef, useEffect, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface InfoTriggerProps {
  /** Brief summary shown on hover (1 sentence) */
  summary: string;
  /** Modal title when clicked */
  title: string;
  /** Detailed content shown in modal */
  details: ReactNode;
  /** Icon size */
  size?: 'sm' | 'md';
  /** Tooltip position relative to trigger */
  position?: 'top' | 'right' | 'bottom' | 'left';
}

export function InfoTrigger({
  summary,
  title,
  details,
  size = 'sm',
  position = 'top',
}: InfoTriggerProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const iconSize = size === 'sm' ? 14 : 18;

  // Calculate tooltip position
  useEffect(() => {
    if (showTooltip && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const padding = 8;

      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = rect.top - padding;
          left = rect.left + rect.width / 2;
          break;
        case 'bottom':
          top = rect.bottom + padding;
          left = rect.left + rect.width / 2;
          break;
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - padding;
          break;
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + padding;
          break;
      }

      setTooltipPosition({ top, left });
    }
  }, [showTooltip, position]);

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        style={styles.trigger}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => {
          e.stopPropagation();
          setShowModal(true);
          setShowTooltip(false);
        }}
        aria-label={summary}
        title={summary}
      >
        <Info size={iconSize} />
      </button>

      {/* Tooltip (Level 1 - Hover) */}
      {showTooltip &&
        createPortal(
          <div
            style={{
              ...styles.tooltip,
              ...getTooltipPositionStyles(position),
              top: tooltipPosition.top,
              left: tooltipPosition.left,
            }}
          >
            {summary}
          </div>,
          document.body
        )}

      {/* Modal (Level 2 - Click) */}
      {showModal &&
        createPortal(
          <InfoModal title={title} onClose={() => setShowModal(false)}>
            {details}
          </InfoModal>,
          document.body
        )}
    </>
  );
}

/**
 * InfoModal - Internal modal component for detailed information
 */
interface InfoModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

function InfoModal({ title, children, onClose }: InfoModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{title}</h3>
          <button style={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.modalContent}>{children}</div>

        {/* Footer */}
        <div style={styles.modalFooter}>
          <button style={styles.closeBtn} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function getTooltipPositionStyles(
  position: 'top' | 'right' | 'bottom' | 'left'
): React.CSSProperties {
  switch (position) {
    case 'top':
      return { transform: 'translate(-50%, -100%)' };
    case 'bottom':
      return { transform: 'translate(-50%, 0)' };
    case 'left':
      return { transform: 'translate(-100%, -50%)' };
    case 'right':
      return { transform: 'translate(0, -50%)' };
  }
}

const styles: Record<string, React.CSSProperties> = {
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'color var(--transition-fast)',
  },

  tooltip: {
    position: 'fixed',
    zIndex: 9999,
    maxWidth: '250px',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-gray-800)',
    color: 'white',
    fontSize: 'var(--text-xs)',
    lineHeight: 'var(--leading-relaxed)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    pointerEvents: 'none',
  },

  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: 'var(--space-4)',
  },

  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    maxWidth: '500px',
    width: '100%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--border-default)',
  },

  modalTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  modalContent: {
    flex: 1,
    padding: 'var(--space-5)',
    overflow: 'auto',
    fontSize: 'var(--text-sm)',
    lineHeight: 'var(--leading-relaxed)',
    color: 'var(--text-secondary)',
  },

  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: 'var(--space-4) var(--space-5)',
    borderTop: '1px solid var(--border-default)',
  },

  closeBtn: {
    padding: 'var(--space-2) var(--space-5)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },
};

export default InfoTrigger;
