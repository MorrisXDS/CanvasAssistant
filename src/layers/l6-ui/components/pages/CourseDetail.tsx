/**
 * CourseDetail Page
 * Full course view with assignments, policies, announcements, and grade history
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Target,
  TrendingUp,
  Calendar,
  FileText,
  Bell,
  Shield,
  CheckCircle,
  Circle,
  Clock,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Megaphone,
  Edit3,
  Save,
  X,
  Settings,
  Palette,
  EyeOff,
  Eye,
  Plus,
  Copy,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import { Card, PolicyForm, ConfirmDialog } from '../shared';
import type { PolicyFormData } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import type { Task, Notification } from '../../../l5-presentation/types';

// Course color palette
const COURSE_COLORS = [
  '#007FA3', '#E53935', '#43A047', '#FB8C00', '#8E24AA',
  '#1E88E5', '#D81B60', '#00ACC1', '#7CB342', '#6D4C41',
];

function getCourseColor(courseId: number, existingColor: string | null): string {
  if (existingColor) return existingColor;
  return COURSE_COLORS[courseId % COURSE_COLORS.length];
}

function getShortCode(code: string): string {
  // Stop before a letter followed by a digit and then space/end (e.g., "H1 " or "Y1")
  const match = code.match(/^(.+?)(?=[A-Z]\d(?:\s|$))/i);
  return match ? match[1] : code.split(/\s/)[0];
}

interface CourseDetailData {
  id: number;
  externalId: string;
  code: string;
  name: string;
  targetGrade: number;
  assessedGrade: number | null;
  currentGrade: number | null;
  totalWeight: number;
  color: string | null;
  nickname: string | null;
  isHidden: boolean;
  syllabusBody: string | null;
  lastSyncedAt: string | null;
}

interface Policy {
  id: number;
  courseId: number;
  policyType: string;
  policyName: string;
  policyConfig: Record<string, unknown>;
  rawText: string | null;
  isUserVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface GradeHistoryEntry {
  id: number;
  courseId: number;
  grade: number;
  recordedAt: string;
}

// Strip HTML tags from text
function stripHtml(html: string | null): string {
  if (!html) return '';
  // Create a temporary element to parse HTML and extract text
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// Format date for display
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

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get urgency color based on due date
function getUrgencyColor(dueAt: string | null): string {
  if (!dueAt) return 'var(--text-muted)';
  const now = new Date();
  const due = new Date(dueAt);
  const hoursUntil = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil < 0) return 'var(--color-error)';
  if (hoursUntil < 24) return 'var(--color-high)';
  if (hoursUntil < 72) return 'var(--color-medium)';
  return 'var(--text-secondary)';
}

// Get policy type icon
function getPolicyIcon(policyType: string): React.ReactNode {
  switch (policyType) {
    case 'late_penalty':
      return <Clock size={16} />;
    case 'grace_token':
      return <Shield size={16} />;
    case 'drop_lowest':
      return <TrendingUp size={16} />;
    default:
      return <FileText size={16} />;
  }
}

// Format policy type for display
function formatPolicyType(policyType: string): string {
  return policyType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tasks } = useStore();

  // Task highlight from URL param
  const highlightTaskId = searchParams.get('highlightTask');
  const [highlightedTaskId, setHighlightedTaskId] = useState<number | null>(null);
  const taskRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [course, setCourse] = useState<CourseDetailData | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [gradeHistory, setGradeHistory] = useState<GradeHistoryEntry[]>([]);
  const [announcements, setAnnouncements] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing state
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetGradeInput, setTargetGradeInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  // Add Task state
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskWeight, setNewTaskWeight] = useState('');

  // Task detail/edit state
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [editTaskDueDate, setEditTaskDueDate] = useState('');
  const [editTaskWeight, setEditTaskWeight] = useState('');
  const [editTaskGrade, setEditTaskGrade] = useState('');

  // Policy management state
  const [showAddPolicy, setShowAddPolicy] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<number | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info' | 'success';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: () => {},
  });

  const courseId = Number(id);

  // Save target grade
  const handleSaveTargetGrade = async () => {
    const newTarget = parseFloat(targetGradeInput);
    if (isNaN(newTarget) || newTarget < 0 || newTarget > 100) return;

    const api = window.api;
    if (!api?.dispatch) return;

    try {
      await api.dispatch('UpdateTargetGrade', { courseId, targetGrade: newTarget });
      setCourse((prev) => prev ? { ...prev, targetGrade: newTarget } : null);
      setEditingTarget(false);
    } catch (error) {
      console.error('Failed to update target grade:', error);
    }
  };

  // Save course settings
  const handleSaveSettings = async () => {
    const api = window.api;
    if (!api?.dispatch) return;

    try {
      // Save course preferences (nickname, color)
      await api.dispatch('UpdateCoursePreferences', {
        courseId,
        preferences: {
          nickname: nicknameInput || undefined,
          color: selectedColor || undefined,
        },
      });

      // Save target grade if changed
      const newTarget = parseFloat(targetGradeInput);
      if (!isNaN(newTarget) && newTarget >= 0 && newTarget <= 100 && newTarget !== course?.targetGrade) {
        await api.dispatch('UpdateTargetGrade', { courseId, targetGrade: newTarget });
        setCourse((prev) =>
          prev ? { ...prev, nickname: nicknameInput || null, color: selectedColor, targetGrade: newTarget } : null
        );
      } else {
        setCourse((prev) =>
          prev ? { ...prev, nickname: nicknameInput || null, color: selectedColor } : null
        );
      }

      setShowSettings(false);
    } catch (error) {
      console.error('Failed to update course settings:', error);
    }
  };

  // Toggle course visibility
  const handleToggleHidden = async () => {
    const api = window.api;
    if (!api?.dispatch || !course) return;

    try {
      const newHidden = !course.isHidden;
      await api.dispatch('UpdateCoursePreferences', {
        courseId,
        preferences: { isHidden: newHidden },
      });
      setCourse((prev) => prev ? { ...prev, isHidden: newHidden } : null);
    } catch (error) {
      console.error('Failed to toggle course visibility:', error);
    }
  };

  // Create new task
  const handleCreateTask = async () => {
    const api = window.api;
    if (!api?.dispatch || !newTaskTitle.trim()) return;

    try {
      await api.dispatch('CreateTask', {
        courseId,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined,
        dueAt: newTaskDueDate || undefined,
        weight: newTaskWeight ? parseFloat(newTaskWeight) : undefined,
      });
      // Reset form
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskDueDate('');
      setNewTaskWeight('');
      setShowAddTask(false);
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  // Duplicate task
  const handleDuplicateTask = async (taskId: number) => {
    const api = window.api;
    if (!api?.dispatch) return;

    try {
      await api.dispatch('DuplicateTask', { taskId });
    } catch (error) {
      console.error('Failed to duplicate task:', error);
    }
  };

  // Toggle task completion
  const handleToggleComplete = async (task: Task) => {
    const api = window.api;
    if (!api?.dispatch) return;

    try {
      await api.dispatch('MarkTaskComplete', {
        taskId: task.id,
        isComplete: !task.isCompleted,
      });
    } catch (error) {
      console.error('Failed to toggle task completion:', error);
    }
  };

  // Start editing a task
  const startEditingTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTaskTitle(task.title);
    setEditTaskDescription(stripHtml(task.description));
    setEditTaskDueDate(task.dueAt ? task.dueAt.slice(0, 16) : '');
    setEditTaskWeight(task.weight?.toString() || '');
    setEditTaskGrade(task.grade?.toString() || '');
  };

  // Save task edits
  const handleSaveTask = async () => {
    const api = window.api;
    if (!api?.dispatch || !editingTaskId) return;

    try {
      await api.dispatch('UpdateTask', {
        taskId: editingTaskId,
        title: editTaskTitle.trim() || undefined,
        description: editTaskDescription.trim() || null,
        dueAt: editTaskDueDate || null,
        weight: editTaskWeight ? parseFloat(editTaskWeight) : undefined,
        grade: editTaskGrade ? parseFloat(editTaskGrade) : null,
      });
      setEditingTaskId(null);
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  // Delete task
  const handleDeleteTask = (taskId: number, taskTitle: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Task',
      message: `Are you sure you want to delete "${taskTitle}"? This action cannot be undone.`,
      type: 'danger',
      onConfirm: async () => {
        const api = window.api;
        if (!api?.dispatch) return;

        try {
          const result = await api.dispatch('DeleteTask', { taskId, force: true });
          if (result.success) {
            setExpandedTaskId(null);
            setEditingTaskId(null);
          }
        } catch (error) {
          console.error('Failed to delete task:', error);
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Policy handlers
  const handleSavePolicy = async (data: PolicyFormData, policyId?: number) => {
    const api = window.api;
    if (!api?.dispatch) {
      console.error('[handleSavePolicy] API dispatch not available');
      return;
    }

    console.log('[handleSavePolicy] Received data:', data);

    try {
      // Build config based on policy type
      const config: Record<string, unknown> = {
        ...data.config,
        applicable_types: data.applicableTypes,
        excluded_types: data.excludedTypes,
      };

      console.log('[handleSavePolicy] Final config:', config);

      if (policyId) {
        // Update existing
        console.log('[handleSavePolicy] Updating policy:', policyId);
        const result = await api.dispatch('UpdatePolicy', {
          policyId,
          updates: {
            policyName: data.policyName,
            policyConfig: config,
          },
        });

        console.log('[handleSavePolicy] Update result:', result);
        if (result.success) {
          const policiesData = await api.getPolicies(courseId);
          setPolicies(policiesData || []);
          setEditingPolicyId(null);
        } else {
          console.error('[handleSavePolicy] Update failed:', result.error);
        }
      } else {
        // Add new
        console.log('[handleSavePolicy] Adding new policy');
        const result = await api.dispatch('AddPolicy', {
          courseId,
          policyType: data.policyType,
          policyName: data.policyName,
          policyConfig: config,
        });

        console.log('[handleSavePolicy] Add result:', result);
        if (result.success) {
          const policiesData = await api.getPolicies(courseId);
          setPolicies(policiesData || []);
          setShowAddPolicy(false);
        } else {
          console.error('[handleSavePolicy] Add failed:', result.error);
        }
      }
    } catch (error) {
      console.error('[handleSavePolicy] Exception:', error);
    }
  };

  const handleDeletePolicy = (policyId: number, policyName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Policy',
      message: `Are you sure you want to delete "${policyName}"? This action cannot be undone.`,
      type: 'danger',
      onConfirm: async () => {
        const api = window.api;
        if (!api?.dispatch) return;

        try {
          const result = await api.dispatch('DeletePolicy', { policyId });
          if (result.success) {
            const policiesData = await api.getPolicies(courseId);
            setPolicies(policiesData || []);
          }
        } catch (error) {
          console.error('Failed to delete policy:', error);
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
    });
  };

  const startEditingPolicy = (policy: Policy) => {
    setEditingPolicyId(policy.id);
  };

  // Fetch course data
  useEffect(() => {
    const fetchData = async () => {
      // Access the global api object
      const api = window.api;

      if (!api) {
        console.error('API not available');
        setLoading(false);
        return;
      }

      try {
        // Fetch all data in parallel
        const [courseData, policiesData, historyData, announcementsData] = await Promise.all([
          api.getCourse(courseId),
          api.getPolicies(courseId),
          api.getGradeHistory(courseId),
          api.getCourseNotifications(courseId),
        ]);

        setCourse(courseData);
        setPolicies(policiesData || []);
        setGradeHistory(historyData || []);
        setAnnouncements(announcementsData || []);
      } catch (error) {
        console.error('Failed to fetch course data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (courseId) {
      fetchData();
    }
  }, [courseId]);

  // Handle task highlight from URL param
  useEffect(() => {
    if (highlightTaskId && !loading) {
      const taskId = parseInt(highlightTaskId, 10);
      if (!isNaN(taskId)) {
        // Expand and highlight the task
        setExpandedTaskId(taskId);
        setHighlightedTaskId(taskId);

        // Scroll to the task after a short delay to allow rendering
        setTimeout(() => {
          const taskElement = taskRefs.current.get(taskId);
          if (taskElement) {
            taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);

        // Clear highlight after 3 seconds
        const timer = setTimeout(() => {
          setHighlightedTaskId(null);
          // Remove the query param from URL
          setSearchParams({}, { replace: true });
        }, 3000);

        return () => clearTimeout(timer);
      }
    }
  }, [highlightTaskId, loading, setSearchParams]);

  // Filter tasks for this course
  const courseTasks = useMemo(() => {
    return tasks.filter((t) => t.courseId === courseId);
  }, [tasks, courseId]);

  // Separate tasks by status
  const { upcomingTasks, completedTasks, overdueTasks } = useMemo(() => {
    const now = new Date();
    const upcoming: Task[] = [];
    const completed: Task[] = [];
    const overdue: Task[] = [];

    for (const task of courseTasks) {
      if (task.isCompleted) {
        completed.push(task);
      } else if (task.dueAt && new Date(task.dueAt) < now) {
        overdue.push(task);
      } else {
        upcoming.push(task);
      }
    }

    // Sort upcoming by due date
    upcoming.sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

    // Sort completed by completion date (most recent first)
    completed.sort((a, b) => {
      if (!a.completedAt) return 1;
      if (!b.completedAt) return -1;
      return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
    });

    return { upcomingTasks: upcoming, completedTasks: completed, overdueTasks: overdue };
  }, [courseTasks]);

  if (loading) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.page}>
          <div style={styles.loadingState}>
            <span>Loading course...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.page}>
          <div style={styles.notFound}>
            <BookOpen size={48} color="var(--text-muted)" />
            <h2 style={styles.notFoundTitle}>Course Not Found</h2>
            <p style={styles.notFoundText}>
              This course may have been removed or doesn't exist.
            </p>
            <Link to="/courses" style={styles.backLinkNotFound}>
              <ArrowLeft size={16} />
              Back to Courses
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const courseColor = getCourseColor(course.id, course.color);
  const gradePercent = course.currentGrade ?? 0;
  const targetPercent = course.targetGrade;
  const gradeStatus =
    gradePercent >= targetPercent
      ? 'on-track'
      : gradePercent >= targetPercent - 10
      ? 'warning'
      : 'behind';

  return (
    <div style={styles.pageWrapper}>
      <div style={styles.page}>
        {/* Back Navigation */}
        <button onClick={() => navigate('/courses')} style={styles.backButton}>
          <ArrowLeft size={16} />
          <span>Courses</span>
        </button>

        {/* Course Header Card */}
        <div style={styles.headerCard}>
          <div style={{ ...styles.headerColorBar, backgroundColor: courseColor }} />
          <div style={styles.headerContent}>
            <div style={styles.headerMain}>
              <div style={styles.headerInfo}>
                <span style={{ ...styles.courseCodeBadge, backgroundColor: courseColor }}>
                  {getShortCode(course.code)}
                </span>
                <h1 style={styles.courseName}>{course.nickname || course.name}</h1>
                <span style={styles.fullCode}>{course.code}</span>
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
                        onChange={(e) => setTargetGradeInput(e.target.value)}
                        style={styles.targetInput}
                        min="0"
                        max="100"
                        step="0.1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTargetGrade();
                          if (e.key === 'Escape') setEditingTarget(false);
                        }}
                      />
                      <button style={styles.editIconButton} onClick={handleSaveTargetGrade}>
                        <Save size={14} color="var(--color-success)" />
                      </button>
                      <button style={styles.editIconButton} onClick={() => setEditingTarget(false)}>
                        <X size={14} color="var(--text-muted)" />
                      </button>
                    </div>
                  ) : (
                    <div
                      style={styles.editableValue}
                      onClick={() => {
                        setTargetGradeInput(targetPercent.toString());
                        setEditingTarget(true);
                      }}
                    >
                      <span style={styles.gradeValue}>{targetPercent}%</span>
                      <Edit3 size={12} color="var(--text-muted)" style={{ marginLeft: '4px' }} />
                    </div>
                  )}
                </div>
                <div style={styles.gradeDivider} />
                <div style={styles.gradeItem}>
                  <div style={styles.gradeLabel}>
                    <TrendingUp size={14} />
                    Current
                  </div>
                  <div
                    style={{
                      ...styles.gradeValue,
                      color:
                        gradeStatus === 'on-track'
                          ? 'var(--color-success)'
                          : gradeStatus === 'warning'
                          ? 'var(--color-medium)'
                          : 'var(--color-high)',
                    }}
                  >
                    {course.currentGrade !== null ? `${course.currentGrade.toFixed(1)}%` : '—'}
                  </div>
                </div>
                {/* Settings Button */}
                <div style={styles.gradeDivider} />
                <button
                  style={styles.settingsButton}
                  onClick={() => {
                    setNicknameInput(course.nickname || '');
                    setSelectedColor(course.color);
                    setTargetGradeInput(course.targetGrade.toString());
                    setShowSettings(!showSettings);
                  }}
                >
                  <Settings size={18} />
                </button>
              </div>
            </div>

            {/* Settings Panel - Collapsible */}
            {showSettings && (
              <div style={styles.settingsPanel}>
                <div style={styles.settingsGrid}>
                  <div style={styles.settingsField}>
                    <label style={styles.settingsLabel}>Nickname</label>
                    <input
                      type="text"
                      value={nicknameInput}
                      onChange={(e) => setNicknameInput(e.target.value)}
                      placeholder={course.name}
                      style={styles.settingsInput}
                    />
                  </div>
                  <div style={styles.settingsField}>
                    <label style={styles.settingsLabel}>Target Grade (%)</label>
                    <input
                      type="number"
                      value={targetGradeInput || targetPercent.toString()}
                      onChange={(e) => setTargetGradeInput(e.target.value)}
                      style={styles.settingsInput}
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </div>
                </div>
                <div style={styles.settingsGrid}>
                  <div style={styles.settingsField}>
                    <label style={styles.settingsLabel}>Color</label>
                    <div style={styles.colorPicker}>
                      {COURSE_COLORS.map((color) => (
                        <button
                          key={color}
                          style={{
                            ...styles.colorOption,
                            backgroundColor: color,
                            border: selectedColor === color ? '3px solid var(--text-primary)' : '3px solid transparent',
                          }}
                          onClick={() => setSelectedColor(color)}
                        />
                      ))}
                    </div>
                  </div>
                  <div style={styles.settingsField}>
                    <label style={styles.settingsLabel}>Visibility</label>
                    <button style={styles.visibilityButton} onClick={handleToggleHidden}>
                      {course.isHidden ? (
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
                </div>
                <div style={styles.settingsActions}>
                  <button style={styles.cancelButton} onClick={() => setShowSettings(false)}>
                    Cancel
                  </button>
                  <button style={styles.saveButton} onClick={handleSaveSettings}>
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {/* Grade Progress Bar */}
            <div style={styles.progressSection}>
              <div style={styles.progressBar}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${Math.min(gradePercent, 100)}%`,
                    backgroundColor:
                      gradeStatus === 'on-track'
                        ? 'var(--color-success)'
                        : gradeStatus === 'warning'
                        ? 'var(--color-medium)'
                        : 'var(--color-high)',
                  }}
                />
                <div
                  style={{
                    ...styles.targetMarker,
                    left: `${targetPercent}%`,
                  }}
                />
              </div>
              <div style={styles.progressLabels}>
                <span>0%</span>
                <span style={styles.targetLabel}>Target: {targetPercent}%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Last Synced */}
            {course.lastSyncedAt && (
              <div style={styles.syncInfo}>
                Last synced: {formatDate(course.lastSyncedAt)}
              </div>
            )}
          </div>
        </div>

        {/* Two Column Layout */}
        <div style={styles.twoColumn}>
          {/* Left Column - Assignments */}
          <div style={styles.mainColumn}>
            {/* Overdue Tasks */}
            {overdueTasks.length > 0 && (
              <Card title={`Overdue (${overdueTasks.length})`} padding="none">
                <div style={styles.taskList}>
                  {overdueTasks.map((task, index) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      isFirst={index === 0}
                      isExpanded={expandedTaskId === task.id}
                      isEditing={editingTaskId === task.id}
                      isHighlighted={highlightedTaskId === task.id}
                      editTitle={editTaskTitle}
                      editDescription={editTaskDescription}
                      editDueDate={editTaskDueDate}
                      editWeight={editTaskWeight}
                      editGrade={editTaskGrade}
                      onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      onToggleComplete={() => handleToggleComplete(task)}
                      onDuplicate={() => handleDuplicateTask(task.id)}
                      onStartEdit={() => startEditingTask(task)}
                      onCancelEdit={() => setEditingTaskId(null)}
                      onSaveEdit={handleSaveTask}
                      onDelete={() => handleDeleteTask(task.id, task.title)}
                      onEditTitleChange={setEditTaskTitle}
                      onEditDescriptionChange={setEditTaskDescription}
                      onEditDueDateChange={setEditTaskDueDate}
                      onEditWeightChange={setEditTaskWeight}
                      onEditGradeChange={setEditTaskGrade}
                      taskRef={(el) => { if (el) taskRefs.current.set(task.id, el); }}
                    />
                  ))}
                </div>
              </Card>
            )}

            {/* Upcoming Tasks */}
            <Card padding="none">
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>Upcoming Assignments ({upcomingTasks.length})</h3>
                <button
                  style={styles.addTaskButton}
                  onClick={() => setShowAddTask(!showAddTask)}
                >
                  <Plus size={16} />
                  Add Task
                </button>
              </div>

              {/* Add Task Form */}
              {showAddTask && (
                <div style={styles.addTaskForm}>
                  <input
                    type="text"
                    placeholder="Task title *"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    style={styles.addTaskInput}
                    autoFocus
                  />
                  <textarea
                    placeholder="Description (optional)"
                    value={newTaskDescription}
                    onChange={(e) => setNewTaskDescription(e.target.value)}
                    style={styles.addTaskTextarea}
                    rows={2}
                  />
                  <div style={styles.addTaskRow}>
                    <input
                      type="datetime-local"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      style={styles.addTaskInputSmall}
                      placeholder="Due date"
                    />
                    <input
                      type="number"
                      placeholder="Weight %"
                      value={newTaskWeight}
                      onChange={(e) => setNewTaskWeight(e.target.value)}
                      style={styles.addTaskInputSmall}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div style={styles.addTaskActions}>
                    <button style={styles.cancelButton} onClick={() => setShowAddTask(false)}>
                      Cancel
                    </button>
                    <button
                      style={styles.saveButton}
                      onClick={handleCreateTask}
                      disabled={!newTaskTitle.trim()}
                    >
                      Create Task
                    </button>
                  </div>
                </div>
              )}

              {upcomingTasks.length === 0 && !showAddTask ? (
                <div style={styles.emptySection}>
                  <CheckCircle size={24} color="var(--color-success)" />
                  <span>No upcoming assignments</span>
                </div>
              ) : (
                <div style={styles.taskList}>
                  {upcomingTasks.map((task, index) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      isFirst={index === 0 && !showAddTask}
                      isExpanded={expandedTaskId === task.id}
                      isEditing={editingTaskId === task.id}
                      isHighlighted={highlightedTaskId === task.id}
                      editTitle={editTaskTitle}
                      editDescription={editTaskDescription}
                      editDueDate={editTaskDueDate}
                      editWeight={editTaskWeight}
                      editGrade={editTaskGrade}
                      onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      onToggleComplete={() => handleToggleComplete(task)}
                      onDuplicate={() => handleDuplicateTask(task.id)}
                      onStartEdit={() => startEditingTask(task)}
                      onCancelEdit={() => setEditingTaskId(null)}
                      onSaveEdit={handleSaveTask}
                      onDelete={() => handleDeleteTask(task.id, task.title)}
                      onEditTitleChange={setEditTaskTitle}
                      onEditDescriptionChange={setEditTaskDescription}
                      onEditDueDateChange={setEditTaskDueDate}
                      onEditWeightChange={setEditTaskWeight}
                      onEditGradeChange={setEditTaskGrade}
                      taskRef={(el) => { if (el) taskRefs.current.set(task.id, el); }}
                    />
                  ))}
                </div>
              )}
            </Card>

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <Card title={`Completed (${completedTasks.length})`} padding="none">
                <div style={styles.taskList}>
                  {completedTasks.slice(0, 5).map((task, index) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      isFirst={index === 0}
                      isCompleted
                      isExpanded={expandedTaskId === task.id}
                      isEditing={editingTaskId === task.id}
                      isHighlighted={highlightedTaskId === task.id}
                      editTitle={editTaskTitle}
                      editDescription={editTaskDescription}
                      editDueDate={editTaskDueDate}
                      editWeight={editTaskWeight}
                      editGrade={editTaskGrade}
                      onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      onToggleComplete={() => handleToggleComplete(task)}
                      onDuplicate={() => handleDuplicateTask(task.id)}
                      onStartEdit={() => startEditingTask(task)}
                      onCancelEdit={() => setEditingTaskId(null)}
                      onSaveEdit={handleSaveTask}
                      onDelete={() => handleDeleteTask(task.id, task.title)}
                      onEditTitleChange={setEditTaskTitle}
                      onEditDescriptionChange={setEditTaskDescription}
                      onEditDueDateChange={setEditTaskDueDate}
                      onEditWeightChange={setEditTaskWeight}
                      onEditGradeChange={setEditTaskGrade}
                      taskRef={(el) => { if (el) taskRefs.current.set(task.id, el); }}
                    />
                  ))}
                  {completedTasks.length > 5 && (
                    <div style={styles.showMore}>
                      +{completedTasks.length - 5} more completed
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div style={styles.sideColumn}>
            {/* Policies */}
            <Card padding="md">
              <div style={styles.policyHeader}>
                <h3 style={styles.policySectionTitle}>Course Policies</h3>
                <button
                  style={styles.addPolicyBtn}
                  onClick={() => setShowAddPolicy(!showAddPolicy)}
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Add Policy Form */}
              {showAddPolicy && (
                <PolicyForm
                  courseId={courseId}
                  tasks={courseTasks}
                  taskGroups={[]}
                  onSave={(data) => {
                    console.log('[PolicyForm] Saving new policy:', data);
                    handleSavePolicy(data);
                  }}
                  onCancel={() => setShowAddPolicy(false)}
                />
              )}

              {policies.length === 0 && !showAddPolicy ? (
                <div style={styles.emptySideSection}>
                  <Shield size={20} color="var(--text-muted)" />
                  <span style={styles.emptySideText}>No policies configured</span>
                </div>
              ) : (
                <div style={styles.policyList}>
                  {policies.map((policy) => (
                    <div key={policy.id} style={styles.policyItemWrapper}>
                      {editingPolicyId === policy.id ? (
                        /* Edit Mode */
                        <PolicyForm
                          courseId={courseId}
                          tasks={courseTasks}
                          taskGroups={[]}
                          initialData={{
                            id: policy.id,
                            policyName: policy.policyName,
                            policyType: policy.policyType as 'late_penalty' | 'grace_tokens' | 'drop_lowest' | 'weight_transfer' | 'grade_replacement',
                            config: policy.policyConfig as Record<string, unknown>,
                            applicableTypes: (policy.policyConfig as Record<string, unknown>).applicable_types as string[] || [],
                            excludedTypes: (policy.policyConfig as Record<string, unknown>).excluded_types as string[] || [],
                          }}
                          onSave={(data) => {
                            console.log('[PolicyForm] Updating policy:', policy.id, data);
                            handleSavePolicy(data, policy.id);
                          }}
                          onCancel={() => setEditingPolicyId(null)}
                        />
                      ) : (
                        /* View Mode */
                        <div style={styles.policyItem}>
                          <div style={styles.policyIcon}>{getPolicyIcon(policy.policyType)}</div>
                          <div style={styles.policyInfo}>
                            <div style={styles.policyName}>{policy.policyName}</div>
                            <div style={styles.policyType}>{formatPolicyType(policy.policyType)}</div>
                          </div>
                          <div style={styles.policyActions}>
                            <button
                              style={styles.policyActionBtn}
                              onClick={() => startEditingPolicy(policy)}
                              title="Edit"
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              style={styles.policyActionBtn}
                              onClick={() => handleDeletePolicy(policy.id, policy.policyName)}
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Recent Announcements */}
            <Card title="Recent Announcements" padding="md">
              {announcements.length === 0 ? (
                <div style={styles.emptySideSection}>
                  <Megaphone size={20} color="var(--text-muted)" />
                  <span style={styles.emptySideText}>No announcements</span>
                </div>
              ) : (
                <div style={styles.announcementList}>
                  {announcements.slice(0, 5).map((ann) => (
                    <Link
                      key={ann.id}
                      to={`/announcement/${ann.id}`}
                      style={styles.announcementItem}
                    >
                      <div style={styles.announcementTitle}>{ann.title}</div>
                      <div style={styles.announcementDate}>
                        {formatShortDate(ann.publishedAt)}
                      </div>
                    </Link>
                  ))}
                  {announcements.length > 5 && (
                    <Link
                      to={`/announcements?course=${courseId}`}
                      style={styles.viewAllLink}
                    >
                      View all {announcements.length} announcements
                      <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              )}
            </Card>

            {/* Grade History */}
            {gradeHistory.length > 0 && (
              <Card title="Grade History" padding="md">
                <div style={styles.historyList}>
                  {gradeHistory.slice(0, 10).map((entry) => (
                    <div key={entry.id} style={styles.historyItem}>
                      <span style={styles.historyGrade}>{entry.grade.toFixed(1)}%</span>
                      <span style={styles.historyDate}>
                        {formatShortDate(entry.recordedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

// Task Item Component
interface TaskItemProps {
  task: Task;
  isFirst: boolean;
  isCompleted?: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  isHighlighted?: boolean;
  editTitle: string;
  editDescription: string;
  editDueDate: string;
  editWeight: string;
  editGrade: string;
  onToggleExpand: () => void;
  onToggleComplete: () => void;
  onDuplicate: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onEditTitleChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onEditDueDateChange: (value: string) => void;
  onEditWeightChange: (value: string) => void;
  onEditGradeChange: (value: string) => void;
  taskRef?: (el: HTMLDivElement | null) => void;
}

function TaskItem({
  task,
  isFirst,
  isCompleted,
  isExpanded,
  isEditing,
  isHighlighted,
  editTitle,
  editDescription,
  editDueDate,
  editWeight,
  editGrade,
  onToggleExpand,
  onToggleComplete,
  onDuplicate,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onEditTitleChange,
  onEditDescriptionChange,
  onEditDueDateChange,
  onEditWeightChange,
  onEditGradeChange,
  taskRef,
}: TaskItemProps) {
  return (
    <div
      ref={taskRef}
      style={{
        ...styles.taskItemWrapper,
        borderTop: isFirst ? 'none' : '1px solid var(--border-light)',
        backgroundColor: isHighlighted ? 'var(--color-info-bg)' : undefined,
        transition: 'background-color 0.5s ease',
        borderRadius: isHighlighted ? 'var(--radius-md)' : undefined,
      }}
    >
      {/* Task Row */}
      <div
        style={{
          ...styles.taskItem,
          opacity: isCompleted ? 0.7 : 1,
          backgroundColor: isExpanded ? 'var(--bg-app)' : 'transparent',
        }}
      >
        <button
          style={styles.taskCheckbox}
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete();
          }}
          title={isCompleted ? 'Mark incomplete' : 'Mark complete'}
        >
          {isCompleted ? (
            <CheckCircle size={20} color="var(--color-success)" />
          ) : (
            <Circle size={20} color="var(--text-muted)" />
          )}
        </button>
        <div style={styles.taskInfo} onClick={onToggleExpand}>
          <div
            style={{
              ...styles.taskTitle,
              textDecoration: isCompleted ? 'line-through' : 'none',
            }}
          >
            {task.title}
          </div>
          <div style={styles.taskMeta}>
            {task.dueAt && (
              <span style={{ color: isCompleted ? 'var(--text-muted)' : getUrgencyColor(task.dueAt) }}>
                <Calendar size={12} />
                {formatDate(task.dueAt)}
              </span>
            )}
            {task.weight > 0 && (
              <span style={styles.taskWeight}>
                {task.weight}%
              </span>
            )}
            {task.grade !== null && (
              <span style={styles.taskGrade}>
                {task.grade.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div style={styles.taskActions}>
          <button
            style={styles.taskActionBtn}
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="Duplicate task"
          >
            <Copy size={14} />
          </button>
          <button
            style={styles.taskActionBtn}
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronDown size={16} color="var(--text-muted)" />
            ) : (
              <ChevronRight size={16} color="var(--text-muted)" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Detail/Edit Panel */}
      {isExpanded && (
        <div style={styles.taskDetailPanel}>
          {isEditing ? (
            /* Edit Mode */
            <div style={styles.taskEditForm}>
              <div style={styles.taskEditRow}>
                <label style={styles.taskEditLabel}>Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => onEditTitleChange(e.target.value)}
                  style={styles.taskEditInput}
                />
              </div>
              <div style={styles.taskEditRow}>
                <label style={styles.taskEditLabel}>Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => onEditDescriptionChange(e.target.value)}
                  style={styles.taskEditTextarea}
                  rows={2}
                />
              </div>
              <div style={styles.taskEditRowGroup}>
                <div style={styles.taskEditRowHalf}>
                  <label style={styles.taskEditLabel}>Due Date</label>
                  <input
                    type="datetime-local"
                    value={editDueDate}
                    onChange={(e) => onEditDueDateChange(e.target.value)}
                    style={styles.taskEditInput}
                  />
                </div>
                <div style={styles.taskEditRowHalf}>
                  <label style={styles.taskEditLabel}>Weight (%)</label>
                  <input
                    type="number"
                    value={editWeight}
                    onChange={(e) => onEditWeightChange(e.target.value)}
                    style={styles.taskEditInput}
                    min="0"
                    max="100"
                  />
                </div>
                <div style={styles.taskEditRowHalf}>
                  <label style={styles.taskEditLabel}>Grade (%)</label>
                  <input
                    type="number"
                    value={editGrade}
                    onChange={(e) => onEditGradeChange(e.target.value)}
                    style={styles.taskEditInput}
                    min="0"
                    max="100"
                  />
                </div>
              </div>
              <div style={styles.taskEditActions}>
                <button style={styles.deleteButton} onClick={onDelete}>
                  <Trash2 size={14} />
                  Delete
                </button>
                <div style={styles.taskEditActionsRight}>
                  <button style={styles.cancelButton} onClick={onCancelEdit}>
                    Cancel
                  </button>
                  <button style={styles.saveButton} onClick={onSaveEdit}>
                    <Save size={14} />
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* View Mode */
            <div style={styles.taskDetailView}>
              {task.description && (
                <div style={styles.taskDescription}>{stripHtml(task.description)}</div>
              )}
              <div style={styles.taskDetailMeta}>
                <div style={styles.taskDetailItem}>
                  <span style={styles.taskDetailLabel}>Status:</span>
                  <span style={styles.taskDetailValue}>
                    {task.isCompleted ? 'Completed' : task.submissionStatus || 'Pending'}
                  </span>
                </div>
                {task.pointsPossible !== null && (
                  <div style={styles.taskDetailItem}>
                    <span style={styles.taskDetailLabel}>Points:</span>
                    <span style={styles.taskDetailValue}>{task.pointsPossible}</span>
                  </div>
                )}
                <div style={styles.taskDetailItem}>
                  <span style={styles.taskDetailLabel}>Priority:</span>
                  <span style={styles.taskDetailValue}>{task.priorityScore}</span>
                </div>
              </div>
              <div style={styles.taskDetailActions}>
                <button style={styles.editButton} onClick={onStartEdit}>
                  <Edit3 size={14} />
                  Edit
                </button>
                <button style={styles.deleteButtonSmall} onClick={onDelete}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    minHeight: '100%',
  },

  page: {
    width: '100%',
    maxWidth: 'min(1400px, calc(100vw - var(--sidebar-width) - var(--space-12)))',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    paddingBottom: 'var(--space-8)',
  },

  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'none',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
  },

  headerCard: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
  },

  headerColorBar: {
    height: '6px',
  },

  headerContent: {
    padding: 'var(--space-6)',
  },

  headerMain: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-5)',
  },

  headerInfo: {
    flex: '1 1 250px',
    minWidth: 0,
  },

  courseCodeBadge: {
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '4px 10px',
    borderRadius: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
    marginBottom: 'var(--space-2)',
  },

  courseName: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
    lineHeight: 'var(--leading-snug)',
  },

  fullCode: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },

  gradeSummary: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    flexShrink: 0,
  },

  gradeItem: {
    textAlign: 'center',
  },

  gradeLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-1)',
  },

  gradeValue: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
  },

  gradeDivider: {
    width: '1px',
    height: '40px',
    backgroundColor: 'var(--border-light)',
  },

  editableValue: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
  },

  editTargetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },

  targetInput: {
    width: '60px',
    padding: 'var(--space-1) var(--space-2)',
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-bold)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    textAlign: 'center',
  },

  editIconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
  },

  settingsButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    padding: 0,
    background: 'none',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },

  settingsPanel: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    marginTop: 'var(--space-4)',
  },

  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },

  settingsField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  settingsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-3)',
  },

  settingsLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-1)',
  },

  settingsInput: {
    width: '100%',
    height: '36px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
  },

  colorPicker: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  colorOption: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'transform var(--transition-fast)',
  },

  visibilityButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    height: '36px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },

  settingsActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-4)',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--border-light)',
  },

  cancelButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },

  saveButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    backgroundColor: 'var(--color-navy)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'white',
  },

  progressSection: {
    marginBottom: 'var(--space-3)',
  },

  progressBar: {
    position: 'relative',
    height: '8px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: '4px',
    overflow: 'visible',
    marginBottom: 'var(--space-2)',
  },

  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },

  targetMarker: {
    position: 'absolute',
    top: '-4px',
    width: '2px',
    height: '16px',
    backgroundColor: 'var(--color-navy)',
    transform: 'translateX(-50%)',
  },

  progressLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  targetLabel: {
    color: 'var(--color-navy)',
    fontWeight: 'var(--font-medium)',
  },

  syncInfo: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textAlign: 'right',
  },

  twoColumn: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) clamp(280px, 30%, 380px)',
    gap: 'var(--space-4)',
  },

  mainColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    minWidth: 0,
  },

  sideColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    minWidth: 0,
  },

  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  cardTitle: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  addTaskButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  addTaskForm: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    borderBottom: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  addTaskInput: {
    padding: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
  },

  addTaskTextarea: {
    padding: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    resize: 'vertical',
    fontFamily: 'inherit',
  },

  addTaskRow: {
    display: 'flex',
    gap: 'var(--space-3)',
  },

  addTaskInputSmall: {
    flex: 1,
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
  },

  addTaskActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-2)',
  },

  taskList: {
    display: 'flex',
    flexDirection: 'column',
  },

  taskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  taskIcon: {
    flexShrink: 0,
  },

  taskInfo: {
    flex: 1,
    minWidth: 0,
  },

  taskTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: '2px',
  },

  taskMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  taskWeight: {
    padding: '1px 6px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-sm)',
  },

  taskGrade: {
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-success)',
  },

  taskActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  duplicateButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    background: 'none',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    transition: 'all var(--transition-fast)',
  },

  taskItemWrapper: {
    display: 'flex',
    flexDirection: 'column',
  },

  taskCheckbox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },

  taskActionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    borderRadius: 'var(--radius-sm)',
  },

  taskDetailPanel: {
    padding: 'var(--space-4)',
    paddingLeft: 'var(--space-12)',
    backgroundColor: 'var(--bg-app)',
    borderTop: '1px solid var(--border-light)',
  },

  taskDetailView: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  taskDescription: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },

  taskDetailMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  taskDetailItem: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  taskDetailLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  taskDetailValue: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  taskDetailActions: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-2)',
  },

  editButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  deleteButtonSmall: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-error)',
    cursor: 'pointer',
  },

  taskEditForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  taskEditRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  taskEditRowGroup: {
    display: 'flex',
    gap: 'var(--space-3)',
  },

  taskEditRowHalf: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  taskEditLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
  },

  taskEditInput: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
  },

  taskEditTextarea: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    resize: 'vertical',
    fontFamily: 'inherit',
  },

  taskEditActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'var(--space-2)',
  },

  taskEditActionsRight: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  deleteButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-error)',
    cursor: 'pointer',
  },

  emptySection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-6)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
  },

  emptySideSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-4)',
    textAlign: 'center',
  },

  emptySideText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },

  showMore: {
    padding: 'var(--space-3) var(--space-4)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    borderTop: '1px solid var(--border-light)',
  },

  policyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  policyItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
  },

  policyIcon: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
  },

  policyInfo: {
    flex: 1,
    minWidth: 0,
  },

  policyName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  policyType: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  policyHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },

  policySectionTitle: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  addPolicyBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  addPolicyForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-3)',
  },

  policyInput: {
    padding: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
  },

  policySelect: {
    padding: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
  },

  policyFormActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-2)',
  },

  policyItemWrapper: {
    marginBottom: 'var(--space-2)',
  },

  policyEditForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
  },

  policyActions: {
    display: 'flex',
    gap: 'var(--space-1)',
  },

  policyActionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    borderRadius: 'var(--radius-sm)',
  },

  announcementList: {
    display: 'flex',
    flexDirection: 'column',
  },

  announcementItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--border-light)',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
  },

  announcementTitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    marginRight: 'var(--space-2)',
  },

  announcementDate: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    flexShrink: 0,
  },

  viewAllLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-3) 0',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-blue)',
    cursor: 'pointer',
    textDecoration: 'none',
  },

  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-1) 0',
  },

  historyGrade: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  historyDate: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-12)',
    color: 'var(--text-secondary)',
  },

  notFound: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: 'var(--space-12)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
  },

  notFoundTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginTop: 'var(--space-4)',
    marginBottom: 'var(--space-2)',
  },

  notFoundText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
  },

  backLinkNotFound: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    color: 'var(--color-navy)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    textDecoration: 'none',
  },
};

export default CourseDetail;
