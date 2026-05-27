/**
 * CourseDetail Page
 * Full course view with assignments, announcements, and grade history
 */

import React, { useEffect, useState, useMemo, useCallback, useContext } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Archive } from 'lucide-react';
import { useStackAwareHotkeys } from '../../hooks/useStackAwareHotkeys';
import { useKeymap } from '../../hooks/useKeymap';
import { KeyboardScopeContext } from '../../contexts/KeyboardScopeContext';
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
import { CanvasUpdatesSection, TaskLinkDialog, type QueuedTaskEdits } from '../Queue';
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

  // Course detail — kept as local useState (NOT a store-duplication suspect).
  // `state.courses` holds the slimmer `Course` shape; `course` here is the
  // richer `CourseDetailData` fetched via `data:getCourse` — it carries
  // `syllabusBody`, `totalWeight`, `gradeCurveAdjustment`, and
  // `syllabusPromptDismissedAt` which are NOT in the store. Several handlers
  // (settings-save, syllabus-dismiss, target-grade-save) optimistically mutate
  // this via `setCourse((prev) => …)` and need a richer shape than the store
  // provides. Migrating this to the store would require introducing a new
  // course-detail slice — out of scope for the state-duplication cleanup.
  const [course, setCourse] = useState<CourseDetailData | null>(null);
  // Grade history is not in the store (no `gradeHistory` field on StoreState),
  // so this is page-local data, not a duplication. Safe to keep as useState.
  const [gradeHistory, setGradeHistory] = useState<GradeHistoryEntry[]>([]);
  // Announcements for archived courses bypass the visibility filter and are
  // fetched separately (mirroring `archivedCourseTasks`). For active courses
  // we read directly from `state.notifications` via a memoized selector below —
  // see CLAUDE.md §2 "Single source of truth for domain data".
  const [archivedCourseAnnouncements, setArchivedCourseAnnouncements] = useState<
    Notification[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Canvas Task Queue — derived from the store. NEVER hold this in local
  // useState: the store's `taskQueue` is the single source of truth, and any
  // hook/handler that writes via the slice actions (acceptQueuedTask,
  // mergeQueuedTask, etc.) automatically flows here without us hand-syncing a
  // duplicate list. See CLAUDE.md §2 "Single source of truth for domain data".
  const taskQueue = useStore((s) => s.taskQueue);
  const fetchTaskQueue = useStore((s) => s.fetchTaskQueue);
  const queuedTasks = useMemo(
    () => taskQueue.filter((q) => q.courseId === courseId),
    [taskQueue, courseId]
  );

  // Announcements derived from the store for active courses. The store loads
  // notifications via `fetchNotifications` (and refetches on any DB commit to
  // the `notifications` table), so any write from elsewhere flows here
  // automatically — no parallel `useState` to hand-sync. Archived courses
  // are NOT in the store's visibility filter, so we fall back to the
  // separately-fetched `archivedCourseAnnouncements` for those.
  const storeNotifications = useStore((s) => s.notifications);
  const announcements = useMemo(() => {
    if (course?.archivedAt) {
      return archivedCourseAnnouncements;
    }
    return storeNotifications.filter((n) => n.courseId === courseId);
  }, [course?.archivedAt, archivedCourseAnnouncements, storeNotifications, courseId]);

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
        // Fetch all data in parallel. The task queue is fetched via the
        // store action (which writes to `state.taskQueue`); the derived
        // `queuedTasks` selector above picks it up — no local copy needed.
        // Announcements for active courses also flow through the store
        // (via `state.notifications`), so we no longer fetch them here —
        // archived-course announcements are fetched below after we know
        // the course's archived state.
        const [courseData, historyData, syllabusData, filesData] = await Promise.all([
          api.getCourse(courseId),
          api.getGradeHistory(courseId),
          api.getCourseSyllabus?.(courseId).catch(() => null),
          api.getCourseFiles?.(courseId).catch(() => []),
        ]);
        // Kick off the queue fetch in parallel but don't block on its return —
        // we don't need its value, and it writes into the store anyway.
        void fetchTaskQueue({ courseId });

        setCourse(courseData);
        setGradeHistory(historyData || []);

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

        // For archived courses, fetch tasks AND announcements directly
        // (both bypass the visibility filter the store applies). Active
        // courses' announcements come from `state.notifications`.
        if (courseData?.archivedAt) {
          if (api.getTasksForArchivedCourse) {
            const archivedTasks = await api.getTasksForArchivedCourse(courseId);
            setArchivedCourseTasks(archivedTasks || []);
          }
          const archivedAnnouncements = await api.getCourseNotifications(courseId);
          setArchivedCourseAnnouncements(archivedAnnouncements || []);
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

  // Queue action handlers — thin wrappers over store actions. The store
  // updates `state.taskQueue`; the derived `queuedTasks` selector re-runs
  // and the UI reflects the change automatically. No local filter needed.
  const handleQueueAccept = useCallback(
    (queueId: number, edits?: QueuedTaskEdits) => acceptQueuedTask(queueId, edits),
    [acceptQueuedTask]
  );

  const handleQueueReject = useCallback(
    (queueId: number) => rejectQueuedTask(queueId),
    [rejectQueuedTask]
  );

  const handleQueueBulkAccept = useCallback(
    () => bulkAcceptQueuedTasks({ courseId }),
    [bulkAcceptQueuedTasks, courseId]
  );

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
    (params: {
      queueId: number;
      userTaskId: number;
      keepFromUser?: {
        notes?: boolean;
        dueAt?: boolean;
        title?: boolean;
        taskType?: boolean;
        description?: boolean;
        startAt?: boolean;
      };
    }) => mergeQueuedTask(params),
    [mergeQueuedTask]
  );

  // ===== Page-level keyboard shortcuts =====
  // Availability of conditional sections (snapshot per render; useHotkeys
  // closures capture these via the deps arrays on each binding below).
  const queueAvailable = !course?.archivedAt && queuedTasks.length > 0;
  const announcementsAvailable = announcements.length > 0;
  const preferencesAvailable = showSettings;

  // Section switching helper — shared by nav keymap and re-scope effect below
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

  // Broadcast active subscope to help modal (edit overrides prefs overrides nav)
  const { setActiveSubscope } = useContext(KeyboardScopeContext);
  useEffect(() => {
    if (editingTaskId !== null) setActiveSubscope('edit');
    else if (showSettings) setActiveSubscope('prefs');
    else setActiveSubscope('nav');
    return () => setActiveSubscope(null);
  }, [editingTaskId, showSettings, setActiveSubscope]);

  // Nav-scope shortcuts (all fired outside form elements by default)
  useKeymap<'nav'>(
    {
      nav: {
        // Open on Canvas
        'shift+o': (e) => {
          if (!course) return;
          e.preventDefault();
          const baseUrl = settingsManager.get(STORAGE_KEYS.CANVAS_URL);
          if (!baseUrl) return;
          window.api?.openExternal(
            `${baseUrl.replace(/\/+$/, '')}/courses/${course.externalId}`
          );
        },
        // Back
        g: () => navigate(-1),
        // Toggle settings panel
        'mod+e': (e) => {
          e.preventDefault();
          handleToggleSettings();
        },
        // Start target-grade inline edit
        t: () => handleStartEditTarget(),
        // Archive course
        'mod+shift+a': (e) => {
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
        // Save settings (when panel open)
        'mod+s': (e) => {
          if (!showSettings) return;
          e.preventDefault();
          handleSaveSettings();
        },
        // Section cycling — E is blocked in tasks section (tasks section uses E = edit task)
        q: (e) => {
          e.preventDefault();
          cycleSection(-1);
        },
        e: (e) => {
          if (sectionFocus === 'tasks') return;
          e.preventDefault();
          cycleSection(1);
        },
      },
    },
    {
      initialScope: 'nav',
      // No `when` needed — useKeymap auto-gates against the modal stack by
      // default (ADR-0006). Q/E/G/etc. won't fire while any modal is open.
    }
  );

  // Re-scope sectionFocus when the underlying availability changes.
  useEffect(() => {
    if (sectionFocus === 'queue' && !queueAvailable) setSectionFocus('tasks');
    if (sectionFocus === 'announcements' && !announcementsAvailable)
      setSectionFocus('tasks');
    if (sectionFocus === 'preferences' && !preferencesAvailable) setSectionFocus('tasks');
  }, [sectionFocus, queueAvailable, announcementsAvailable, preferencesAvailable]);

  // ===== Task edit + preferences field-jump shortcuts =====
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
  // Task edit field-jump shortcuts — only fire when a task is being edited.
  // enableOnFormTags: true so they work inside the edit form's inputs.
  useKeymap<'edit'>(
    {
      edit: {
        'mod+Enter': (e) => {
          e.preventDefault();
          handleSaveTask();
        },
        'alt+t': (e) => {
          if (focusTaskEditField('task-edit-title')) e.preventDefault();
        },
        'alt+d': (e) => {
          if (focusTaskEditField('task-edit-description')) e.preventDefault();
        },
        'alt+n': (e) => {
          if (focusTaskEditField('task-edit-notes')) e.preventDefault();
        },
        'alt+y': (e) => {
          if (focusTaskEditField('task-edit-type')) e.preventDefault();
        },
        'alt+l': (e) => {
          if (focusTaskEditField('task-edit-location')) e.preventDefault();
        },
        'alt+s': (e) => {
          if (focusTaskEditField('task-edit-start')) e.preventDefault();
        },
        'alt+shift+d': (e) => {
          if (focusTaskEditField('task-edit-due')) e.preventDefault();
        },
        'alt+w': (e) => {
          if (focusTaskEditField('task-edit-weight')) e.preventDefault();
        },
        'alt+g': (e) => {
          if (focusTaskEditField('task-edit-grade')) e.preventDefault();
        },
      },
    },
    {
      initialScope: 'edit',
      enableOnFormTags: true,
      when: () => editingTaskId !== null,
    }
  );

  // Preferences field-jump shortcuts — only fire when settings panel is open and no task edit.
  useKeymap<'prefs'>(
    {
      prefs: {
        'alt+n': (e) => {
          if (focusTaskEditField('course-settings-nickname')) e.preventDefault();
        },
        'alt+c': (e) => {
          if (focusTaskEditField('course-settings-color')) e.preventDefault();
        },
        'alt+u': (e) => {
          if (focusTaskEditField('course-settings-credits')) e.preventDefault();
        },
        'alt+g': (e) => {
          if (focusTaskEditField('course-settings-curve')) e.preventDefault();
        },
        'alt+t': (e) => {
          e.preventDefault();
          handleStartEditTarget();
        },
      },
    },
    {
      initialScope: 'prefs',
      enableOnFormTags: true,
      when: () => showSettings && editingTaskId === null,
    }
  );

  // Escape cascade: close open menus/forms/edits first, then sectionFocus
  // back to tasks, else navigate back.
  useStackAwareHotkeys(
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
    {},
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
    </div>
  );
}

export default CourseDetail;
