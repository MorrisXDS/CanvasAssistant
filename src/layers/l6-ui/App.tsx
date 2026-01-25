/**
 * App Component
 * Root component with routing and auth state management
 */

import React, { useEffect, useState } from 'react';
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
import { Dashboard } from './components/Dashboard';
import { Onboarding } from './components/Onboarding';
import { ReAuthModal } from './components/shared/ReAuthModal';
import {
  AnnouncementDetail,
  AnnouncementsPage,
  CalendarPage,
  CourseDetail,
  CoursesPage,
  FilesPage,
  SettingsPage,
  TasksPage,
} from './components/pages';

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
 * Loading Screen
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

  // Listen for system theme changes with proper cleanup
  useSystemThemeListener();

  useEffect(() => {
    // Initialize store (checks auth, loads data)
    const init = async () => {
      await initialize();
      setIsCheckingAuth(false);
    };
    init();

    // Subscribe to IPC events from main process
    const unsubscribe = subscribeToIpcEvents();
    return unsubscribe;
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

  // Show loading while checking auth
  if (!isInitialized || isCheckingAuth) {
    return <LoadingScreen />;
  }

  // Show onboarding if not authenticated
  if (!isAuthenticated) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // Show main app with ReAuthModal overlay if auth error
  return (
    <>
      {authError && (
        <ReAuthModal
          reason={authError.reason}
          onReauthSuccess={handleReauthSuccess}
          onDisconnect={handleReauthDisconnect}
        />
      )}
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
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
