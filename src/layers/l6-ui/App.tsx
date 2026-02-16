/**
 * App Component
 * Root component with routing and auth state management
 */

import React, { useEffect, useState, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

import { useStore, subscribeToIpcEvents } from '../l5-presentation/store';
import {
  settingsManager,
  STORAGE_KEYS,
  type AppearanceSettings,
  type FileExplorerSettings,
  DEFAULT_APPEARANCE_SETTINGS,
} from '../l5-presentation/settings';
import { Layout } from './components/Layout';
import { ReAuthModal } from './components/shared/ReAuthModal';
import { RecoveryBanner, type RecoveryStatus } from './components/shared/RecoveryBanner';
import {
  CorruptionDialog,
  type CorruptionInfo,
} from './components/shared/CorruptionDialog';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

// Lazy load Dashboard, Onboarding, and WelcomeGuide
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const Onboarding = lazy(() => import('./components/Onboarding'));
const WelcomeGuide = lazy(() => import('./components/WelcomeGuide'));

// Lazy load heavy page components for code-splitting
const AnnouncementDetail = lazy(() => import('./components/pages/AnnouncementDetail'));
const AnnouncementsPage = lazy(() => import('./components/pages/AnnouncementsPage'));
const CalendarPage = lazy(() => import('./components/Calendar'));
const CourseDetail = lazy(() => import('./components/pages/CourseDetail'));
const CoursesPage = lazy(() => import('./components/pages/CoursesPage'));
const FilesPage = lazy(() => import('./components/pages/FilesPage'));
const SettingsPage = lazy(() => import('./components/pages/SettingsPage'));
const TasksPage = lazy(() => import('./components/pages/TasksPage'));
const UpdatesPage = lazy(() => import('./components/pages/UpdatesPage'));

import './styles/global.css';

// ============ Settings Preload ============
// Apply saved settings immediately on app load (before React renders)

function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

function initializeSettings() {
  // Initialize settings manager
  settingsManager.initialize();

  // Apply theme immediately
  const appearance = settingsManager.get(STORAGE_KEYS.APPEARANCE) as
    | AppearanceSettings
    | undefined;
  const theme = appearance?.theme ?? DEFAULT_APPEARANCE_SETTINGS.theme;
  applyTheme(theme);

  // Note: System theme change listener is set up in useSystemThemeListener()
  // to ensure proper cleanup and avoid memory leaks

  // Restore custom download location if saved
  const fileSettings = settingsManager.get(STORAGE_KEYS.FILE_EXPLORER) as
    | FileExplorerSettings
    | undefined;
  if (fileSettings?.downloadLocation) {
    // Async restore - don't block startup
    window.api?.setFilesDirectory?.(fileSettings.downloadLocation).catch((err: Error) => {
      console.warn('[App] Failed to restore download location:', err);
    });
  }
}

// Initialize settings immediately (before React renders)
initializeSettings();

/**
 * Hook to listen for system theme changes with proper cleanup
 */
function useSystemThemeListener() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const currentAppearance = settingsManager.get(STORAGE_KEYS.APPEARANCE) as
        | AppearanceSettings
        | undefined;
      if (!currentAppearance?.theme || currentAppearance.theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
}

/**
 * Loading Screen (full page - for initial app load)
 */
function LoadingScreen() {
  return (
    <div style={styles.loadingContainer}>
      <div style={styles.loadingContent}>
        <span style={styles.loadingIcon}>🎓</span>
        <span style={styles.loadingText}>Loading...</span>
      </div>
    </div>
  );
}

/**
 * Main App with auth routing
 */
function AppContent() {
  const {
    isInitialized,
    isAuthenticated,
    authError,
    initialize,
    setAuthenticated,
    clearAuthError,
    refreshAll,
  } = useStore();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Recovery and corruption state
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus | null>(null);
  const [corruptionInfo, setCorruptionInfo] = useState<CorruptionInfo | null>(null);

  // Welcome guide state - show once after first onboarding
  const [onboardingCompleted, setOnboardingCompleted] = useState(
    () => settingsManager.get(STORAGE_KEYS.ONBOARDING_COMPLETED) === true
  );

  // Listen for system theme changes with proper cleanup
  useSystemThemeListener();

  useEffect(() => {
    // Initialize store (checks auth, loads data)
    const init = async () => {
      await initialize();
      setIsCheckingAuth(false);

      // Check for recovery status on startup
      try {
        const status = await window.api?.getRecoveryStatus?.();
        if (status && (status.safeMode || status.lastCrash)) {
          setRecoveryStatus(status);
        }
      } catch {
        // Ignore errors
      }
    };
    init();

    // Subscribe to IPC events from main process
    const unsubscribe = subscribeToIpcEvents();

    // Listen for recovery status updates
    const unsubscribeRecovery = window.api?.onRecoveryStatus?.((status) => {
      if (status.safeMode || status.lastCrash) {
        setRecoveryStatus(status);
      } else {
        setRecoveryStatus(null);
      }
    });

    // Listen for database corruption
    const unsubscribeCorruption = window.api?.onDatabaseCorruption?.((info) => {
      setCorruptionInfo(info);
    });

    // Listen for shutdown notification
    const unsubscribeShutdown = window.api?.onShutdownRequested?.(() => {
      // Acknowledge shutdown immediately
      window.api?.acknowledgeShutdown?.();
    });

    return () => {
      unsubscribe();
      unsubscribeRecovery?.();
      unsubscribeCorruption?.();
      unsubscribeShutdown?.();
    };
  }, [initialize]);

  // Handle onboarding completion
  const handleOnboardingComplete = async () => {
    setAuthenticated(true);
    await refreshAll();
  };

  // Handle successful re-authentication
  const handleReauthSuccess = async () => {
    clearAuthError();
    await refreshAll();
  };

  // Handle disconnect from re-auth modal
  const handleReauthDisconnect = () => {
    clearAuthError();
    setAuthenticated(false);
  };

  // Handle recovery banner dismissal
  const handleRecoveryDismiss = async () => {
    try {
      await window.api?.dismissCrashNotification?.();
    } catch {
      // Ignore errors
    }
    setRecoveryStatus(null);
  };

  // Handle exit safe mode
  const handleExitSafeMode = async () => {
    try {
      await window.api?.exitSafeMode?.();
      setRecoveryStatus(null);
    } catch {
      // Ignore errors
    }
  };

  // Handle corruption action
  const handleCorruptionAction = async (action: 'reset' | 'continue' | 'export') => {
    if (!window.api?.handleCorruption) {
      return { success: false, error: 'API not available' };
    }
    const result = await window.api.handleCorruption(action);
    if (result.success && action === 'continue') {
      setCorruptionInfo(null);
    }
    return result;
  };

  // Handle corruption dialog close
  const handleCorruptionClose = () => {
    setCorruptionInfo(null);
  };

  // Show loading while checking auth
  if (!isInitialized || isCheckingAuth) {
    return <LoadingScreen />;
  }

  // Show onboarding if not authenticated
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Onboarding onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  // Show welcome guide before dashboard on first launch
  if (!onboardingCompleted) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <WelcomeGuide
          onComplete={() => {
            settingsManager.set(STORAGE_KEYS.ONBOARDING_COMPLETED, true);
            setOnboardingCompleted(true);
          }}
        />
      </Suspense>
    );
  }

  // Show main app with modals and overlays
  return (
    <>
      {/* Database corruption dialog - highest priority */}
      {corruptionInfo && (
        <CorruptionDialog
          corruption={corruptionInfo}
          onAction={handleCorruptionAction}
          onClose={handleCorruptionClose}
        />
      )}

      {/* Re-auth modal */}
      {authError && (
        <ReAuthModal
          reason={authError.reason}
          onReauthSuccess={handleReauthSuccess}
          onDisconnect={handleReauthDisconnect}
        />
      )}

      {/* Recovery banner at top */}
      {recoveryStatus && (
        <RecoveryBanner
          status={recoveryStatus}
          onDismiss={handleRecoveryDismiss}
          onExitSafeMode={handleExitSafeMode}
        />
      )}

      <ErrorBoundary>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/announcement/:id" element={<AnnouncementDetail />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/course/:id" element={<CourseDetail />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/updates" element={<UpdatesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </>
  );
}

/**
 * App wrapper with Router
 */
export default function App() {
  // HashRouter is required for Electron's file:// protocol in production
  // BrowserRouter only works with http:// URLs (dev server)
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-app)',
  },

  loadingContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-4)',
  },

  loadingIcon: {
    fontSize: '3rem',
    animation: 'pulse 1.5s ease-in-out infinite',
  },

  loadingText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },
};
