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
import { Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Modal } from '../primitives/Modal';

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
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        size="md"
        zIndex={1400}
      >
        <Modal.Header title={title} onClose={() => setShowModal(false)} />
        <Modal.Content>{details}</Modal.Content>
        <Modal.Footer align="end">
          <button style={styles.closeBtn} onClick={() => setShowModal(false)}>
            Got it
          </button>
        </Modal.Footer>
      </Modal>
    </>
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
