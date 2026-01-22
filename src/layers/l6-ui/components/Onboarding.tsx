/**
 * Onboarding Component
 * First-run experience for token setup
 */

import React, { useState } from 'react';
import {
  GraduationCap,
  BarChart3,
  WifiOff,
  Shield,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { Card } from './shared';

export interface OnboardingProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'token' | 'validating' | 'success' | 'error';

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token.trim()) {
      setError('Please enter your Canvas API token');
      return;
    }

    setStep('validating');
    setError(null);

    try {
      // Get API from window (exposed by preload)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api;

      // Check if running in Electron
      if (!api) {
        setError('Not running in Electron. Please run: npx electron .');
        setStep('error');
        return;
      }

      // Validate token with Canvas
      const baseUrl = 'https://utoronto.instructure.com';
      const result = await api.validateToken(token.trim(), baseUrl);

      if (result.valid) {
        // Store the credential
        await api.storeCredential(token.trim());

        // Connect to Canvas
        await api.connectCanvas(baseUrl);

        setUserName(result.user?.name ?? null);
        setStep('success');

        // Auto-proceed after success
        setTimeout(() => {
          onComplete();
        }, 2000);
      } else {
        setError(result.error || 'Invalid token. Please check and try again.');
        setStep('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setStep('error');
    }
  };

  const handleRetry = () => {
    setStep('token');
    setError(null);
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Logo */}
        <div style={styles.logo}>
          <GraduationCap size={40} color="var(--color-navy)" />
          <h1 style={styles.logoText}>Quercus Desktop</h1>
        </div>

        {/* Welcome Step */}
        {step === 'welcome' && (
          <Card padding="lg">
            <div style={styles.stepContent}>
              <h2 style={styles.stepTitle}>Welcome!</h2>
              <p style={styles.stepDescription}>
                Quercus Desktop gives you offline access to your Canvas courses,
                assignments, and grades with intelligent priority scoring.
              </p>
              <div style={styles.features}>
                <div style={styles.feature}>
                  <BarChart3 size={20} color="var(--color-blue)" />
                  <span>Smart priority scoring</span>
                </div>
                <div style={styles.feature}>
                  <WifiOff size={20} color="var(--color-blue)" />
                  <span>Works offline</span>
                </div>
                <div style={styles.feature}>
                  <Shield size={20} color="var(--color-blue)" />
                  <span>Data stays on your device</span>
                </div>
              </div>
              <button
                style={styles.primaryButton}
                onClick={() => setStep('token')}
              >
                Get Started
              </button>
            </div>
          </Card>
        )}

        {/* Token Input Step */}
        {(step === 'token' || step === 'error') && (
          <Card padding="lg">
            <form onSubmit={handleTokenSubmit} style={styles.stepContent}>
              <h2 style={styles.stepTitle}>Connect to Canvas</h2>
              <p style={styles.stepDescription}>
                Enter your Canvas API access token to sync your courses.
              </p>

              {error && (
                <div style={styles.errorBox}>
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              <div style={styles.inputGroup}>
                <label style={styles.label} htmlFor="token">
                  Access Token
                </label>
                <input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your Canvas token here..."
                  style={styles.input}
                  autoFocus
                />
              </div>

              <div style={styles.helpBox}>
                <h4 style={styles.helpTitle}>How to get your token:</h4>
                <ol style={styles.helpList}>
                  <li>Go to Canvas → Account → Settings</li>
                  <li>Scroll to &quot;Approved Integrations&quot;</li>
                  <li>Click &quot;+ New Access Token&quot;</li>
                  <li>Enter a purpose (e.g., &quot;Quercus Desktop&quot;)</li>
                  <li>Copy the generated token</li>
                </ol>
              </div>

              <div style={styles.buttonRow}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setStep('welcome')}
                >
                  Back
                </button>
                <button type="submit" style={styles.primaryButton}>
                  Connect
                </button>
              </div>
            </form>
          </Card>
        )}

        {/* Validating Step */}
        {step === 'validating' && (
          <Card padding="lg">
            <div style={styles.stepContent}>
              <div style={styles.spinnerWrapper}>
                <Loader2 size={48} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <h2 style={styles.stepTitle}>Connecting...</h2>
              <p style={styles.stepDescription}>
                Validating your token with Canvas
              </p>
            </div>
          </Card>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <Card padding="lg">
            <div style={styles.stepContent}>
              <div style={styles.successIcon}>
                <CheckCircle size={32} />
              </div>
              <h2 style={styles.stepTitle}>Connected!</h2>
              <p style={styles.stepDescription}>
                {userName ? `Welcome, ${userName}!` : 'Welcome!'} Taking you to your dashboard...
              </p>
            </div>
          </Card>
        )}

        {/* Footer */}
        <p style={styles.footer}>
          University of Toronto • Canvas Integration Dashboard
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-app)',
    padding: 'var(--space-4)',
  },

  content: {
    width: '100%',
    maxWidth: '440px',
  },

  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-6)',
  },

  logoText: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--color-navy)',
  },

  stepContent: {
    textAlign: 'center',
  },

  stepTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  stepDescription: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
    lineHeight: 'var(--leading-relaxed)',
  },

  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-6)',
    textAlign: 'left',
  },

  feature: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  inputGroup: {
    textAlign: 'left',
    marginBottom: 'var(--space-4)',
  },

  label: {
    display: 'block',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  input: {
    width: '100%',
    padding: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    transition: 'border-color var(--transition-fast)',
  },

  helpBox: {
    textAlign: 'left',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-gray-50)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
  },

  helpTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-2)',
  },

  helpList: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    paddingLeft: 'var(--space-4)',
    lineHeight: '1.8',
  },

  buttonRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    justifyContent: 'center',
  },

  primaryButton: {
    padding: 'var(--space-3) var(--space-6)',
    backgroundColor: 'var(--color-navy)',
    color: 'var(--text-inverse)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  secondaryButton: {
    padding: 'var(--space-3) var(--space-6)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-error-bg)',
    color: 'var(--color-error)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
    fontSize: 'var(--text-sm)',
    textAlign: 'left',
  },

  spinnerWrapper: {
    marginBottom: 'var(--space-4)',
    color: 'var(--color-navy)',
  },

  successIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    fontSize: '2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto var(--space-4)',
    fontWeight: 'var(--font-bold)',
  },

  footer: {
    textAlign: 'center',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: 'var(--space-6)',
  },
};

export default Onboarding;
