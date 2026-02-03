/**
 * SettingsPanel Component
 * Collapsible course settings form with nickname, target grade, color, visibility, and archive
 */

import React from 'react';
import { EyeOff, Eye, Archive } from 'lucide-react';
import { ColorPicker } from '../../primitives';
import { COURSE_COLORS, getCourseColor } from '../../../constants';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';

export interface SettingsPanelProps {
  courseId: number;
  courseName: string;
  courseColor: string | null;
  isHidden: boolean;
  targetPercent: number;
  nicknameInput: string;
  targetGradeInput: string;
  creditsInput: string;
  selectedColor: string | null;
  onNicknameChange: (value: string) => void;
  onTargetGradeChange: (value: string) => void;
  onCreditsChange: (value: string) => void;
  onColorChange: (value: string | null) => void;
  onToggleHidden: () => void;
  onArchive: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function SettingsPanel({
  courseId,
  courseName,
  courseColor,
  isHidden,
  targetPercent,
  nicknameInput,
  targetGradeInput,
  creditsInput,
  selectedColor,
  onNicknameChange,
  onTargetGradeChange,
  onCreditsChange,
  onColorChange,
  onToggleHidden,
  onArchive,
  onSave,
  onCancel,
}: SettingsPanelProps) {
  return (
    <div style={styles.settingsPanel}>
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
          <label style={styles.settingsLabel}>Credit</label>
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
