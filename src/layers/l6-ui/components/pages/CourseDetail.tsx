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
  Shield,
  CheckCircle,
  Clock,
  ChevronRight,
  Megaphone,
  Edit3,
  Save,
  X,
  Settings,
  EyeOff,
  Eye,
  Plus,
  Trash2,
  ChevronDown,
  Download,
  FileCode,
  GripVertical,
} from 'lucide-react';
import { Card, PolicyModal, ConfirmDialog } from '../shared';
import type { PolicyModalData, PolicyType } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import type { Task, Notification } from '../../../l5-presentation/types';
import { COURSE_COLORS, getCourseColor } from '../../constants';
import { ColorPicker } from '../primitives';
import { SyllabusSelector, TaskContextMenu, type CourseSyllabus } from '../Course';
import type { FileResource } from '../Files/FileListItem';
import { useCourseDetailDragDrop } from './useCourseDetailDragDrop';

// Task types for coursework
const TASK_TYPES = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'problem_set', label: 'Problem Set' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'homework', label: 'Homework' },
  { value: 'lab', label: 'Lab' },
  { value: 'essay', label: 'Essay' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'participation', label: 'Participation' },
  { value: 'project', label: 'Project' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'termtest', label: 'Term Test' },
  { value: 'final_exam', label: 'Final Exam' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'reading_response', label: 'Reading Response' },
  { value: 'discussion', label: 'Discussion' },
  { value: 'reading', label: 'Reading' },
  { value: 'external', label: 'External Tool' },
  { value: 'info', label: 'Info (Not Graded)' },
];

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
  targetGradeSource: 'default' | 'manual';
  assessedGrade: number | null;
  currentGrade: number | null;
  totalWeight: number;
  color: string | null;
  nickname: string | null;
  isHidden: boolean;
  syllabusBody: string | null;
  lastSyncedAt: string | null;
}

interface CoursePage {
  id: number;
  externalId: string | null;
  courseId: number;
  pageType: string;
  title: string;
  urlSlug: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  isFrontPage: boolean;
  published: boolean;
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
  const [coursePages, setCoursePages] = useState<CoursePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingPageId, setDownloadingPageId] = useState<number | null>(null);

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
  const [newTaskType, setNewTaskType] = useState('');

  // Task detail/edit state
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [editTaskDueDate, setEditTaskDueDate] = useState('');
  const [editTaskWeight, setEditTaskWeight] = useState('');
  const [editTaskGrade, setEditTaskGrade] = useState('');
  const [editTaskType, setEditTaskType] = useState('');

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
      // Save course preferences (nickname, color)
      await api.dispatch('UpdateCoursePreferences', {
        courseId,
        preferences: {
          nickname: nicknameInput || undefined,
          color: selectedColor || undefined,
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
              }
            : null
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
      setCourse((prev) => (prev ? { ...prev, isHidden: newHidden } : null));
    } catch (error) {
      console.error('Failed to toggle course visibility:', error);
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

  const _handleRemoveSyllabus = async () => {
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
        taskType: newTaskType || undefined,
      });
      // Reset form
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskDueDate('');
      setNewTaskWeight('');
      setNewTaskType('');
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
    // Convert UTC ISO string to local datetime-local format (YYYY-MM-DDTHH:MM)
    if (task.dueAt) {
      const localDate = new Date(task.dueAt);
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const hours = String(localDate.getHours()).padStart(2, '0');
      const minutes = String(localDate.getMinutes()).padStart(2, '0');
      setEditTaskDueDate(`${year}-${month}-${day}T${hours}:${minutes}`);
    } else {
      setEditTaskDueDate('');
    }
    setEditTaskWeight(task.weight?.toString() || '');
    setEditTaskGrade(task.grade?.toString() || '');
    setEditTaskType(task.taskType || '');
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
        taskType: editTaskType || null,
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
      confirmText: 'Delete',
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

  // Handle page HTML download
  const handleDownloadPage = async (page: CoursePage) => {
    if (!page.bodyHtml || !course) return;

    setDownloadingPageId(page.id);
    try {
      const api = window.api;
      if (api?.exportPageHtml) {
        await api.exportPageHtml({
          courseId: course.id,
          pageId: page.id,
          title: page.title,
          bodyHtml: page.bodyHtml,
        });
      }
    } catch (error) {
      console.error('Failed to download page:', error);
    } finally {
      setDownloadingPageId(null);
    }
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
          pagesData,
          syllabusData,
          filesData,
        ] = await Promise.all([
          api.getCourse(courseId),
          api.getPolicies(courseId),
          api.getGradeHistory(courseId),
          api.getCourseNotifications(courseId),
          api.getPagesByCourse(courseId),
          api.getCourseSyllabus?.(courseId).catch(() => null),
          api.getCourseFiles?.(courseId).catch(() => []),
        ]);

        setCourse(courseData);
        setPolicies(policiesData || []);
        setGradeHistory(historyData || []);
        setAnnouncements(announcementsData || []);
        setCoursePages(pagesData || []);
        setSyllabus(syllabusData || null);
        setCourseFiles(filesData || []);
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
                      <button
                        style={styles.editIconButton}
                        onClick={handleSaveTargetGrade}
                      >
                        <Save size={14} color="var(--color-success)" />
                      </button>
                      <button
                        style={styles.editIconButton}
                        onClick={() => setEditingTarget(false)}
                      >
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
                      <Edit3
                        size={12}
                        color="var(--text-muted)"
                        style={{ marginLeft: '4px' }}
                      />
                    </div>
                  )}
                  <div style={styles.gradeSubtext}>
                    final goal
                    {course.targetGradeSource === 'default' && (
                      <span
                        style={{ color: 'var(--color-blue)', marginLeft: '4px' }}
                        title="Using app default - will update when you change the default target grade in Settings"
                      >
                        (default)
                      </span>
                    )}
                  </div>
                </div>
                <div style={styles.gradeDivider} />
                <div style={styles.gradeItem}>
                  <div style={styles.gradeLabel}>
                    <TrendingUp size={14} />
                    Earned
                  </div>
                  <div
                    style={{
                      ...styles.gradeValue,
                      color:
                        completedWeight > 0
                          ? gradeStatus === 'on-track'
                            ? 'var(--color-success)'
                            : gradeStatus === 'warning'
                              ? 'var(--color-medium)'
                              : 'var(--color-high)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {completedWeight > 0 ? `${earnedContribution.toFixed(2)}%` : '—'}
                  </div>
                  <div style={styles.gradeSubtext}>
                    {completedWeight > 0
                      ? `of ${completedWeight.toFixed(0)}% assessed`
                      : '\u00A0'}
                  </div>
                </div>
                <div style={styles.gradeDivider} />
                <div style={styles.gradeItem}>
                  <div style={styles.gradeLabel}>
                    <TrendingUp size={14} />
                    Trend
                  </div>
                  <div
                    style={{
                      ...styles.gradeValue,
                      color:
                        completedWeight > 0
                          ? gradeStatus === 'on-track'
                            ? 'var(--color-success)'
                            : gradeStatus === 'warning'
                              ? 'var(--color-medium)'
                              : 'var(--color-high)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {completedWeight > 0 ? `${effectiveGrade.toFixed(1)}%` : '—'}
                  </div>
                  <div style={styles.gradeSubtext}>
                    {completedWeight > 0 ? 'avg on graded work' : '\u00A0'}
                  </div>
                </div>
                {/* Syllabus */}
                <div style={styles.gradeDivider} />
                <div
                  style={{ ...styles.gradeItem, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => {
                    // Delay single-click to allow double-click to cancel it
                    if (syllabusClickTimeout.current) {
                      clearTimeout(syllabusClickTimeout.current);
                    }
                    syllabusClickTimeout.current = setTimeout(() => {
                      setShowSyllabusSelector(true);
                    }, 1000);
                  }}
                  onDoubleClick={() => {
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
                    // Fire-and-forget: don't block UI while file opens
                    if (syllabus.resourceId < 0) {
                      api
                        ?.openAttachment(Math.abs(syllabus.resourceId))
                        .catch((error: unknown) =>
                          console.error('Failed to open syllabus:', error)
                        );
                    } else {
                      api
                        ?.openResource(syllabus.resourceId)
                        .catch((error: unknown) =>
                          console.error('Failed to open syllabus:', error)
                        );
                    }
                  }}
                  title={
                    syllabus
                      ? 'Click to change, double-click to open'
                      : 'Click to select syllabus'
                  }
                >
                  <div style={styles.gradeLabel}>
                    <FileText size={14} />
                    Syllabus
                  </div>
                  <div
                    style={{
                      ...styles.gradeValue,
                      color: syllabus ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {syllabus ? syllabus.resourceTitle : '—'}
                  </div>
                  <div style={styles.gradeSubtext}>
                    {syllabus?.changeDetectedAt ? (
                      <span style={{ color: 'var(--color-warning)' }}>file updated</span>
                    ) : syllabus ? (
                      'up to date'
                    ) : (
                      'click to select'
                    )}
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
                    <ColorPicker
                      value={selectedColor || getCourseColor(course.id, course.color)}
                      onChange={setSelectedColor}
                      presets={COURSE_COLORS}
                      allowCustom={true}
                      swatchSize={24}
                    />
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
                  <button
                    style={styles.cancelButton}
                    onClick={() => setShowSettings(false)}
                  >
                    Cancel
                  </button>
                  <button style={styles.saveButton} onClick={handleSaveSettings}>
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {/* Grade Progress Bar - Two layers: assessed weight (background) and earned contribution (foreground) */}
            {completedWeight > 0 ? (
              <div style={styles.progressSection}>
                <div style={styles.progressBar}>
                  {/* Background layer: total assessed weight */}
                  <div
                    style={{
                      ...styles.progressFillBackground,
                      width: `${Math.min(completedWeight, 100)}%`,
                    }}
                  />
                  {/* Foreground layer: earned contribution */}
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${Math.min(earnedContribution, 100)}%`,
                      backgroundColor:
                        gradeStatus === 'on-track'
                          ? 'var(--color-success)'
                          : gradeStatus === 'warning'
                            ? 'var(--color-medium)'
                            : 'var(--color-high)',
                    }}
                  />
                  {/* Target marker: where you need to be */}
                  <div
                    style={{
                      ...styles.targetMarker,
                      left: `${targetPercent}%`,
                    }}
                  />
                </div>
                <div style={styles.progressLabels}>
                  <span>0%</span>
                  <span style={styles.progressLegend}>
                    <span style={styles.legendItem}>
                      <span
                        style={{
                          ...styles.legendDot,
                          backgroundColor: 'var(--color-gray-300)',
                        }}
                      />
                      Assessed: {completedWeight.toFixed(0)}%
                    </span>
                    <span style={styles.legendItem}>
                      <span
                        style={{
                          ...styles.legendDot,
                          backgroundColor:
                            gradeStatus === 'on-track'
                              ? 'var(--color-success)'
                              : gradeStatus === 'warning'
                                ? 'var(--color-medium)'
                                : 'var(--color-high)',
                        }}
                      />
                      Earned: {earnedContribution.toFixed(2)}%
                    </span>
                    <span style={styles.legendItem}>
                      <span
                        style={{
                          ...styles.legendDot,
                          backgroundColor: 'var(--color-navy)',
                        }}
                      />
                      Target: {targetPercent.toFixed(2)}%
                    </span>
                  </span>
                  <span>100%</span>
                </div>
              </div>
            ) : (
              <div style={styles.noProgressSection}>
                <span style={styles.noProgressText}>
                  No graded coursework with weight yet
                </span>
              </div>
            )}

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
                          <select
                            value={newTaskType}
                            onChange={(e) => setNewTaskType(e.target.value)}
                            style={styles.addTaskSelect}
                          >
                            <option value="">Select type...</option>
                            {TASK_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
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
                          <button
                            style={styles.cancelButton}
                            onClick={() => setShowAddTask(false)}
                          >
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
                            isFirst={index === 0 && !(isPending && showAddTask)}
                            isCompleted={getIsCompleted(task)}
                            isExpanded={expandedTaskId === task.id}
                            isEditing={editingTaskId === task.id}
                            isHighlighted={highlightedTaskId === task.id}
                            editTitle={editTaskTitle}
                            editDescription={editTaskDescription}
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
                            onCancelEdit={() => setEditingTaskId(null)}
                            onSaveEdit={handleSaveTask}
                            onDelete={() => handleDeleteTask(task.id, task.title)}
                            onEditTitleChange={setEditTaskTitle}
                            onEditDescriptionChange={setEditTaskDescription}
                            onEditDueDateChange={setEditTaskDueDate}
                            onEditWeightChange={setEditTaskWeight}
                            onEditGradeChange={setEditTaskGrade}
                            editTaskType={editTaskType}
                            onEditTaskTypeChange={setEditTaskType}
                            onContextMenu={(e) => handleTaskContextMenu(e, task)}
                            taskRef={(el) => {
                              if (el) taskRefs.current.set(task.id, el);
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
                  <div
                    key={sectionId}
                    draggable
                    onDragStart={sidebarDragHandlers.onDragStart(sectionId)}
                    onDragEnd={sidebarDragHandlers.onDragEnd}
                    onDragOver={sidebarDragHandlers.onDragOver(sectionId)}
                    onDragLeave={sidebarDragHandlers.onDragLeave}
                    onDrop={sidebarDragHandlers.onDrop(sectionId)}
                    style={{
                      opacity: isDragging ? 0.5 : 1,
                      borderTop: isDragOver
                        ? '2px solid var(--color-blue)'
                        : '2px solid transparent',
                      transition: 'opacity 0.2s, border-color 0.2s',
                    }}
                  >
                    <Card padding="md">
                      <div style={styles.policyHeader}>
                        <div style={styles.cardHeaderLeft}>
                          <GripVertical size={14} style={styles.sectionDragHandle} />
                          <h3 style={styles.policySectionTitle}>Course Policies</h3>
                        </div>
                        <button style={styles.addPolicyBtn} onClick={openAddPolicyModal}>
                          <Plus size={14} />
                        </button>
                      </div>

                      {policies.length === 0 ? (
                        <div style={styles.emptySideSection}>
                          <Shield size={20} color="var(--text-muted)" />
                          <span style={styles.emptySideText}>No policies configured</span>
                        </div>
                      ) : (
                        <div style={styles.policyList}>
                          {policies.map((policy) => (
                            <div key={policy.id} style={styles.policyItem}>
                              <div style={styles.policyIcon}>
                                {getPolicyIcon(policy.policyType)}
                              </div>
                              <div style={styles.policyInfo}>
                                <div style={styles.policyName}>{policy.policyName}</div>
                                <div style={styles.policyType}>
                                  {formatPolicyType(policy.policyType)}
                                </div>
                              </div>
                              <div style={styles.policyActions}>
                                <button
                                  style={styles.policyActionBtn}
                                  onClick={() => openEditPolicyModal(policy)}
                                  title="Edit"
                                >
                                  <Edit3 size={12} />
                                </button>
                                <button
                                  style={styles.policyActionBtn}
                                  onClick={() =>
                                    handleDeletePolicy(policy.id, policy.policyName)
                                  }
                                  title="Delete"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  </div>
                );
              }

              if (sectionId === 'announcements') {
                return (
                  <div
                    key={sectionId}
                    draggable
                    onDragStart={sidebarDragHandlers.onDragStart(sectionId)}
                    onDragEnd={sidebarDragHandlers.onDragEnd}
                    onDragOver={sidebarDragHandlers.onDragOver(sectionId)}
                    onDragLeave={sidebarDragHandlers.onDragLeave}
                    onDrop={sidebarDragHandlers.onDrop(sectionId)}
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
                          <h3 style={styles.cardTitle}>Recent Announcements</h3>
                        </div>
                      </div>
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
                  </div>
                );
              }

              if (sectionId === 'pages') {
                // Only render if there are course pages
                if (coursePages.length === 0) return null;

                return (
                  <div
                    key={sectionId}
                    draggable
                    onDragStart={sidebarDragHandlers.onDragStart(sectionId)}
                    onDragEnd={sidebarDragHandlers.onDragEnd}
                    onDragOver={sidebarDragHandlers.onDragOver(sectionId)}
                    onDragLeave={sidebarDragHandlers.onDragLeave}
                    onDrop={sidebarDragHandlers.onDrop(sectionId)}
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
                          <h3 style={styles.cardTitle}>Course Pages</h3>
                        </div>
                      </div>
                      <div style={styles.pagesList}>
                        {coursePages.map((page) => (
                          <div key={page.id} style={styles.pageItem}>
                            <div style={styles.pageInfo}>
                              <FileCode size={16} color="var(--text-muted)" />
                              <div style={styles.pageDetails}>
                                <div style={styles.pageTitle}>{page.title}</div>
                                <div style={styles.pageType}>
                                  {page.pageType === 'syllabus'
                                    ? 'Syllabus'
                                    : page.isFrontPage
                                      ? 'Front Page'
                                      : 'Wiki Page'}
                                </div>
                              </div>
                            </div>
                            {page.bodyHtml && (
                              <button
                                style={styles.downloadButton}
                                onClick={() => handleDownloadPage(page)}
                                disabled={downloadingPageId === page.id}
                                title="Download as HTML"
                              >
                                {downloadingPageId === page.id ? (
                                  <Clock size={14} />
                                ) : (
                                  <Download size={14} />
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
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
            {gradeHistory.length > 0 && (
              <Card padding="none">
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>Grade History</h3>
                </div>
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
        confirmText={confirmDialog.confirmText}
        cancelText="Cancel"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
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
          editDueDate={editTaskDueDate}
          editWeight={editTaskWeight}
          editGrade={editTaskGrade}
          editTaskType={editTaskType}
          onToggleExpand={(taskId) =>
            setExpandedTaskId(expandedTaskId === taskId ? null : taskId)
          }
          onToggleComplete={handleToggleComplete}
          onDuplicate={handleDuplicateTask}
          onStartEdit={startEditingTask}
          onCancelEdit={() => setEditingTaskId(null)}
          onSaveEdit={handleSaveTask}
          onDelete={(taskId, taskTitle) => handleDeleteTask(taskId, taskTitle)}
          onEditTitleChange={setEditTaskTitle}
          onEditDescriptionChange={setEditTaskDescription}
          onEditDueDateChange={setEditTaskDueDate}
          onEditWeightChange={setEditTaskWeight}
          onEditGradeChange={setEditTaskGrade}
          onEditTaskTypeChange={setEditTaskType}
          onTaskContextMenu={handleTaskContextMenu}
        />
      )}

      {/* Task Context Menu */}
      {taskContextMenu && (
        <TaskContextMenu
          task={taskContextMenu.task}
          position={taskContextMenu.position}
          onClose={() => setTaskContextMenu(null)}
          onEdit={() => {
            setExpandedTaskId(taskContextMenu.task.id);
            startEditingTask(taskContextMenu.task);
          }}
          onDuplicate={() => handleDuplicateTask(taskContextMenu.task.id)}
          onToggleComplete={() => handleToggleComplete(taskContextMenu.task)}
          onOpenInCanvas={() => handleOpenTaskInCanvas(taskContextMenu.task)}
          onDelete={() =>
            handleDeleteTask(taskContextMenu.task.id, taskContextMenu.task.title)
          }
          onToggleOptional={() => handleToggleOptional(taskContextMenu.task)}
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
  editTaskType: string;
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
  onEditTaskTypeChange: (value: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
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
  editTaskType,
  onToggleExpand,
  onToggleComplete: _onToggleComplete,
  onDuplicate: _onDuplicate,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onEditTitleChange,
  onEditDescriptionChange,
  onEditDueDateChange,
  onEditWeightChange,
  onEditGradeChange,
  onEditTaskTypeChange,
  onContextMenu,
  taskRef,
}: TaskItemProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  // Determine if task is submitted (submitted or graded status)
  const isSubmitted =
    task.submissionStatus === 'submitted' || task.submissionStatus === 'graded';

  // Get display label for task type
  const _getTaskTypeLabel = (typeValue: string | null): string => {
    if (!typeValue) return '';
    const found = TASK_TYPES.find((t) => t.value === typeValue);
    return found ? found.label : typeValue;
  };

  // Handle double-click to expand for editing
  const handleDoubleClick = () => {
    if (!isExpanded) {
      onToggleExpand();
    }
    onStartEdit();
  };

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
      onContextMenu={onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Task Row */}
      <div
        style={{
          ...styles.taskItem,
          opacity: isCompleted ? 0.7 : 1,
          backgroundColor: isExpanded ? 'var(--bg-app)' : 'transparent',
          cursor: 'pointer',
        }}
        onDoubleClick={handleDoubleClick}
      >
        {/* Submission status indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            minWidth: '24px',
            marginRight: 'var(--space-2)',
          }}
        >
          {isSubmitted && (
            <CheckCircle
              size={18}
              color="var(--color-success)"
              className="task-submitted-icon"
              style={{
                animation: 'fadeIn 0.3s ease-out',
              }}
            />
          )}
        </div>
        <div style={styles.taskInfo}>
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
              <span
                style={{
                  color: isCompleted ? 'var(--text-muted)' : getUrgencyColor(task.dueAt),
                }}
              >
                <Calendar size={12} />
                {formatDate(task.dueAt)}
                {task.fieldSources?.due_at === 'guessed' && (
                  <span style={styles.guessedBadge} title="Auto-assigned date">
                    (est.)
                  </span>
                )}
              </span>
            )}
            {task.weight > 0 && (
              <span style={styles.taskWeight} title="Weight towards final grade">
                Weight: {task.weight}%
              </span>
            )}
            {task.grade !== null && (
              <span style={styles.taskScore} title="Score on this coursework">
                Score: {task.grade.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            ...styles.taskActions,
            opacity: isHovered || isExpanded ? 1 : 0,
            transition: 'opacity 0.15s ease',
          }}
        >
          <button
            style={styles.taskActionBtn}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            title={isExpanded ? 'Collapse' : 'Expand'}
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
              <div style={styles.taskEditRow}>
                <label style={styles.taskEditLabel}>Type</label>
                <select
                  value={editTaskType}
                  onChange={(e) => onEditTaskTypeChange(e.target.value)}
                  style={styles.taskEditSelect}
                >
                  <option value="">Select type...</option>
                  {TASK_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
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
                  <label
                    style={styles.taskEditLabel}
                    title="How much this counts towards your final grade"
                  >
                    Weight (%)
                  </label>
                  <input
                    type="number"
                    value={editWeight}
                    onChange={(e) => onEditWeightChange(e.target.value)}
                    style={styles.taskEditInput}
                    min="0"
                    max="100"
                    placeholder="e.g. 10"
                  />
                </div>
                <div style={styles.taskEditRowHalf}>
                  <label
                    style={styles.taskEditLabel}
                    title="Your score on this coursework (0-100%)"
                  >
                    Score (%)
                  </label>
                  <input
                    type="number"
                    value={editGrade}
                    onChange={(e) => onEditGradeChange(e.target.value)}
                    style={styles.taskEditInput}
                    min="0"
                    max="150"
                    placeholder="e.g. 85"
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

// Task List Modal Component
interface TaskListModalProps {
  isOpen: boolean;
  title: string;
  tasks: Task[];
  onClose: () => void;
  expandedTaskId: number | null;
  editingTaskId: number | null;
  highlightedTaskId: number | null;
  editTitle: string;
  editDescription: string;
  editDueDate: string;
  editWeight: string;
  editGrade: string;
  editTaskType: string;
  onToggleExpand: (taskId: number) => void;
  onToggleComplete: (task: Task) => void;
  onDuplicate: (taskId: number) => void;
  onStartEdit: (task: Task) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (taskId: number, taskTitle: string) => void;
  onEditTitleChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onEditDueDateChange: (value: string) => void;
  onEditWeightChange: (value: string) => void;
  onEditGradeChange: (value: string) => void;
  onEditTaskTypeChange: (value: string) => void;
  onTaskContextMenu?: (e: React.MouseEvent, task: Task) => void;
}

function TaskListModal({
  isOpen,
  title,
  tasks,
  onClose,
  expandedTaskId,
  editingTaskId,
  highlightedTaskId,
  editTitle,
  editDescription,
  editDueDate,
  editWeight,
  editGrade,
  editTaskType,
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
  onEditTaskTypeChange,
  onTaskContextMenu,
}: TaskListModalProps) {
  if (!isOpen) return null;

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>{title}</h2>
          <button style={modalStyles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div style={modalStyles.content}>
          {tasks.length === 0 ? (
            <div style={styles.emptySection}>
              <span>No tasks</span>
            </div>
          ) : (
            <div style={styles.taskList}>
              {tasks.map((task, index) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  isFirst={index === 0}
                  isCompleted={task.isCompleted || task.grade !== null}
                  isExpanded={expandedTaskId === task.id}
                  isEditing={editingTaskId === task.id}
                  isHighlighted={highlightedTaskId === task.id}
                  editTitle={editTitle}
                  editDescription={editDescription}
                  editDueDate={editDueDate}
                  editWeight={editWeight}
                  editGrade={editGrade}
                  onToggleExpand={() => onToggleExpand(task.id)}
                  onToggleComplete={() => onToggleComplete(task)}
                  onDuplicate={() => onDuplicate(task.id)}
                  onStartEdit={() => onStartEdit(task)}
                  onCancelEdit={onCancelEdit}
                  onSaveEdit={onSaveEdit}
                  onDelete={() => onDelete(task.id, task.title)}
                  onEditTitleChange={onEditTitleChange}
                  onEditDescriptionChange={onEditDescriptionChange}
                  onEditDueDateChange={onEditDueDateChange}
                  onEditWeightChange={onEditWeightChange}
                  onEditGradeChange={onEditGradeChange}
                  editTaskType={editTaskType}
                  onEditTaskTypeChange={onEditTaskTypeChange}
                  onContextMenu={
                    onTaskContextMenu ? (e) => onTaskContextMenu(e, task) : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const modalStyles: Record<string, React.CSSProperties> = {
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
  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    width: '90%',
    maxWidth: '700px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--border-light)',
  },
  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    borderRadius: 'var(--radius-md)',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
  },
};

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    flex: 1,
  },

  page: {
    width: '100%',
    maxWidth: 'min(1400px, calc(100vw - var(--sidebar-width) - var(--space-12)))',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    paddingBottom: 'var(--space-8)',
    flex: 1,
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

  gradeSubtext: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
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

  settingsDivider: {
    height: '1px',
    backgroundColor: 'var(--border-light)',
    margin: 'var(--space-4) 0',
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

  noProgressSection: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-3)',
    textAlign: 'center',
  },

  noProgressText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },

  progressBar: {
    position: 'relative',
    height: '8px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: '4px',
    overflow: 'visible',
    marginBottom: 'var(--space-2)',
  },

  progressFillBackground: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    borderRadius: '4px',
    backgroundColor: 'var(--color-gray-300)',
    transition: 'width 0.3s ease',
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

  progressLegend: {
    display: 'flex',
    gap: 'var(--space-4)',
  },

  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },

  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
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

  cardHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  sectionDragHandle: {
    color: 'var(--text-muted)',
    cursor: 'grab',
    flexShrink: 0,
    opacity: 0.5,
    transition: 'opacity var(--transition-fast)',
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

  viewAllButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    color: 'var(--color-blue)',
    border: '1px solid var(--color-blue)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
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

  addTaskSelect: {
    flex: 1,
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    cursor: 'pointer',
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

  taskScore: {
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-success)',
    cursor: 'help',
  },

  guessedBadge: {
    marginLeft: '4px',
    fontStyle: 'italic',
    color: 'var(--color-blue)',
    cursor: 'help',
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
    padding: '4px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    borderRadius: '50%',
    transition: 'transform 0.15s ease, background-color 0.15s ease',
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

  taskEditSelect: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    cursor: 'pointer',
    width: '100%',
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
    padding: '0 var(--space-4) var(--space-4) var(--space-4)',
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

  pagesList: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0 var(--space-4) var(--space-4) var(--space-4)',
  },

  pageItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--border-light)',
  },

  pageInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flex: 1,
    minWidth: 0,
  },

  pageDetails: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },

  pageTitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  pageType: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  downloadButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    transition: 'all var(--transition-fast)',
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
