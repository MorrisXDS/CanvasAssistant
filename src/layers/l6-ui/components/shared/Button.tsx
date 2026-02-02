/**
 * Button Component
 * Unified button with variants for consistent UI
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    borderRadius: 'var(--radius-md)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    border: 'none',
    outline: 'none',
  },
  // Sizes
  sm: {
    padding: 'var(--space-1) var(--space-2)',
    fontSize: 'var(--text-xs)',
    height: '28px',
  },
  md: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    height: '36px',
  },
  lg: {
    padding: 'var(--space-3) var(--space-5)',
    fontSize: 'var(--text-base)',
    height: '44px',
  },
  // Variants
  primary: {
    backgroundColor: 'var(--color-navy)',
    color: 'white',
  },
  secondary: {
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
  },
  danger: {
    backgroundColor: 'var(--color-error)',
    color: 'white',
  },
  success: {
    backgroundColor: 'var(--color-success)',
    color: 'white',
  },
  // States
  disabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  fullWidth: {
    width: '100%',
  },
  iconOnly: {
    padding: 'var(--space-2)',
    aspectRatio: '1',
  },
};

const hoverStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: { backgroundColor: 'var(--color-navy-light)' },
  secondary: {
    backgroundColor: 'var(--bg-card-hover)',
    borderColor: 'var(--color-navy)',
  },
  ghost: { backgroundColor: 'var(--bg-app)' },
  danger: { opacity: 0.9 },
  success: { opacity: 0.9 },
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  disabled,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  ...props
}: ButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !loading) {
      setIsHovered(true);
    }
    onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsHovered(false);
    onMouseLeave?.(e);
  };

  const buttonStyle: React.CSSProperties = {
    ...styles.base,
    ...styles[size],
    ...styles[variant],
    ...(disabled || loading ? styles.disabled : {}),
    ...(fullWidth ? styles.fullWidth : {}),
    ...(!children && icon ? styles.iconOnly : {}),
    ...(isHovered && !disabled && !loading ? hoverStyles[variant] : {}),
    ...style,
  };

  const iconElement = loading ? (
    <Loader2
      size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16}
      style={{ animation: 'spin 1s linear infinite' }}
    />
  ) : (
    icon
  );

  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={buttonStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {iconElement && iconPosition === 'left' && iconElement}
      {children}
      {iconElement && iconPosition === 'right' && iconElement}
    </button>
  );
}

export default Button;
