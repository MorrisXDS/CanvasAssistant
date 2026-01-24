/**
 * App Component
 * Root component with routing and auth state management
 */

import React, { useEffect, useState } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import { useStore, subscribeToIpcEvents } from '../l5-presentation/store';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Onboarding } from './components/Onboarding';
import { AnnouncementDetail, AnnouncementsPage, CalendarPage, CourseDetail, CoursesPage, FilesPage, SettingsPage, TasksPage } from './components/pages';

import './styles/global.css';

// ============ Settings Preload ============
// Apply saved settings immediately on app load

const STORAGE_KEYS = {
  APPEARANCE: 'appearanceSettings',
  FILE_EXPLORER: 'fileExplorerSettings',
};

interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
}

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
  // Load and apply appearance settings
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.APPEARANCE);
    if (stored) {
      const appearance: AppearanceSettings = JSON.parse(stored);
      applyTheme(appearance.theme || 'system');
    } else {
      applyTheme('system');
    }
  } catch {
    applyTheme('system');
  }

  // Listen for system theme changes if using 'system' theme
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.APPEARANCE);
      if (stored) {
        const appearance: AppearanceSettings = JSON.parse(stored);
        if (appearance.theme === 'system') {
          applyTheme('system');
        }
      } else {
        applyTheme('system');
      }
    } catch {
      applyTheme('system');
    }
  });

  // Restore custom download location if saved
  try {
    const fileSettings = localStorage.getItem(STORAGE_KEYS.FILE_EXPLORER);
    if (fileSettings) {
      const parsed = JSON.parse(fileSettings);
      if (parsed.downloadLocation) {
        // Async restore - don't block startup
        window.api?.setFilesDirectory?.(parsed.downloadLocation).catch((err: Error) => {
          console.warn('[App] Failed to restore download location:', err);
        });
      }
    }
  } catch {
    // Ignore errors in download location restoration
  }
}

// Initialize settings immediately (before React renders)
initializeSettings();

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
  const { isInitialized, isAuthenticated, initialize, setAuthenticated, refreshAll } =
    useStore();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

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

  // Show loading while checking auth
  if (!isInitialized || isCheckingAuth) {
    return <LoadingScreen />;
  }

  // Show onboarding if not authenticated
  if (!isAuthenticated) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // Show main app
  return (
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
