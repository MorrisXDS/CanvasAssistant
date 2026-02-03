/**
 * CalendarWeekView Component
 * Weekly calendar grid with task cards
 */

import React from 'react';
import type { Task, Course } from '../../../l5-presentation/types';
import { getCourseColor } from '../../constants';
import { styles } from './CalendarPage.styles';
import { DAYS, isSameDay } from './CalendarPageUtils';

export interface CalendarWeekViewProps {
  weekDays: Date[];
  today: Date;
  tasksByDate: Map<string, Task[]>;
  courseMap: Map<number, Course>;
}

export function CalendarWeekView({
  weekDays,
  today,
  tasksByDate,
  courseMap,
}: CalendarWeekViewProps) {
  return (
    <div style={styles.weekGrid}>
      {/* Day headers with dates */}
      {weekDays.map((date, index) => {
        const isToday = isSameDay(date, today);
        return (
          <div
            key={index}
            style={{
              ...styles.weekDayHeader,
              backgroundColor: isToday ? 'var(--color-navy-light)' : 'transparent',
            }}
          >
            <span style={styles.weekDayName}>{DAYS[date.getDay()]}</span>
            <span
              style={{
                ...styles.weekDayNumber,
                color: isToday ? 'var(--color-navy)' : 'var(--text-primary)',
                fontWeight: isToday ? 'var(--font-bold)' : 'var(--font-medium)',
              }}
            >
              {date.getDate()}
            </span>
          </div>
        );
      })}

      {/* Week day columns */}
      {weekDays.map((date, index) => {
        const isToday = isSameDay(date, today);
        const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const dayTasks = tasksByDate.get(dateKey) || [];

        return (
          <div
            key={index}
            style={{
              ...styles.weekDayColumn,
              backgroundColor: isToday ? 'var(--color-navy-light)' : 'transparent',
            }}
          >
            {dayTasks.map((task) => {
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
              return (
                <div
                  key={task.id}
                  style={{
                    ...styles.weekTaskCard,
                    borderLeftColor: color,
                  }}
                  title={task.title}
                >
                  {time && <span style={styles.weekTaskTime}>{time}</span>}
                  <span style={styles.weekTaskTitle}>{task.title}</span>
                  {course && (
                    <span style={styles.weekTaskCourse}>
                      {course.code.split(' ')[0]}
                    </span>
                  )}
                </div>
              );
            })}
            {dayTasks.length === 0 && (
              <div style={styles.weekNoTasks}>No tasks</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default CalendarWeekView;
