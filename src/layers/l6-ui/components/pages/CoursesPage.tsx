/**
 * Courses Page
 * Course list and detail view
 */

import React from 'react';
import { BookOpen } from 'lucide-react';
import { useStore } from '../../../l5-presentation/store';
import { Card, Badge } from '../shared';

export function CoursesPage() {
  const { courses } = useStore();

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Courses</h1>
        <p style={styles.subtitle}>
          {courses.length} active course{courses.length !== 1 ? 's' : ''}
        </p>
      </header>

      {courses.length === 0 ? (
        <Card padding="lg">
          <div style={styles.emptyState}>
            <BookOpen size={64} color="var(--color-navy)" style={{ marginBottom: 'var(--space-4)' }} />
            <h2 style={styles.emptyTitle}>No Courses Found</h2>
            <p style={styles.emptyText}>
              Sync with Canvas to load your enrolled courses.
            </p>
          </div>
        </Card>
      ) : (
        <div style={styles.grid}>
          {courses.map((course) => (
            <Card key={course.id} padding="md">
              <div style={styles.courseCard}>
                <div style={styles.courseHeader}>
                  <span style={styles.courseCode}>{course.code}</span>
                  {course.currentGrade !== null && (
                    <Badge
                      variant={
                        course.currentGrade >= course.targetGrade
                          ? 'success'
                          : course.currentGrade >= course.targetGrade - 10
                          ? 'medium'
                          : 'high'
                      }
                    >
                      {course.currentGrade.toFixed(1)}%
                    </Badge>
                  )}
                </div>
                <h3 style={styles.courseName}>
                  {course.nickname || course.name}
                </h3>
                <div style={styles.courseStats}>
                  <div style={styles.statItem}>
                    <span style={styles.statLabel}>Target</span>
                    <span style={styles.statValue}>{course.targetGrade}%</span>
                  </div>
                  {course.assessedGrade !== null && (
                    <div style={styles.statItem}>
                      <span style={styles.statLabel}>Assessed</span>
                      <span style={styles.statValue}>
                        {course.assessedGrade.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
                {course.lastSyncedAt && (
                  <div style={styles.syncTime}>
                    Last synced: {new Date(course.lastSyncedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '1200px',
    margin: '0 auto',
  },

  header: {
    marginBottom: 'var(--space-6)',
  },

  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 'var(--space-4)',
  },

  courseCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  courseHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  courseCode: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--color-navy)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  courseName: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    lineHeight: 'var(--leading-tight)',
  },

  courseStats: {
    display: 'flex',
    gap: 'var(--space-4)',
    marginTop: 'var(--space-2)',
  },

  statItem: {
    display: 'flex',
    flexDirection: 'column',
  },

  statLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  statValue: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  syncTime: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: 'var(--space-2)',
    paddingTop: 'var(--space-2)',
    borderTop: '1px solid var(--border-light)',
  },

  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-10)',
  },

  emptyIcon: {
    fontSize: '4rem',
    display: 'block',
    marginBottom: 'var(--space-4)',
  },

  emptyTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  emptyText: {
    color: 'var(--text-secondary)',
  },
};

export default CoursesPage;
