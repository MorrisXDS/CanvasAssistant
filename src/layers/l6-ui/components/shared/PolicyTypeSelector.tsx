/**
 * PolicyTypeSelector - Card-based policy type selection (Step 1 of policy modal)
 *
 * Displays policy types as selectable cards with icons and descriptions.
 */

import React from 'react';
import { Ticket, Clock, TrendingDown, ArrowRightLeft, RefreshCw } from 'lucide-react';
import { POLICY_LABELS } from '../../constants';

export type PolicyType =
  | 'late_penalty'
  | 'grace_tokens'
  | 'drop_lowest'
  | 'weight_transfer'
  | 'grade_replacement';

interface PolicyTypeInfo {
  value: PolicyType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const POLICY_TYPES: PolicyTypeInfo[] = [
  {
    value: 'grace_tokens',
    label: POLICY_LABELS.types.grace_tokens.label,
    description: POLICY_LABELS.types.grace_tokens.description,
    icon: <Ticket size={24} />,
  },
  {
    value: 'late_penalty',
    label: POLICY_LABELS.types.late_penalty.label,
    description: POLICY_LABELS.types.late_penalty.description,
    icon: <Clock size={24} />,
  },
  {
    value: 'drop_lowest',
    label: POLICY_LABELS.types.drop_lowest.label,
    description: POLICY_LABELS.types.drop_lowest.description,
    icon: <TrendingDown size={24} />,
  },
  {
    value: 'weight_transfer',
    label: POLICY_LABELS.types.weight_transfer.label,
    description: POLICY_LABELS.types.weight_transfer.description,
    icon: <ArrowRightLeft size={24} />,
  },
  {
    value: 'grade_replacement',
    label: POLICY_LABELS.types.grade_replacement.label,
    description: POLICY_LABELS.types.grade_replacement.description,
    icon: <RefreshCw size={24} />,
  },
];

interface PolicyTypeSelectorProps {
  onSelect: (type: PolicyType) => void;
}

export function PolicyTypeSelector({ onSelect }: PolicyTypeSelectorProps) {
  return (
    <div style={styles.container}>
      <div style={styles.grid}>
        {POLICY_TYPES.map((type) => (
          <button
            key={type.value}
            style={styles.card}
            onClick={() => onSelect(type.value)}
            type="button"
          >
            <div style={styles.iconWrapper}>{type.icon}</div>
            <div style={styles.cardContent}>
              <div style={styles.cardLabel}>{type.label}</div>
              <div style={styles.cardDescription}>{type.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export { POLICY_TYPES };

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '8px 0',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },

  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 16px',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    textAlign: 'center',
  },

  iconWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--color-navy)',
    marginBottom: '12px',
  },

  cardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  cardLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },

  cardDescription: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.3',
  },
};

export default PolicyTypeSelector;
