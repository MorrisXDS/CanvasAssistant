/**
 * WelcomeGuide Styles - CSS-in-JS styles for the WelcomeGuide component
 *
 * Follows the same extraction pattern as onboardingStyles.ts.
 * Reuses CSS variables from the app theme.
 */

import React from 'react';

import { Z_INDEX } from '../constants';

export const welcomeGuideStyles: Record<string, React.CSSProperties> = {
  // Full-page overlay
  container: {
    position: 'fixed',
    inset: 0,
    zIndex: Z_INDEX.overlayChrome,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-app)',
    animation: 'wgFadeIn 0.3s ease',
  },

  containerExiting: {
    animation: 'wgFadeOut 0.3s ease forwards',
  },

  // Content centering
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
    maxWidth: '480px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  // Progress dots
  progressBar: {
    marginBottom: 'var(--space-4)',
  },

  progressDots: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },

  progressDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--border-default)',
    transition: 'all 0.3s ease',
    flexShrink: 0,
  },

  progressDotActive: {
    backgroundColor: 'var(--color-navy)',
    width: '10px',
    height: '10px',
  },

  progressDotCompleted: {
    backgroundColor: 'var(--color-navy)',
    opacity: 0.5,
  },

  // Step content area with animation
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
    minHeight: '340px',
  },

  stepBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  // Step icon
  stepIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '14px',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto var(--space-4)',
  },

  // Typography
  stepTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: '0 0 var(--space-3) 0',
  },

  stepDescription: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    lineHeight: '1.6',
    margin: '0',
    maxWidth: '400px',
  },

  // 3-column footer grid (matches onboarding)
  footer: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    width: '100%',
    marginTop: 'auto',
    paddingTop: 'var(--space-4)',
    borderTop: '1px solid var(--border-subtle)',
  },

  footerLeft: {
    justifySelf: 'start',
  },

  footerCenter: {
    justifySelf: 'center',
  },

  footerRight: {
    justifySelf: 'end',
  },

  // Step counter
  stepCounter: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },
};

// =============================================================================
// CSS ANIMATIONS
// =============================================================================

export const welcomeGuideAnimations = `
  @keyframes wgFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes wgFadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-30px); }
    to { opacity: 1; transform: translateX(0); }
  }
`;
