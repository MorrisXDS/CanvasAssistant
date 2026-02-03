/**
 * Settings Module - Refactored settings components
 *
 * This module provides:
 * - SettingsProvider: Context provider with all settings state and handlers
 * - useSettings: Hook to access settings context
 * - Section components (to be added): AccountSection, DisplaySection, etc.
 */

export { SettingsProvider, useSettings, type EnrollmentTerm } from './SettingsContext';
export { SettingsModalContent } from './SettingsModalContent';

// Section components
export { AccountSection } from './AccountSection';
export { DisplaySection } from './DisplaySection';
export { AcademicSection } from './AcademicSection';
export { NotificationsSection } from './NotificationsSection';
export { DataSection } from './DataSection';

// Modal components
export { UninstallModal } from './UninstallModal';
