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

export { PolicyForm } from './PolicyForm';
export type { PolicyFormData, PolicyType } from './PolicyForm';

export { ConfirmDialog } from './ConfirmDialog';

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
export type { AccordionProps, AccordionItemProps, AccordionSectionProps } from './Accordion';

export { Dropdown, DropdownSection, DropdownSubmenu, DropdownItem } from './Dropdown';
export type { DropdownProps, DropdownSectionProps, DropdownSubmenuProps, DropdownItemProps } from './Dropdown';
