/**
 * UI Primitives Module
 *
 * Re-exports all primitive UI components:
 * - Modal - Compound modal component
 * - Button - Consistent buttons
 * - FormField - Form input wrapper
 * - EmptyState - Empty state display
 * - StatusMessage - Alert/message display
 */

// Modal
export { Modal, type ModalSize } from './Modal';

// Button
export {
  Button,
  IconButton,
  type ButtonVariant,
  type ButtonSize,
} from './Button';

// Form components
export {
  FormField,
  TextInput,
  TextArea,
  Select,
} from './FormField';

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
