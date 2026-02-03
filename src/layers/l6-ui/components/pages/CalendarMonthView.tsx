/**
 * CalendarMonthView Component
 * Monthly calendar grid with task indicators
 */

import React from 'react';
import type { Task, Course } from '../../../l5-presentation/types';
import { getCourseColor } from '../../constants';
import { styles } from './CalendarPage.styles';
import { DAYS, isSameDay } from './CalendarPageUtils';

export interface CalendarMonthViewProps {
  calendarDays: Date[];
  currentDate: Date;
  today: Date;
  tasksByDate: Map<string, Task[]>;
  courseMap: Map<number, Course>;
}

export function CalendarMonthView({
  calendarDays,
  currentDate,
  today,
  tasksByDate,
  courseMap,
}: CalendarMonthViewProps) {
  return (
    <div style={styles.calendarGrid}>
      {/* Day headers */}
      {DAYS.map((day) => (
        <div key={day} style={styles.dayHeader}>
          {day}
        </div>
      ))}

      {/* Calendar days */}
      {calendarDays.map((date, index) => {
        const isCurrentMonth = date.getMonth() === currentDate.getMonth();
        const isToday = isSameDay(date, today);
        const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const dayTasks = tasksByDate.get(dateKey) || [];

        return (
          <div
            key={index}
            style={{
              ...styles.calendarDay,
              backgroundColor: isToday ? 'var(--color-navy-light)' : 'transparent',
              opacity: isCurrentMonth ? 1 : 0.4,
            }}
          >
            <div
              style={{
                ...styles.dayNumber,
                color: isToday ? 'var(--color-navy)' : 'var(--text-primary)',
                fontWeight: isToday ? 'var(--font-bold)' : 'var(--font-medium)',
              }}
            >
              {date.getDate()}
            </div>
            <div style={styles.dayTasks}>
              {dayTasks.slice(0, 3).map((task) => {
                const course = courseMap.get(task.courseId);
                const color = course
                  ? getCourseColor(course.id, course.color)
                  : 'var(--text-muted)';
                const time = task.dueAt
                  ? new Date(task.dueAt).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : '';
                // Truncate title for display (short for calendar cells)
                const maxLen = 12;
                const displayTitle =
                  task.title.length > maxLen
                    ? task.title.substring(0, maxLen).trim() + '…'
                    : task.title;
                return (
                  <div
                    key={task.id}
                    style={{
                      ...styles.taskPill,
                      backgroundColor: color,
                    }}
                    title={`${task.title}${time ? ` - ${time}` : ''}`}
                  >
                    {time && <span style={styles.taskTime}>{time}</span>}
                    <span style={styles.taskPillText}>{displayTitle}</span>
                  </div>
                );
              })}
              {dayTasks.length > 3 && (
                <div style={styles.moreTasksIndicator}>
                  +{dayTasks.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CalendarMonthView;
