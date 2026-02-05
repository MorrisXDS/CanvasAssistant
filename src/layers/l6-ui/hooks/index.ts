/**
 * UI Hooks - Custom React hooks for the presentation layer
 */

export { useScrollbarVisibility } from './useScrollbarVisibility';
export {
  useFeatureFlag,
  useFeatureFlagValue,
  useFeatureFlagsByCategory,
  useSetFeatureFlag,
  useResetFeatureFlag,
} from './useFeatureFlag';
export {
  useUpdatesByCourse,
  useUpdatesByFolder,
  useUpdateCountByType,
  useSidebarDots,
  useCourseHasUpdates,
  useFileUpdateDots,
  useTaskUpdates,
  useFileUpdates,
  useTaskFieldUpdates,
  useTaskHasUpdates,
  useFileHasUpdates,
} from './useUpdatesByEntity';
export type {
  CourseUpdateSummary,
  FolderUpdateSummary,
  TaskUpdateSummary,
  FieldUpdateInfo,
  FileUpdateInfo,
} from './useUpdatesByEntity';
