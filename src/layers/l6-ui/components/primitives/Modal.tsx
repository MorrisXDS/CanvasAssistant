/**
 * Modal - Compound component for modals/dialogs
 *
 * A flexible, reusable modal component using the compound component pattern.
 * Provides Modal.Header, Modal.Content, and Modal.Footer sub-components
 * for consistent modal structure across the application.
 *
 * @example
 * <Modal isOpen={isOpen} onClose={onClose} size="md">
 *   <Modal.Header title="Settings" onClose={onClose} />
 *   <Modal.Content>
 *     <p>Modal content here</p>
 *   </Modal.Content>
 *   <Modal.Footer>
 *     <Button onClick={onClose}>Cancel</Button>
 *     <Button variant="primary" onClick={handleSave}>Save</Button>
 *   </Modal.Footer>
 * </Modal>
 */

import React, { useEffect, useCallback, createContext, useContext } from 'react';
import { X } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalContextValue {
  onClose?: () => void;
}

interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose?: () => void;
  /** Modal size variant */
  size?: ModalSize;
  /** Close on backdrop click (default: true) */
  closeOnBackdropClick?: boolean;
  /** Close on Escape key (default: true) */
  closeOnEscape?: boolean;
  /** Custom z-index (default: 1000) */
  zIndex?: number;
  /** Modal content */
  children: React.ReactNode;
  /** Additional className for the modal container */
  className?: string;
}

interface ModalHeaderProps {
  /** Modal title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Optional icon to display before title */
  icon?: React.ReactNode;
  /** Show close button (default: true) */
  showCloseButton?: boolean;
  /** Close handler (uses context onClose if not provided) */
  onClose?: () => void;
  /** Additional content after the title */
  children?: React.ReactNode;
}

interface ModalContentProps {
  /** Content children */
  children: React.ReactNode;
  /** Add padding (default: true) */
  padded?: boolean;
  /** Allow content to scroll (default: true) */
  scrollable?: boolean;
  /** Max height constraint */
  maxHeight?: string;
}

interface ModalFooterProps {
  /** Footer content (usually buttons) */
  children: React.ReactNode;
  /** Alignment (default: 'end') */
  align?: 'start' | 'center' | 'end' | 'between';
}

// =============================================================================
// CONTEXT
// =============================================================================

const ModalContext = createContext<ModalContextValue>({});

function useModalContext() {
  return useContext(ModalContext);
}

// =============================================================================
// SIZE CONFIG
// =============================================================================

const sizeConfig: Record<ModalSize, { width: string; maxWidth: string }> = {
  sm: { width: '100%', maxWidth: '320px' },
  md: { width: '100%', maxWidth: '480px' },
  lg: { width: '100%', maxWidth: '640px' },
  xl: { width: '100%', maxWidth: '800px' },
  full: { width: '100%', maxWidth: 'calc(100vw - 48px)' },
};

// =============================================================================
// MODAL COMPONENT
// =============================================================================

export function Modal({
  isOpen,
  onClose,
  size = 'md',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  zIndex = 1000,
  children,
  className,
}: ModalProps) {
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape && onClose) {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  // Add/remove escape key listener
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleBackdropClick = () => {
    if (closeOnBackdropClick && onClose) {
      onClose();
    }
  };

  const sizeStyles = sizeConfig[size];

  return (
    <ModalContext.Provider value={{ onClose }}>
      {/* Backdrop */}
      <div
        style={{
          ...styles.backdrop,
          zIndex,
        }}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div
        role="dialog"
        aria-modal="true"
        className={className}
        style={{
          ...styles.modal,
          width: sizeStyles.width,
          maxWidth: sizeStyles.maxWidth,
          zIndex: zIndex + 1,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </ModalContext.Provider>
  );
}

// =============================================================================
// MODAL.HEADER
// =============================================================================

function ModalHeader({
  title,
  subtitle,
  icon,
  showCloseButton = true,
  onClose,
  children,
}: ModalHeaderProps) {
  const context = useModalContext();
  const handleClose = onClose ?? context.onClose;

  return (
    <div style={styles.header}>
      <div style={styles.headerContent}>
        {icon && <div style={styles.headerIcon}>{icon}</div>}
        <div style={styles.headerText}>
          <h2 style={styles.title}>{title}</h2>
          {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
        </div>
        {children}
      </div>
      {showCloseButton && handleClose && (
        <button style={styles.closeButton} onClick={handleClose} aria-label="Close modal">
          <X size={20} />
        </button>
      )}
    </div>
  );
}

// =============================================================================
// MODAL.CONTENT
// =============================================================================

function ModalContent({
  children,
  padded = true,
  scrollable = true,
  maxHeight,
}: ModalContentProps) {
  return (
    <div
      style={{
        ...styles.content,
        padding: padded ? '0 24px' : 0,
        overflowY: scrollable ? 'auto' : 'visible',
        maxHeight: maxHeight ?? (scrollable ? 'calc(80vh - 160px)' : undefined),
      }}
    >
      {children}
    </div>
  );
}

// =============================================================================
// MODAL.FOOTER
// =============================================================================

function ModalFooter({ children, align = 'end' }: ModalFooterProps) {
  const alignMap: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
  };

  return (
    <div
      style={{
        ...styles.footer,
        justifyContent: alignMap[align],
      }}
    >
      {children}
    </div>
  );
}

// =============================================================================
// COMPOUND EXPORTS
// =============================================================================

Modal.Header = ModalHeader;
Modal.Content = ModalContent;
Modal.Footer = ModalFooter;

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(2px)',
  },

  modal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-xl)',
    boxShadow:
      '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '90vh',
    overflow: 'visible',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--border-default)',
  },

  headerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    minWidth: 0,
  },

  headerIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--color-navy)',
    flexShrink: 0,
  },

  headerText: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    margin: 0,
    lineHeight: 1.3,
  },

  subtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    margin: '4px 0 0 0',
    lineHeight: 1.4,
  },

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    border: 'none',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'transparent',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    flexShrink: 0,
    marginLeft: '8px',
  },

  content: {
    flex: 1,
    paddingTop: '16px',
    paddingBottom: '16px',
  },

  footer: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '16px 24px 20px',
    borderTop: '1px solid var(--border-default)',
  },
};

export default Modal;
