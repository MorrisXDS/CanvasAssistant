/**
 * Button - Consistent button component
 *
 * A reusable button component with multiple variants and sizes.
 *
 * @example
 * <Button variant="primary" onClick={handleClick}>Save</Button>
 * <Button variant="ghost" size="sm">Cancel</Button>
 * <Button variant="danger" loading>Delete</Button>
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button style variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Show loading spinner */
  loading?: boolean;
  /** Left icon */
  leftIcon?: React.ReactNode;
  /** Right icon */
  rightIcon?: React.ReactNode;
  /** Full width button */
  fullWidth?: boolean;
  /** Children (button text) */
  children: React.ReactNode;
}

// =============================================================================
// BUTTON COMPONENT
// =============================================================================

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const variantStyles = variants[variant];
  const sizeStyles = sizes[size];

  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      style={{
        ...styles.base,
        ...variantStyles,
        ...sizeStyles,
        width: fullWidth ? '100%' : 'auto',
        opacity: isDisabled ? 0.6 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <Loader2
          size={sizeStyles.iconSize}
          style={{ animation: 'spin 1s linear infinite' }}
        />
      ) : (
        leftIcon && <span style={styles.icon}>{leftIcon}</span>
      )}
      <span>{children}</span>
      {!loading && rightIcon && <span style={styles.icon}>{rightIcon}</span>}
    </button>
  );
}

// =============================================================================
// VARIANT STYLES
// =============================================================================

const variants: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
  },
  secondary: {
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: 'none',
  },
  danger: {
    backgroundColor: 'var(--color-error)',
    color: 'white',
    border: 'none',
  },
  success: {
    backgroundColor: 'var(--color-success)',
    color: 'white',
    border: 'none',
  },
};

// =============================================================================
// SIZE STYLES
// =============================================================================

const sizes: Record<ButtonSize, React.CSSProperties & { iconSize: number }> = {
  sm: {
    height: '32px',
    padding: '0 12px',
    fontSize: '13px',
    gap: '6px',
    borderRadius: 'var(--radius-md)',
    iconSize: 14,
  },
  md: {
    height: '40px',
    padding: '0 16px',
    fontSize: '14px',
    gap: '8px',
    borderRadius: 'var(--radius-md)',
    iconSize: 16,
  },
  lg: {
    height: '48px',
    padding: '0 24px',
    fontSize: '16px',
    gap: '10px',
    borderRadius: 'var(--radius-lg)',
    iconSize: 20,
  },
};

// =============================================================================
// BASE STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '500',
    transition: 'all 150ms ease',
    outline: 'none',
    whiteSpace: 'nowrap',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
  },
};

// =============================================================================
// ICON BUTTON
// =============================================================================

interface IconButtonProps extends Omit<ButtonProps, 'children' | 'leftIcon' | 'rightIcon'> {
  /** Icon to display */
  icon: React.ReactNode;
  /** Accessible label */
  'aria-label': string;
}

export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  style,
  ...props
}: IconButtonProps) {
  const sizeStyles = sizes[size];
  const dimension = parseInt(String(sizeStyles.height)) || 40;

  return (
    <Button
      variant={variant}
      size={size}
      style={{
        width: `${dimension}px`,
        padding: 0,
        ...style,
      }}
      {...props}
    >
      {icon}
    </Button>
  );
}

export default Button;
