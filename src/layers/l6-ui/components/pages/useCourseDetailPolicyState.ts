/**
 * useCourseDetailPolicyState Hook
 * Manages policy-related state and handlers for CourseDetail page
 */

import { useState, useCallback } from 'react';
import type { PolicyModalData, PolicyType } from '../shared';
import type { Policy } from '../../../l5-presentation/types';

export interface ConfirmDialogConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  confirmText: string;
  onConfirm: () => void;
}

export interface PolicyModalStateData {
  isOpen: boolean;
  editData?: {
    id: number;
    policyType: PolicyType;
    policyName: string;
    config: Record<string, unknown>;
  };
}

export interface UseCourseDetailPolicyStateProps {
  courseId: number;
  setPolicies: React.Dispatch<React.SetStateAction<Policy[]>>;
  setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogConfig>>;
}

export interface UseCourseDetailPolicyStateReturn {
  // Modal state
  policyModalState: PolicyModalStateData;
  setPolicyModalState: React.Dispatch<React.SetStateAction<PolicyModalStateData>>;
  policyLoading: boolean;

  // Handlers
  handleSavePolicy: (data: PolicyModalData) => Promise<void>;
  openAddPolicyModal: () => void;
  openEditPolicyModal: (policy: Policy) => void;
  closePolicyModal: () => void;
  handleDeletePolicy: (policyId: number, policyName: string) => void;
}

export function useCourseDetailPolicyState({
  courseId,
  setPolicies,
  setConfirmDialog,
}: UseCourseDetailPolicyStateProps): UseCourseDetailPolicyStateReturn {
  // Policy modal state
  const [policyModalState, setPolicyModalState] = useState<PolicyModalStateData>({
    isOpen: false,
  });
  const [policyLoading, setPolicyLoading] = useState(false);

  // Save policy (create or update)
  const handleSavePolicy = useCallback(async (data: PolicyModalData) => {
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
  }, [courseId, policyModalState.editData?.id, setPolicies]);

  // Open add policy modal
  const openAddPolicyModal = useCallback(() => {
    setPolicyModalState({ isOpen: true });
  }, []);

  // Open edit policy modal
  const openEditPolicyModal = useCallback((policy: Policy) => {
    setPolicyModalState({
      isOpen: true,
      editData: {
        id: policy.id,
        policyType: policy.policyType as PolicyType,
        policyName: policy.policyName,
        config: policy.policyConfig as Record<string, unknown>,
      },
    });
  }, []);

  // Close policy modal
  const closePolicyModal = useCallback(() => {
    setPolicyModalState({ isOpen: false });
  }, []);

  // Delete policy with confirmation
  const handleDeletePolicy = useCallback((policyId: number, policyName: string) => {
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
  }, [courseId, setPolicies, setConfirmDialog]);

  return {
    // Modal state
    policyModalState,
    setPolicyModalState,
    policyLoading,

    // Handlers
    handleSavePolicy,
    openAddPolicyModal,
    openEditPolicyModal,
    closePolicyModal,
    handleDeletePolicy,
  };
}

export default useCourseDetailPolicyState;
