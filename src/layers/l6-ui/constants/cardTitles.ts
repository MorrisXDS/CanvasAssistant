/**
 * Card Titles - Centralized dashboard and page section titles
 *
 * This module contains all user-facing strings for card and section titles.
 * Centralizing these strings makes it easier to:
 * - Maintain consistency across the application
 * - Update copy in one place
 * - Prepare for future internationalization (i18n)
 */

export const CARD_TITLES = {
  // Dashboard card titles
  dashboard: {
    importantWorks: 'Important Works',
    announcements: 'Announcements',
    todaySchedule: "Today's Schedule",
    upcomingCoursework: 'Upcoming Coursework',
    insights: 'Insights',
    priorityTasks: 'Priority Tasks',
    recommendations: 'Recommendations',
    myCourses: 'My Courses',
  },

  // Course detail sections
  course: {
    overview: 'Overview',
    assignments: 'Assignments',
    grades: 'Grades',
    files: 'Files',
    announcements: 'Announcements',
    syllabus: 'Syllabus',
    policies: 'Policies',
  },

  // Calendar sections
  calendar: {
    events: 'Events',
    deadlines: 'Deadlines',
    schedule: 'Schedule',
  },

  // Settings sections
  settings: {
    title: 'Settings',
    account: 'Account & Connection',
    display: 'Display & Layout',
    academic: 'Academic & Courses',
    notifications: 'Notifications',
    data: 'Data Management',
  },
} as const;

// Type helper for accessing card titles
export type CardTitles = typeof CARD_TITLES;
