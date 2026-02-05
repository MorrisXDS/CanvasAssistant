/**
 * AcademicSection - Academic settings
 *
 * Contains:
 * - Target grade settings
 * - Term/semester selection
 * - Show hidden courses toggle
 * - Auto-fill due dates
 */

import React from 'react';
import { GraduationCap } from 'lucide-react';
import { useSettings } from './SettingsContext';
import { Accordion, SettingRow, ToggleSwitch, SettingSlider } from '../primitives';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS } from '../../constants';
import {
  SETTINGS_CATEGORIES,
  DEFAULT_ACADEMIC_SETTINGS,
  DEFAULT_COURSE_SETTINGS,
  DEFAULT_SYNC_PREFERENCES,
} from '../../../l5-presentation/settings';

// Category icon
const ACADEMIC_ICON = <GraduationCap size={18} />;

interface AcademicSectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function AcademicSection({ sectionRef }: AcademicSectionProps) {
  const {
    // Search
    isSearching,
    shouldShowSetting,

    // Drag and drop
    sectionOrder,
    handleMouseDown,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDragWrapperStyle,

    // Academic
    academic,
    updateAcademic,
    enrollmentTerms,

    // Course settings
    courseSettings,
    updateCourseSettings,

    // Sync preferences
    syncPrefs,
    updateSyncPrefs,

    // Modified count
    academicModifiedCount,
  } = useSettings();

  const ModifiedBadge = ({ count }: { count: number }) =>
    count > 0 ? <span style={styles.modifiedBadge}>{count} modified</span> : null;

  return (
    <div
      ref={sectionRef}
      draggable
      onMouseDown={handleMouseDown}
      onDragStart={(e) => handleDragStart(e, 'academic')}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, 'academic')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, 'academic')}
      style={{
        ...getDragWrapperStyle('academic'),
        order: sectionOrder.indexOf('academic'),
      }}
    >
      <Accordion.Item value="academic">
        <Accordion.Trigger
          icon={ACADEMIC_ICON}
          badge={<ModifiedBadge count={academicModifiedCount} />}
        >
          {SETTINGS_CATEGORIES.academic.label}
        </Accordion.Trigger>
        <Accordion.Content>
          <div style={styles.section}>
            {!isSearching && (
              <p style={styles.sectionDesc}>{SETTINGS_CATEGORIES.academic.description}</p>
            )}

            {/* Target Grade */}
            {shouldShowSetting('academic.defaultTargetGrade') && (
              <SettingRow
                settingKey="academic.defaultTargetGrade"
                label="Default target grade"
                description="Applied to new courses. Individual targets can be overridden."
                isModified={
                  academic.defaultTargetGrade !==
                  DEFAULT_ACADEMIC_SETTINGS.defaultTargetGrade
                }
                onReset={() =>
                  updateAcademic({
                    defaultTargetGrade: DEFAULT_ACADEMIC_SETTINGS.defaultTargetGrade,
                  })
                }
              >
                <SettingSlider
                  value={academic.defaultTargetGrade}
                  onChange={(v) => updateAcademic({ defaultTargetGrade: v })}
                  min={50}
                  max={100}
                  step={1}
                  formatValue={(v) => `${v}%`}
                />
              </SettingRow>
            )}

            {/* Term Selection */}
            {shouldShowSetting('academic.termSelection') && (
              <SettingRow
                settingKey="academic.termSelection"
                label="Semester selection"
                description="Which semester's courses to display"
                isModified={
                  academic.termSelection !== DEFAULT_ACADEMIC_SETTINGS.termSelection
                }
                onReset={() =>
                  updateAcademic({
                    termSelection: DEFAULT_ACADEMIC_SETTINGS.termSelection,
                  })
                }
              >
                <select
                  value={academic.termSelection}
                  onChange={(e) => updateAcademic({ termSelection: e.target.value })}
                  style={styles.select}
                >
                  <option value="auto">
                    {SETTINGS_LABELS.options.termSelection.autoDetect}
                  </option>
                  <option value="all">
                    {SETTINGS_LABELS.options.termSelection.showAll}
                  </option>
                  {enrollmentTerms.length > 0 && (
                    <optgroup
                      label={SETTINGS_LABELS.options.termSelection.availableLabel}
                    >
                      {enrollmentTerms.map((term) => (
                        <option key={term.externalId} value={term.externalId}>
                          {term.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </SettingRow>
            )}

            {!isSearching && <div style={styles.divider} />}

            {/* Course Visibility */}
            {shouldShowSetting('courses.showHiddenByDefault') && (
              <SettingRow
                settingKey="courses.showHiddenByDefault"
                label="Show hidden courses"
                description="Display hidden courses in the courses list by default"
                isModified={
                  courseSettings.showHiddenByDefault !==
                  DEFAULT_COURSE_SETTINGS.showHiddenByDefault
                }
                onReset={() =>
                  updateCourseSettings({
                    showHiddenByDefault: DEFAULT_COURSE_SETTINGS.showHiddenByDefault,
                  })
                }
              >
                <ToggleSwitch
                  checked={courseSettings.showHiddenByDefault}
                  onChange={(checked) =>
                    updateCourseSettings({ showHiddenByDefault: checked })
                  }
                />
              </SettingRow>
            )}

            {/* Auto-fill due dates */}
            {shouldShowSetting('syncPrefs.autoAssignDueDate') && (
              <SettingRow
                settingKey="syncPrefs.autoAssignDueDate"
                label="Auto-fill due dates"
                description="Set today at 11:59 PM as due date for coursework without one"
                isModified={
                  syncPrefs.autoAssignDueDate !==
                  DEFAULT_SYNC_PREFERENCES.autoAssignDueDate
                }
                onReset={() =>
                  updateSyncPrefs({
                    autoAssignDueDate: DEFAULT_SYNC_PREFERENCES.autoAssignDueDate,
                  })
                }
              >
                <ToggleSwitch
                  checked={syncPrefs.autoAssignDueDate}
                  onChange={(checked) => updateSyncPrefs({ autoAssignDueDate: checked })}
                />
              </SettingRow>
            )}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </div>
  );
}
