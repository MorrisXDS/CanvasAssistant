/**
 * FormField - Form input wrapper with label and error handling
 *
 * A consistent wrapper for form inputs that provides:
 * - Label with optional icon
 * - Help text
 * - Error message display
 * - Required indicator
 *
 * @example
 * <FormField label="Email" icon={<Mail />} error={errors.email} required>
 *   <input type="email" value={email} onChange={...} />
 * </FormField>
 */

import React from 'react';

// =============================================================================
// TYPES
// =============================================================================

interface FormFieldProps {
  /** Field label */
  label: string;
  /** Optional icon to display with label */
  icon?: React.ReactNode;
  /** Help text shown below the input */
  helpText?: string;
  /** Error message (shows error state when set) */
  error?: string;
  /** Mark field as required */
  required?: boolean;
  /** Disable the field */
  disabled?: boolean;
  /** Hide the label visually (still accessible) */
  hideLabel?: boolean;
  /** Input element(s) */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
  /** Layout direction (default: 'vertical') */
  layout?: 'vertical' | 'horizontal';
}

// =============================================================================
// FORM FIELD COMPONENT
// =============================================================================

export function FormField({
  label,
  icon,
  helpText,
  error,
  required = false,
  disabled = false,
  hideLabel = false,
  children,
  className,
  layout = 'vertical',
}: FormFieldProps) {
  const hasError = Boolean(error);

  return (
    <div
      className={className}
      style={{
        ...styles.container,
        opacity: disabled ? 0.5 : 1,
        flexDirection: layout === 'horizontal' ? 'row' : 'column',
        alignItems: layout === 'horizontal' ? 'center' : 'stretch',
      }}
    >
      {/* Label */}
      <label
        style={{
          ...styles.label,
          ...(hideLabel ? styles.visuallyHidden : {}),
          marginBottom: layout === 'horizontal' ? 0 : '6px',
          marginRight: layout === 'horizontal' ? '12px' : 0,
          minWidth: layout === 'horizontal' ? '120px' : undefined,
        }}
      >
        {icon && <span style={styles.labelIcon}>{icon}</span>}
        <span style={styles.labelText}>{label}</span>
        {required && <span style={styles.required}>*</span>}
      </label>

      {/* Input wrapper */}
      <div style={styles.inputWrapper}>
        {children}
      </div>

      {/* Help text or error */}
      {(helpText || error) && (
        <div
          style={{
            ...styles.helpText,
            color: hasError ? 'var(--color-error)' : 'var(--text-tertiary)',
            marginLeft: layout === 'horizontal' ? '132px' : 0,
          }}
        >
          {error || helpText}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    width: '100%',
  },

  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  labelIcon: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text-tertiary)',
  },

  labelText: {
    flex: 1,
  },

  required: {
    color: 'var(--color-error)',
    marginLeft: '2px',
  },

  inputWrapper: {
    flex: 1,
  },

  helpText: {
    fontSize: '12px',
    marginTop: '4px',
    lineHeight: 1.4,
  },

  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
};

// =============================================================================
// SUB-COMPONENTS: TextInput, Select, etc.
// =============================================================================

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show error state */
  hasError?: boolean;
  /** Left icon/element */
  leftElement?: React.ReactNode;
  /** Right icon/element */
  rightElement?: React.ReactNode;
}

export function TextInput({
  size = 'md',
  hasError = false,
  leftElement,
  rightElement,
  className,
  style,
  ...props
}: TextInputProps) {
  const sizeStyles = inputSizes[size];

  return (
    <div style={inputStyles.wrapper}>
      {leftElement && <div style={inputStyles.leftElement}>{leftElement}</div>}
      <input
        className={className}
        style={{
          ...inputStyles.input,
          ...sizeStyles,
          paddingLeft: leftElement ? '36px' : sizeStyles.paddingLeft,
          paddingRight: rightElement ? '36px' : sizeStyles.paddingRight,
          borderColor: hasError ? 'var(--color-error)' : 'var(--border-default)',
          ...style,
        }}
        {...props}
      />
      {rightElement && <div style={inputStyles.rightElement}>{rightElement}</div>}
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Show error state */
  hasError?: boolean;
  /** Minimum rows */
  minRows?: number;
}

export function TextArea({
  hasError = false,
  minRows = 3,
  className,
  style,
  ...props
}: TextAreaProps) {
  return (
    <textarea
      className={className}
      style={{
        ...inputStyles.input,
        ...inputStyles.textarea,
        minHeight: `${minRows * 24 + 16}px`,
        borderColor: hasError ? 'var(--color-error)' : 'var(--border-default)',
        ...style,
      }}
      {...props}
    />
  );
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Select size variant */
  inputSize?: 'sm' | 'md' | 'lg';
  /** Show error state */
  hasError?: boolean;
  /** Options array */
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
}

export function Select({
  inputSize = 'md',
  hasError = false,
  options,
  children,
  className,
  style,
  ...props
}: SelectProps) {
  const sizeStyles = inputSizes[inputSize];

  return (
    <select
      className={className}
      style={{
        ...inputStyles.input,
        ...inputStyles.select,
        ...sizeStyles,
        borderColor: hasError ? 'var(--color-error)' : 'var(--border-default)',
        ...style,
      }}
      {...props}
    >
      {options
        ? options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))
        : children}
    </select>
  );
}

// =============================================================================
// INPUT STYLES
// =============================================================================

const inputSizes = {
  sm: {
    height: '32px',
    fontSize: '13px',
    paddingLeft: '10px',
    paddingRight: '10px',
  },
  md: {
    height: '40px',
    fontSize: '14px',
    paddingLeft: '12px',
    paddingRight: '12px',
  },
  lg: {
    height: '48px',
    fontSize: '16px',
    paddingLeft: '16px',
    paddingRight: '16px',
  },
};

const inputStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },

  input: {
    width: '100%',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    outline: 'none',
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
  },

  textarea: {
    resize: 'vertical',
    padding: '8px 12px',
    lineHeight: 1.5,
  },

  select: {
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: '40px',
    cursor: 'pointer',
  },

  leftElement: {
    position: 'absolute',
    left: '12px',
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text-tertiary)',
    pointerEvents: 'none',
  },

  rightElement: {
    position: 'absolute',
    right: '12px',
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text-tertiary)',
  },
};

export default FormField;
