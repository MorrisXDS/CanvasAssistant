/**
 * App Component
 * Root component with routing and auth state management
 */

import React, { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import { useStore, subscribeToIpcEvents } from '../l5-presentation/store';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Onboarding } from './components/Onboarding';
import { AnnouncementDetail, AnnouncementsPage, CalendarPage, CourseDetail, CoursesPage, FilesPage, TasksPage } from './components/pages';

import './styles/global.css';

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
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
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
