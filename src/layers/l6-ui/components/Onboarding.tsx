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
import {
  STORAGE_KEYS,
  settingsManager,
  DEFAULT_SYNC_PREFERENCES,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_CONTENT_SETTINGS,
} from '../../l5-presentation/settings';
import { getLetterGrade } from '../constants';
import { onboardingStyles as styles, onboardingAnimations } from './onboardingStyles';

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
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
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
      api
        .getFilesDirectory()
        .then((result: { path: string }) => {
          if (result?.path) {
            setDownloadPath(result.path);
          }
        })
        .catch(() => {
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
    settingsManager.set(STORAGE_KEYS.ACADEMIC, {
      defaultTargetGrade: targetGrade,
      termSelection: 'auto',
    });

    // Save sync preferences (use defaults with onboarding overrides)
    settingsManager.set(STORAGE_KEYS.SYNC_PREFS, {
      ...DEFAULT_SYNC_PREFERENCES,
      autoSyncEnabled: true,
      autoSyncInterval: 30,
      htmlUrlRewriting: 'local',
      downloadLinkedFiles: true,
    });

    // Save appearance settings
    settingsManager.set(STORAGE_KEYS.APPEARANCE, {
      theme,
      sidebarCollapsed: false,
    });

    // Save notification settings (use defaults)
    settingsManager.set(STORAGE_KEYS.NOTIFICATIONS, DEFAULT_NOTIFICATION_SETTINGS);

    // Save content settings (use defaults)
    settingsManager.set(STORAGE_KEYS.CONTENT, DEFAULT_CONTENT_SETTINGS);

    // Set landing page to Dashboard
    settingsManager.set(STORAGE_KEYS.LANDING_PAGE, '/');

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
    return STEPS.findIndex((s) => s.id === step);
  };

  // Navigate to step with animation
  const goToStep = useCallback(
    (newStep: Step) => {
      if (isAnimating) return;

      const currentIndex = getStepIndex(currentStep);
      const newIndex = getStepIndex(newStep);

      setDirection(newIndex > currentIndex ? 'forward' : 'backward');
      setIsAnimating(true);

      setTimeout(() => {
        setCurrentStep(newStep);
        setTimeout(() => setIsAnimating(false), 50);
      }, 200);
    },
    [currentStep, isAnimating]
  );

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
        // Save Canvas URL using settings manager (keeps cache in sync)
        settingsManager.set(STORAGE_KEYS.CANVAS_URL, baseUrl);
        setUserName(result.user?.name ?? null);
        setIsConnected(true);
        setCompletedSteps((prev) => new Set([...prev, 'connection']));
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
    setCompletedSteps((prev) => new Set([...prev, currentStep]));

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

  const currentIndex = getStepIndex(currentStep);
  const isComplete = currentStep === 'complete';

  return (
    <div
      style={{
        ...styles.container,
        ...(isExiting ? styles.containerExiting : {}),
      }}
    >
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
                <div style={styles.stepBody}>
                  <h2 style={styles.title}>Connect to Canvas</h2>
                  <p style={styles.subtitle}>
                    Enter your Canvas credentials to get started
                  </p>

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
                </div>

                <div style={styles.stepFooter}>
                  <div /> {/* Spacer for alignment */}
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
              </div>
            )}

            {/* Appearance Step */}
            {currentStep === 'appearance' && (
              <div style={styles.stepContent}>
                <div style={styles.stepBody}>
                  <h2 style={styles.title}>Theme</h2>
                  <p style={styles.subtitle}>
                    {userName ? `Welcome, ${userName}! ` : ''}Choose your preferred look
                  </p>

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
                </div>

                <div style={styles.stepFooter}>
                  <button style={styles.skipButton} onClick={handleSkipToEnd}>
                    Skip Setup
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
                <div style={styles.stepBody}>
                  <h2 style={styles.title}>Storage</h2>
                  <p style={styles.subtitle}>Where to save downloaded files</p>

                  <div style={styles.pathBox}>
                    <FolderOpen size={16} color="var(--text-muted)" />
                    <span style={styles.pathText}>
                      {downloadPath || 'Default location'}
                    </span>
                    <button style={styles.changeButton} onClick={handleSelectFolder}>
                      Change
                    </button>
                  </div>
                </div>

                <div style={styles.stepFooter}>
                  <button style={styles.secondaryButton} onClick={handleBack}>
                    <ChevronLeft size={16} />
                    Back
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
                <div style={styles.stepBody}>
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
                </div>

                <div style={styles.stepFooter}>
                  <button style={styles.secondaryButton} onClick={handleBack}>
                    <ChevronLeft size={16} />
                    Back
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

      {/* CSS Animations - imported from onboardingStyles.ts */}
      <style>{onboardingAnimations}</style>
    </div>
  );
}

// Styles imported from ./onboardingStyles.ts

export default Onboarding;
