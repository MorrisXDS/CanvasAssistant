/**
 * SearchInput - Search input with clear button
 *
 * A styled search input component with debounced search, clear button,
 * and loading state indicator.
 *
 * @example
 * <SearchInput
 *   value={search}
 *   onChange={setSearch}
 *   placeholder="Search settings..."
 * />
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface SearchInputProps {
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Debounce delay in ms (0 = no debounce) */
  debounce?: number;
  /** Loading state */
  loading?: boolean;
  /** Auto focus on mount */
  autoFocus?: boolean;
  /** Additional styles */
  style?: React.CSSProperties;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

// =============================================================================
// SIZE CONFIG
// =============================================================================

const sizeConfig = {
  sm: {
    height: '32px',
    fontSize: '13px',
    iconSize: 14,
    padding: '0 var(--space-2) 0 var(--space-8)',
  },
  md: {
    height: '40px',
    fontSize: '14px',
    iconSize: 16,
    padding: '0 var(--space-3) 0 var(--space-10)',
  },
  lg: {
    height: '48px',
    fontSize: '16px',
    iconSize: 18,
    padding: '0 var(--space-4) 0 var(--space-12)',
  },
};

// =============================================================================
// SEARCH INPUT COMPONENT
// =============================================================================

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  debounce = 0,
  loading = false,
  autoFocus = false,
  style,
  size = 'md',
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced onChange
  const handleChange = useCallback(
    (newValue: string) => {
      setLocalValue(newValue);

      if (debounce > 0) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          onChange(newValue);
        }, debounce);
      } else {
        onChange(newValue);
      }
    },
    [onChange, debounce]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Auto focus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleClear = () => {
    setLocalValue('');
    onChange('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && localValue) {
      e.preventDefault();
      handleClear();
    }
  };

  const sizeStyles = sizeConfig[size];

  return (
    <div style={{ ...styles.container, ...style }}>
      <Search
        size={sizeStyles.iconSize}
        style={{
          ...styles.searchIcon,
          left: size === 'sm' ? 8 : size === 'lg' ? 16 : 12,
        }}
      />
      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          ...styles.input,
          height: sizeStyles.height,
          fontSize: sizeStyles.fontSize,
          padding: sizeStyles.padding,
          paddingRight: localValue || loading ? '40px' : 'var(--space-3)',
        }}
      />
      {(localValue || loading) && (
        <button
          type="button"
          onClick={loading ? undefined : handleClear}
          style={{
            ...styles.clearButton,
            cursor: loading ? 'default' : 'pointer',
          }}
          aria-label={loading ? 'Searching' : 'Clear search'}
          disabled={loading}
        >
          {loading ? (
            <Loader2
              size={sizeStyles.iconSize}
              style={{ animation: 'spin 1s linear infinite' }}
            />
          ) : (
            <X size={sizeStyles.iconSize} />
          )}
        </button>
      )}
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
  },

  searchIcon: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-tertiary)',
    pointerEvents: 'none',
  },

  input: {
    width: '100%',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
  },

  clearButton: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'transparent',
    color: 'var(--text-tertiary)',
    transition: 'color 150ms ease, background-color 150ms ease',
  },
};

export default SearchInput;
