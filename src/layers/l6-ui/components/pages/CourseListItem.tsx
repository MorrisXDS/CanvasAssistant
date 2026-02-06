/**
 * Course List Item Component
 * Row component for displaying a course in list view
 */

import React from 'react';
import { Pin, PinOff, Eye, EyeOff, ChevronRight } from 'lucide-react';
import { ColorPickerPopup } from '../primitives';
import { NotificationDot } from '../shared';
import { COURSE_COLORS, getCourseColor, formatGrade } from '../../constants';
import { getShortCode } from './coursesPageUtils';
import { styles } from './coursesPageStyles';
import type { CourseCardProps } from './CourseGridCard';

interface CourseListItemProps extends CourseCardProps {
  isFirst: boolean;
}

function CourseListItemComponent({
  course,
  isPinned,
  earned,
  trend,
  assessed,
  onTogglePin,
  onToggleHide,
  isFirst,
  onClick,
  onColorClick,
  showColorPicker,
  colorPickerValue,
  onColorChange,
  onColorInputChange: _onColorInputChange,
  onColorPickerClose,
  hasUpdates,
  hasActionRequired,
}: CourseListItemProps) {
  const color = getCourseColor(course.id, course.color);

  return (
    <div
      style={{
        ...styles.listItem,
        borderTop: isFirst ? 'none' : '1px solid var(--border-light)',
      }}
      onClick={onClick}
    >
      {/* Color indicator - click to change color */}
      <div style={{ position: 'relative' }}>
        <button
          style={{
            ...styles.listColorDot,
            backgroundColor: color,
            cursor: 'pointer',
            border: 'none',
          }}
          onClick={(e) => onColorClick?.(course.id, color, e)}
          title="Click to change color"
        />
        <ColorPickerPopup
          isOpen={showColorPicker || false}
          onClose={() => onColorPickerClose?.()}
          value={colorPickerValue || color}
          onChange={(newColor) => onColorChange?.(course.id, newColor)}
          presets={COURSE_COLORS}
          allowCustom={true}
          swatchSize={24}
          position="bottom-left"
        />
      </div>

      {/* Course info */}
      <div style={styles.listInfo}>
        <div style={styles.listHeader}>
          <span style={{ ...styles.listCodeBadge, backgroundColor: color }}>
            {getShortCode(course.code)}
          </span>
          <span style={styles.listFullCode}>{course.code}</span>
          {/* Notification dot for unseen updates */}
          {hasUpdates && (
            <NotificationDot
              color={color}
              size="sm"
              pulse={hasActionRequired}
              title="New updates available"
              style={{ marginLeft: 'var(--space-2)' }}
            />
          )}
        </div>
        <h3 style={styles.listCourseName}>{course.nickname || course.name}</h3>
      </div>

      {/* Grades */}
      <div style={styles.listGrades}>
        <div style={styles.listGradeItem}>
          <span style={styles.listGradeLabel}>Target</span>
          <span style={styles.listGradeValue}>{course.targetGrade}%</span>
        </div>
        {assessed > 0 && (
          <>
            <div style={styles.listGradeItem}>
              <span style={styles.listGradeLabel}>Earned</span>
              <span
                style={{
                  ...styles.listGradeValue,
                  color:
                    trend >= course.targetGrade
                      ? 'var(--color-success)'
                      : trend >= course.targetGrade - 10
                        ? 'var(--color-medium)'
                        : 'var(--color-high)',
                }}
              >
                {formatGrade(earned)}
              </span>
            </div>
            <div style={styles.listGradeItem}>
              <span style={styles.listGradeLabel}>Trend</span>
              <span
                style={{
                  ...styles.listGradeValue,
                  color:
                    trend >= course.targetGrade
                      ? 'var(--color-success)'
                      : trend >= course.targetGrade - 10
                        ? 'var(--color-medium)'
                        : 'var(--color-high)',
                }}
              >
                {formatGrade(trend)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div style={styles.listActions}>
        <button
          style={{
            ...styles.pinButton,
            color: course.isHidden ? 'var(--color-medium)' : 'var(--text-muted)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHide(course.id, course.isHidden);
          }}
          title={course.isHidden ? 'Show course' : 'Hide course'}
        >
          {course.isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button
          style={{
            ...styles.pinButton,
            color: isPinned ? 'var(--color-navy)' : 'var(--text-muted)',
          }}
          onClick={(e) => onTogglePin(course.id, e)}
          title={isPinned ? 'Unpin course' : 'Pin course'}
        >
          {isPinned ? <Pin size={16} /> : <PinOff size={16} />}
        </button>
        <ChevronRight size={18} color="var(--text-muted)" />
      </div>
    </div>
  );
}

export const CourseListItem = React.memo(CourseListItemComponent);
