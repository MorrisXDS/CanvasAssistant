/**
 * AcademicSection - Academic & Course settings
 *
 * Contains:
 * - Target grade settings
 * - Term/semester selection
 * - Course visibility
 * - Content settings (link behavior, offline HTML)
 * - Course visibility list
 */

import React from 'react';
import { GraduationCap, Eye, EyeOff, FolderOpen } from 'lucide-react';
import { useSettings } from './SettingsContext';
import {
  Accordion,
  SettingRow,
  ToggleSwitch,
  SettingSelect,
  SettingSlider,
} from '../primitives';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS, MENU_LABELS } from '../../constants';
import {
  SETTINGS_CATEGORIES,
  DEFAULT_ACADEMIC_SETTINGS,
  DEFAULT_COURSE_SETTINGS,
  DEFAULT_SYNC_PREFERENCES,
  DEFAULT_FILE_EXPLORER_SETTINGS,
  DEFAULT_CONTENT_SETTINGS,
  DEFAULT_LOCAL_HTML_PATHS_SETTINGS,
  LINK_BEHAVIOR,
  type ContentSettings,
} from '../../../l5-presentation/settings';
import type { Course } from '../../../l5-presentation/types';

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
    handleToggleCourseVisibility,
    courses,

    // Sync preferences
    syncPrefs,
    updateSyncPrefs,

    // File explorer
    fileExplorer,
    updateFileExplorer,
    currentDownloadPath,
    handleChangeDownloadLocation,

    // Content settings
    contentSettings,
    updateContentSettings,

    // Local HTML paths
    localHtmlPathsSettings,
    updateLocalHtmlPathsSettings,

    // Modified count
    academicModifiedCount,
  } = useSettings();

  const ModifiedBadge = ({ count }: { count: number }) =>
    count > 0 ? <span style={styles.modifiedBadge}>{count} modified</span> : null;

  return (
    <div
      ref={sectionRef}
      draggable
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
                description="Set today 23:59 as due date for coursework without one"
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

            {!isSearching && <div style={styles.divider} />}

            {/* Download Location */}
            {shouldShowSetting('fileExplorer.downloadLocation') && (
              <SettingRow
                settingKey="fileExplorer.downloadLocation"
                label="Download location"
                description="Where downloaded files are stored on your computer"
                vertical
              >
                <div style={styles.downloadLocationRow}>
                  <div style={styles.downloadLocationPath}>
                    {currentDownloadPath || 'Loading...'}
                  </div>
                  <button
                    style={styles.changeLocationBtn}
                    onClick={handleChangeDownloadLocation}
                  >
                    <FolderOpen size={14} /> {MENU_LABELS.common.change}
                  </button>
                </div>
              </SettingRow>
            )}

            {/* Link Behavior */}
            {shouldShowSetting('content.linkBehavior') && (
              <SettingRow
                settingKey="content.linkBehavior"
                label="Link click behavior"
                description="How to handle clicks on links in course content"
                isModified={
                  contentSettings.linkBehavior !== DEFAULT_CONTENT_SETTINGS.linkBehavior
                }
                onReset={() =>
                  updateContentSettings({
                    linkBehavior: DEFAULT_CONTENT_SETTINGS.linkBehavior,
                  })
                }
              >
                <SettingSelect
                  value={contentSettings.linkBehavior}
                  onChange={(v) =>
                    updateContentSettings({
                      linkBehavior: v as ContentSettings['linkBehavior'],
                    })
                  }
                  options={[
                    {
                      value: LINK_BEHAVIOR.ALWAYS_EXTERNAL,
                      label: SETTINGS_LABELS.options.linkBehavior.browser,
                    },
                    {
                      value: LINK_BEHAVIOR.PREFER_LOCAL,
                      label: SETTINGS_LABELS.options.linkBehavior.local,
                    },
                  ]}
                />
              </SettingRow>
            )}

            {/* Offline HTML Files */}
            {shouldShowSetting('localHtmlPathsSettings.enabled') && (
              <SettingRow
                settingKey="localHtmlPathsSettings.enabled"
                label="Offline HTML files"
                description="Prompt to download missing images and linked files when opening HTML content"
                isModified={
                  localHtmlPathsSettings.enabled !==
                  DEFAULT_LOCAL_HTML_PATHS_SETTINGS.enabled
                }
                onReset={() =>
                  updateLocalHtmlPathsSettings({
                    enabled: DEFAULT_LOCAL_HTML_PATHS_SETTINGS.enabled,
                  })
                }
              >
                <ToggleSwitch
                  checked={localHtmlPathsSettings.enabled}
                  onChange={(checked) =>
                    updateLocalHtmlPathsSettings({ enabled: checked })
                  }
                />
              </SettingRow>
            )}

            {/* Skip External Link Warning */}
            {shouldShowSetting('fileExplorer.skipExternalLinkWarning') && (
              <SettingRow
                settingKey="fileExplorer.skipExternalLinkWarning"
                label="Skip external link warning"
                description="Open external links from modules without showing a confirmation dialog"
                isModified={
                  fileExplorer.skipExternalLinkWarning !==
                  DEFAULT_FILE_EXPLORER_SETTINGS.skipExternalLinkWarning
                }
                onReset={() =>
                  updateFileExplorer({
                    skipExternalLinkWarning:
                      DEFAULT_FILE_EXPLORER_SETTINGS.skipExternalLinkWarning,
                  })
                }
              >
                <ToggleSwitch
                  checked={fileExplorer.skipExternalLinkWarning}
                  onChange={(checked) =>
                    updateFileExplorer({ skipExternalLinkWarning: checked })
                  }
                />
              </SettingRow>
            )}

            {!isSearching && <div style={styles.divider} />}

            {/* Course Visibility List */}
            {!isSearching && (
              <>
                <div style={styles.subsectionTitle}>
                  {SETTINGS_LABELS.sections.courseVisibility}
                </div>
                <p style={styles.fieldDesc}>
                  Hidden courses won't appear in Dashboard, Tasks, or Announcements.
                </p>
                <div style={styles.courseList}>
                  {courses.length === 0 ? (
                    <p style={styles.emptyText}>{SETTINGS_LABELS.empty.noCourses}</p>
                  ) : (
                    courses.map((course: Course) => (
                      <div key={course.id} style={styles.courseRow}>
                        <div style={styles.courseInfo}>
                          <span
                            style={{
                              ...styles.courseDot,
                              backgroundColor: course.color || 'var(--color-navy)',
                            }}
                          />
                          <div style={styles.courseText}>
                            <span style={styles.courseCode}>{course.code}</span>
                            <span style={styles.courseName}>{course.name}</span>
                          </div>
                        </div>
                        <button
                          style={{
                            ...styles.visibilityBtn,
                            color: course.isHidden
                              ? 'var(--text-muted)'
                              : 'var(--color-success)',
                          }}
                          onClick={() =>
                            handleToggleCourseVisibility(course.id, course.isHidden)
                          }
                          title={course.isHidden ? 'Show course' : 'Hide course'}
                        >
                          {course.isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </div>
  );
}
