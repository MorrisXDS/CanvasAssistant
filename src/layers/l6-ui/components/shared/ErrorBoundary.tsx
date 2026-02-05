/**
 * ErrorBoundary - Catches React errors and displays a fallback UI
 *
 * Prevents the entire app from crashing when a component throws an error.
 * Shows error details in development for debugging.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.hash = '#/';
    window.location.reload();
  };

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <div style={styles.iconContainer}>
              <AlertTriangle size={48} style={{ color: 'var(--color-error, #ef4444)' }} />
            </div>
            <h1 style={styles.title}>Something went wrong</h1>
            <p style={styles.message}>
              An error occurred while rendering this page. You can try refreshing or go
              back to the dashboard.
            </p>

            {/* Error details (development) */}
            {this.state.error && (
              <div style={styles.errorDetails}>
                <div style={styles.errorName}>
                  {this.state.error.name}: {this.state.error.message}
                </div>
                {this.state.errorInfo?.componentStack && (
                  <pre style={styles.stackTrace}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div style={styles.actions}>
              <button style={styles.primaryButton} onClick={this.handleRetry}>
                <RefreshCw size={16} />
                Try Again
              </button>
              <button style={styles.secondaryButton} onClick={this.handleGoHome}>
                <Home size={16} />
                Go to Dashboard
              </button>
              <button style={styles.secondaryButton} onClick={this.handleReload}>
                <RefreshCw size={16} />
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 'var(--space-4, 16px)',
    backgroundColor: 'var(--bg-app, #f3f4f6)',
  },
  content: {
    maxWidth: '500px',
    width: '100%',
    textAlign: 'center',
    padding: 'var(--space-6, 24px)',
    backgroundColor: 'var(--bg-card, white)',
    borderRadius: 'var(--radius-lg, 12px)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
  },
  iconContainer: {
    marginBottom: 'var(--space-4, 16px)',
  },
  title: {
    fontSize: 'var(--text-xl, 20px)',
    fontWeight: 'var(--font-bold, 700)',
    color: 'var(--text-primary, #111827)',
    margin: '0 0 var(--space-2, 8px) 0',
  },
  message: {
    fontSize: 'var(--text-sm, 14px)',
    color: 'var(--text-secondary, #6b7280)',
    margin: '0 0 var(--space-4, 16px) 0',
    lineHeight: 1.5,
  },
  errorDetails: {
    backgroundColor: 'var(--bg-secondary, #f9fafb)',
    borderRadius: 'var(--radius-md, 8px)',
    padding: 'var(--space-3, 12px)',
    marginBottom: 'var(--space-4, 16px)',
    textAlign: 'left',
    border: '1px solid var(--border-default, #e5e7eb)',
  },
  errorName: {
    fontSize: 'var(--text-sm, 14px)',
    fontWeight: 'var(--font-semibold, 600)',
    color: 'var(--color-error, #ef4444)',
    marginBottom: 'var(--space-2, 8px)',
    wordBreak: 'break-word',
  },
  stackTrace: {
    fontSize: 'var(--text-xs, 12px)',
    color: 'var(--text-tertiary, #9ca3af)',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '200px',
    overflow: 'auto',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2, 8px)',
  },
  primaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2, 8px)',
    padding: 'var(--space-3, 12px) var(--space-4, 16px)',
    backgroundColor: 'var(--color-primary, #3b82f6)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md, 8px)',
    fontSize: 'var(--text-sm, 14px)',
    fontWeight: 'var(--font-medium, 500)',
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },
  secondaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2, 8px)',
    padding: 'var(--space-3, 12px) var(--space-4, 16px)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary, #6b7280)',
    border: '1px solid var(--border-default, #e5e7eb)',
    borderRadius: 'var(--radius-md, 8px)',
    fontSize: 'var(--text-sm, 14px)',
    fontWeight: 'var(--font-medium, 500)',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
};

export default ErrorBoundary;
