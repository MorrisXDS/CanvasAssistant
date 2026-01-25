/**
 * Onboarding Component
 * First-run experience with horizontal stepper and smooth animations
 *
 * Steps:
 * 1: Connection - Canvas URL + API token
 * 2: Appearance - Theme selection
 * 3: Storage - Download location
 * 4: Notifications - Alert preferences
 * 5: Academic - Target grade
 * 6: Sync - Auto-sync preferences
 * 7: Congratulations - Success screen with slide-out
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Target,
  Sun,
  Moon,
  Monitor,
  FolderOpen,
  Palette,
  Check,
  Sparkles,
  Rocket,
  LucideIcon,
} from 'lucide-react';

export interface OnboardingProps {
  onComplete: () => void;
}

type Step = 'connection' | 'appearance' | 'storage' | 'academic' | 'complete';

const STEPS: { id: Step; label: string; icon: LucideIcon }[] = [
  { id: 'connection', label: 'Connect', icon: GraduationCap },
  { id: 'appearance', label: 'Theme', icon: Palette },
  { id: 'storage', label: 'Files', icon: FolderOpen },
  { id: 'academic', label: 'Goal', icon: Target },
];

// Storage keys for settings (same as SettingsModal)
const STORAGE_KEYS = {
  SYNC_PREFS: 'syncPreferences',
  ACADEMIC: 'academicSettings',
  APPEARANCE: 'appearanceSettings',
  NOTIFICATIONS: 'notificationSettings',
  FILE_EXPLORER: 'fileExplorerSettings',
  CONTENT: 'contentSettings',
  LANDING_PAGE: 'landingPage',
};

export function Onboarding({ onComplete }: OnboardingProps) {
  // Step management
  const [currentStep, setCurrentStep] = useState<Step>('connection');
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [isAnimating, setIsAnimating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Connection state
  const [token, setToken] = useState('');
  const [canvasUrl, setCanvasUrl] = useState('https://q.utoronto.ca');
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Appearance settings
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  // Storage settings
  const [downloadPath, setDownloadPath] = useState<string>('');

  // Academic settings
  const [targetGrade, setTargetGrade] = useState(85);

  // Prevent page refresh during setup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent F5, Ctrl+R, Cmd+R
      if (
        e.key === 'F5' ||
        ((e.ctrlKey || e.metaKey) && e.key === 'r')
      ) {
        e.preventDefault();
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Load current download path on mount
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).api;
    if (api?.getFilesDirectory) {
      api.getFilesDirectory().then((result: { path: string }) => {
        if (result?.path) {
          setDownloadPath(result.path);
        }
      }).catch(() => {
        // Ignore errors
      });
    }
  }, []);

  // Apply theme immediately when changed
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // Save all settings
  const saveAllSettings = useCallback(async () => {
    // Save academic settings
    localStorage.setItem(STORAGE_KEYS.ACADEMIC, JSON.stringify({
      defaultTargetGrade: targetGrade,
      termSelection: 'auto',
    }));

    // Save sync preferences (defaults)
    localStorage.setItem(STORAGE_KEYS.SYNC_PREFS, JSON.stringify({
      autoSyncEnabled: true,
      autoSyncInterval: 30,
      syncFiles: true,
      syncAnnouncements: true,
      saveHtmlContent: true,
      htmlUrlRewriting: 'local',
      downloadImages: true,
      downloadLinkedFiles: true,
    }));

    // Save appearance settings
    localStorage.setItem(STORAGE_KEYS.APPEARANCE, JSON.stringify({
      theme,
      sidebarCollapsed: false,
    }));

    // Save notification settings (defaults)
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify({
      enabled: true,
      priorityAlerts: true,
      syncStatus: true,
      dueDateReminders: true,
      gradeAlerts: true,
      workloadPredictions: true,
      riskWarnings: true,
      quietWhenUnplugged: false,
      quietWhenFullscreen: false,
      quietWhenBusy: false,
    }));

    // Save content settings
    localStorage.setItem(STORAGE_KEYS.CONTENT, JSON.stringify({
      linkBehavior: 'always-external',
    }));

    // Set landing page to Dashboard
    localStorage.setItem(STORAGE_KEYS.LANDING_PAGE, '/');

    // Propagate settings via IPC
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api;
      if (api?.setDefaultTargetGrade) {
        await api.setDefaultTargetGrade(targetGrade);
      }
      if (api?.setAutoSyncPreferences) {
        await api.setAutoSyncPreferences({
          autoSyncEnabled: true,
          autoSyncInterval: 30,
        });
      }
    } catch (error) {
      console.error('[Onboarding] Failed to propagate settings via IPC:', error);
    }
  }, [targetGrade, theme]);

  // Get step index
  const getStepIndex = (step: Step): number => {
    if (step === 'complete') return STEPS.length;
    return STEPS.findIndex(s => s.id === step);
  };

  // Navigate to step with animation
  const goToStep = useCallback((newStep: Step) => {
    if (isAnimating) return;

    const currentIndex = getStepIndex(currentStep);
    const newIndex = getStepIndex(newStep);

    setDirection(newIndex > currentIndex ? 'forward' : 'backward');
    setIsAnimating(true);

    setTimeout(() => {
      setCurrentStep(newStep);
      setTimeout(() => setIsAnimating(false), 50);
    }, 200);
  }, [currentStep, isAnimating]);

  // Handle token validation
  const handleConnect = async () => {
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
    baseUrl = baseUrl.replace(/\/+$/, '');

    setIsValidating(true);
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api;

      if (!api) {
        setError('Not running in Electron. Please run: npx electron .');
        setIsValidating(false);
        return;
      }

      const result = await api.validateToken(token.trim(), baseUrl);

      if (result.valid) {
        await api.storeCredential(token.trim());
        await api.connectCanvas(baseUrl);
        // Save Canvas URL to localStorage
        localStorage.setItem('canvasUrl', baseUrl);
        setUserName(result.user?.name ?? null);
        setIsConnected(true);
        setCompletedSteps(prev => new Set([...prev, 'connection']));
        goToStep('appearance');
      } else {
        setError(result.error || 'Invalid token. Please check and try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsValidating(false);
    }
  };

  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (window as any).api;
      if (api?.selectFilesDirectory) {
        const result = await api.selectFilesDirectory();
        if (result?.success && result?.data?.path) {
          await api.setFilesDirectory(result.data.path);
          setDownloadPath(result.data.path);
        }
      }
    } catch (error) {
      console.error('[Onboarding] Failed to select directory:', error);
    }
  };

  // Navigation handlers
  const handleNext = async () => {
    setCompletedSteps(prev => new Set([...prev, currentStep]));

    const currentIndex = getStepIndex(currentStep);
    if (currentIndex < STEPS.length - 1) {
      goToStep(STEPS[currentIndex + 1].id);
    } else {
      // Last step - save and show completion
      await saveAllSettings();
      goToStep('complete');
    }
  };

  const handleBack = () => {
    const currentIndex = getStepIndex(currentStep);
    if (currentIndex > 0) {
      // Don't go back past connection if connected
      if (currentIndex === 1 && isConnected) return;
      goToStep(STEPS[currentIndex - 1].id);
    }
  };

  const handleSkipToEnd = async () => {
    await saveAllSettings();
    goToStep('complete');
  };

  const handleFinish = () => {
    // Set hash immediately so it's ready when routes render after animation
    window.location.hash = '#/';
    setIsExiting(true);
    setTimeout(() => {
      onComplete();
    }, 600);
  };

  // Letter grade helper (UofT grading scale)
  const getLetterGrade = (grade: number) => {
    if (grade >= 90) return 'A+';
    if (grade >= 85) return 'A';
    if (grade >= 80) return 'A-';
    if (grade >= 77) return 'B+';
    if (grade >= 73) return 'B';
    if (grade >= 70) return 'B-';
    if (grade >= 67) return 'C+';
    if (grade >= 63) return 'C';
    if (grade >= 60) return 'C-';
    if (grade >= 57) return 'D+';
    if (grade >= 53) return 'D';
    if (grade >= 50) return 'D-';
    return 'F';
  };

  const currentIndex = getStepIndex(currentStep);
  const isComplete = currentStep === 'complete';

  return (
    <div style={{
      ...styles.container,
      ...(isExiting ? styles.containerExiting : {}),
    }}>
      {/* Main Content Area */}
      <div style={styles.contentWrapper}>
        <div style={styles.contentInner}>
          {/* Progress Bar - above content */}
          {!isComplete && (
            <div style={styles.progressBar}>
              <div style={styles.progressDots}>
                {STEPS.map((step, idx) => {
                  const isActive = idx === currentIndex;
                  const isCompleted = completedSteps.has(step.id);
                  return (
                    <React.Fragment key={step.id}>
                      <div
                        style={{
                          ...styles.progressDot,
                          ...(isCompleted ? styles.progressDotCompleted : {}),
                          ...(isActive ? styles.progressDotActive : {}),
                        }}
                        title={step.label}
                      >
                        {isCompleted && <Check size={8} />}
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div
                          style={{
                            ...styles.progressLine,
                            ...(isCompleted ? styles.progressLineCompleted : {}),
                          }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step Content */}
          <div
            style={{
              ...styles.content,
              ...(isAnimating && direction === 'forward' ? styles.contentExitLeft : {}),
              ...(isAnimating && direction === 'backward' ? styles.contentExitRight : {}),
            }}
          >
          {/* Connection Step */}
          {currentStep === 'connection' && (
            <div style={styles.stepContent}>
              <h2 style={styles.title}>Connect to Canvas</h2>
              <p style={styles.subtitle}>Enter your Canvas credentials to get started</p>

              {error && (
                <div style={styles.errorBox}>
                  <AlertTriangle size={14} />
                  <span>{error}</span>
                </div>
              )}

              <div style={styles.form}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>Canvas URL</label>
                  <input
                    type="text"
                    value={canvasUrl}
                    onChange={(e) => setCanvasUrl(e.target.value)}
                    placeholder="e.g., canvas.university.edu"
                    style={styles.input}
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>Access Token</label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste your Canvas token here..."
                    style={styles.input}
                  />
                  <div style={styles.helpText}>
                    Canvas → Account → Settings → New Access Token
                  </div>
                </div>
              </div>

              <button
                style={{
                  ...styles.primaryButton,
                  ...(isValidating ? styles.buttonDisabled : {}),
                }}
                onClick={handleConnect}
                disabled={isValidating}
              >
                {isValidating ? (
                  <>
                    <Loader2 size={16} style={styles.spinner} />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Appearance Step */}
          {currentStep === 'appearance' && (
            <div style={styles.stepContent}>
              <h2 style={styles.title}>Theme</h2>
              <p style={styles.subtitle}>{userName ? `Welcome, ${userName}! ` : ''}Choose your preferred look</p>

              <div style={styles.themeOptions}>
                {[
                  { value: 'light' as const, icon: Sun, label: 'Light' },
                  { value: 'dark' as const, icon: Moon, label: 'Dark' },
                  { value: 'system' as const, icon: Monitor, label: 'Auto' },
                ].map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    style={{
                      ...styles.themeOption,
                      ...(theme === value ? styles.themeOptionSelected : {}),
                    }}
                    onClick={() => setTheme(value)}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div style={styles.buttonRow}>
                <button style={styles.skipButton} onClick={handleSkipToEnd}>
                  Skip
                </button>
                <button style={styles.primaryButton} onClick={handleNext}>
                  Continue
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Storage Step */}
          {currentStep === 'storage' && (
            <div style={styles.stepContent}>
              <h2 style={styles.title}>Storage</h2>
              <p style={styles.subtitle}>Where to save downloaded files</p>

              <div style={styles.pathBox}>
                <FolderOpen size={16} color="var(--text-muted)" />
                <span style={styles.pathText}>{downloadPath || 'Default location'}</span>
                <button style={styles.changeButton} onClick={handleSelectFolder}>
                  Change
                </button>
              </div>

              <div style={styles.buttonRow}>
                <button style={styles.secondaryButton} onClick={handleBack}>
                  <ChevronLeft size={16} />
                </button>
                <button style={styles.primaryButton} onClick={handleNext}>
                  Continue
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Academic Step */}
          {currentStep === 'academic' && (
            <div style={styles.stepContent}>
              <h2 style={styles.title}>Target Grade</h2>
              <p style={styles.subtitle}>Set your default grade goal</p>

              <div style={styles.gradeSelector}>
                <div style={styles.gradeDisplay}>
                  <span style={styles.gradeValue}>{targetGrade}%</span>
                  <span style={styles.gradeLabel}>{getLetterGrade(targetGrade)}</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="1"
                  value={targetGrade}
                  onChange={(e) => setTargetGrade(Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      setTargetGrade((prev) => Math.min(100, prev + 1));
                    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      setTargetGrade((prev) => Math.max(50, prev - 1));
                    }
                  }}
                  style={styles.slider}
                />
              </div>

              <div style={styles.buttonRow}>
                <button style={styles.secondaryButton} onClick={handleBack}>
                  <ChevronLeft size={16} />
                </button>
                <button style={styles.primaryButton} onClick={handleNext}>
                  Finish
                  <Check size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Completion Screen */}
          {currentStep === 'complete' && (
            <div style={styles.stepContent}>
              <div style={styles.completeIcon}>
                <Sparkles size={32} />
              </div>
              <h2 style={styles.completeTitle}>All Set!</h2>
              <p style={styles.subtitle}>Your setup is complete</p>

              <button style={styles.launchButton} onClick={handleFinish}>
                <Rocket size={16} />
                Open Dashboard
              </button>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
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
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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

export default Onboarding;
