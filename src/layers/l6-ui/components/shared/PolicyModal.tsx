/**
 * PolicyModal - Unified policy creation/editing modal
 *
 * Two-step flow for new policies:
 * - Step 1: Select policy type (card grid)
 * - Step 2: Configure policy (type-specific form)
 *
 * Edit mode skips step 1 and goes directly to configuration.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Modal } from '../primitives/Modal';
import { Button } from '../primitives/Button';
import { PolicyTypeSelector, type PolicyType, POLICY_TYPES } from './PolicyTypeSelector';
import { PolicyConfigForm, type PolicyConfigFormData } from './PolicyConfigForm';

interface Task {
  id: number;
  title: string;
  taskType?: string | null;
}

interface TaskGroup {
  id: number;
  name: string;
  displayName: string;
}

export interface PolicyModalData {
  policyType: PolicyType;
  policyName: string;
  config: Record<string, unknown>;
}

interface PolicyModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Save handler */
  onSave: (data: PolicyModalData) => void;
  /** Course ID for context */
  courseId: number;
  /** Course code for display */
  courseCode?: string;
  /** Available tasks for weight transfer / grade replacement */
  tasks?: Task[];
  /** Available task groups */
  taskGroups?: TaskGroup[];
  /** Existing policy names for duplicate validation */
  existingPolicyNames?: string[];
  /** Initial data for editing (skips type selection) */
  editData?: {
    id: number;
    policyType: PolicyType;
    policyName: string;
    config: Record<string, unknown>;
  };
  /** Loading state */
  isLoading?: boolean;
}

type ModalStep = 'select-type' | 'configure';

export function PolicyModal({
  isOpen,
  onClose,
  onSave,
  courseCode,
  tasks = [],
  taskGroups = [],
  existingPolicyNames = [],
  editData,
  isLoading = false,
}: PolicyModalProps) {
  // Step management
  const [step, setStep] = useState<ModalStep>(editData ? 'configure' : 'select-type');
  const [selectedType, setSelectedType] = useState<PolicyType | null>(editData?.policyType || null);

  // Form state
  const [isFormValid, setIsFormValid] = useState(false);
  const [formData, setFormData] = useState<PolicyConfigFormData | null>(null);

  // Reset state when modal opens/closes or edit data changes
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setStep('configure');
        setSelectedType(editData.policyType);
      } else {
        setStep('select-type');
        setSelectedType(null);
      }
      setIsFormValid(false);
      setFormData(null);
    }
  }, [isOpen, editData]);

  // Handle type selection (Step 1 -> Step 2)
  const handleTypeSelect = useCallback((type: PolicyType) => {
    setSelectedType(type);
    setStep('configure');
  }, []);

  // Handle back button (Step 2 -> Step 1)
  const handleBack = useCallback(() => {
    setStep('select-type');
    setSelectedType(null);
    setIsFormValid(false);
    setFormData(null);
  }, []);

  // Handle form validity change
  const handleValidChange = useCallback((isValid: boolean, data: PolicyConfigFormData) => {
    setIsFormValid(isValid);
    setFormData(data);
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    if (!selectedType || !formData || !isFormValid) return;

    onSave({
      policyType: selectedType,
      policyName: formData.policyName,
      config: formData.config,
    });
  }, [selectedType, formData, isFormValid, onSave]);

  // Get modal title based on step and mode
  const getTitle = () => {
    if (editData) {
      return 'Edit Policy';
    }
    if (step === 'select-type') {
      return 'Select Policy Type';
    }
    const typeInfo = POLICY_TYPES.find(t => t.value === selectedType);
    return `Add ${typeInfo?.label || 'Policy'}`;
  };

  // Get subtitle
  const getSubtitle = () => {
    if (courseCode) {
      return courseCode;
    }
    if (step === 'select-type') {
      return 'Choose the type of policy to add';
    }
    return undefined;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      closeOnBackdropClick={!isLoading}
      closeOnEscape={!isLoading}
    >
      <Modal.Header
        title={getTitle()}
        subtitle={getSubtitle()}
        onClose={onClose}
      >
        {/* Back button for Step 2 in create mode */}
        {step === 'configure' && !editData && (
          <button
            style={styles.backButton}
            onClick={handleBack}
            type="button"
            disabled={isLoading}
          >
            <ArrowLeft size={16} />
          </button>
        )}
      </Modal.Header>

      <Modal.Content>
        {step === 'select-type' ? (
          <PolicyTypeSelector onSelect={handleTypeSelect} />
        ) : selectedType ? (
          <PolicyConfigForm
            policyType={selectedType}
            initialData={editData ? {
              policyName: editData.policyName,
              config: editData.config,
            } : undefined}
            tasks={tasks}
            taskGroups={taskGroups}
            existingPolicyNames={existingPolicyNames}
            onValidChange={handleValidChange}
          />
        ) : null}
      </Modal.Content>

      {step === 'configure' && (
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!isFormValid || isLoading}
            loading={isLoading}
          >
            {editData ? 'Save Changes' : 'Add Policy'}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backButton: {
    position: 'absolute',
    left: '24px',
    top: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    border: 'none',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'transparent',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
};

export default PolicyModal;
