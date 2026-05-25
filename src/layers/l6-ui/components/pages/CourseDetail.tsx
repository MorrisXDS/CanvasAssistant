/**
 * CourseDetail Page
 * Full course view with assignments, announcements, and grade history
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Archive } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { ConfirmDialog } from '../shared';
import { MissingDependenciesDialog } from '../Files/MissingDependenciesDialog';
import { useStore } from '../../../l5-presentation/store';
import type { Task, Notification, QueuedTask } from '../../../l5-presentation/types';
import { getCourseColor } from '../../constants';
import {
  STORAGE_KEYS,
  SETTINGS_DEFAULTS,
  settingsManager,
} from '../../../l5-presentation/settings';
import {
  SyllabusSelector,
  TaskContextMenu,
  MissingSyllabusWarning,
  DuplicateCourseworkBanner,
} from '../Course';
import {
  CanvasUpdatesSection,
  TaskMergeDialog,
  TaskLinkDialog,
  type QueuedTaskEdits,
} from '../Queue';
import { useCourseDetailDragDrop } from './useCourseDetailDragDrop';
import { useCourseDetailTaskState } from './useCourseDetailTaskState';
import { useCourseDetailSettingsState } from './useCourseDetailSettingsState';
import { useCourseDetailSyllabusState } from './useCourseDetailSyllabusState';
import { courseDetailStyles as styles } from './CourseDetail.styles';
import {
  TaskListModal,
  AnnouncementsCard,
  GradeHistoryCard,
  CourseHeader,
  UnifiedTaskList,
  type GradeHistoryEntry,
} from '../CourseDetail/components';
import { createLogger } from '../../utils/rendererLogger';

const log = createLogger('CourseDetail');

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
  gradeCurveAdjustment: number;
  syllabusPromptDismissedAt: string | null;
}

export function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tasks: storeTasks, markAllSyncUpdatesSeen } = useStore();
  const courseId = Number(id);

  // Task highlight/edit from URL params
  const highlightTaskId = searchParams.get('highlightTask');
  const editTaskId = searchParams.get('editTask');
  const highlightQueueId = searchParams.get('highlightQueue');

  // Course and related data state
  const [course, setCourse] = useState<CourseDetailData | null>(null);
  const [gradeHistory, setGradeHistory] = useState<GradeHistoryEntry[]>([]);
  const [announcements, setAnnouncements] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Canvas Task Queue state
  const [queuedTasks, setQueuedTasks] = useState<QueuedTask[]>([]);

  // Queue expanded setting from localStorage
  const queueDefaultExpanded = useMemo(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.QUEUE_DEFAULT_EXPANDED);
      if (stored !== null) {
        return JSON.parse(stored) === true;
      }
    } catch {
      // Ignore parse errors
    }
    return SETTINGS_DEFAULTS[STORAGE_KEYS.QUEUE_DEFAULT_EXPANDED] ?? false;
  }, []);
  // Link dialog state - shows all linkable tasks with match scores
  const [linkDialogState, setLinkDialogState] = useState<{
    isOpen: boolean;
    queuedTask: QueuedTask | null;
  }>({
    isOpen: false,
    queuedTask: null,
  });

  // Legacy merge dialog state (for auto-detected matches)
  const [mergeDialogState, setMergeDialogState] = useState<{
    isOpen: boolean;
    queuedTask: QueuedTask | null;
    userTask: Task | null;
  }>({
    isOpen: false,
    queuedTask: null,
    userTask: null,
  });

  // Store actions for queue operations
  const { acceptQueuedTask, rejectQueuedTask, bulkAcceptQueuedTasks, mergeQueuedTask } =
    useStore();

  // Course settings state and handlers from custom hook
  const {
    editingTarget,
    setEditingTarget,
    targetGradeInput,
    setTargetGradeInput,
    showSettings,
    setShowSettings,
    nicknameInput,
    setNicknameInput,
    selectedColor,
    setSelectedColor,
    creditsInput,
    setCreditsInput,
    curveAdjustmentInput,
    setCurveAdjustmentInput,
    handleSaveTargetGrade,
    handleSaveSettings,
    handleToggleHidden,
    handleArchiveCourse,
    handleToggleSettings,
    handleStartEditTarget,
  } = useCourseDetailSettingsState({
    courseId,
    course,
    setCourse,
    navigate,
  });

  // Keyboard section focus — which sub-section on the page the user is
  // currently driving with the keyboard. Tasks is the default; Queue and
  // Announcements only become reachable via Q/E when they're visible.
  type SectionFocus = 'tasks' | 'queue' | 'announcements' | 'preferences';
  const [sectionFocus, setSectionFocus] = useState<SectionFocus>('tasks');

  // Confirm dialog state (declared early as other hooks depend on it)
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

  // Syllabus state and handlers from custom hook
  const {
    syllabus,
    setSyllabus,
    courseFiles,
    setCourseFiles,
    showSyllabusSelector,
    setShowSyllabusSelector,
    missingDepsDialog,
    handleDownloadDependencies,
    handleOpenSyllabusAnyway,
    closeMissingDepsDialog,
    handleSetSyllabus,
    handleMarkSyllabusReviewed,
    handleSyllabusDoubleClick,
    syllabusLoading,
  } = useCourseDetailSyllabusState({
    courseId,
    setConfirmDialog,
  });

  // Task state and handlers from custom hook
  const {
    // New task form state
    showAddTask,
    setShowAddTask,
    newTaskTitle,
    setNewTaskTitle,
    newTaskDescription,
    setNewTaskDescription,
    newTaskStartDate,
    setNewTaskStartDate,
    newTaskDueDate,
    setNewTaskDueDate,
    newTaskWeight,
    setNewTaskWeight,
    newTaskType,
    setNewTaskType,
    // Task expansion/editing state
    expandedTaskId,
    setExpandedTaskId,
    editingTaskId,
    setEditingTaskId,
    highlightedTaskId,
    setHighlightedTaskId,
    // Edit task form state
    editTaskTitle,
    setEditTaskTitle,
    editTaskDescription,
    setEditTaskDescription,
    editTaskNotes,
    setEditTaskNotes,
    editTaskStartDate,
    setEditTaskStartDate,
    editTaskDueDate,
    setEditTaskDueDate,
    editTaskWeight,
    setEditTaskWeight,
    editTaskGrade,
    setEditTaskGrade,
    editTaskType,
    setEditTaskType,
    editTaskLocation,
    setEditTaskLocation,
    // Task list modal
    taskListModal,
    setTaskListModal,
    // Task context menu
    taskContextMenu,
    setTaskContextMenu,
    // Archived course tasks
    archivedCourseTasks,
    setArchivedCourseTasks,
    // Task refs
    taskRefs,
    // Handlers
    handleCreateTask,
    handleDuplicateTask,
    handleToggleComplete,
    startEditingTask,
    handleSaveTask,
    handleDeleteTask,
    handleTaskContextMenu,
    handleOpenTaskInCanvas,
    handleToggleOptional,
  } = useCourseDetailTaskState({
    courseId,
    courseArchivedAt: course?.archivedAt ?? null,
    setConfirmDialog,
    navigate,
  });

  // Pending file download state (for link click handling)
  const [pendingFileDownload, setPendingFileDownload] = useState<{
    fileId: number;
    title: string;
    href: string;
  } | null>(null);

  // Archived course warning state
  const [archivedWarningAcknowledged, setArchivedWarningAcknowledged] = useState(() => {
    // Check if user has globally dismissed archived warnings
    const globalDismiss = localStorage.getItem(
      STORAGE_KEYS.ARCHIVED_COURSE_WARNING_DISMISSED
    );
    if (globalDismiss === 'true') return true;
    // Check if dismissed for this specific course
    const dismissedCourses = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.ARCHIVED_COURSE_WARNING_DISMISSED_IDS) || '[]'
    );
    return dismissedCourses.includes(Number(id));
  });

  const handleAcknowledgeArchivedWarning = (neverShowAgain: boolean) => {
    if (neverShowAgain) {
      localStorage.setItem(STORAGE_KEYS.ARCHIVED_COURSE_WARNING_DISMISSED, 'true');
    } else {
      const dismissedCourses = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.ARCHIVED_COURSE_WARNING_DISMISSED_IDS) || '[]'
      );
      if (!dismissedCourses.includes(courseId)) {
        dismissedCourses.push(courseId);
        localStorage.setItem(
          STORAGE_KEYS.ARCHIVED_COURSE_WARNING_DISMISSED_IDS,
          JSON.stringify(dismissedCourses)
        );
      }
    }
    setArchivedWarningAcknowledged(true);
  };

  // Drag-and-drop for sidebar section reordering
  const { sidebarOrder, sidebarDragState, sidebarDragHandlers } =
    useCourseDetailDragDrop();

  // Fetch course data
  useEffect(() => {
    const fetchData = async () => {
      // Access the global api object
      const api = window.api;

      if (!api) {
        log.error('API not available');
        setLoading(false);
        return;
      }

      try {
        // Fetch all data in parallel
        const [
          courseData,
          historyData,
          announcementsData,
          syllabusData,
          filesData,
          queueData,
        ] = await Promise.all([
          api.getCourse(courseId),
          api.getGradeHistory(courseId),
          api.getCourseNotifications(courseId),
          api.getCourseSyllabus?.(courseId).catch(() => null),
          api.getCourseFiles?.(courseId).catch(() => []),
          api.getTaskQueueForCourse?.(courseId).catch(() => []),
        ]);

        setCourse(courseData);
        setGradeHistory(historyData || []);
        setAnnouncements(announcementsData || []);
        setQueuedTasks(queueData || []);

        // Map syllabus API response to CourseSyllabus interface
        if (syllabusData && syllabusData.type === 'resource') {
          setSyllabus({
            id: syllabusData.resourceId,
            courseId,
            resourceId: syllabusData.resourceId,
            resourceTitle: syllabusData.title || 'Unknown file',
            resourceUpdatedAt: syllabusData.downloadedAt || null,
            lastReviewedAt: syllabusData.reviewedAt || syllabusData.designatedAt,
            changeDetectedAt: syllabusData.changeDetectedAt || null,
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
        log.error(
          'Failed to fetch course data',
          error instanceof Error ? error : undefined
        );
      } finally {
        setLoading(false);
      }
    };

    if (courseId) {
      fetchData();
    }
  }, [courseId]);

  // Mark sync updates as seen when visiting this course
  // This auto-dismisses the notification dots for this course
  useEffect(() => {
    if (courseId && !loading) {
      // Mark informational updates (not action-required) as seen for this course
      // Action-required items (queued tasks) are marked seen when the user takes action
      markAllSyncUpdatesSeen({
        courseId,
        excludeActionRequired: true,
      });
    }
  }, [courseId, loading, markAllSyncUpdatesSeen]);

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
  }, [
    highlightTaskId,
    editTaskId,
    loading,
    setSearchParams,
    course?.archivedAt,
    archivedCourseTasks,
    storeTasks,
  ]);

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

  // Queue action handlers
  const handleQueueAccept = useCallback(
    async (queueId: number, edits?: QueuedTaskEdits) => {
      const result = await acceptQueuedTask(queueId, edits);
      if (result.success) {
        setQueuedTasks((prev) => prev.filter((q) => q.id !== queueId));
      }
      return result;
    },
    [acceptQueuedTask]
  );

  const handleQueueReject = useCallback(
    async (queueId: number) => {
      const success = await rejectQueuedTask(queueId);
      if (success) {
        setQueuedTasks((prev) => prev.filter((q) => q.id !== queueId));
      }
      return success;
    },
    [rejectQueuedTask]
  );

  const handleQueueBulkAccept = useCallback(async () => {
    const result = await bulkAcceptQueuedTasks({ courseId });
    if (result.success) {
      setQueuedTasks([]);
    }
    return result;
  }, [bulkAcceptQueuedTasks, courseId]);

  // Open link dialog to select which task to link
  const handleOpenLinkDialog = useCallback(
    (queueId: number) => {
      const queuedTask = queuedTasks.find((q) => q.id === queueId);
      if (queuedTask) {
        // Get all user tasks that can be linked (not already linked to Canvas)
        const userTasksOnly = courseTasks.filter((t) => t.sourceType === 'user');
        if (userTasksOnly.length > 0) {
          // Open link dialog with all linkable tasks
          setLinkDialogState({
            isOpen: true,
            queuedTask,
          });
        } else {
          // No user tasks to link to - just accept directly
          handleQueueAccept(queueId);
        }
      }
    },
    [queuedTasks, courseTasks, handleQueueAccept]
  );

  // Close link dialog
  const closeLinkDialog = useCallback(() => {
    setLinkDialogState({ isOpen: false, queuedTask: null });
  }, []);

  const handleMergeTask = useCallback(
    async (params: {
      queueId: number;
      userTaskId: number;
      keepFromUser?: { notes?: boolean; dueAt?: boolean; title?: boolean };
    }) => {
      const result = await mergeQueuedTask(params);
      if (result.success) {
        setQueuedTasks((prev) => prev.filter((q) => q.id !== params.queueId));
      }
      return result;
    },
    [mergeQueuedTask]
  );

  const closeMergeDialog = useCallback(() => {
    setMergeDialogState({
      isOpen: false,
      queuedTask: null,
      userTask: null,
    });
  }, []);

  // ===== Page-level keyboard shortcuts =====
  // Availability of conditional sections (snapshot per render; useHotkeys
  // closures capture these via the deps arrays on each binding below).
  const queueAvailable = !course?.archivedAt && queuedTasks.length > 0;
  const announcementsAvailable = announcements.length > 0;
  const preferencesAvailable = showSettings;

  // Open focused course on Canvas (Shift+O, distinct from task-level 'O')
  useHotkeys(
    'shift+o',
    (e) => {
      if (!course) return;
      e.preventDefault();
      const baseUrl = settingsManager.get(STORAGE_KEYS.CANVAS_URL);
      if (!baseUrl) return;
      window.api?.openExternal(
        `${baseUrl.replace(/\/+$/, '')}/courses/${course.externalId}`
      );
    },
    [course]
  );

  // G: go back (same as Back button) — ignored when typing in inputs.
  useHotkeys('g', () => navigate(-1), []);

  // mod+E: toggle Settings panel
  useHotkeys(
    'mod+e',
    (e) => {
      e.preventDefault();
      handleToggleSettings();
    },
    [handleToggleSettings]
  );

  // T: start inline Target-grade edit in the header
  useHotkeys(
    't',
    () => {
      handleStartEditTarget();
    },
    [handleStartEditTarget]
  );

  // mod+Shift+A: archive this course (confirms first)
  useHotkeys(
    'mod+shift+a',
    (e) => {
      if (!course) return;
      e.preventDefault();
      setConfirmDialog({
        isOpen: true,
        title: 'Archive Course',
        message: `Are you sure you want to archive "${course.nickname || course.name}"? Archived courses are hidden from the main view but can be restored later.`,
        type: 'warning',
        confirmText: 'Archive',
        onConfirm: handleArchiveCourse,
      });
    },
    [course, handleArchiveCourse]
  );

  // mod+S: save settings (when panel is open)
  useHotkeys(
    'mod+s',
    (e) => {
      if (!showSettings) return;
      e.preventDefault();
      handleSaveSettings();
    },
    [showSettings, handleSaveSettings]
  );

  // Section switching: Q / E cycles across visible sections
  const cycleSection = useCallback(
    (dir: 1 | -1) => {
      const available: SectionFocus[] = ['tasks'];
      if (queueAvailable) available.push('queue');
      if (announcementsAvailable) available.push('announcements');
      if (preferencesAvailable) available.push('preferences');
      if (available.length <= 1) return;
      const idx = available.indexOf(sectionFocus);
      const next = (idx === -1 ? 0 : idx + dir + available.length) % available.length;
      setSectionFocus(available[next]);
    },
    [queueAvailable, announcementsAvailable, preferencesAvailable, sectionFocus]
  );
  useHotkeys(
    'q',
    (e) => {
      // Don't hijack Q while the user is editing target grade inline etc.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      cycleSection(-1);
    },
    [cycleSection]
  );
  useHotkeys(
    'e',
    (e) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Only hijack E when in a non-task section (tasks section uses E=edit).
      if (sectionFocus === 'tasks') return;
      e.preventDefault();
      cycleSection(1);
    },
    [cycleSection, sectionFocus]
  );

  // Re-scope sectionFocus when the underlying availability changes.
  useEffect(() => {
    if (sectionFocus === 'queue' && !queueAvailable) setSectionFocus('tasks');
    if (sectionFocus === 'announcements' && !announcementsAvailable)
      setSectionFocus('tasks');
    if (sectionFocus === 'preferences' && !preferencesAvailable) setSectionFocus('tasks');
  }, [sectionFocus, queueAvailable, announcementsAvailable, preferencesAvailable]);

  // ===== Task edit mode shortcuts (active while editingTaskId !== null) =====
  // Ctrl/Cmd+Enter saves the edit; Alt+letter jumps to a field.
  const taskEditActive = editingTaskId !== null;
  const focusTaskEditField = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return false;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      if (el instanceof HTMLInputElement && el.type === 'text') el.select();
      return true;
    }
    if (el instanceof HTMLSelectElement) {
      el.focus();
      return true;
    }
    // Wrapper div (e.g. description RichTextEditor, color picker swatch row):
    // focus the first focusable descendant.
    const focusable = el.querySelector<HTMLElement>(
      '[contenteditable], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) {
      focusable.focus();
      return true;
    }
    return false;
  };
  useHotkeys(
    'mod+enter',
    (e) => {
      if (!taskEditActive) return;
      e.preventDefault();
      handleSaveTask();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive, handleSaveTask]
  );
  useHotkeys(
    'alt+t',
    (e) => {
      if (!taskEditActive) return;
      if (focusTaskEditField('task-edit-title')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive]
  );
  useHotkeys(
    'alt+d',
    (e) => {
      if (!taskEditActive) return;
      if (focusTaskEditField('task-edit-description')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive]
  );
  useHotkeys(
    'alt+n',
    (e) => {
      if (!taskEditActive) return;
      if (focusTaskEditField('task-edit-notes')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive]
  );
  useHotkeys(
    'alt+y',
    (e) => {
      if (!taskEditActive) return;
      if (focusTaskEditField('task-edit-type')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive]
  );
  useHotkeys(
    'alt+l',
    (e) => {
      if (!taskEditActive) return;
      if (focusTaskEditField('task-edit-location')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive]
  );
  useHotkeys(
    'alt+s',
    (e) => {
      if (!taskEditActive) return;
      if (focusTaskEditField('task-edit-start')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive]
  );
  useHotkeys(
    'alt+shift+d',
    (e) => {
      if (!taskEditActive) return;
      if (focusTaskEditField('task-edit-due')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive]
  );
  useHotkeys(
    'alt+w',
    (e) => {
      if (!taskEditActive) return;
      if (focusTaskEditField('task-edit-weight')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive]
  );
  useHotkeys(
    'alt+g',
    (e) => {
      // In preferences section → Grade curve; in task edit → Score
      if (showSettings && !taskEditActive) {
        if (focusTaskEditField('course-settings-curve')) e.preventDefault();
        return;
      }
      if (!taskEditActive) return;
      if (focusTaskEditField('task-edit-grade')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive, showSettings]
  );

  // ===== Preferences shortcuts (active while showSettings === true) =====
  useHotkeys(
    'alt+n',
    (e) => {
      // Task-edit N = notes handled above; when task edit is inactive but
      // settings is open, Alt+N jumps to Nickname.
      if (taskEditActive || !showSettings) return;
      if (focusTaskEditField('course-settings-nickname')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive, showSettings]
  );
  useHotkeys(
    'alt+c',
    (e) => {
      if (!showSettings) return;
      if (focusTaskEditField('course-settings-color')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [showSettings]
  );
  useHotkeys(
    'alt+u',
    (e) => {
      if (!showSettings) return;
      if (focusTaskEditField('course-settings-credits')) e.preventDefault();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [showSettings]
  );
  // Alt+T in preferences mirrors the page-level T (opens target grade edit)
  useHotkeys(
    'alt+t',
    (e) => {
      if (taskEditActive) return; // task-edit Alt+T = Title is handled above
      if (!showSettings) return;
      e.preventDefault();
      handleStartEditTarget();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
    [taskEditActive, showSettings, handleStartEditTarget]
  );

  // Escape cascade: close open menus/forms/edits first, then sectionFocus
  // back to tasks, else navigate back.
  useHotkeys(
    'esc',
    (e) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (taskContextMenu) {
        e.preventDefault();
        setTaskContextMenu(null);
        return;
      }
      if (showAddTask) {
        e.preventDefault();
        setShowAddTask(false);
        return;
      }
      if (editingTaskId !== null) {
        e.preventDefault();
        setEditingTaskId(null);
        return;
      }
      if (expandedTaskId !== null) {
        e.preventDefault();
        setExpandedTaskId(null);
        return;
      }
      if (showSettings) {
        e.preventDefault();
        setShowSettings(false);
        return;
      }
      if (sectionFocus !== 'tasks') {
        e.preventDefault();
        setSectionFocus('tasks');
        return;
      }
      // Fall through: let Layout's Escape handler navigate(-1) on sub-pages.
    },
    [
      taskContextMenu,
      setTaskContextMenu,
      showAddTask,
      setShowAddTask,
      editingTaskId,
      setEditingTaskId,
      expandedTaskId,
      setExpandedTaskId,
      showSettings,
      setShowSettings,
      sectionFocus,
    ]
  );

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
        <button onClick={() => navigate(-1)} style={styles.backButton}>
          <ArrowLeft size={16} />
          <span>Back</span>
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
            gradeCurveAdjustment: course.gradeCurveAdjustment,
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
          syllabusAvailableFiles={courseFiles}
          onSetSyllabus={handleSetSyllabus}
          onMarkSyllabusReviewed={handleMarkSyllabusReviewed}
          onDownloadSyllabus={handleSyllabusDoubleClick}
          onOpenSyllabus={handleSyllabusDoubleClick}
          syllabusLoading={syllabusLoading}
          showSettings={showSettings}
          nicknameInput={nicknameInput}
          creditsInput={creditsInput}
          curveAdjustmentInput={curveAdjustmentInput}
          selectedColor={selectedColor}
          onToggleSettings={handleToggleSettings}
          onNicknameChange={setNicknameInput}
          onCreditsChange={setCreditsInput}
          onCurveAdjustmentChange={setCurveAdjustmentInput}
          onColorChange={setSelectedColor}
          onToggleHidden={handleToggleHidden}
          onArchive={() => {
            setConfirmDialog({
              isOpen: true,
              title: 'Archive Course',
              message: `Are you sure you want to archive "${course.nickname || course.name}"? Archived courses are hidden from the main view but can be restored later.`,
              type: 'warning',
              confirmText: 'Archive',
              onConfirm: handleArchiveCourse,
            });
          }}
          onSaveSettings={handleSaveSettings}
          onCancelSettings={() => setShowSettings(false)}
        />

        {/* Missing Syllabus Warning */}
        {!course.syllabusPromptDismissedAt && (
          <MissingSyllabusWarning
            hasSyllabusFile={syllabus !== null}
            hasCanvasSyllabus={Boolean(course.syllabusBody)}
            onDismiss={() => {
              setConfirmDialog({
                isOpen: true,
                title: 'Dismiss Syllabus Prompt',
                message:
                  'Permanently dismiss the syllabus prompt for this course? You can re-enable it later in course settings.',
                type: 'info',
                confirmText: 'Dismiss',
                onConfirm: async () => {
                  try {
                    await window.api?.dispatch('UpdateCoursePreferences', {
                      courseId: course.id,
                      preferences: { syllabusPromptDismissed: true },
                    });
                    setCourse((prev) =>
                      prev
                        ? { ...prev, syllabusPromptDismissedAt: new Date().toISOString() }
                        : prev
                    );
                  } catch (error) {
                    log.error(
                      'Failed to dismiss syllabus prompt',
                      error instanceof Error ? error : undefined
                    );
                  }
                },
              });
            }}
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

        {/* Canvas Updates Section - Only show for non-archived courses */}
        {!course.archivedAt && queuedTasks.length > 0 && (
          <CanvasUpdatesSection
            queuedTasks={queuedTasks}
            onAccept={handleQueueAccept}
            onReject={handleQueueReject}
            onBulkAccept={handleQueueBulkAccept}
            onLink={handleOpenLinkDialog}
            defaultExpanded={queueDefaultExpanded}
            highlightedQueueId={
              highlightQueueId ? parseInt(highlightQueueId, 10) : undefined
            }
            onHighlightClear={() => setSearchParams({}, { replace: true })}
            keyboardEnabled={sectionFocus === 'queue'}
          />
        )}

        {/* Two Column Layout */}
        <div style={styles.twoColumn}>
          {/* Left Column - Assignments */}
          <div style={styles.mainColumn}>
            <UnifiedTaskList
              pendingTasks={pendingTasks}
              submittedTasks={submittedTasks}
              gradedTasks={gradedTasks}
              infoTasks={infoTasks}
              showAddTask={showAddTask}
              setShowAddTask={setShowAddTask}
              newTaskTitle={newTaskTitle}
              newTaskDescription={newTaskDescription}
              newTaskStartDate={newTaskStartDate}
              newTaskDueDate={newTaskDueDate}
              newTaskWeight={newTaskWeight}
              newTaskType={newTaskType}
              setNewTaskTitle={setNewTaskTitle}
              setNewTaskDescription={setNewTaskDescription}
              setNewTaskStartDate={setNewTaskStartDate}
              setNewTaskDueDate={setNewTaskDueDate}
              setNewTaskWeight={setNewTaskWeight}
              setNewTaskType={setNewTaskType}
              handleCreateTask={handleCreateTask}
              expandedTaskId={expandedTaskId}
              setExpandedTaskId={setExpandedTaskId}
              editingTaskId={editingTaskId}
              setEditingTaskId={setEditingTaskId}
              highlightedTaskId={highlightedTaskId}
              editTaskTitle={editTaskTitle}
              editTaskDescription={editTaskDescription}
              editTaskNotes={editTaskNotes}
              editTaskStartDate={editTaskStartDate}
              editTaskDueDate={editTaskDueDate}
              editTaskWeight={editTaskWeight}
              editTaskGrade={editTaskGrade}
              editTaskType={editTaskType}
              editTaskLocation={editTaskLocation}
              setEditTaskTitle={setEditTaskTitle}
              setEditTaskDescription={setEditTaskDescription}
              setEditTaskNotes={setEditTaskNotes}
              setEditTaskStartDate={setEditTaskStartDate}
              setEditTaskDueDate={setEditTaskDueDate}
              setEditTaskWeight={setEditTaskWeight}
              setEditTaskGrade={setEditTaskGrade}
              setEditTaskType={setEditTaskType}
              setEditTaskLocation={setEditTaskLocation}
              taskRefs={taskRefs}
              handleToggleComplete={handleToggleComplete}
              handleDuplicateTask={handleDuplicateTask}
              startEditingTask={startEditingTask}
              handleSaveTask={handleSaveTask}
              handleDeleteTask={handleDeleteTask}
              handleTaskContextMenu={handleTaskContextMenu}
              handleOpenTaskInCanvas={handleOpenTaskInCanvas}
              handleToggleOptional={handleToggleOptional}
              keyboardEnabled={sectionFocus === 'tasks'}
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
                      const result = await window.api?.downloadResource(file.id);
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
          </div>

          {/* Right Column - Sidebar */}
          <div style={styles.sideColumn}>
            {sidebarOrder.map((sectionId) => {
              const isDragging = sidebarDragState.draggingId === sectionId;
              const isDragOver = sidebarDragState.dragOverId === sectionId;

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
                    keyboardEnabled={sectionFocus === 'announcements'}
                  />
                );
              }

              return null;
            })}

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
          onClose={() => setTaskListModal((prev) => ({ ...prev, isOpen: false }))}
          expandedTaskId={expandedTaskId}
          editingTaskId={editingTaskId}
          highlightedTaskId={highlightedTaskId}
          editTitle={editTaskTitle}
          editDescription={editTaskDescription}
          editNotes={editTaskNotes}
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
          onEditNotesChange={setEditTaskNotes}
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

      {/* Missing Dependencies Dialog for Syllabus */}
      <MissingDependenciesDialog
        isOpen={missingDepsDialog.isOpen}
        onClose={closeMissingDepsDialog}
        onDownload={handleDownloadDependencies}
        onOpenAnyway={handleOpenSyllabusAnyway}
        missingDependencies={missingDepsDialog.dependencies}
        totalSize={missingDepsDialog.totalSize}
        fileName={syllabus?.resourceTitle || 'Syllabus'}
        isDownloading={missingDepsDialog.isDownloading}
        downloadProgress={missingDepsDialog.downloadProgress}
      />

      {/* Task Link Dialog (two-step: select task, then resolve fields) */}
      {linkDialogState.isOpen && linkDialogState.queuedTask && (
        <TaskLinkDialog
          isOpen={linkDialogState.isOpen}
          queuedTask={linkDialogState.queuedTask}
          linkableTasks={courseTasks.filter((t) => t.sourceType === 'user')}
          onMerge={handleMergeTask}
          onCancel={closeLinkDialog}
        />
      )}

      {/* Task Merge Dialog (legacy - for auto-detected matches) */}
      {mergeDialogState.isOpen &&
        mergeDialogState.queuedTask &&
        mergeDialogState.userTask && (
          <TaskMergeDialog
            isOpen={mergeDialogState.isOpen}
            queuedTask={mergeDialogState.queuedTask}
            userTask={mergeDialogState.userTask}
            onMerge={handleMergeTask}
            onCancel={closeMergeDialog}
          />
        )}
    </div>
  );
}

export default CourseDetail;
