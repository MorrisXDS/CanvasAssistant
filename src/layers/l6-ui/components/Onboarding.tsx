/**
 * Onboarding Component
 * First-run experience for token setup and initial configuration
 */

import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  BarChart3,
  WifiOff,
  Shield,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Settings,
  BookOpen,
  Target,
  RefreshCw,
} from 'lucide-react';
import { Card } from './shared';

export interface OnboardingProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'token' | 'validating' | 'success' | 'config-academic' | 'config-sync' | 'error';

interface CourseForSetup {
  id: number;
  code: string;
  name: string;
  color: string | null;
}

// Storage keys for settings (same as SettingsModal)
const STORAGE_KEYS = {
  SYNC_PREFS: 'syncPreferences',
  ACADEMIC: 'academicSettings',
};

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [token, setToken] = useState('');
  const [canvasUrl, setCanvasUrl] = useState('https://utoronto.instructure.com');
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  // Configuration state
  const [targetGrade, setTargetGrade] = useState(80);
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState(30);

  // Save settings to localStorage
  const saveSettings = () => {
    // Save academic settings
    localStorage.setItem(STORAGE_KEYS.ACADEMIC, JSON.stringify({
      defaultTargetGrade: targetGrade,
      termSelection: 'auto',
    }));

    // Save sync preferences
    localStorage.setItem(STORAGE_KEYS.SYNC_PREFS, JSON.stringify({
      autoSyncEnabled: autoSync,
      autoSyncInterval: syncInterval,
      syncFiles: true,
      syncAnnouncements: true,
      saveHtmlContent: true,
      htmlUrlRewriting: 'local',
      downloadImages: true,
      downloadLinkedFiles: true,
    }));
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canvasUrl.trim()) {
      setError('Please enter your Canvas URL');
      return;
    }

    if (!token.trim()) {
      setError('Please enter your Canvas API token');
      return;
    }

    // Normalize URL
    let baseUrl = canvasUrl.trim();
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }
    // Remove trailing slash
    baseUrl = baseUrl.replace(/\/+$/, '');

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
      const result = await api.validateToken(token.trim(), baseUrl);

      if (result.valid) {
        // Store the credential
        await api.storeCredential(token.trim());

        // Connect to Canvas
        await api.connectCanvas(baseUrl);

        setUserName(result.user?.name ?? null);
        setStep('success');

        // Proceed to configuration after brief delay
        setTimeout(() => {
          setStep('config-academic');
        }, 1500);
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

  const handleSkipConfig = () => {
    saveSettings();
    onComplete();
  };

  const handleNextStep = () => {
    if (step === 'config-academic') {
      setStep('config-sync');
    } else if (step === 'config-sync') {
      saveSettings();
      onComplete();
    }
  };

  const handlePrevStep = () => {
    if (step === 'config-sync') {
      setStep('config-academic');
    }
  };

  // Get current step number for progress indicator
  const getStepNumber = () => {
    if (step === 'config-academic') return 1;
    if (step === 'config-sync') return 2;
    return 0;
  };

  const totalConfigSteps = 2;

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
                <label style={styles.label} htmlFor="canvasUrl">
                  Canvas URL
                </label>
                <input
                  id="canvasUrl"
                  type="text"
                  value={canvasUrl}
                  onChange={(e) => setCanvasUrl(e.target.value)}
                  placeholder="e.g., canvas.university.edu"
                  style={styles.input}
                  autoFocus
                />
                <span style={styles.inputHint}>
                  Your institution&apos;s Canvas website address
                </span>
              </div>

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
                {userName ? `Welcome, ${userName}!` : 'Welcome!'} Let&apos;s set up a few things...
              </p>
            </div>
          </Card>
        )}

        {/* Academic Settings Step */}
        {step === 'config-academic' && (
          <Card padding="lg">
            <div style={styles.stepContent}>
              <div style={styles.configHeader}>
                <div style={styles.configIcon}>
                  <Target size={24} color="var(--color-navy)" />
                </div>
                <div style={styles.stepProgress}>
                  Step {getStepNumber()} of {totalConfigSteps}
                </div>
              </div>
              <h2 style={styles.stepTitle}>Set Your Target Grade</h2>
              <p style={styles.stepDescription}>
                This helps prioritize your assignments based on your goals.
                You can change this per-course later.
              </p>

              <div style={styles.gradeSliderContainer}>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={targetGrade}
                  onChange={(e) => setTargetGrade(Number(e.target.value))}
                  style={styles.slider}
                />
                <div style={styles.gradeDisplay}>
                  <span style={styles.gradeValue}>{targetGrade}%</span>
                  <span style={styles.gradeLabel}>
                    {targetGrade >= 90 ? 'A+' : targetGrade >= 85 ? 'A' : targetGrade >= 80 ? 'A-' : targetGrade >= 77 ? 'B+' : targetGrade >= 73 ? 'B' : targetGrade >= 70 ? 'B-' : targetGrade >= 67 ? 'C+' : targetGrade >= 63 ? 'C' : 'C-'}
                  </span>
                </div>
              </div>

              <div style={styles.buttonRow}>
                <button
                  type="button"
                  style={styles.skipButton}
                  onClick={handleSkipConfig}
                >
                  Skip Setup
                </button>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={handleNextStep}
                >
                  Continue
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Sync Settings Step */}
        {step === 'config-sync' && (
          <Card padding="lg">
            <div style={styles.stepContent}>
              <div style={styles.configHeader}>
                <div style={styles.configIcon}>
                  <RefreshCw size={24} color="var(--color-navy)" />
                </div>
                <div style={styles.stepProgress}>
                  Step {getStepNumber()} of {totalConfigSteps}
                </div>
              </div>
              <h2 style={styles.stepTitle}>Auto-Sync Preferences</h2>
              <p style={styles.stepDescription}>
                Keep your data up to date automatically in the background.
              </p>

              <div style={styles.toggleContainer}>
                <div style={styles.toggleRow}>
                  <div style={styles.toggleText}>
                    <span style={styles.toggleLabel}>Enable Auto-Sync</span>
                    <span style={styles.toggleDesc}>Sync data automatically</span>
                  </div>
                  <button
                    type="button"
                    style={{
                      ...styles.toggleSwitch,
                      backgroundColor: autoSync ? 'var(--color-navy)' : 'var(--color-gray-300)',
                    }}
                    onClick={() => setAutoSync(!autoSync)}
                  >
                    <div
                      style={{
                        ...styles.toggleKnob,
                        transform: autoSync ? 'translateX(20px)' : 'translateX(0)',
                      }}
                    />
                  </button>
                </div>

                {autoSync && (
                  <div style={styles.intervalSelector}>
                    <label style={styles.intervalLabel}>Sync every:</label>
                    <select
                      value={syncInterval}
                      onChange={(e) => setSyncInterval(Number(e.target.value))}
                      style={styles.select}
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </div>
                )}
              </div>

              <div style={styles.recommendedNote}>
                <Settings size={14} />
                <span>You can adjust these and more in Settings anytime.</span>
              </div>

              <div style={styles.buttonRow}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={handlePrevStep}
                >
                  Back
                </button>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={handleNextStep}
                >
                  <CheckCircle size={16} />
                  Finish Setup
                </button>
              </div>
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

  inputHint: {
    display: 'block',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: 'var(--space-1)',
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
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
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

  // Configuration steps styles
  configHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-4)',
  },

  configIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-blue-50)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepProgress: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    fontWeight: 'var(--font-medium)',
  },

  gradeSliderContainer: {
    marginBottom: 'var(--space-6)',
  },

  slider: {
    width: '100%',
    height: '8px',
    borderRadius: '4px',
    background: 'linear-gradient(to right, var(--color-gray-200), var(--color-blue), var(--color-navy))',
    outline: 'none',
    cursor: 'pointer',
  },

  gradeDisplay: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-3)',
  },

  gradeValue: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--color-navy)',
  },

  gradeLabel: {
    fontSize: 'var(--text-lg)',
    color: 'var(--text-secondary)',
  },

  toggleContainer: {
    marginBottom: 'var(--space-4)',
    textAlign: 'left',
  },

  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-2)',
  },

  toggleText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  toggleLabel: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  toggleDesc: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  toggleSwitch: {
    position: 'relative',
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  toggleKnob: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    transition: 'transform var(--transition-fast)',
  },

  intervalSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
  },

  intervalLabel: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  select: {
    flex: 1,
    padding: 'var(--space-2)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
  },

  recommendedNote: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-4)',
  },

  skipButton: {
    padding: 'var(--space-3) var(--space-6)',
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },
};

export default Onboarding;
