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
  X,
  Archive,
  RefreshCw,
} from 'lucide-react';
import {
  PolicyModal,
  ConfirmDialog,
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
import { useCourseDetailTaskState } from './useCourseDetailTaskState';
import { useCourseDetailSettingsState } from './useCourseDetailSettingsState';
import { useCourseDetailSyllabusState } from './useCourseDetailSyllabusState';
import { useCourseDetailPolicyState } from './useCourseDetailPolicyState';
import { courseDetailStyles as styles } from './CourseDetail.styles';
import {
  TaskListModal,
  PoliciesCard,
  AnnouncementsCard,
  GradeHistoryCard,
  CourseHeader,
  TaskSectionList,
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
  const courseId = Number(id);

  // Task highlight/edit from URL params
  const highlightTaskId = searchParams.get('highlightTask');
  const editTaskId = searchParams.get('editTask');

  // Course and related data state
  const [course, setCourse] = useState<CourseDetailData | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [gradeHistory, setGradeHistory] = useState<GradeHistoryEntry[]>([]);
  const [announcements, setAnnouncements] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Policy state and handlers from custom hook
  const {
    policyModalState,
    policyLoading,
    handleSavePolicy,
    openAddPolicyModal,
    openEditPolicyModal,
    closePolicyModal,
    handleDeletePolicy,
  } = useCourseDetailPolicyState({
    courseId,
    setPolicies,
    setConfirmDialog,
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
    refreshArchivedCourseTasks,
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
            <TaskSectionList
              taskSectionOrder={taskSectionOrder}
              pendingTasks={pendingTasks}
              submittedTasks={submittedTasks}
              gradedTasks={gradedTasks}
              infoTasks={infoTasks}
              policies={policies}
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
              editTaskStartDate={editTaskStartDate}
              editTaskDueDate={editTaskDueDate}
              editTaskWeight={editTaskWeight}
              editTaskGrade={editTaskGrade}
              editTaskType={editTaskType}
              editTaskLocation={editTaskLocation}
              setEditTaskTitle={setEditTaskTitle}
              setEditTaskDescription={setEditTaskDescription}
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
