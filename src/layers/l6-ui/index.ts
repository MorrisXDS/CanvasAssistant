/**
 * L6 UI Layer - React Components
 */

export { default as App } from './App';
export { Layout } from './components/Layout';
export { Onboarding } from './components/Onboarding';

// Shared components
export { Card, Badge } from './components/shared';
export type { CardProps, BadgeProps, BadgeVariant } from './components/shared';

// Dashboard components
export {
  Dashboard,
  QuickStats,
  HealthIndicator,
  PriorityList,
  NotificationsFeed,
} from './components/Dashboard';

// Pages
export { CalendarPage, CoursesPage, FilesPage } from './components/pages';
