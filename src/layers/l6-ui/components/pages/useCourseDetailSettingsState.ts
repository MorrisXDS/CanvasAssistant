/**
 * useCourseDetailSettingsState Hook
 * Manages course settings state and handlers for CourseDetail page
 */

import { useState, useCallback } from 'react';

export interface CourseSettingsData {
  id: number;
  targetGrade: number;
  targetGradeSource: 'default' | 'manual';
  nickname: string | null;
  color: string | null;
  isHidden: boolean;
  credits: number;
  gradeCurveAdjustment?: number;
}

export interface UseCourseDetailSettingsStateProps<T extends CourseSettingsData> {
  courseId: number;
  course: T | null;
  setCourse: React.Dispatch<React.SetStateAction<T | null>>;
  navigate: (path: string) => void;
}

export interface UseCourseDetailSettingsStateReturn {
  // Target grade editing
  editingTarget: boolean;
  setEditingTarget: (editing: boolean) => void;
  targetGradeInput: string;
  setTargetGradeInput: (value: string) => void;

  // Settings panel
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  nicknameInput: string;
  setNicknameInput: (value: string) => void;
  selectedColor: string | null;
  setSelectedColor: (color: string | null) => void;
  creditsInput: string;
  setCreditsInput: (value: string) => void;
  curveAdjustmentInput: string;
  setCurveAdjustmentInput: (value: string) => void;

  // Handlers
  handleSaveTargetGrade: () => Promise<void>;
  handleSaveSettings: () => Promise<void>;
  handleToggleHidden: () => Promise<void>;
  handleArchiveCourse: () => Promise<void>;
  handleToggleSettings: () => void;
  handleStartEditTarget: () => void;
}

export function useCourseDetailSettingsState<T extends CourseSettingsData>({
  courseId,
  course,
  setCourse,
  navigate,
}: UseCourseDetailSettingsStateProps<T>): UseCourseDetailSettingsStateReturn {
  // Target grade editing state
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetGradeInput, setTargetGradeInput] = useState('');

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [creditsInput, setCreditsInput] = useState('');
  const [curveAdjustmentInput, setCurveAdjustmentInput] = useState('');

  // Save target grade
  const handleSaveTargetGrade = useCallback(async () => {
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
  }, [courseId, targetGradeInput, setCourse]);

  // Save course settings
  const handleSaveSettings = useCallback(async () => {
    const api = window.api;
    if (!api?.dispatch) return;

    try {
      // Parse credits
      const newCredits = parseFloat(creditsInput);
      const validCredits = !isNaN(newCredits) && newCredits >= 0 && newCredits <= 10;

      // Parse curve adjustment (empty = 0)
      const newCurveAdjustment =
        curveAdjustmentInput.trim() === '' ? 0 : parseFloat(curveAdjustmentInput);
      const validCurve =
        !isNaN(newCurveAdjustment) &&
        newCurveAdjustment >= -50 &&
        newCurveAdjustment <= 50;

      // Save course preferences (nickname, color, credits, curve adjustment)
      // Use null to explicitly clear nickname/color, undefined to skip update
      const prefsResult = await api.dispatch('UpdateCoursePreferences', {
        courseId,
        preferences: {
          nickname: nicknameInput === '' ? null : nicknameInput || undefined,
          color: selectedColor === '' ? null : selectedColor || undefined,
          credits: validCredits ? newCredits : undefined,
          gradeCurveAdjustment: validCurve ? newCurveAdjustment : undefined,
        },
      });

      if (!prefsResult.success) {
        console.error('Failed to save course preferences:', prefsResult.error);
        throw new Error(prefsResult.error || 'Failed to save preferences');
      }

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
                gradeCurveAdjustment: validCurve
                  ? newCurveAdjustment
                  : prev.gradeCurveAdjustment,
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
                gradeCurveAdjustment: validCurve
                  ? newCurveAdjustment
                  : prev.gradeCurveAdjustment,
              }
            : null
        );
      }

      setShowSettings(false);
    } catch (error) {
      console.error('Failed to update course settings:', error);
    }
  }, [
    courseId,
    course?.targetGrade,
    nicknameInput,
    selectedColor,
    targetGradeInput,
    creditsInput,
    curveAdjustmentInput,
    setCourse,
  ]);

  // Toggle course visibility
  const handleToggleHidden = useCallback(async () => {
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
  }, [courseId, course, setCourse]);

  // Archive course
  const handleArchiveCourse = useCallback(async () => {
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
  }, [courseId, course, navigate]);

  // Toggle settings panel
  const handleToggleSettings = useCallback(() => {
    if (!course) return;
    setNicknameInput(course.nickname || '');
    setSelectedColor(course.color);
    setTargetGradeInput(course.targetGrade.toString());
    setCreditsInput(course.credits?.toString() || '1.0');
    setCurveAdjustmentInput((course.gradeCurveAdjustment ?? 0).toString());
    setShowSettings(!showSettings);
  }, [course, showSettings]);

  // Start editing target grade
  const handleStartEditTarget = useCallback(() => {
    if (!course) return;
    setTargetGradeInput(course.targetGrade.toString());
    setEditingTarget(true);
  }, [course]);

  return {
    // Target grade editing
    editingTarget,
    setEditingTarget,
    targetGradeInput,
    setTargetGradeInput,

    // Settings panel
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

    // Handlers
    handleSaveTargetGrade,
    handleSaveSettings,
    handleToggleHidden,
    handleArchiveCourse,
    handleToggleSettings,
    handleStartEditTarget,
  };
}

export default useCourseDetailSettingsState;
