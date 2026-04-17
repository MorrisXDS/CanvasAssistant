/**
 * SettingsPanel Component
 * Collapsible course settings form with nickname, target grade, color, visibility, and archive
 */

import React from 'react';
import { EyeOff, Eye, Archive } from 'lucide-react';
import { ColorPicker } from '../../primitives';
import { COURSE_COLORS, getCourseColor } from '../../../constants';
import { SyllabusSection } from '../../Course/SyllabusSection';
import type { CourseSyllabus } from '../../Course';
import type { FileResource } from '../../Files/FileListItem';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';

export interface SettingsPanelProps {
  courseId: number;
  courseCode: string;
  courseName: string;
  courseColor: string | null;
  isHidden: boolean;
  targetPercent: number;
  nicknameInput: string;
  targetGradeInput: string;
  creditsInput: string;
  curveAdjustmentInput: string;
  selectedColor: string | null;
  onNicknameChange: (value: string) => void;
  onTargetGradeChange: (value: string) => void;
  onCreditsChange: (value: string) => void;
  onCurveAdjustmentChange: (value: string) => void;
  onColorChange: (value: string | null) => void;
  onToggleHidden: () => void;
  onArchive: () => void;
  onSave: () => void;
  onCancel: () => void;
  // Syllabus
  syllabus: CourseSyllabus | null;
  syllabusAvailableFiles: FileResource[];
  onSetSyllabus: (resourceId: number) => void;
  onMarkSyllabusReviewed: () => void;
  onDownloadSyllabus: () => void;
  onOpenSyllabus: () => void;
  syllabusLoading?: boolean;
}

export function SettingsPanel({
  courseId,
  courseCode,
  courseName,
  courseColor,
  isHidden,
  targetPercent,
  nicknameInput,
  targetGradeInput,
  creditsInput,
  curveAdjustmentInput,
  selectedColor,
  onNicknameChange,
  onTargetGradeChange,
  onCreditsChange,
  onCurveAdjustmentChange,
  onColorChange,
  onToggleHidden,
  onArchive,
  onSave,
  onCancel,
  syllabus,
  syllabusAvailableFiles,
  onSetSyllabus,
  onMarkSyllabusReviewed,
  onDownloadSyllabus,
  onOpenSyllabus,
  syllabusLoading,
}: SettingsPanelProps) {
  return (
    <div style={styles.settingsPanel}>
      {/* Row 1: Basic course info - 3 fields */}
      <div style={styles.settingsGrid}>
        <div style={styles.settingsField}>
          <label style={styles.settingsLabel}>Nickname</label>
          <input
            type="text"
            value={nicknameInput}
            onChange={(e) => onNicknameChange(e.target.value)}
            placeholder={courseName}
            style={styles.settingsInput}
          />
        </div>
        <div style={styles.settingsField}>
          <label style={styles.settingsLabel}>Target Grade (%)</label>
          <input
            type="number"
            value={targetGradeInput || targetPercent.toString()}
            onChange={(e) => onTargetGradeChange(e.target.value)}
            style={styles.settingsInput}
            min="0"
            max="100"
            step="0.1"
          />
        </div>
        <div style={styles.settingsField}>
          <label style={styles.settingsLabel}>Credits</label>
          <input
            type="number"
            value={creditsInput}
            onChange={(e) => onCreditsChange(e.target.value)}
            style={styles.settingsInput}
            min="0"
            max="10"
            step="0.5"
            placeholder="1.0"
          />
        </div>
      </div>
      {/* Row 2: Grade curve, visibility, archive - 3 fields */}
      <div style={styles.settingsGrid}>
        <div style={styles.settingsField}>
          <label style={styles.settingsLabel}>Grade Adjustment (±%)</label>
          <input
            type="number"
            value={curveAdjustmentInput}
            onChange={(e) => onCurveAdjustmentChange(e.target.value)}
            style={styles.settingsInput}
            min="-50"
            max="50"
            step="0.5"
            placeholder="0"
            title="Adjust your earned grade by this percentage (e.g., +5 for a curve up)"
          />
        </div>
        <div style={styles.settingsField}>
          <label style={styles.settingsLabel}>Visibility</label>
          <button style={styles.visibilityButton} onClick={onToggleHidden}>
            {isHidden ? (
              <>
                <EyeOff size={16} />
                Hidden
              </>
            ) : (
              <>
                <Eye size={16} />
                Visible
              </>
            )}
          </button>
        </div>
        <div style={styles.settingsField}>
          <label style={styles.settingsLabel}>Archive</label>
          <button
            style={styles.archiveButton}
            onClick={onArchive}
            title="Archive this course. Archived courses are hidden but can be restored."
          >
            <Archive size={16} />
            Archive Course
          </button>
        </div>
      </div>
      {/* Row 3: Color picker */}
      <div style={styles.settingsGrid}>
        <div style={styles.settingsField}>
          <label style={styles.settingsLabel}>Color</label>
          <ColorPicker
            value={selectedColor || getCourseColor(courseId, courseColor)}
            onChange={onColorChange}
            presets={COURSE_COLORS}
            allowCustom={true}
            swatchSize={24}
          />
        </div>
      </div>

      {/* Row 4: Syllabus */}
      <div style={styles.settingsGrid}>
        <div style={{ ...styles.settingsField, flex: 1 }}>
          <label style={styles.settingsLabel}>Syllabus</label>
          <SyllabusSection
            courseId={courseId}
            courseCode={courseCode}
            syllabus={syllabus}
            availableFiles={syllabusAvailableFiles}
            onSetSyllabus={onSetSyllabus}
            onMarkReviewed={onMarkSyllabusReviewed}
            onDownload={onDownloadSyllabus}
            onOpen={onOpenSyllabus}
            isLoading={syllabusLoading}
          />
        </div>
      </div>

      <div style={styles.settingsActions}>
        <button style={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
        <button style={styles.saveButton} onClick={onSave}>
          Save Changes
        </button>
      </div>
    </div>
  );
}

export default SettingsPanel;
