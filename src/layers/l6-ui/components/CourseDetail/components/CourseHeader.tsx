/**
 * CourseHeader Component
 * Displays course info, grade summary, settings panel, and progress bar
 */

import React from 'react';
import { Target, TrendingUp, FileText, Edit3, Save, X, Settings } from 'lucide-react';
import { SettingsPanel } from './SettingsPanel';
import type { CourseSyllabus } from '../../Course';
import { formatGrade } from '../../../constants';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';

export interface CourseHeaderProps {
  course: {
    id: number;
    code: string;
    name: string;
    nickname: string | null;
    color: string | null;
    isHidden: boolean;
    targetGrade: number;
    targetGradeSource: 'default' | 'manual';
    lastSyncedAt: string | null;
    archivedAt: string | null;
    archiveSource: 'manual' | 'auto' | null;
    credits: number;
    gradeCurveAdjustment: number;
  };
  courseColor: string;

  // Grade calculations
  completedWeight: number;
  earnedContribution: number;
  effectiveGrade: number;
  gradeStatus: 'on-track' | 'warning' | 'behind';

  // Target grade editing
  editingTarget: boolean;
  targetGradeInput: string;
  onStartEditTarget: () => void;
  onTargetGradeInputChange: (value: string) => void;
  onSaveTargetGrade: () => void;
  onCancelEditTarget: () => void;

  // Syllabus
  syllabus: CourseSyllabus | null;
  syllabusPromptDismissed?: boolean;
  onSyllabusClick: () => void;
  onSyllabusDoubleClick: () => void;
  onSyllabusContextMenu: (e: React.MouseEvent) => void;

  // Settings panel
  showSettings: boolean;
  nicknameInput: string;
  creditsInput: string;
  curveAdjustmentInput: string;
  selectedColor: string | null;
  onToggleSettings: () => void;
  onNicknameChange: (value: string) => void;
  onCreditsChange: (value: string) => void;
  onCurveAdjustmentChange: (value: string) => void;
  onColorChange: (value: string | null) => void;
  onToggleHidden: () => void;
  onArchive: () => void;
  onSaveSettings: () => void;
  onCancelSettings: () => void;
}

function getShortCode(code: string): string {
  const match = code.match(/^(.+?)(?=[A-Z]\d(?:\s|$))/i);
  return match ? match[1] : code.split(/\s/)[0];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No date';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CourseHeader({
  course,
  courseColor,
  completedWeight,
  earnedContribution,
  effectiveGrade,
  gradeStatus,
  editingTarget,
  targetGradeInput,
  onStartEditTarget,
  onTargetGradeInputChange,
  onSaveTargetGrade,
  onCancelEditTarget,
  syllabus,
  syllabusPromptDismissed,
  onSyllabusClick,
  onSyllabusDoubleClick,
  onSyllabusContextMenu,
  showSettings,
  nicknameInput,
  creditsInput,
  curveAdjustmentInput,
  selectedColor,
  onToggleSettings,
  onNicknameChange,
  onCreditsChange,
  onCurveAdjustmentChange,
  onColorChange,
  onToggleHidden,
  onArchive,
  onSaveSettings,
  onCancelSettings,
}: CourseHeaderProps) {
  const targetPercent = course.targetGrade;

  return (
    <div style={styles.headerCard}>
      <div style={{ ...styles.headerColorBar, backgroundColor: courseColor }} />
      <div style={styles.headerContent}>
        <div style={styles.headerMain}>
          <div style={styles.headerInfo}>
            <span style={{ ...styles.courseCodeBadge, backgroundColor: courseColor }}>
              {getShortCode(course.code)}
            </span>
            <h1 style={styles.courseName}>
              {course.nickname || `${course.code} - ${course.name}`}
            </h1>
            <span style={styles.fullCode}>{course.code}</span>
            {course.archivedAt && (
              <span style={styles.archivedBadge}>
                ARCHIVED
                {course.archiveSource === 'auto' && ' (Term Ended)'}
              </span>
            )}
          </div>

          {/* Grade Summary */}
          <div style={styles.gradeSummary}>
            <div style={styles.gradeItem}>
              <div style={styles.gradeLabel}>
                <Target size={14} />
                Target
              </div>
              {editingTarget ? (
                <div style={styles.editTargetRow}>
                  <input
                    type="number"
                    value={targetGradeInput}
                    onChange={(e) => onTargetGradeInputChange(e.target.value)}
                    style={styles.targetInput}
                    min="0"
                    max="100"
                    step="0.1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveTargetGrade();
                      if (e.key === 'Escape') onCancelEditTarget();
                    }}
                  />
                  <button style={styles.editIconButton} onClick={onSaveTargetGrade}>
                    <Save size={14} color="var(--color-success)" />
                  </button>
                  <button style={styles.editIconButton} onClick={onCancelEditTarget}>
                    <X size={14} color="var(--text-muted)" />
                  </button>
                </div>
              ) : (
                <div style={styles.editableValue} onClick={onStartEditTarget}>
                  <span style={styles.gradeValue}>{targetPercent}%</span>
                  <Edit3
                    size={12}
                    color="var(--text-muted)"
                    style={{ marginLeft: '4px' }}
                  />
                </div>
              )}
              <div style={styles.gradeSubtext}>
                final goal
                {course.targetGradeSource === 'default' && (
                  <span
                    style={{ color: 'var(--color-blue)', marginLeft: '4px' }}
                    title="Using app default - will update when you change the default target grade in Settings"
                  >
                    (default)
                  </span>
                )}
              </div>
            </div>
            <div style={styles.gradeDivider} />
            <div style={styles.gradeItem}>
              <div style={styles.gradeLabel}>
                <TrendingUp size={14} />
                Earned
              </div>
              <div
                style={{
                  ...styles.gradeValue,
                  color:
                    completedWeight > 0
                      ? gradeStatus === 'on-track'
                        ? 'var(--color-success)'
                        : gradeStatus === 'warning'
                          ? 'var(--color-medium)'
                          : 'var(--color-high)'
                      : 'var(--text-muted)',
                }}
              >
                {completedWeight > 0
                  ? formatGrade(earnedContribution + (course.gradeCurveAdjustment ?? 0))
                  : '—'}
                {completedWeight > 0 && course.gradeCurveAdjustment !== 0 && (
                  <span
                    style={{
                      fontSize: '10px',
                      marginLeft: '4px',
                      color:
                        course.gradeCurveAdjustment > 0
                          ? 'var(--color-success)'
                          : 'var(--color-high)',
                    }}
                  >
                    (curved {course.gradeCurveAdjustment > 0 ? 'up' : 'down'})
                  </span>
                )}
              </div>
              <div style={styles.gradeSubtext}>
                {completedWeight > 0
                  ? `of ${completedWeight.toFixed(0)}% assessed`
                  : '\u00A0'}
              </div>
            </div>
            <div style={styles.gradeDivider} />
            <div style={styles.gradeItem}>
              <div style={styles.gradeLabel}>
                <TrendingUp size={14} />
                Trend
              </div>
              <div
                style={{
                  ...styles.gradeValue,
                  color:
                    completedWeight > 0
                      ? gradeStatus === 'on-track'
                        ? 'var(--color-success)'
                        : gradeStatus === 'warning'
                          ? 'var(--color-medium)'
                          : 'var(--color-high)'
                      : 'var(--text-muted)',
                }}
              >
                {completedWeight > 0 ? formatGrade(effectiveGrade) : '—'}
              </div>
              <div style={styles.gradeSubtext}>
                {completedWeight > 0 ? 'avg on graded work' : '\u00A0'}
              </div>
            </div>
            {/* Syllabus */}
            <div style={styles.gradeDivider} />
            <div
              style={{
                ...styles.gradeItem,
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onContextMenu={onSyllabusContextMenu}
              onClick={onSyllabusClick}
              onDoubleClick={onSyllabusDoubleClick}
              title={
                syllabus
                  ? 'Click to change, double-click to open, right-click for options'
                  : 'Click to select syllabus'
              }
            >
              <div style={styles.gradeLabel}>
                <FileText size={14} />
                Syllabus
              </div>
              <div
                style={{
                  ...styles.syllabusValue,
                  color: syllabus ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {syllabus ? syllabus.resourceTitle : '—'}
              </div>
              <div style={styles.gradeSubtext}>
                {syllabus?.changeDetectedAt ? (
                  <span style={{ color: 'var(--color-warning)' }}>Updated</span>
                ) : syllabus ? (
                  'Current'
                ) : syllabusPromptDismissed ? (
                  '\u2014'
                ) : (
                  'Select a syllabus'
                )}
              </div>
            </div>
            {/* Settings Button */}
            <div style={styles.gradeDivider} />
            <button style={styles.settingsButton} onClick={onToggleSettings}>
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Settings Panel - Collapsible */}
        {showSettings && (
          <SettingsPanel
            courseId={course.id}
            courseName={course.name}
            courseColor={course.color}
            isHidden={course.isHidden}
            targetPercent={targetPercent}
            nicknameInput={nicknameInput}
            targetGradeInput={targetGradeInput}
            creditsInput={creditsInput}
            curveAdjustmentInput={curveAdjustmentInput}
            selectedColor={selectedColor}
            onNicknameChange={onNicknameChange}
            onTargetGradeChange={onTargetGradeInputChange}
            onCreditsChange={onCreditsChange}
            onCurveAdjustmentChange={onCurveAdjustmentChange}
            onColorChange={onColorChange}
            onToggleHidden={onToggleHidden}
            onArchive={onArchive}
            onSave={onSaveSettings}
            onCancel={onCancelSettings}
          />
        )}

        {/* Grade Progress Bar */}
        {completedWeight > 0 ? (
          <div style={styles.progressSection}>
            <div style={styles.progressBar}>
              {/* Background layer: total assessed weight */}
              <div
                style={{
                  ...styles.progressFillBackground,
                  width: `${Math.min(completedWeight, 100)}%`,
                }}
              />
              {/* Foreground layer: earned contribution */}
              <div
                style={{
                  ...styles.progressFill,
                  width: `${Math.min(earnedContribution, 100)}%`,
                  backgroundColor:
                    gradeStatus === 'on-track'
                      ? 'var(--color-success)'
                      : gradeStatus === 'warning'
                        ? 'var(--color-medium)'
                        : 'var(--color-high)',
                }}
              />
              {/* Target marker */}
              <div
                style={{
                  ...styles.targetMarker,
                  left: `${targetPercent}%`,
                }}
              />
            </div>
            <div style={styles.progressLabels}>
              <span>0%</span>
              <span style={styles.progressLegend}>
                <span style={styles.legendItem}>
                  <span
                    style={{
                      ...styles.legendDot,
                      backgroundColor: 'var(--color-gray-300)',
                    }}
                  />
                  Assessed: {completedWeight.toFixed(0)}%
                </span>
                <span style={styles.legendItem}>
                  <span
                    style={{
                      ...styles.legendDot,
                      backgroundColor:
                        gradeStatus === 'on-track'
                          ? 'var(--color-success)'
                          : gradeStatus === 'warning'
                            ? 'var(--color-medium)'
                            : 'var(--color-high)',
                    }}
                  />
                  Earned: {formatGrade(earnedContribution)}
                </span>
                <span style={styles.legendItem}>
                  <span
                    style={{
                      ...styles.legendDot,
                      backgroundColor: 'var(--color-navy)',
                    }}
                  />
                  Target: {formatGrade(targetPercent)}
                </span>
              </span>
              <span>100%</span>
            </div>
          </div>
        ) : (
          <div style={styles.noProgressSection}>
            <span style={styles.noProgressText}>No graded coursework yet</span>
          </div>
        )}

        {/* Last Synced */}
        {course.lastSyncedAt && (
          <div style={styles.syncInfo}>
            Last synced: {formatDate(course.lastSyncedAt)}
          </div>
        )}
      </div>
    </div>
  );
}

export default CourseHeader;
