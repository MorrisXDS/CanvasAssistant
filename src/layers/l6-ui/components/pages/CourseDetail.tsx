/**
 * CourseDetail Page
 * Full course view with assignments, announcements, and grade history
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, X, Archive, RefreshCw } from 'lucide-react';
import { ConfirmDialog } from '../shared';
import { MissingDependenciesDialog } from '../Files/MissingDependenciesDialog';
import { useStore } from '../../../l5-presentation/store';
import type { Task, Notification, QueuedTask } from '../../../l5-presentation/types';
import { getCourseColor } from '../../constants';
import { STORAGE_KEYS, SETTINGS_DEFAULTS } from '../../../l5-presentation/settings';
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
  TaskSectionList,
  type GradeHistoryEntry,
} from '../CourseDetail/components';

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

export function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tasks: storeTasks } = useStore();
  const courseId = Number(id);

  // Task highlight/edit from URL params
  const highlightTaskId = searchParams.get('highlightTask');
  const editTaskId = searchParams.get('editTask');

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
    syllabusWarningDismissed,
    setSyllabusWarningDismissed,
    syllabusContextMenu,
    setSyllabusContextMenu,
    missingDepsDialog,
    handleDownloadDependencies,
    handleOpenSyllabusAnyway,
    closeMissingDepsDialog,
    handleSetSyllabus,
    handleRemoveSyllabus,
    handleSyllabusClick,
    handleSyllabusDoubleClick,
    handleSyllabusContextMenu,
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

        {/* Canvas Updates Section - Only show for non-archived courses */}
        {!course.archivedAt && queuedTasks.length > 0 && (
          <CanvasUpdatesSection
            queuedTasks={queuedTasks}
            onAccept={handleQueueAccept}
            onReject={handleQueueReject}
            onBulkAccept={handleQueueBulkAccept}
            onLink={handleOpenLinkDialog}
            defaultExpanded={queueDefaultExpanded}
          />
        )}

        {/* Two Column Layout */}
        <div style={styles.twoColumn}>
          {/* Left Column - Assignments */}
          <div style={styles.mainColumn}>
            <TaskSectionList
              taskSectionOrder={taskSectionOrder}
              pendingTasks={pendingTasks}
              submittedTasks={submittedTasks}
              gradedTasks={gradedTasks}
              infoTasks={infoTasks}
              maxVisibleItems={MAX_VISIBLE_ITEMS}
              taskDragState={taskDragState}
              taskDragHandlers={taskDragHandlers}
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
              setTaskListModal={setTaskListModal}
              taskRefs={taskRefs}
              handleToggleComplete={handleToggleComplete}
              handleDuplicateTask={handleDuplicateTask}
              startEditingTask={startEditingTask}
              handleSaveTask={handleSaveTask}
              handleDeleteTask={handleDeleteTask}
              handleTaskContextMenu={handleTaskContextMenu}
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
