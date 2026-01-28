/**
 * UI Primitives Module
 *
 * Re-exports all primitive UI components:
 * - Modal - Compound modal component
 * - Button - Consistent buttons
 * - FormField - Form input wrapper
 * - EmptyState - Empty state display
 * - StatusMessage - Alert/message display
 * - ColorPicker - Color selection component
 */

// Modal
export { Modal, type ModalSize } from './Modal';

// Color Picker
export {
  ColorPicker,
  ColorPickerPopup,
  ColorSwatch,
  type ColorPickerProps,
  type ColorPickerPopupProps,
  type ColorSwatchProps,
} from './ColorPicker';

// Button
export { Button, IconButton, type ButtonVariant, type ButtonSize } from './Button';

// Form components
export { FormField, TextInput, TextArea, Select } from './FormField';

// Feedback components
export { EmptyState } from './EmptyState';

export {
  StatusMessage,
  InfoMessage,
  SuccessMessage,
  WarningMessage,
  ErrorMessage,
  type StatusType,
} from './StatusMessage';

// Accordion
export { Accordion } from './Accordion';

// Search Input
export { SearchInput } from './SearchInput';

// Setting Row
export {
  SettingRow,
  ToggleSwitch,
  SettingSelect,
  SettingInput,
  SettingSlider,
  SettingButtonGroup,
} from './SettingRow';
