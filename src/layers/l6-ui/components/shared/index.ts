/**
 * Shared UI Components
 * Re-export all shared components for easy importing
 */

export { Card } from './Card';
export type { CardProps } from './Card';

export { Badge, urgencyToBadgeVariant, formatUrgency } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';

export * from './Icon';

export { TaskTypeSelector } from './TaskTypeSelector';

export { ConfirmDialog } from './ConfirmDialog';

export { CloseBehaviorDialog } from './CloseBehaviorDialog';

export { SyncResultToast } from './SyncResultToast';
export type { SyncResultData } from './SyncResultToast';

export { SmartCard } from './SmartCard';
export type { SmartCardProps } from './SmartCard';

export { InfoTrigger } from './InfoTrigger';
export type { InfoTriggerProps } from './InfoTrigger';

export { TargetBar } from './TargetBar';
export type { TargetBarProps } from './TargetBar';

export { SyncConflictModal } from './SyncConflictModal';
export type { SyncConflictData, ConflictResolutionData } from './SyncConflictModal';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { Accordion, AccordionItem, AccordionSection } from './Accordion';
export type {
  AccordionProps,
  AccordionItemProps,
  AccordionSectionProps,
} from './Accordion';

export { Dropdown, DropdownSection, DropdownSubmenu, DropdownItem } from './Dropdown';
export type {
  DropdownProps,
  DropdownSectionProps,
  DropdownSubmenuProps,
  DropdownItemProps,
} from './Dropdown';

export { RichTextEditor } from './RichTextEditor';
export type { RichTextEditorProps } from './RichTextEditor';

export { HtmlContent, extractCanvasFileId } from './HtmlContent';
export type { HtmlContentProps } from './HtmlContent';

export { TaskCheckIcon } from './TaskCheckIcon';
export type { TaskCheckIconProps } from './TaskCheckIcon';

export { SyncUpdatesFAB } from './SyncUpdatesFAB';
export type { SyncUpdatesFABProps } from './SyncUpdatesFAB';

export { ErrorBoundary } from './ErrorBoundary';

export {
  NotificationDot,
  NotificationDotGroup,
  FieldNotificationDot,
  UPDATE_TYPE_LABELS,
  FIELD_DISPLAY_LABELS,
  getUpdateTypePriority,
  getPriorityUpdateType,
} from './NotificationDot';
// UPDATE_TYPE_COLORS moved to colors.ts; re-exported here for backward compatibility
export { UPDATE_TYPE_COLORS } from '../../constants/colors';
export type {
  NotificationDotProps,
  NotificationDotGroupProps,
  FieldNotificationDotProps,
  UpdateType,
} from './NotificationDot';

export { SelectionBar } from './SelectionBar';
export type { SelectionBarProps, SelectionBarAction } from './SelectionBar';

export { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
export type { KeyboardShortcutsModalProps } from './KeyboardShortcutsModal';
