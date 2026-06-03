/**
 * ExportDialog Component
 *
 * Modal dialog for custom/selective export with:
 * - Course picker with select all/none
 * - Include options (tasks, notifications, files, grades)
 * - Task status and date range filters
 * - Format selector (JSON, CSV, ZIP)
 * - Encryption toggle with password input
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  Lock,
  FileJson,
  FileSpreadsheet,
  Archive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useStore, selectors } from '../../../l5-presentation/store';
import { styles } from './ExportDialog.styles';
import { createLogger } from '../../utils/rendererLogger';
import { Modal } from '../primitives/Modal';
import { Z_INDEX } from '../../constants';

const logger = createLogger('ExportDialog');

// =============================================================================
// TYPES
// =============================================================================

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ExportOptions {
  courses: number[];
  archivedCourses: number[];
  includeTasks: boolean;
  includeNotifications: boolean;
  includeFiles: boolean;
  includeGrades: boolean;
  includeCalendar: boolean;
  taskStatus: 'all' | 'pending' | 'completed';
  dateRange: { start: string; end: string } | null;
  format: 'json' | 'csv' | 'zip';
  encrypt: boolean;
  password: string;
}

interface ArchivedCourse {
  id: number;
  code: string;
  name: string;
  archivedAt: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  // Visibility-filtered course list (CLAUDE.md §8 — read via the centralized
  // `selectors.visibleCourses`).
  //
  // IMPORTANT: do NOT pass `selectors.visibleCourses` straight to `useStore(...)`.
  // The selector returns a FRESH array on every call, and zustand's default
  // Object.is equality would then hand back a new reference each render. Every
  // downstream `useEffect`/`useMemo` keyed on `courses` would re-fire — here the
  // init-all-courses effect, which would instantly undo "Select None" and make a
  // 0-course export unreachable (a real regression vs. the pre-migration
  // `const { courses } = useStore()`). So subscribe to state and memoize the
  // selector result for a STABLE reference — the same hazard Dashboard.tsx
  // documents for `selectors.visibleNotifications`.
  const state = useStore();
  const courses = useMemo(() => selectors.visibleCourses(state), [state.courses]);

  // Export options state
  const [options, setOptions] = useState<ExportOptions>({
    courses: [],
    archivedCourses: [],
    includeTasks: true,
    includeNotifications: false,
    includeFiles: false,
    includeGrades: true,
    includeCalendar: false,
    taskStatus: 'all',
    dateRange: null,
    format: 'json',
    encrypt: false,
    password: '',
  });

  // UI state
  const [isExporting, setIsExporting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [exportResult, setExportResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [archivedCoursesList, setArchivedCoursesList] = useState<ArchivedCourse[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // Fetch archived courses when dialog opens
  useEffect(() => {
    if (isOpen) {
      window.api
        .getArchivedCourses()
        .then((result) => {
          // API returns array directly, not wrapped in { success, data }
          if (Array.isArray(result)) {
            setArchivedCoursesList(result);
          }
        })
        .catch((err) => {
          logger.error(
            'Failed to fetch archived courses',
            err instanceof Error ? err : undefined
          );
        });
    }
  }, [isOpen]);

  // Initialize with all visible courses selected
  useEffect(() => {
    if (isOpen && courses.length > 0 && options.courses.length === 0) {
      setOptions((prev) => ({
        ...prev,
        courses: courses.map((c) => c.id),
      }));
    }
  }, [isOpen, courses]);

  // Close on Escape key — child-priority Esc.
  //
  // ExportDialog is a STACKED CHILD above the SettingsModal parent (both use the
  // <Modal> primitive; parent at zIndex 1100, child at 1200). The parent
  // SettingsModal owns Esc via the primitive's default `closeOnEscape={true}`,
  // which registers a `document` keydown listener. If the child also let the
  // primitive own Esc, BOTH document listeners would fire on one Escape and
  // close BOTH modals. So the child Modal is given `closeOnEscape={false}` and
  // this focused, CAPTURE-phase listener intercepts Escape first and
  // `stopPropagation()`s it so it never reaches the parent's listener — Esc
  // closes ONLY the ExportDialog, leaving Settings open. (CLAUDE.md §2
  // "child modals stacked above a parent" — give the child Esc priority.)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler, true); // capture phase
    return () => document.removeEventListener('keydown', handler, true);
  }, [isOpen, onClose]);

  // Clear result when closing
  useEffect(() => {
    if (!isOpen) {
      setExportResult(null);
    }
  }, [isOpen]);

  // Calculate estimated file count
  const fileCount = useMemo(() => {
    // This would need actual data from backend, using placeholder
    return options.includeFiles ? '~23 MB' : '0';
  }, [options.includeFiles]);

  // Password strength indicator
  const passwordStrength = useMemo(() => {
    const pwd = options.password;
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return Math.min(score, 4);
  }, [options.password]);

  // Handlers
  const toggleCourse = (courseId: number) => {
    setOptions((prev) => ({
      ...prev,
      courses: prev.courses.includes(courseId)
        ? prev.courses.filter((id) => id !== courseId)
        : [...prev.courses, courseId],
    }));
  };

  const selectAllCourses = () => {
    setOptions((prev) => ({
      ...prev,
      courses: courses.map((c) => c.id),
    }));
  };

  const selectNoCourses = () => {
    setOptions((prev) => ({
      ...prev,
      courses: [],
    }));
  };

  const toggleArchivedCourse = (courseId: number) => {
    setOptions((prev) => ({
      ...prev,
      archivedCourses: prev.archivedCourses.includes(courseId)
        ? prev.archivedCourses.filter((id) => id !== courseId)
        : [...prev.archivedCourses, courseId],
    }));
  };

  const selectAllArchivedCourses = () => {
    setOptions((prev) => ({
      ...prev,
      archivedCourses: archivedCoursesList.map((c) => c.id),
    }));
  };

  const selectNoArchivedCourses = () => {
    setOptions((prev) => ({
      ...prev,
      archivedCourses: [],
    }));
  };

  const toggleInclude = (key: keyof ExportOptions) => {
    setOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleExport = async () => {
    const totalCourses = options.courses.length + options.archivedCourses.length;
    if (totalCourses === 0) {
      setExportResult({ success: false, message: 'Please select at least one course' });
      return;
    }

    if (options.encrypt && options.password.length < 8) {
      setExportResult({
        success: false,
        message: 'Password must be at least 8 characters',
      });
      return;
    }

    setIsExporting(true);
    setExportResult(null);

    try {
      const result = await window.api.exportSelective({
        courses: options.courses,
        archivedCourses:
          options.archivedCourses.length > 0 ? options.archivedCourses : undefined,
        includeTasks: options.includeTasks,
        includeNotifications: options.includeNotifications,
        includeFiles: options.includeFiles,
        includeGrades: options.includeGrades,
        includeCalendar: options.includeCalendar,
        taskStatus: options.taskStatus,
        dateRange: options.dateRange
          ? {
              start: options.dateRange.start,
              end: options.dateRange.end,
            }
          : undefined,
        format: options.format,
        encrypt: options.encrypt,
        password: options.encrypt ? options.password : undefined,
      });

      if (result.success) {
        setExportResult({
          success: true,
          message: `Export complete: ${result.data?.filePath || 'file saved'}`,
        });
      } else {
        setExportResult({
          success: false,
          message: result.error || 'Export failed',
        });
      }
    } catch (error) {
      setExportResult({
        success: false,
        message: String(error),
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const totalSelectedCourses = options.courses.length + options.archivedCourses.length;
  const canExport =
    totalSelectedCourses > 0 &&
    (!options.encrypt || options.password.length >= 8) &&
    !isExporting;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      zIndex={Z_INDEX.modalChild}
      closeOnEscape={false}
    >
      <Modal.Header title="Custom Export" onClose={onClose} />

      <Modal.Content>
        {/* Status Message */}
        {exportResult && (
          <div
            style={{
              ...styles.statusMessage,
              ...(exportResult.success ? styles.successMessage : styles.errorMessage),
            }}
          >
            {exportResult.success ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertCircle size={18} />
            )}
            {exportResult.message}
          </div>
        )}

        {/* Courses Section */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Courses</div>
          <div style={styles.courseList}>
            {courses.map((course) => (
              <div
                key={course.id}
                style={styles.courseItem}
                onClick={() => toggleCourse(course.id)}
              >
                <input
                  type="checkbox"
                  style={styles.checkbox}
                  checked={options.courses.includes(course.id)}
                  onChange={() => toggleCourse(course.id)}
                />
                <span>
                  {course.code} - {course.name}
                </span>
              </div>
            ))}
          </div>
          <div style={styles.courseActions}>
            <button style={styles.linkButton} onClick={selectAllCourses}>
              Select All
            </button>
            <button style={styles.linkButton} onClick={selectNoCourses}>
              Select None
            </button>
          </div>
        </div>

        {/* Archived Courses Section */}
        {archivedCoursesList.length > 0 && (
          <div style={styles.section}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Archive size={16} style={{ color: 'var(--text-secondary)' }} />
                <span style={styles.sectionTitle}>Archived Courses</span>
              </div>
              <button
                style={{
                  ...styles.linkButton,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                onClick={() => setShowArchived(!showArchived)}
              >
                {showArchived ? 'Hide' : `Show (${archivedCoursesList.length})`}
              </button>
            </div>
            {showArchived && (
              <>
                <div style={styles.courseList}>
                  {archivedCoursesList.map((course) => (
                    <div
                      key={course.id}
                      style={{
                        ...styles.courseItem,
                        opacity: 0.8,
                      }}
                      onClick={() => toggleArchivedCourse(course.id)}
                    >
                      <input
                        type="checkbox"
                        style={styles.checkbox}
                        checked={options.archivedCourses.includes(course.id)}
                        onChange={() => toggleArchivedCourse(course.id)}
                      />
                      <span>
                        {course.code} - {course.name}
                        <span
                          style={{
                            color: 'var(--text-tertiary)',
                            fontSize: '12px',
                            marginLeft: '8px',
                          }}
                        >
                          (archived)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <div style={styles.courseActions}>
                  <button style={styles.linkButton} onClick={selectAllArchivedCourses}>
                    Select All Archived
                  </button>
                  <button style={styles.linkButton} onClick={selectNoArchivedCourses}>
                    Select None
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Include Options */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Include</div>
          <div style={styles.includeGrid}>
            {[
              { key: 'includeTasks', label: 'Tasks' },
              { key: 'includeNotifications', label: 'Notifications' },
              { key: 'includeGrades', label: 'Grades' },
              { key: 'includeCalendar', label: 'Calendar' },
            ].map(({ key, label }) => (
              <div
                key={key}
                style={{
                  ...styles.includeOption,
                  ...(options[key as keyof ExportOptions]
                    ? styles.includeOptionSelected
                    : {}),
                }}
                onClick={() => toggleInclude(key as keyof ExportOptions)}
              >
                <input
                  type="checkbox"
                  style={styles.checkbox}
                  checked={!!options[key as keyof ExportOptions]}
                  onChange={() => toggleInclude(key as keyof ExportOptions)}
                />
                <span>{label}</span>
              </div>
            ))}
            <div
              style={{
                ...styles.includeOption,
                ...(options.includeFiles ? styles.includeOptionSelected : {}),
              }}
              onClick={() => toggleInclude('includeFiles')}
            >
              <input
                type="checkbox"
                style={styles.checkbox}
                checked={options.includeFiles}
                onChange={() => toggleInclude('includeFiles')}
              />
              <span>Downloaded files ({fileCount})</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Filters</div>
          <div style={styles.filtersRow}>
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Task status</label>
              <select
                style={styles.select}
                value={options.taskStatus}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    taskStatus: e.target.value as 'all' | 'pending' | 'completed',
                  }))
                }
              >
                <option value="all">All</option>
                <option value="pending">Pending only</option>
                <option value="completed">Completed only</option>
              </select>
            </div>
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Date range</label>
              <select
                style={styles.select}
                value={options.dateRange ? 'custom' : 'all'}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    dateRange:
                      e.target.value === 'all'
                        ? null
                        : {
                            start: new Date(
                              Date.now() - 30 * 24 * 60 * 60 * 1000
                            ).toISOString(),
                            end: new Date().toISOString(),
                          },
                  }))
                }
              >
                <option value="all">All time</option>
                <option value="custom">Last 30 days</option>
              </select>
            </div>
          </div>
        </div>

        {/* Format */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Format</div>
          <div style={styles.formatOptions}>
            <button
              style={{
                ...styles.formatButton,
                ...(options.format === 'json' ? styles.formatButtonSelected : {}),
              }}
              onClick={() => setOptions((prev) => ({ ...prev, format: 'json' }))}
            >
              <FileJson size={24} />
              <span style={styles.formatLabel}>JSON</span>
              <span style={styles.formatDesc}>Full data export</span>
            </button>
            <button
              style={{
                ...styles.formatButton,
                ...(options.format === 'csv' ? styles.formatButtonSelected : {}),
              }}
              onClick={() => setOptions((prev) => ({ ...prev, format: 'csv' }))}
            >
              <FileSpreadsheet size={24} />
              <span style={styles.formatLabel}>CSV</span>
              <span style={styles.formatDesc}>Tasks & grades only</span>
            </button>
            <button
              style={{
                ...styles.formatButton,
                ...(options.format === 'zip' ? styles.formatButtonSelected : {}),
              }}
              onClick={() => setOptions((prev) => ({ ...prev, format: 'zip' }))}
            >
              <Archive size={24} />
              <span style={styles.formatLabel}>ZIP</span>
              <span style={styles.formatDesc}>With files</span>
            </button>
          </div>
        </div>

        {/* Encryption */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Security</div>
          <div style={styles.encryptSection}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={options.encrypt}
              onChange={() => toggleInclude('encrypt')}
            />
            <Lock size={18} />
            <span>Encrypt with password</span>
          </div>
          {options.encrypt && (
            <>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  style={styles.passwordInput}
                  placeholder="Enter password (min 8 characters)"
                  value={options.password}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, password: e.target.value }))
                  }
                />
                <button
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                  }}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div style={styles.passwordStrength}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.strengthBar,
                      backgroundColor:
                        i < passwordStrength
                          ? passwordStrength >= 3
                            ? 'var(--color-success)'
                            : passwordStrength >= 2
                              ? '#f59e0b'
                              : 'var(--color-error)'
                          : 'var(--border-default)',
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </Modal.Content>

      <Modal.Footer align="between">
        <div style={styles.footerInfo}>
          {totalSelectedCourses} course{totalSelectedCourses !== 1 ? 's' : ''} selected
          {options.archivedCourses.length > 0 && (
            <span style={{ color: 'var(--text-tertiary)' }}>
              {' '}
              ({options.archivedCourses.length} archived)
            </span>
          )}
        </div>
        <div style={styles.footerButtons}>
          <button style={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{
              ...styles.exportButton,
              ...(!canExport ? styles.exportButtonDisabled : {}),
            }}
            onClick={handleExport}
            disabled={!canExport}
          >
            {isExporting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download size={18} />
                Export
              </>
            )}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
