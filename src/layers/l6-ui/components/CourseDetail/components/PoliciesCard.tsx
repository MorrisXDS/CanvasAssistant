/**
 * PoliciesCard Component
 * Displays course policies with add/edit/delete functionality
 */

import React from 'react';
import {
  Shield,
  Clock,
  TrendingUp,
  FileText,
  Plus,
  Edit3,
  Trash2,
  GripVertical,
} from 'lucide-react';
import { Card } from '../../shared';
import type { Policy } from '../../../../l5-presentation/types';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';

export interface PoliciesCardProps {
  policies: Policy[];
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onAddPolicy: () => void;
  onEditPolicy: (policy: Policy) => void;
  onDeletePolicy: (policyId: number, policyName: string) => void;
}

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

function formatPolicyType(policyType: string): string {
  return policyType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function PoliciesCard({
  policies,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onAddPolicy,
  onEditPolicy,
  onDeletePolicy,
}: PoliciesCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        ...styles.sidebarCardWrapper,
        opacity: isDragging ? 0.5 : 1,
        borderTop: isDragOver
          ? '2px solid var(--color-blue)'
          : '2px solid transparent',
        transition: 'opacity 0.2s, border-color 0.2s',
      }}
    >
      <Card padding="md" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={styles.policyHeader}>
          <div style={styles.cardHeaderLeft}>
            <GripVertical size={14} style={styles.sectionDragHandle} />
            <h3 style={styles.policySectionTitle}>Course Policies</h3>
          </div>
          <button style={styles.addPolicyBtn} onClick={onAddPolicy}>
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
                    onClick={() => onEditPolicy(policy)}
                    title="Edit"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    style={styles.policyActionBtn}
                    onClick={() => onDeletePolicy(policy.id, policy.policyName)}
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

export default PoliciesCard;
