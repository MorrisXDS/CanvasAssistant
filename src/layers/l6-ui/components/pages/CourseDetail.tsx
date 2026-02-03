/**
 * CourseDetail Page
 * Full course view with assignments, policies, announcements, and grade history
 */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  Clock,
  ChevronRight,
  X,
  Plus,
  Trash2,
  ChevronDown,
  GripVertical,
  Archive,
  RefreshCw,
  FileText,
} from 'lucide-react';
import {
  Card,
  PolicyModal,
  ConfirmDialog,
  PolicyBadgeGroup,
  RichTextEditor,
} from '../shared';
import type { PolicyModalData, PolicyType } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import {
  STORAGE_KEYS,
  LINK_BEHAVIOR,
  type LinkBehavior,
} from '../../../l5-presentation/settings';
import type { Task, Notification, Policy } from '../../../l5-presentation/types';
import { getCourseColor } from '../../constants';
import {
  SyllabusSelector,
  TaskContextMenu,
  MissingSyllabusWarning,
  DuplicateCourseworkBanner,
  type CourseSyllabus,
} from '../Course';
import type { FileResource } from '../Files/FileListItem';
import { useCourseDetailDragDrop } from './useCourseDetailDragDrop';
import { courseDetailStyles as styles } from './CourseDetail.styles';
import {
  TaskItem,
  TaskListModal,
  PoliciesCard,
  AnnouncementsCard,
  GradeHistoryCard,
  CourseHeader,
  AddTaskForm,
  type GradeHistoryEntry,
} from '../CourseDetail/components';

/**
 * Get the user's link behavior preference from localStorage
 */
function getLinkBehaviorPreference(): LinkBehavior {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CONTENT);
    if (stored) {
      const settings = JSON.parse(stored);
      return settings.linkBehavior ?? LINK_BEHAVIOR.ALWAYS_EXTERNAL;
    }
  } catch {
    // Ignore parse errors
  }
  return LINK_BEHAVIOR.ALWAYS_EXTERNAL;
}

/**
 * Extract Canvas file ID from a URL if possible
 * Returns null if not a Canvas file URL
 */
function extractCanvasFileId(url: string): string | null {
  // Match patterns like /files/12345 or /files/12345/download
  const match = url.match(/\/files\/(\d+)/);
  return match ? match[1] : null;
}

interface CourseDetailData {
  id: number;
  externalId: string;
  code: string;
  name: string;
  targetGrade: number;
  targetGradeSource: 'default' | 'manual';
  assessedGrade: number | null;
  currentGrade: number | null;
  totalWeight: number;
  color: string | null;
  nickname: string | null;
  isHidden: boolean;
  syllabusBody: string | null;
  lastSyncedAt: string | null;
  credits: number;
  archivedAt: string | null;
  archiveSource: 'manual' | 'auto' | null;
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

export function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tasks: storeTasks } = useStore();

  // Local state for archived course tasks (fetched directly, bypasses visibility filtering)
  const [archivedCourseTasks, setArchivedCourseTasks] = useState<Task[]>([]);

  // Task highlight/edit from URL params
  const highlightTaskId = searchParams.get('highlightTask');
  const editTaskId = searchParams.get('editTask');
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
  const [creditsInput, setCreditsInput] = useState('');

  // Add Task state
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskWeight, setNewTaskWeight] = useState('');
  const [newTaskType, setNewTaskType] = useState('');

  // Task detail/edit state
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [editTaskOriginalDescription, setEditTaskOriginalDescription] = useState(''); // Track original stripped description
  const [editTaskStartDate, setEditTaskStartDate] = useState('');
  const [editTaskDueDate, setEditTaskDueDate] = useState('');
  const [editTaskWeight, setEditTaskWeight] = useState('');
  const [editTaskGrade, setEditTaskGrade] = useState('');
  const [editTaskType, setEditTaskType] = useState('');
  const [editTaskLocation, setEditTaskLocation] = useState('');

  // Policy modal state
  const [policyModalState, setPolicyModalState] = useState<{
    isOpen: boolean;
    editData?: {
      id: number;
      policyType: PolicyType;
      policyName: string;
      config: Record<string, unknown>;
    };
  }>({ isOpen: false });
  const [policyLoading, setPolicyLoading] = useState(false);

  // Syllabus and enhanced policy state
  const [syllabus, setSyllabus] = useState<CourseSyllabus | null>(null);
  const [courseFiles, setCourseFiles] = useState<FileResource[]>([]);
  const [_settingsLoading, _setSettingsLoading] = useState(false);
  const [showSyllabusSelector, setShowSyllabusSelector] = useState(false);
  const [syllabusWarningDismissed, setSyllabusWarningDismissed] = useState(false);
  const [syllabusContextMenu, setSyllabusContextMenu] = useState<{ x: number; y: number } | null>(null);
  const syllabusClickTimeout = useRef<NodeJS.Timeout | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info' | 'success';
    confirmText: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    confirmText: 'Confirm',
    onConfirm: () => {},
  });

  // Task list modal state
  const [taskListModal, setTaskListModal] = useState<{
    isOpen: boolean;
    title: string;
    tasks: Task[];
  }>({
    isOpen: false,
    title: '',
    tasks: [],
  });

  // Task context menu state
  const [taskContextMenu, setTaskContextMenu] = useState<{
    task: Task;
    position: { x: number; y: number };
  } | null>(null);

  // Pending file download state (for link click handling)
  const [pendingFileDownload, setPendingFileDownload] = useState<{
    fileId: number;
    title: string;
    href: string;
  } | null>(null);

  // Archived course warning state
  const [archivedWarningAcknowledged, setArchivedWarningAcknowledged] = useState(() => {
    // Check if user has globally dismissed archived warnings
    const globalDismiss = localStorage.getItem('archivedCourseWarningDismissed');
    if (globalDismiss === 'true') return true;
    // Check if dismissed for this specific course
    const dismissedCourses = JSON.parse(
      localStorage.getItem('archivedCourseWarningDismissedIds') || '[]'
    );
    return dismissedCourses.includes(Number(id));
  });

  const handleAcknowledgeArchivedWarning = (neverShowAgain: boolean) => {
    if (neverShowAgain) {
      localStorage.setItem('archivedCourseWarningDismissed', 'true');
    } else {
      const dismissedCourses = JSON.parse(
        localStorage.getItem('archivedCourseWarningDismissedIds') || '[]'
      );
      if (!dismissedCourses.includes(courseId)) {
        dismissedCourses.push(courseId);
        localStorage.setItem(
          'archivedCourseWarningDismissedIds',
          JSON.stringify(dismissedCourses)
        );
      }
    }
    setArchivedWarningAcknowledged(true);
  };

  // Maximum items to show in each list before "View all"
  const MAX_VISIBLE_ITEMS = 5;

  // Drag-and-drop for section reordering
  const {
    taskSectionOrder,
    taskDragState,
    taskDragHandlers,
    sidebarOrder,
    sidebarDragState,
    sidebarDragHandlers,
  } = useCourseDetailDragDrop();

  const courseId = Number(id);

  // Save target grade
  const handleSaveTargetGrade = async () => {
    const newTarget = parseFloat(targetGradeInput);
    if (isNaN(newTarget) || newTarget < 0 || newTarget > 100) return;

    const api = window.api;
    if (!api?.dispatch) return;

    try {
      await api.dispatch('UpdateTargetGrade', { courseId, targetGrade: newTarget });
      // Mark as 'manual' since user explicitly changed it
      setCourse((prev) =>
        prev ? { ...prev, targetGrade: newTarget, targetGradeSource: 'manual' } : null
      );
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
      // Parse credits
      const newCredits = parseFloat(creditsInput);
      const validCredits = !isNaN(newCredits) && newCredits >= 0 && newCredits <= 10;

      // Save course preferences (nickname, color, credits)
      await api.dispatch('UpdateCoursePreferences', {
        courseId,
        preferences: {
          nickname: nicknameInput || undefined,
          color: selectedColor || undefined,
          credits: validCredits ? newCredits : undefined,
        },
      });

      // Save target grade if changed (marks as 'manual')
      const newTarget = parseFloat(targetGradeInput);
      if (
        !isNaN(newTarget) &&
        newTarget >= 0 &&
        newTarget <= 100 &&
        newTarget !== course?.targetGrade
      ) {
        await api.dispatch('UpdateTargetGrade', { courseId, targetGrade: newTarget });
        setCourse((prev) =>
          prev
            ? {
                ...prev,
                nickname: nicknameInput || null,
                color: selectedColor,
                targetGrade: newTarget,
                targetGradeSource: 'manual',
                credits: validCredits ? newCredits : prev.credits,
              }
            : null
        );
      } else {
        setCourse((prev) =>
          prev
            ? {
                ...prev,
                nickname: nicknameInput || null,
                color: selectedColor,
                credits: validCredits ? newCredits : prev.credits,
              }
            : null
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
      setCourse((prev) => (prev ? { ...prev, isHidden: newHidden } : null));
    } catch (error) {
      console.error('Failed to toggle course visibility:', error);
    }
  };

  // Archive/Unarchive course
  const handleArchiveCourse = async () => {
    const api = window.api;
    if (!api?.dispatch || !course) return;

    try {
      const result = await api.dispatch('ArchiveCourse', { courseId });
      if (result.success) {
        // Navigate back to courses page after archiving
        navigate('/courses');
      }
    } catch (error) {
      console.error('Failed to archive course:', error);
    }
  };

  // Syllabus handlers
  const handleSetSyllabus = async (resourceId: number) => {
    const api = window.api;
    if (!api?.dispatch) return;

    _setSettingsLoading(true);
    try {
      const result = await api.dispatch('SetCourseSyllabus', { courseId, resourceId });
      if (result.success && result.data) {
        const file = courseFiles.find((f) => f.id === resourceId);
        setSyllabus({
          id: result.data.syllabusId,
          courseId,
          resourceId,
          resourceTitle: file?.title ?? 'Unknown file',
          resourceUpdatedAt: null,
          lastReviewedAt: result.data.lastReviewedAt,
          changeDetectedAt: null,
          markedAt: result.data.lastReviewedAt,
        });
      }
    } catch (error) {
      console.error('Failed to set syllabus:', error);
    } finally {
      _setSettingsLoading(false);
    }
  };

  const _handleMarkSyllabusReviewed = async () => {
    const api = window.api;
    if (!api?.dispatch) return;

    _setSettingsLoading(true);
    try {
      const result = await api.dispatch('MarkSyllabusReviewed', { courseId });
      if (result.success && result.data) {
        setSyllabus((prev) =>
          prev
            ? {
                ...prev,
                lastReviewedAt: result.data.lastReviewedAt,
                changeDetectedAt: null,
              }
            : null
        );
      }
    } catch (error) {
      console.error('Failed to mark syllabus reviewed:', error);
    } finally {
      _setSettingsLoading(false);
    }
  };

  const handleRemoveSyllabus = async () => {
    const api = window.api;
    if (!api?.dispatch) return;

    _setSettingsLoading(true);
    try {
      await api.dispatch('RemoveCourseSyllabus', { courseId });
      setSyllabus(null);
    } catch (error) {
      console.error('Failed to remove syllabus:', error);
    } finally {
      _setSettingsLoading(false);
    }
  };

  // Refresh archived course tasks (for archived courses only)
  const refreshArchivedCourseTasks = async () => {
    if (!course?.archivedAt) return;
    const api = window.api;
    if (!api?.getTasksForArchivedCourse) return;
    try {
      const tasks = await api.getTasksForArchivedCourse(courseId);
      setArchivedCourseTasks(tasks || []);
    } catch (error) {
      console.error('Failed to refresh archived course tasks:', error);
    }
  };

  // Create new task
  const handleCreateTask = async () => {
    const api = window.api;
    if (!api?.dispatch || !newTaskTitle.trim()) return;

    try {
      // Convert datetime-local values to ISO strings if set
      const unlockAt = newTaskStartDate
        ? new Date(newTaskStartDate).toISOString()
        : undefined;
      const dueAt = newTaskDueDate
        ? new Date(newTaskDueDate).toISOString()
        : undefined;

      await api.dispatch('CreateTask', {
        courseId,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined,
        unlockAt,
        dueAt,
        weight: newTaskWeight ? parseFloat(newTaskWeight) : undefined,
        taskType: newTaskType || undefined,
      });
      // Reset form
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskStartDate('');
      setNewTaskDueDate('');
      setNewTaskWeight('');
      setNewTaskType('');
      setShowAddTask(false);
      // Refresh archived course tasks if applicable
      await refreshArchivedCourseTasks();
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
      await refreshArchivedCourseTasks();
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
      await refreshArchivedCourseTasks();
    } catch (error) {
      console.error('Failed to toggle task completion:', error);
    }
  };

  // Start editing a task (also expands it)
  const startEditingTask = (task: Task) => {
    // Set all edit fields first
    setEditTaskTitle(task.title);
    // Keep original HTML to preserve links and formatting
    // User can edit around HTML tags to keep links intact
    const originalDescription = task.description || '';
    setEditTaskDescription(originalDescription);
    setEditTaskOriginalDescription(originalDescription);

    // Helper to convert ISO string to datetime-local format
    const formatDateForInput = (isoString: string | null): string => {
      if (!isoString) return '';
      const date = new Date(isoString);
      // Check if it's epoch time (1970-01-01) - treat as "not set"
      if (date.getTime() === 0) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    setEditTaskStartDate(formatDateForInput(task.unlockAt));
    setEditTaskDueDate(formatDateForInput(task.dueAt));
    setEditTaskWeight(task.weight?.toString() || '');
    setEditTaskGrade(task.grade?.toString() || '');
    setEditTaskType(task.taskType || '');
    setEditTaskLocation(task.location || '');
    // Set editing and expanded state together at the end
    setEditingTaskId(task.id);
    setExpandedTaskId(task.id);
  };

  // Save task edits
  const handleSaveTask = async () => {
    const api = window.api;
    if (!api?.dispatch || !editingTaskId) return;

    try {
      // Only include description if it was actually changed
      const descriptionChanged = editTaskDescription !== editTaskOriginalDescription;

      // Convert empty start date to epoch time (1970-01-01T00:00:00.000Z)
      const unlockAt = editTaskStartDate
        ? new Date(editTaskStartDate).toISOString()
        : '1970-01-01T00:00:00.000Z';

      await api.dispatch('UpdateTask', {
        taskId: editingTaskId,
        title: editTaskTitle.trim() || undefined,
        // Only send description if user actually modified it (preserves HTML/links if unchanged)
        ...(descriptionChanged && { description: editTaskDescription || null }),
        unlockAt,
        dueAt: editTaskDueDate || null,
        weight: editTaskWeight ? parseFloat(editTaskWeight) : undefined,
        grade: editTaskGrade ? parseFloat(editTaskGrade) : null,
        taskType: editTaskType || null,
        location: editTaskLocation || null,
      });
      setEditingTaskId(null);
      await refreshArchivedCourseTasks();
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
      confirmText: 'Delete',
      onConfirm: async () => {
        const api = window.api;
        if (!api?.dispatch) return;

        try {
          const result = await api.dispatch('DeleteTask', { taskId, force: true });
          if (result.success) {
            setExpandedTaskId(null);
            setEditingTaskId(null);
            await refreshArchivedCourseTasks();
          }
        } catch (error) {
          console.error('Failed to delete task:', error);
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Task context menu handlers
  const handleTaskContextMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    setTaskContextMenu({ task, position: { x: e.clientX, y: e.clientY } });
  };

  const handleOpenTaskInCanvas = async (task: Task) => {
    const api = window.api;
    if (!api?.getTaskCanvasUrl || !api?.openExternal) return;

    try {
      const result = await api.getTaskCanvasUrl(task.id);
      if (result.success && result.data?.canvasUrl) {
        api.openExternal(result.data.canvasUrl);
      }
    } catch (error) {
      console.error('Failed to open task in Canvas:', error);
    }
  };

  // Toggle optional status with confirmation
  const handleToggleOptional = (task: Task) => {
    const isCurrentlyOptional = task.isOptional;
    const action = isCurrentlyOptional ? 'restore' : 'mark as optional';
    const description = isCurrentlyOptional
      ? `This will move "${task.title}" back to its original section based on submission status.`
      : `This will move "${task.title}" to the "Not for Grade" section. Canvas sync will no longer update its status.`;

    setConfirmDialog({
      isOpen: true,
      title: isCurrentlyOptional ? 'Restore Task' : 'Mark as Optional',
      message: description,
      type: 'info',
      confirmText: isCurrentlyOptional ? 'Restore' : 'Mark Optional',
      onConfirm: async () => {
        const api = window.api;
        if (!api?.dispatch) return;

        try {
          await api.dispatch('UpdateTask', {
            taskId: task.id,
            isOptional: !isCurrentlyOptional,
          });
        } catch (error) {
          console.error(`Failed to ${action} task:`, error);
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Policy handlers
  const handleSavePolicy = async (data: PolicyModalData) => {
    const api = window.api;
    if (!api?.dispatch) {
      console.error('[handleSavePolicy] API dispatch not available');
      return;
    }

    setPolicyLoading(true);

    try {
      const policyId = policyModalState.editData?.id;

      if (policyId) {
        // Update existing
        const result = await api.dispatch('UpdatePolicy', {
          policyId,
          updates: {
            policyName: data.policyName,
            policyConfig: data.config,
          },
        });

        if (result.success) {
          const policiesData = await api.getPolicies(courseId);
          setPolicies(policiesData || []);
          setPolicyModalState({ isOpen: false });
        } else {
          console.error('[handleSavePolicy] Update failed:', result.error);
        }
      } else {
        // Add new
        const result = await api.dispatch('AddPolicy', {
          courseId,
          policyType: data.policyType,
          policyName: data.policyName,
          policyConfig: data.config,
        });

        if (result.success) {
          const policiesData = await api.getPolicies(courseId);
          setPolicies(policiesData || []);
          setPolicyModalState({ isOpen: false });
        } else {
          console.error('[handleSavePolicy] Add failed:', result.error);
        }
      }
    } catch (error) {
      console.error('[handleSavePolicy] Exception:', error);
    } finally {
      setPolicyLoading(false);
    }
  };

  const openAddPolicyModal = () => {
    setPolicyModalState({ isOpen: true });
  };

  const openEditPolicyModal = (policy: Policy) => {
    setPolicyModalState({
      isOpen: true,
      editData: {
        id: policy.id,
        policyType: policy.policyType as PolicyType,
        policyName: policy.policyName,
        config: policy.policyConfig as Record<string, unknown>,
      },
    });
  };

  const closePolicyModal = () => {
    setPolicyModalState({ isOpen: false });
  };

  const handleDeletePolicy = (policyId: number, policyName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Policy',
      message: `Are you sure you want to delete "${policyName}"?`,
      type: 'danger',
      confirmText: 'Delete',
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
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Syllabus click handlers for CourseHeader
  const handleSyllabusClick = () => {
    // Delay single-click to allow double-click to cancel it
    if (syllabusClickTimeout.current) {
      clearTimeout(syllabusClickTimeout.current);
    }
    syllabusClickTimeout.current = setTimeout(() => {
      setShowSyllabusSelector(true);
    }, 250);
  };

  const handleSyllabusDoubleClick = () => {
    // Cancel single-click action
    if (syllabusClickTimeout.current) {
      clearTimeout(syllabusClickTimeout.current);
      syllabusClickTimeout.current = null;
    }
    if (!syllabus) {
      // No syllabus - open selector instead
      setShowSyllabusSelector(true);
      return;
    }
    const api = window.api;

    // Check if syllabus file is downloaded
    const syllabusFile = courseFiles.find((f) => f.id === syllabus.resourceId);
    const isDownloaded = syllabusFile?.localPath != null;

    if (!isDownloaded) {
      // Prompt to download first
      setConfirmDialog({
        isOpen: true,
        title: 'Download Syllabus',
        message: `"${syllabus.resourceTitle}" hasn't been downloaded yet. Would you like to download it now?`,
        type: 'info',
        confirmText: 'Download',
        onConfirm: async () => {
          try {
            if (syllabus.resourceId < 0) {
              await api?.downloadAttachment(Math.abs(syllabus.resourceId));
            } else {
              await api?.downloadResource(syllabus.resourceId);
            }
            // Refresh course files to update download status
            const updatedFiles = await api?.getCourseFiles?.(courseId);
            if (updatedFiles) setCourseFiles(updatedFiles);
          } catch (error) {
            console.error('Failed to download syllabus:', error);
          }
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
      return;
    }

    // File is downloaded - open it
    if (syllabus.resourceId < 0) {
      api
        ?.openAttachment(Math.abs(syllabus.resourceId))
        .catch((error: unknown) => console.error('Failed to open syllabus:', error));
    } else {
      api
        ?.openResource(syllabus.resourceId)
        .catch((error: unknown) => console.error('Failed to open syllabus:', error));
    }
  };

  const handleSyllabusContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setSyllabusContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Settings toggle handler
  const handleToggleSettings = () => {
    if (!course) return;
    setNicknameInput(course.nickname || '');
    setSelectedColor(course.color);
    setTargetGradeInput(course.targetGrade.toString());
    setCreditsInput(course.credits?.toString() || '1.0');
    setShowSettings(!showSettings);
  };

  // Start editing target grade
  const handleStartEditTarget = () => {
    if (!course) return;
    setTargetGradeInput(course.targetGrade.toString());
    setEditingTarget(true);
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
        const [
          courseData,
          policiesData,
          historyData,
          announcementsData,
          syllabusData,
          filesData,
        ] = await Promise.all([
          api.getCourse(courseId),
          api.getPolicies(courseId),
          api.getGradeHistory(courseId),
          api.getCourseNotifications(courseId),
          api.getCourseSyllabus?.(courseId).catch(() => null),
          api.getCourseFiles?.(courseId).catch(() => []),
        ]);

        setCourse(courseData);
        setPolicies(policiesData || []);
        setGradeHistory(historyData || []);
        setAnnouncements(announcementsData || []);

        // Map syllabus API response to CourseSyllabus interface
        if (syllabusData && syllabusData.type === 'resource') {
          setSyllabus({
            id: syllabusData.resourceId,
            courseId,
            resourceId: syllabusData.resourceId,
            resourceTitle: syllabusData.title || 'Unknown file',
            resourceUpdatedAt: syllabusData.downloadedAt || null,
            lastReviewedAt: syllabusData.reviewedAt || syllabusData.designatedAt,
            changeDetectedAt: null,
            markedAt: syllabusData.designatedAt,
          });
        } else {
          setSyllabus(null);
        }
        setCourseFiles(filesData || []);

        // For archived courses, fetch tasks directly (bypasses visibility filtering)
        if (courseData?.archivedAt && api.getTasksForArchivedCourse) {
          const archivedTasks = await api.getTasksForArchivedCourse(courseId);
          setArchivedCourseTasks(archivedTasks || []);
        }
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

  // Handle task highlight/edit from URL params
  useEffect(() => {
    const targetTaskId = editTaskId || highlightTaskId;
    if (targetTaskId && !loading) {
      const taskId = parseInt(targetTaskId, 10);
      if (!isNaN(taskId)) {
        // Expand and highlight the task
        setExpandedTaskId(taskId);
        setHighlightedTaskId(taskId);

        // If editTask param is present, also start editing
        if (editTaskId) {
          // Look up task from store or archived tasks
          const allTasks = course?.archivedAt ? archivedCourseTasks : storeTasks;
          const task = allTasks.find((t) => t.id === taskId);
          if (task) {
            startEditingTask(task);
          }
        }

        // Scroll to the task after a short delay to allow rendering
        setTimeout(() => {
          const taskElement = taskRefs.current.get(taskId);
          if (taskElement) {
            taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);

        // Clear highlight after 3 seconds (only if not editing)
        if (!editTaskId) {
          const timer = setTimeout(() => {
            setHighlightedTaskId(null);
            // Remove the query param from URL
            setSearchParams({}, { replace: true });
          }, 3000);

          return () => clearTimeout(timer);
        } else {
          // Remove edit param from URL immediately to prevent re-triggering
          setSearchParams({}, { replace: true });
        }
      }
    }
  }, [highlightTaskId, editTaskId, loading, setSearchParams, course?.archivedAt, archivedCourseTasks, storeTasks]);

  // Filter tasks for this course
  // For archived courses, use directly fetched tasks (bypasses visibility filtering)
  // For active courses, use store tasks (respects visibility filtering)
  const courseTasks = useMemo(() => {
    if (course?.archivedAt) {
      return archivedCourseTasks;
    }
    return storeTasks.filter((t) => t.courseId === courseId);
  }, [course?.archivedAt, archivedCourseTasks, storeTasks, courseId]);

  // Separate tasks by status: pending, submitted, graded, info (not for grade)
  const { pendingTasks, submittedTasks, gradedTasks, infoTasks } = useMemo(() => {
    const pending: Task[] = [];
    const submitted: Task[] = [];
    const graded: Task[] = [];
    const info: Task[] = [];

    for (const task of courseTasks) {
      // Check if task is optional (user-marked) or "info" type (not graded from Canvas)
      if (task.isOptional || task.taskType === 'info') {
        info.push(task);
      } else if (task.grade !== null) {
        // Has a grade - graded
        graded.push(task);
      } else if (task.isCompleted || task.submissionStatus === 'submitted') {
        // Submitted but not yet graded
        submitted.push(task);
      } else {
        // Not submitted yet - pending
        pending.push(task);
      }
    }

    // Sort pending by due date (earliest first)
    pending.sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

    // Sort submitted by due date (earliest first)
    submitted.sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

    // Sort graded by due date (most recent first)
    graded.sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime();
    });

    // Sort info by title alphabetically
    info.sort((a, b) => a.title.localeCompare(b.title));

    return {
      pendingTasks: pending,
      submittedTasks: submitted,
      gradedTasks: graded,
      infoTasks: info,
    };
  }, [courseTasks]);

  // Calculate progress from tasks that have BOTH weight AND grade
  // Must be before early returns to follow React hooks rules
  const { completedWeight, earnedContribution } = useMemo(() => {
    let totalWeight = 0;
    let totalContribution = 0;

    for (const task of courseTasks) {
      // Only count tasks that have both weight > 0 AND grade is not null
      if (task.weight > 0 && task.grade !== null) {
        totalWeight += task.weight;
        // Contribution = (score/100) * weight
        // e.g., 100% score on 5% weight = 5% contribution
        // e.g., 50% score on 10% weight = 5% contribution
        totalContribution += (task.grade / 100) * task.weight;
      }
    }

    return {
      completedWeight: totalWeight,
      earnedContribution: totalContribution,
    };
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
  const targetPercent = course.targetGrade;

  // Determine grade status based on how well earned contribution compares to target
  // Compare (earnedContribution / completedWeight) to target
  const effectiveGrade =
    completedWeight > 0 ? (earnedContribution / completedWeight) * 100 : 0;
  const gradeStatus =
    effectiveGrade >= targetPercent
      ? 'on-track'
      : effectiveGrade >= targetPercent - 10
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
        <CourseHeader
          course={{
            id: course.id,
            code: course.code,
            name: course.name,
            nickname: course.nickname,
            color: course.color,
            isHidden: course.isHidden,
            targetGrade: course.targetGrade,
            targetGradeSource: course.targetGradeSource,
            lastSyncedAt: course.lastSyncedAt,
            archivedAt: course.archivedAt,
            archiveSource: course.archiveSource,
            credits: course.credits,
          }}
          courseColor={courseColor}
          completedWeight={completedWeight}
          earnedContribution={earnedContribution}
          effectiveGrade={effectiveGrade}
          gradeStatus={gradeStatus}
          editingTarget={editingTarget}
          targetGradeInput={targetGradeInput}
          onStartEditTarget={handleStartEditTarget}
          onTargetGradeInputChange={setTargetGradeInput}
          onSaveTargetGrade={handleSaveTargetGrade}
          onCancelEditTarget={() => setEditingTarget(false)}
          syllabus={syllabus}
          onSyllabusClick={handleSyllabusClick}
          onSyllabusDoubleClick={handleSyllabusDoubleClick}
          onSyllabusContextMenu={handleSyllabusContextMenu}
          showSettings={showSettings}
          nicknameInput={nicknameInput}
          creditsInput={creditsInput}
          selectedColor={selectedColor}
          onToggleSettings={handleToggleSettings}
          onNicknameChange={setNicknameInput}
          onCreditsChange={setCreditsInput}
          onColorChange={setSelectedColor}
          onToggleHidden={handleToggleHidden}
          onArchive={handleArchiveCourse}
          onSaveSettings={handleSaveSettings}
          onCancelSettings={() => setShowSettings(false)}
        />

        {/* Missing Syllabus Warning */}
        {!syllabusWarningDismissed && (
          <MissingSyllabusWarning
            hasSyllabusFile={syllabus !== null}
            hasCanvasSyllabus={Boolean(course.syllabusBody)}
            onDismiss={() => setSyllabusWarningDismissed(true)}
            onSetSyllabus={() => setShowSyllabusSelector(true)}
          />
        )}

        {/* Duplicate Coursework Warning */}
        <DuplicateCourseworkBanner tasks={courseTasks} />

        {/* Archived Course Warning */}
        {course.archivedAt && !archivedWarningAcknowledged && (
          <div style={styles.archivedWarningBanner}>
            <div style={styles.archivedWarningContent}>
              <Archive size={20} />
              <div style={styles.archivedWarningText}>
                <strong>This course is archived.</strong>
                <span>
                  Changes you make here are stored locally only and will not sync with
                  Canvas.
                </span>
              </div>
            </div>
            <div style={styles.archivedWarningActions}>
              <label style={styles.archivedWarningCheckbox}>
                <input
                  type="checkbox"
                  id="neverShowArchivedWarning"
                  style={{ marginRight: '6px' }}
                />
                Don't show again
              </label>
              <button
                style={styles.archivedWarningButton}
                onClick={() => {
                  const neverShow = (
                    document.getElementById(
                      'neverShowArchivedWarning'
                    ) as HTMLInputElement
                  )?.checked;
                  handleAcknowledgeArchivedWarning(neverShow);
                }}
              >
                I understand
              </button>
            </div>
          </div>
        )}

        {/* Two Column Layout */}
        <div style={styles.twoColumn}>
          {/* Left Column - Assignments */}
          <div style={styles.mainColumn}>
            {taskSectionOrder.map((sectionId) => {
              // Section configuration
              const sectionConfig = {
                pending: {
                  title: 'Pending',
                  tasks: pendingTasks,
                  emptyIcon: <CheckCircle size={24} color="var(--color-success)" />,
                  emptyText: 'No pending coursework',
                  showAddButton: true,
                  showViewAll: false,
                  modalTitle: 'All Pending Tasks',
                  getIsCompleted: (task: Task) => task.isCompleted,
                },
                submitted: {
                  title: 'Submitted',
                  tasks: submittedTasks,
                  emptyIcon: <Clock size={24} color="var(--text-muted)" />,
                  emptyText: 'No submitted coursework awaiting grades',
                  showAddButton: false,
                  showViewAll: true,
                  modalTitle: 'All Submitted Tasks',
                  getIsCompleted: (task: Task) => task.isCompleted,
                },
                graded: {
                  title: 'Graded',
                  tasks: gradedTasks,
                  emptyIcon: <CheckCircle size={24} color="var(--text-muted)" />,
                  emptyText: 'No graded coursework yet',
                  showAddButton: false,
                  showViewAll: true,
                  modalTitle: 'All Graded Tasks',
                  getIsCompleted: (task: Task) => task.isCompleted || task.grade !== null,
                },
                info: {
                  title: 'Not for Grade',
                  tasks: infoTasks,
                  emptyIcon: <FileText size={24} color="var(--text-muted)" />,
                  emptyText: 'No informational items',
                  showAddButton: false,
                  showViewAll: true,
                  modalTitle: 'All Informational Items',
                  getIsCompleted: () => true, // Info items are always "complete" (no submission needed)
                },
              }[sectionId];

              if (!sectionConfig) return null;

              const {
                title,
                tasks: sectionTasks,
                emptyIcon,
                emptyText,
                showAddButton,
                showViewAll,
                modalTitle,
                getIsCompleted,
              } = sectionConfig;
              const isDragging = taskDragState.draggingId === sectionId;
              const isDragOver = taskDragState.dragOverId === sectionId;
              const isPending = sectionId === 'pending';
              const displayTasks = showViewAll
                ? sectionTasks.slice(0, MAX_VISIBLE_ITEMS)
                : sectionTasks;

              return (
                <div
                  key={sectionId}
                  draggable
                  onDragStart={taskDragHandlers.onDragStart(sectionId)}
                  onDragEnd={taskDragHandlers.onDragEnd}
                  onDragOver={taskDragHandlers.onDragOver(sectionId)}
                  onDragLeave={taskDragHandlers.onDragLeave}
                  onDrop={taskDragHandlers.onDrop(sectionId)}
                  style={{
                    opacity: isDragging ? 0.5 : 1,
                    borderTop: isDragOver
                      ? '2px solid var(--color-blue)'
                      : '2px solid transparent',
                    transition: 'opacity 0.2s, border-color 0.2s',
                  }}
                >
                  <Card padding="none">
                    <div style={styles.cardHeader}>
                      <div style={styles.cardHeaderLeft}>
                        <GripVertical size={14} style={styles.sectionDragHandle} />
                        <h3 style={styles.cardTitle}>
                          {title} ({sectionTasks.length})
                        </h3>
                      </div>
                      {showAddButton && (
                        <button
                          style={styles.addTaskButton}
                          onClick={() => setShowAddTask(!showAddTask)}
                        >
                          <Plus size={16} />
                          Add Task
                        </button>
                      )}
                      {showViewAll && sectionTasks.length > MAX_VISIBLE_ITEMS && (
                        <button
                          style={styles.viewAllButton}
                          onClick={() =>
                            setTaskListModal({
                              isOpen: true,
                              title: modalTitle,
                              tasks: sectionTasks,
                            })
                          }
                        >
                          View all {sectionTasks.length}
                          <ChevronRight size={14} />
                        </button>
                      )}
                    </div>

                    {/* Add Task Form (only for pending section) */}
                    {isPending && showAddTask && (
                      <AddTaskForm
                        title={newTaskTitle}
                        description={newTaskDescription}
                        startDate={newTaskStartDate}
                        dueDate={newTaskDueDate}
                        weight={newTaskWeight}
                        taskType={newTaskType}
                        onTitleChange={setNewTaskTitle}
                        onDescriptionChange={setNewTaskDescription}
                        onStartDateChange={setNewTaskStartDate}
                        onDueDateChange={setNewTaskDueDate}
                        onWeightChange={setNewTaskWeight}
                        onTaskTypeChange={setNewTaskType}
                        onCancel={() => setShowAddTask(false)}
                        onCreate={handleCreateTask}
                      />
                    )}

                    {sectionTasks.length === 0 && !(isPending && showAddTask) ? (
                      <div style={styles.emptySection}>
                        {emptyIcon}
                        <span>{emptyText}</span>
                      </div>
                    ) : (
                      <div style={styles.taskList}>
                        {displayTasks.map((task, index) => (
                          <TaskItem
                            key={task.id}
                            task={task}
                            policies={policies}
                            isFirst={index === 0 && !(isPending && showAddTask)}
                            isCompleted={getIsCompleted(task)}
                            isExpanded={expandedTaskId === task.id}
                            isEditing={editingTaskId === task.id}
                            isHighlighted={highlightedTaskId === task.id}
                            editTitle={editTaskTitle}
                            editDescription={editTaskDescription}
                            editStartDate={editTaskStartDate}
                            editDueDate={editTaskDueDate}
                            editWeight={editTaskWeight}
                            editGrade={editTaskGrade}
                            onToggleExpand={() =>
                              setExpandedTaskId(
                                expandedTaskId === task.id ? null : task.id
                              )
                            }
                            onToggleComplete={() => handleToggleComplete(task)}
                            onDuplicate={() => handleDuplicateTask(task.id)}
                            onStartEdit={() => startEditingTask(task)}
                            onCancelEdit={() => {
                              setEditingTaskId(null);
                              setExpandedTaskId(null);
                            }}
                            onSaveEdit={handleSaveTask}
                            onDelete={() => handleDeleteTask(task.id, task.title)}
                            onEditTitleChange={setEditTaskTitle}
                            onEditDescriptionChange={setEditTaskDescription}
                            onEditStartDateChange={setEditTaskStartDate}
                            onEditDueDateChange={setEditTaskDueDate}
                            onEditWeightChange={setEditTaskWeight}
                            onEditGradeChange={setEditTaskGrade}
                            editTaskType={editTaskType}
                            onEditTaskTypeChange={setEditTaskType}
                            editLocation={editTaskLocation}
                            onEditLocationChange={setEditTaskLocation}
                            onContextMenu={(e) => handleTaskContextMenu(e, task)}
                            taskRef={(el) => {
                              if (el) taskRefs.current.set(task.id, el);
                            }}
                            onFileDownloadRequest={(file, href) => {
                              setPendingFileDownload({
                                fileId: file.id,
                                title: file.title,
                                href,
                              });
                              setConfirmDialog({
                                isOpen: true,
                                title: 'Download File',
                                message: `"${file.title}" is not downloaded yet. Would you like to download it to your Files folder?`,
                                type: 'info',
                                confirmText: 'Download',
                                onConfirm: async () => {
                                  try {
                                    const result = await window.api?.downloadResource(
                                      file.id
                                    );
                                    if (result?.success && result.localPath) {
                                      await window.api?.openResource(file.id);
                                    } else {
                                      window.api?.openExternal(href);
                                    }
                                  } catch {
                                    window.api?.openExternal(href);
                                  }
                                  setPendingFileDownload(null);
                                },
                              });
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>

          {/* Right Column - Sidebar */}
          <div style={styles.sideColumn}>
            {sidebarOrder.map((sectionId) => {
              const isDragging = sidebarDragState.draggingId === sectionId;
              const isDragOver = sidebarDragState.dragOverId === sectionId;

              if (sectionId === 'policies') {
                return (
                  <PoliciesCard
                    key={sectionId}
                    policies={policies}
                    isDragging={isDragging}
                    isDragOver={isDragOver}
                    onDragStart={sidebarDragHandlers.onDragStart(sectionId)}
                    onDragEnd={sidebarDragHandlers.onDragEnd}
                    onDragOver={sidebarDragHandlers.onDragOver(sectionId)}
                    onDragLeave={sidebarDragHandlers.onDragLeave}
                    onDrop={sidebarDragHandlers.onDrop(sectionId)}
                    onAddPolicy={openAddPolicyModal}
                    onEditPolicy={openEditPolicyModal}
                    onDeletePolicy={handleDeletePolicy}
                  />
                );
              }

              if (sectionId === 'announcements') {
                return (
                  <AnnouncementsCard
                    key={sectionId}
                    announcements={announcements}
                    courseId={courseId}
                    isDragging={isDragging}
                    isDragOver={isDragOver}
                    onDragStart={sidebarDragHandlers.onDragStart(sectionId)}
                    onDragEnd={sidebarDragHandlers.onDragEnd}
                    onDragOver={sidebarDragHandlers.onDragOver(sectionId)}
                    onDragLeave={sidebarDragHandlers.onDragLeave}
                    onDrop={sidebarDragHandlers.onDrop(sectionId)}
                  />
                );
              }

              return null;
            })}

            {/* Policy Modal */}
            <PolicyModal
              isOpen={policyModalState.isOpen}
              onClose={closePolicyModal}
              onSave={handleSavePolicy}
              courseId={courseId}
              courseCode={course?.code}
              tasks={courseTasks}
              taskGroups={[]}
              existingPolicyNames={policies.map((p) => p.policyName)}
              editData={policyModalState.editData}
              isLoading={policyLoading}
            />

            {/* Grade History */}
            <GradeHistoryCard gradeHistory={gradeHistory} />
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText={confirmDialog.confirmText}
        cancelText={pendingFileDownload ? 'Open in Canvas' : 'Cancel'}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => {
          // If there's a pending file download, open in Canvas instead
          if (pendingFileDownload) {
            window.api?.openExternal(pendingFileDownload.href);
            setPendingFileDownload(null);
          }
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }}
      />

      {/* Task List Modal */}
      {taskListModal.isOpen && (
        <TaskListModal
          isOpen={taskListModal.isOpen}
          title={taskListModal.title}
          tasks={taskListModal.tasks}
          policies={policies}
          onClose={() => setTaskListModal((prev) => ({ ...prev, isOpen: false }))}
          expandedTaskId={expandedTaskId}
          editingTaskId={editingTaskId}
          highlightedTaskId={highlightedTaskId}
          editTitle={editTaskTitle}
          editDescription={editTaskDescription}
          editStartDate={editTaskStartDate}
          editDueDate={editTaskDueDate}
          editWeight={editTaskWeight}
          editGrade={editTaskGrade}
          editTaskType={editTaskType}
          editLocation={editTaskLocation}
          onToggleExpand={(taskId) =>
            setExpandedTaskId(expandedTaskId === taskId ? null : taskId)
          }
          onToggleComplete={handleToggleComplete}
          onDuplicate={handleDuplicateTask}
          onStartEdit={startEditingTask}
          onCancelEdit={() => {
            setEditingTaskId(null);
            setExpandedTaskId(null);
          }}
          onSaveEdit={handleSaveTask}
          onDelete={(taskId, taskTitle) => handleDeleteTask(taskId, taskTitle)}
          onEditTitleChange={setEditTaskTitle}
          onEditDescriptionChange={setEditTaskDescription}
          onEditStartDateChange={setEditTaskStartDate}
          onEditDueDateChange={setEditTaskDueDate}
          onEditWeightChange={setEditTaskWeight}
          onEditGradeChange={setEditTaskGrade}
          onEditTaskTypeChange={setEditTaskType}
          onEditLocationChange={setEditTaskLocation}
          onTaskContextMenu={handleTaskContextMenu}
        />
      )}

      {/* Task Context Menu */}
      {taskContextMenu && (
        <TaskContextMenu
          task={{
            id: taskContextMenu.task.id,
            title: taskContextMenu.task.title,
            isCompleted: taskContextMenu.task.isCompleted,
            isOptional: taskContextMenu.task.isOptional,
            calendarEventId: taskContextMenu.task.calendarEventId,
            dueAt: taskContextMenu.task.dueAt,
            sourceType: taskContextMenu.task.sourceType,
          }}
          position={taskContextMenu.position}
          onClose={() => setTaskContextMenu(null)}
          onEdit={() => {
            startEditingTask(taskContextMenu.task);
          }}
          onDuplicate={() => handleDuplicateTask(taskContextMenu.task.id)}
          onToggleComplete={() => handleToggleComplete(taskContextMenu.task)}
          onOpenInCanvas={() => handleOpenTaskInCanvas(taskContextMenu.task)}
          onDelete={() =>
            handleDeleteTask(taskContextMenu.task.id, taskContextMenu.task.title)
          }
          onToggleOptional={() => handleToggleOptional(taskContextMenu.task)}
          onViewInCalendar={() => {
            // Navigate to calendar with task info in state (more reliable than URL params with HashRouter)
            if (taskContextMenu.task.dueAt) {
              const dueDate = new Date(taskContextMenu.task.dueAt);
              navigate('/calendar', {
                state: {
                  targetDate: dueDate.toISOString(),
                  taskId: taskContextMenu.task.id,
                },
              });
            } else {
              navigate('/calendar');
            }
          }}
        />
      )}

      {/* Syllabus Selector Modal */}
      <SyllabusSelector
        isOpen={showSyllabusSelector}
        onClose={() => setShowSyllabusSelector(false)}
        courseCode={course?.code || ''}
        files={courseFiles}
        currentSyllabusId={syllabus?.resourceId ?? null}
        onSelect={(resourceId) => {
          handleSetSyllabus(resourceId);
          setShowSyllabusSelector(false);
        }}
      />

      {/* Syllabus Context Menu */}
      {syllabusContextMenu && (
        <div
          style={styles.contextMenuOverlay}
          onClick={() => setSyllabusContextMenu(null)}
        >
          <div
            style={{
              ...styles.contextMenu,
              left: syllabusContextMenu.x,
              top: syllabusContextMenu.y,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.contextMenuItem}
              onClick={() => {
                setShowSyllabusSelector(true);
                setSyllabusContextMenu(null);
              }}
            >
              <RefreshCw size={14} />
              {syllabus ? 'Replace Syllabus' : 'Select Syllabus'}
            </button>
            {syllabus && (
              <button
                style={{ ...styles.contextMenuItem, color: 'var(--color-error)' }}
                onClick={() => {
                  handleRemoveSyllabus();
                  setSyllabusContextMenu(null);
                }}
              >
                <X size={14} />
                Remove Syllabus
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


export default CourseDetail;
