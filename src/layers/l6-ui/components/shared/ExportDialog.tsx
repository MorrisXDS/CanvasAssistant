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
  X,
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
import { useStore } from '../../../l5-presentation/store';

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
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: '12px',
    width: '560px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    border: '1px solid var(--border-default)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    padding: '4px',
    display: 'flex',
    borderRadius: '4px',
  },
  content: {
    padding: '20px',
    overflowY: 'auto',
    flex: 1,
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  courseList: {
    maxHeight: '150px',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    padding: '8px',
  },
  courseItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--text-primary)',
  },
  courseActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: 'var(--color-blue)',
    cursor: 'pointer',
    fontSize: '13px',
    padding: 0,
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
    accentColor: 'var(--color-blue)',
  },
  includeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  includeOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    cursor: 'pointer',
    color: 'var(--text-primary)',
  },
  includeOptionSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'var(--color-blue)',
  },
  filtersRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '12px',
  },
  filterGroup: {
    flex: 1,
  },
  filterLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    display: 'block',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: '14px',
  },
  formatOptions: {
    display: 'flex',
    gap: '12px',
  },
  formatButton: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 12px',
    border: '2px solid var(--border-default)',
    borderRadius: '8px',
    background: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    color: 'var(--text-primary)',
    minHeight: '100px',
  },
  formatButtonSelected: {
    borderColor: 'var(--color-blue)',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  formatLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  formatDesc: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  encryptSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    marginBottom: '12px',
    color: 'var(--text-primary)',
  },
  passwordInput: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: '14px',
  },
  passwordStrength: {
    display: 'flex',
    gap: '4px',
    marginTop: '8px',
  },
  strengthBar: {
    flex: 1,
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'var(--border-default)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderTop: '1px solid var(--border-default)',
    gap: '12px',
    flexShrink: 0,
    backgroundColor: 'var(--bg-card)',
  },
  footerInfo: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  footerButtons: {
    display: 'flex',
    gap: '12px',
  },
  cancelButton: {
    padding: '10px 20px',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    background: 'none',
    cursor: 'pointer',
    color: 'var(--text-primary)',
    fontSize: '14px',
  },
  exportButton: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  exportButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  statusMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  successMessage: {
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
  },
  errorMessage: {
    backgroundColor: 'var(--color-error-bg)',
    color: 'var(--color-error)',
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const { courses } = useStore();

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
          console.error('Failed to fetch archived courses:', err);
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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>Custom Export</h3>
          <button style={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
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
        </div>

        {/* Footer */}
        <div style={styles.footer}>
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
        </div>
      </div>
    </div>
  );
}
