/**
 * GradeHistoryCard Component
 * Displays grade history entries for a course
 */

import React from 'react';
import { Card } from '../../shared';
import { formatGrade } from '../../../constants';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';

export interface GradeHistoryEntry {
  id: number;
  courseId: number;
  grade: number;
  recordedAt: string;
}

export interface GradeHistoryCardProps {
  gradeHistory: GradeHistoryEntry[];
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function GradeHistoryCard({ gradeHistory }: GradeHistoryCardProps) {
  // Don't render if there's no grade history
  if (gradeHistory.length === 0) return null;

  return (
    <Card padding="none">
      <div style={styles.cardHeader}>
        <h3 style={styles.cardTitle}>Grade History</h3>
      </div>
      <div style={styles.historyList}>
        {gradeHistory.slice(0, 10).map((entry) => (
          <div key={entry.id} style={styles.historyItem}>
            <span style={styles.historyGrade}>{formatGrade(entry.grade)}</span>
            <span style={styles.historyDate}>
              {formatShortDate(entry.recordedAt)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default GradeHistoryCard;
