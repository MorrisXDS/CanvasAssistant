/**
 * Course Grid Card Component
 * Card component for displaying a course in grid view
 */

import React from 'react';
import { Pin, PinOff, Target, Eye, EyeOff, GripVertical } from 'lucide-react';
import { ColorPickerPopup } from '../primitives';
import { NotificationDot } from '../shared';
import {
  formatTimeAgo,
  formatGrade,
  COURSE_COLORS,
  getCourseColor,
} from '../../constants';
import { getShortCode } from './coursesPageUtils';
import { styles } from './coursesPageStyles';
import type { Course } from '../../../l5-presentation/types';

export interface CourseCardProps {
  course: Course;
  isPinned: boolean;
  earned: number;
  trend: number;
  assessed: number;
  onTogglePin: (courseId: number, e: React.MouseEvent) => void;
  onToggleHide: (courseId: number, currentlyHidden: boolean) => void;
  onClick: () => void;
  onColorClick?: (courseId: number, currentColor: string, e: React.MouseEvent) => void;
  showColorPicker?: boolean;
  colorPickerValue?: string;
  onColorChange?: (courseId: number, color: string) => void;
  onColorInputChange?: (value: string) => void;
  onColorPickerClose?: () => void;
  // Notification dot props
  hasUpdates?: boolean;
  updateCount?: number;
  hasActionRequired?: boolean;
  // Drag-and-drop props
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Keyboard-focused card (for grid/list nav highlight) */
  focused?: boolean;
}

function CourseGridCardComponent({
  course,
  isPinned,
  earned,
  trend,
  assessed,
  onTogglePin,
  onToggleHide,
  onClick,
  onColorClick,
  showColorPicker,
  colorPickerValue,
  onColorChange,
  onColorInputChange: _onColorInputChange,
  onColorPickerClose,
  hasUpdates,
  hasActionRequired,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  focused,
}: CourseCardProps) {
  const color = getCourseColor(course.id, course.color);

  return (
    <div
      style={{
        ...styles.gridCard,
        opacity: isDragging ? 0.5 : course.isHidden ? 0.5 : 1,
        // Precedence: drag-over outline wins; then keyboard focus; then default shadow.
        boxShadow: isDragOver
          ? '0 0 0 2px var(--color-blue)'
          : focused
            ? '0 0 0 2px var(--color-navy)'
            : 'var(--shadow-card)',
        transition: 'box-shadow 150ms ease, opacity 150ms ease',
        position: 'relative',
      }}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Notification dot for unseen updates */}
      {hasUpdates && (
        <NotificationDot
          color={color}
          size="md"
          pulse={hasActionRequired}
          title="New updates available"
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
          }}
        />
      )}
      {/* Color accent bar - click to change color */}
      <div
        style={{
          ...styles.colorBar,
          backgroundColor: color,
          cursor: 'pointer',
          position: 'relative',
        }}
        onClick={(e) => onColorClick?.(course.id, color, e)}
        title="Click to change color"
      >
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

      {/* Use display: contents to allow children to participate in parent grid */}
      <div style={styles.gridCardContent}>
        {/* Header row - Grid row 1 */}
        <div style={styles.gridCardHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ ...styles.courseCodeBadge, backgroundColor: color }}>
              {getShortCode(course.code)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
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
          </div>
        </div>

        {/* Course name - Grid row 2 */}
        <h3 style={styles.gridCourseName}>{course.nickname || course.name}</h3>

        {/* Full code - Grid row 3 (flex spacer) */}
        <span style={styles.fullCode}>{course.code}</span>

        {/* Stats - Grid row 4 */}
        <div style={styles.gridStats}>
          <div style={styles.gridStatItem}>
            <Target size={14} color="var(--text-muted)" />
            <span style={styles.gridStatLabel}>Target</span>
            <span style={styles.gridStatValue}>{course.targetGrade}%</span>
          </div>
          <div style={styles.gridStatItem}>
            <span style={styles.gridStatLabel}>Credits</span>
            <span style={styles.gridStatValue}>{course.credits ?? 1.0}</span>
          </div>
          {assessed > 0 && (
            <>
              <div style={styles.gridStatItem}>
                <span style={styles.gridStatLabel}>Earned</span>
                <span
                  style={{
                    ...styles.gridStatValue,
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
              <div style={styles.gridStatItem}>
                <span style={styles.gridStatLabel}>Trend</span>
                <span
                  style={{
                    ...styles.gridStatValue,
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

        {/* Footer row - Grid row 5: Sync time + Drag handle */}
        <div style={styles.cardFooter}>
          <div style={styles.syncTime}>
            {course.lastSyncedAt
              ? `Synced ${formatTimeAgo(course.lastSyncedAt)}`
              : '\u00A0'}
          </div>
          {/* Drag handle */}
          <div style={styles.dragHandle} title="Drag to reorder" data-drag-handle>
            <GripVertical size={14} />
          </div>
        </div>
      </div>
    </div>
  );
}

export const CourseGridCard = React.memo(CourseGridCardComponent);
