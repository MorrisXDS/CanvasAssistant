/**
 * Onboarding Styles - CSS-in-JS styles for the Onboarding component
 *
 * Extracted from Onboarding.tsx for maintainability.
 * This module contains pure static style definitions.
 */

import React from 'react';

export const onboardingStyles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-app)',
    transition: 'transform 0.5s ease, opacity 0.5s ease',
  },

  containerExiting: {
    animation: 'exitSlideUp 0.5s ease forwards',
  },

  // Content styles
  contentWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-4)',
    overflow: 'hidden',
  },

  contentInner: {
    width: '100%',
    maxWidth: '360px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  // Progress bar - compact inline dots
  progressBar: {
    marginBottom: 'var(--space-4)',
  },

  progressDots: {
    display: 'flex',
    alignItems: 'center',
    gap: '0',
  },

  progressDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: 'var(--border-default)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'transparent',
    transition: 'all 0.3s ease',
    flexShrink: 0,
  },

  progressDotActive: {
    backgroundColor: 'var(--color-navy)',
    width: '14px',
    height: '14px',
  },

  progressDotCompleted: {
    backgroundColor: 'var(--color-success)',
    color: 'white',
  },

  progressLine: {
    width: '24px',
    height: '2px',
    backgroundColor: 'var(--border-default)',
    transition: 'background-color 0.3s ease',
  },

  progressLineCompleted: {
    backgroundColor: 'var(--color-success)',
  },

  content: {
    width: '100%',
    animation: 'fadeSlideUp 0.3s ease',
  },

  contentExitLeft: {
    animation: 'slideInRight 0.2s ease reverse forwards',
  },

  contentExitRight: {
    animation: 'slideInLeft 0.2s ease reverse forwards',
  },

  stepContent: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: '280px',
  },

  stepBody: {
    flex: 1,
  },

  stepFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'var(--space-5)',
    paddingTop: 'var(--space-4)',
    borderTop: '1px solid var(--border-subtle)',
  },

  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: '0 0 var(--space-1) 0',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    margin: '0 0 var(--space-5) 0',
  },

  // Form styles
  form: {
    marginBottom: 'var(--space-5)',
  },

  inputGroup: {
    marginBottom: 'var(--space-3)',
    textAlign: 'left',
  },

  label: {
    display: 'block',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-1)',
  },

  input: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  },

  helpText: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '4px',
  },

  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--color-error-bg)',
    color: 'var(--color-error)',
    borderRadius: 'var(--radius-sm)',
    marginBottom: 'var(--space-4)',
    fontSize: 'var(--text-xs)',
  },

  // Button styles
  buttonRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    justifyContent: 'center',
    marginTop: 'var(--space-5)',
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-5)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
  },

  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
  },

  skipButton: {
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    border: 'none',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
  },

  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },

  spinner: {
    animation: 'spin 1s linear infinite',
  },

  // Theme options - compact inline buttons
  themeOptions: {
    display: 'flex',
    gap: 'var(--space-2)',
    justifyContent: 'center',
    marginBottom: 'var(--space-4)',
  },

  themeOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  themeOptionSelected: {
    borderColor: 'var(--color-navy)',
    color: 'var(--color-navy)',
    backgroundColor: 'var(--color-blue-50)',
  },

  // Path/Storage styles
  pathBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
  },

  pathText: {
    flex: 1,
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },

  changeButton: {
    padding: '4px 8px',
    backgroundColor: 'transparent',
    color: 'var(--color-blue)',
    border: 'none',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
    flexShrink: 0,
  },

  // Grade selector
  gradeSelector: {
    marginBottom: 'var(--space-4)',
  },

  slider: {
    width: '100%',
    height: '4px',
    borderRadius: '2px',
    background: 'var(--border-default)',
    outline: 'none',
    cursor: 'pointer',
  },

  gradeDisplay: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },

  gradeValue: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
  },

  gradeLabel: {
    fontSize: 'var(--text-base)',
    color: 'var(--text-muted)',
  },

  // Completion screen
  completeIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto var(--space-4)',
    animation: 'celebratePulse 2s ease infinite',
  },

  completeTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: '0 0 var(--space-1) 0',
  },

  launchButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-6)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    marginTop: 'var(--space-4)',
  },
};

// =============================================================================
// CSS ANIMATIONS - Keyframe definitions for onboarding transitions
// =============================================================================

/**
 * CSS keyframe animations used by the Onboarding component.
 * Inject this string into a <style> tag in the component.
 */
export const onboardingAnimations = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes checkPop {
    0% { transform: scale(0); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes celebratePulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  @keyframes exitSlideUp {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-100%); }
  }
`;
