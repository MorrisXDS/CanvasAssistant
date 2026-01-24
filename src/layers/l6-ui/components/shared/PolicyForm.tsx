/**
 * PolicyForm - Comprehensive policy configuration form
 *
 * Supports all policy types:
 * - Late Penalty (with hard cutoff, min grade, applicable types)
 * - Grace Tokens (with applicable types)
 * - Drop Lowest (with category selection)
 * - Weight Transfer (source/target selection)
 * - Grade Replacement (if_higher, best_of)
 */

import React, { useState } from 'react';
import { Info, ArrowDown } from 'lucide-react';
import { TaskTypeSelector } from './TaskTypeSelector';

export type PolicyType =
  | 'late_penalty'
  | 'grace_tokens'
  | 'drop_lowest'
  | 'weight_transfer'
  | 'grade_replacement';

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

interface PolicyFormProps {
  courseId: number;
  initialData?: {
    id?: number;
    policyType: PolicyType;
    policyName: string;
    config: Record<string, unknown>;
    applicableTypes?: string[];
    excludedTypes?: string[];
  };
  tasks?: Task[];
  taskGroups?: TaskGroup[];
  onSave: (data: PolicyFormData) => void;
  onCancel: () => void;
}

export interface PolicyFormData {
  policyType: PolicyType;
  policyName: string;
  config: Record<string, unknown>;
  applicableTypes: string[];
  excludedTypes: string[];
}

const POLICY_TYPE_OPTIONS: { value: PolicyType; label: string; description: string }[] = [
  {
    value: 'late_penalty',
    label: 'Late Penalty',
    description: 'Deduct points for late submissions',
  },
  {
    value: 'grace_tokens',
    label: 'Grace Tokens',
    description: 'Allow deadline extensions using tokens',
  },
  {
    value: 'drop_lowest',
    label: 'Drop Lowest',
    description: 'Drop the lowest grade(s) in a category',
  },
  {
    value: 'weight_transfer',
    label: 'Weight Transfer',
    description: 'Move weight from one task to another',
  },
  {
    value: 'grade_replacement',
    label: 'Grade Replacement',
    description: 'Replace grade with another if higher',
  },
];

export function PolicyForm({
  courseId,
  initialData,
  tasks = [],
  taskGroups = [],
  onSave,
  onCancel,
}: PolicyFormProps) {
  const [policyType, setPolicyType] = useState<PolicyType>(
    initialData?.policyType || 'late_penalty'
  );
  const [policyName, setPolicyName] = useState(initialData?.policyName || '');
  const [applicableTypes, setApplicableTypes] = useState<string[]>(
    initialData?.applicableTypes || []
  );
  const [excludedTypes, setExcludedTypes] = useState<string[]>(
    initialData?.excludedTypes || []
  );

  // Late Penalty Config
  const [penaltyType, setPenaltyType] = useState<string>(
    (initialData?.config?.penalty_type as string) || 'percentage_per_day'
  );
  const [penaltyValue, setPenaltyValue] = useState(
    String(initialData?.config?.penalty_value || '10')
  );
  const [gracePeriodHours, setGracePeriodHours] = useState(
    String(initialData?.config?.grace_period_hours || '0')
  );
  const [hardCutoffDays, setHardCutoffDays] = useState(
    String(initialData?.config?.hard_cutoff_days || '')
  );
  const [minGrade, setMinGrade] = useState(
    String(initialData?.config?.min_grade || '0')
  );

  // Grace Token Config
  const [totalTokens, setTotalTokens] = useState(
    String(initialData?.config?.total_tokens || '3')
  );
  const [hoursPerToken, setHoursPerToken] = useState(
    String(initialData?.config?.hours_per_token || '24')
  );
  const [maxTokensPerTask, setMaxTokensPerTask] = useState(
    String(initialData?.config?.max_tokens_per_task || '2')
  );

  // Drop Lowest Config
  const [dropCount, setDropCount] = useState(
    String(initialData?.config?.drop_count || '1')
  );
  const [dropCategory, setDropCategory] = useState(
    (initialData?.config?.category as string) || ''
  );
  const [minSubmissions, setMinSubmissions] = useState(
    String(initialData?.config?.min_submissions || '1')
  );

  // Weight Transfer Config
  const [sourceType, setSourceType] = useState<'task' | 'group'>('task');
  const [sourceId, setSourceId] = useState(
    String(initialData?.config?.source_task_id || initialData?.config?.source_group_id || '')
  );
  const [targetType, setTargetType] = useState<'task' | 'group'>('task');
  const [targetId, setTargetId] = useState(
    String(initialData?.config?.target_task_id || initialData?.config?.target_group_id || '')
  );
  const [transferType, setTransferType] = useState<'full' | 'partial' | 'conditional'>(
    (initialData?.config?.transfer_type as 'full' | 'partial' | 'conditional') || 'full'
  );
  const [transferPercent, setTransferPercent] = useState(
    String(initialData?.config?.transfer_percent || '100')
  );
  const [conditionType, setConditionType] = useState<'missed' | 'lower' | 'always'>(
    (initialData?.config?.condition_type as 'missed' | 'lower' | 'always') || 'missed'
  );

  // Grade Replacement Config
  const [replacementType, setReplacementType] = useState<'if_higher' | 'always' | 'best_of'>(
    (initialData?.config?.replacement_type as 'if_higher' | 'always' | 'best_of') || 'if_higher'
  );
  const [replacementRatio, setReplacementRatio] = useState(
    String(initialData?.config?.replacement_ratio || '1.0')
  );

  const handleSubmit = () => {
    let config: Record<string, unknown> = {};

    switch (policyType) {
      case 'late_penalty':
        config = {
          penalty_type: penaltyType,
          penalty_value: parseFloat(penaltyValue) || 10,
          grace_period_hours: parseFloat(gracePeriodHours) || 0,
          hard_cutoff_days: hardCutoffDays ? parseFloat(hardCutoffDays) : null,
          min_grade: parseFloat(minGrade) || 0,
        };
        break;

      case 'grace_tokens':
        config = {
          total_tokens: parseInt(totalTokens) || 3,
          hours_per_token: parseInt(hoursPerToken) || 24,
          max_tokens_per_task: parseInt(maxTokensPerTask) || 2,
        };
        break;

      case 'drop_lowest':
        config = {
          drop_count: parseInt(dropCount) || 1,
          category: dropCategory,
          min_submissions: parseInt(minSubmissions) || 1,
        };
        break;

      case 'weight_transfer':
        config = {
          transfer_type: transferType,
          transfer_percent: parseFloat(transferPercent) || 100,
          condition_type: transferType === 'conditional' ? conditionType : undefined,
          ...(sourceType === 'task'
            ? { source_task_id: parseInt(sourceId) || undefined }
            : { source_group_id: parseInt(sourceId) || undefined }),
          ...(targetType === 'task'
            ? { target_task_id: parseInt(targetId) || undefined }
            : { target_group_id: parseInt(targetId) || undefined }),
        };
        break;

      case 'grade_replacement':
        config = {
          replacement_type: replacementType,
          replacement_ratio: parseFloat(replacementRatio) || 1.0,
          ...(sourceType === 'task'
            ? { source_task_id: parseInt(sourceId) || undefined }
            : { source_group_id: parseInt(sourceId) || undefined }),
          ...(targetType === 'task'
            ? { target_task_id: parseInt(targetId) || undefined }
            : { target_group_id: parseInt(targetId) || undefined }),
        };
        break;
    }

    onSave({
      policyType,
      policyName: policyName.trim() || POLICY_TYPE_OPTIONS.find(p => p.value === policyType)?.label || '',
      config,
      applicableTypes,
      excludedTypes,
    });
  };

  return (
    <div style={styles.form}>
      {/* Policy Type Selection */}
      <div style={styles.section}>
        <label style={styles.label}>Policy Type</label>
        <select
          value={policyType}
          onChange={(e) => setPolicyType(e.target.value as PolicyType)}
          style={styles.select}
          disabled={!!initialData?.id}
        >
          {POLICY_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p style={styles.hint}>
          {POLICY_TYPE_OPTIONS.find(p => p.value === policyType)?.description}
        </p>
      </div>

      {/* Policy Name */}
      <div style={styles.section}>
        <label style={styles.label}>Policy Name</label>
        <input
          type="text"
          value={policyName}
          onChange={(e) => setPolicyName(e.target.value)}
          placeholder={POLICY_TYPE_OPTIONS.find(p => p.value === policyType)?.label}
          style={styles.input}
        />
      </div>

      {/* Policy-specific configuration */}
      {policyType === 'late_penalty' && (
        <div style={styles.configBox}>
          <div style={styles.configTitle}>Late Penalty Settings</div>

          <div style={styles.grid2}>
            <div style={styles.field}>
              <label style={styles.label}>Penalty Type</label>
              <select
                value={penaltyType}
                onChange={(e) => setPenaltyType(e.target.value)}
                style={styles.select}
              >
                <option value="percentage_per_day">% per day</option>
                <option value="percentage_per_hour">% per hour</option>
                <option value="flat">Flat deduction</option>
                <option value="tiered">Tiered penalty</option>
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Penalty Value</label>
              <input
                type="number"
                value={penaltyValue}
                onChange={(e) => setPenaltyValue(e.target.value)}
                style={styles.input}
                min="0"
                max="100"
              />
            </div>
          </div>

          <div style={styles.grid2}>
            <div style={styles.field}>
              <label style={styles.label}>Grace Period (hours)</label>
              <input
                type="number"
                value={gracePeriodHours}
                onChange={(e) => setGracePeriodHours(e.target.value)}
                style={styles.input}
                min="0"
              />
              <p style={styles.hint}>No penalty during this period</p>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Hard Cutoff (days)</label>
              <input
                type="number"
                value={hardCutoffDays}
                onChange={(e) => setHardCutoffDays(e.target.value)}
                placeholder="No cutoff"
                style={styles.input}
                min="0"
              />
              <p style={styles.hint}>Zero grade after this</p>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Minimum Grade (%)</label>
            <input
              type="number"
              value={minGrade}
              onChange={(e) => setMinGrade(e.target.value)}
              style={styles.input}
              min="0"
              max="100"
            />
            <p style={styles.hint}>Grade floor - never goes below this</p>
          </div>
        </div>
      )}

      {policyType === 'grace_tokens' && (
        <div style={styles.configBox}>
          <div style={styles.configTitle}>Grace Token Settings</div>

          <div style={styles.grid3}>
            <div style={styles.field}>
              <label style={styles.label}>Total Tokens</label>
              <input
                type="number"
                value={totalTokens}
                onChange={(e) => setTotalTokens(e.target.value)}
                style={styles.input}
                min="1"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Hours per Token</label>
              <input
                type="number"
                value={hoursPerToken}
                onChange={(e) => setHoursPerToken(e.target.value)}
                style={styles.input}
                min="1"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Max per Task</label>
              <input
                type="number"
                value={maxTokensPerTask}
                onChange={(e) => setMaxTokensPerTask(e.target.value)}
                style={styles.input}
                min="1"
              />
            </div>
          </div>

          <div style={styles.infoBox}>
            <Info size={14} />
            <span>
              {totalTokens} tokens × {hoursPerToken} hours = {parseInt(totalTokens || '0') * parseInt(hoursPerToken || '0')} total hours
            </span>
          </div>
        </div>
      )}

      {policyType === 'drop_lowest' && (
        <div style={styles.configBox}>
          <div style={styles.configTitle}>Drop Lowest Settings</div>

          <div style={styles.grid2}>
            <div style={styles.field}>
              <label style={styles.label}>Number to Drop</label>
              <input
                type="number"
                value={dropCount}
                onChange={(e) => setDropCount(e.target.value)}
                style={styles.input}
                min="1"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Category/Group</label>
              <select
                value={dropCategory}
                onChange={(e) => setDropCategory(e.target.value)}
                style={styles.select}
              >
                <option value="">Select category...</option>
                {taskGroups.map(group => (
                  <option key={group.id} value={group.name}>
                    {group.displayName}
                  </option>
                ))}
                <option value="quiz">Quiz</option>
                <option value="assignment">Assignment</option>
                <option value="homework">Homework</option>
                <option value="lab">Lab</option>
              </select>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Min Submissions Required</label>
            <input
              type="number"
              value={minSubmissions}
              onChange={(e) => setMinSubmissions(e.target.value)}
              style={styles.input}
              min="1"
            />
            <p style={styles.hint}>Must submit at least this many before drop applies</p>
          </div>
        </div>
      )}

      {policyType === 'weight_transfer' && (
        <div style={styles.configBox}>
          <div style={styles.configTitle}>Weight Transfer Settings</div>

          {/* Source */}
          <div style={styles.field}>
            <label style={styles.label}>Source (Transfer From)</label>
            <div style={styles.splitSelect}>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as 'task' | 'group')}
                style={styles.selectSmall}
              >
                <option value="task">Task</option>
                <option value="group">Group</option>
              </select>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                style={styles.selectLarge}
              >
                <option value="">Select {sourceType}...</option>
                {sourceType === 'task'
                  ? tasks.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))
                  : taskGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.displayName}</option>
                    ))}
              </select>
            </div>
          </div>

          {/* Arrow */}
          <div style={styles.arrowDown}>
            <ArrowDown size={20} color="var(--text-muted)" />
          </div>

          {/* Target */}
          <div style={styles.field}>
            <label style={styles.label}>Target (Transfer To)</label>
            <div style={styles.splitSelect}>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as 'task' | 'group')}
                style={styles.selectSmall}
              >
                <option value="task">Task</option>
                <option value="group">Group</option>
              </select>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                style={styles.selectLarge}
              >
                <option value="">Select {targetType}...</option>
                {targetType === 'task'
                  ? tasks.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))
                  : taskGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.displayName}</option>
                    ))}
              </select>
            </div>
          </div>

          <div style={styles.divider} />

          {/* Transfer Options */}
          <div style={styles.grid2}>
            <div style={styles.field}>
              <label style={styles.label}>Transfer Type</label>
              <select
                value={transferType}
                onChange={(e) => setTransferType(e.target.value as 'full' | 'partial' | 'conditional')}
                style={styles.select}
              >
                <option value="full">Full (100%)</option>
                <option value="partial">Partial</option>
                <option value="conditional">Conditional</option>
              </select>
            </div>
            <div style={styles.field}>
              {transferType === 'partial' && (
                <>
                  <label style={styles.label}>Transfer %</label>
                  <input
                    type="number"
                    value={transferPercent}
                    onChange={(e) => setTransferPercent(e.target.value)}
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </>
              )}
              {transferType === 'conditional' && (
                <>
                  <label style={styles.label}>Condition</label>
                  <select
                    value={conditionType}
                    onChange={(e) => setConditionType(e.target.value as 'missed' | 'lower' | 'always')}
                    style={styles.select}
                  >
                    <option value="missed">If source is missed</option>
                    <option value="lower">If source is lower</option>
                    <option value="always">Always</option>
                  </select>
                </>
              )}
              {transferType === 'full' && (
                <div style={styles.placeholder} />
              )}
            </div>
          </div>
        </div>
      )}

      {policyType === 'grade_replacement' && (
        <div style={styles.configBox}>
          <div style={styles.configTitle}>Grade Replacement Settings</div>

          {/* Source */}
          <div style={styles.field}>
            <label style={styles.label}>Source Grade (Replace From)</label>
            <div style={styles.splitSelect}>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as 'task' | 'group')}
                style={styles.selectSmall}
              >
                <option value="task">Task</option>
                <option value="group">Group</option>
              </select>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                style={styles.selectLarge}
              >
                <option value="">Select {sourceType}...</option>
                {sourceType === 'task'
                  ? tasks.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))
                  : taskGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.displayName}</option>
                    ))}
              </select>
            </div>
          </div>

          {/* Arrow */}
          <div style={styles.arrowDown}>
            <ArrowDown size={20} color="var(--text-muted)" />
          </div>

          {/* Target */}
          <div style={styles.field}>
            <label style={styles.label}>Target Grade (Replace With)</label>
            <div style={styles.splitSelect}>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as 'task' | 'group')}
                style={styles.selectSmall}
              >
                <option value="task">Task</option>
                <option value="group">Group</option>
              </select>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                style={styles.selectLarge}
              >
                <option value="">Select {targetType}...</option>
                {targetType === 'task'
                  ? tasks.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))
                  : taskGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.displayName}</option>
                    ))}
              </select>
            </div>
          </div>

          <div style={styles.divider} />

          {/* Replacement Options */}
          <div style={styles.grid2}>
            <div style={styles.field}>
              <label style={styles.label}>Replacement Type</label>
              <select
                value={replacementType}
                onChange={(e) => setReplacementType(e.target.value as 'if_higher' | 'always' | 'best_of')}
                style={styles.select}
              >
                <option value="if_higher">If target is higher</option>
                <option value="always">Always replace</option>
                <option value="best_of">Best of N</option>
              </select>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Replacement Ratio</label>
              <input
                type="number"
                value={replacementRatio}
                onChange={(e) => setReplacementRatio(e.target.value)}
                style={styles.input}
                min="0"
                max="1"
                step="0.1"
              />
              <p style={styles.hint}>1.0 = full replacement</p>
            </div>
          </div>
        </div>
      )}

      {/* Applicable Types - only for late_penalty and grace_tokens */}
      {(policyType === 'late_penalty' || policyType === 'grace_tokens') && (
        <>
          <div style={styles.section}>
            <label style={styles.label}>Applies To (Task Types)</label>
            <TaskTypeSelector
              value={applicableTypes}
              onChange={setApplicableTypes}
              multiple
              placeholder="All task types (leave empty for all)"
            />
            <p style={styles.hint}>Leave empty to apply to all task types</p>
          </div>

          <div style={styles.section}>
            <label style={styles.label}>Exclude Types</label>
            <TaskTypeSelector
              value={excludedTypes}
              onChange={setExcludedTypes}
              multiple
              placeholder="No exclusions"
            />
            <p style={styles.hint}>These types will never be affected</p>
          </div>
        </>
      )}

      {/* Actions */}
      <div style={styles.actions}>
        <button style={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button style={styles.saveBtn} onClick={handleSubmit}>
          {initialData?.id ? 'Update Policy' : 'Add Policy'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '20px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
  },

  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  configBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '16px',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-light)',
  },

  configTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: '4px',
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
  },

  input: {
    width: '100%',
    height: '36px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
  },

  select: {
    width: '100%',
    height: '36px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },

  hint: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    margin: 0,
  },

  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },

  grid3: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '16px',
  },

  splitSelect: {
    display: 'flex',
    gap: '8px',
  },

  selectSmall: {
    width: '100px',
    flexShrink: 0,
    height: '36px',
    padding: '0 8px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },

  selectLarge: {
    flex: 1,
    minWidth: 0,
    height: '36px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },

  arrowDown: {
    display: 'flex',
    justifyContent: 'center',
    padding: '4px 0',
  },

  divider: {
    height: '1px',
    backgroundColor: 'var(--border-light)',
    margin: '4px 0',
  },

  placeholder: {
    height: '36px',
  },

  infoBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },

  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    paddingTop: '12px',
    borderTop: '1px solid var(--border-light)',
  },

  cancelBtn: {
    height: '36px',
    padding: '0 16px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },

  saveBtn: {
    height: '36px',
    padding: '0 16px',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: 'var(--color-navy)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'white',
  },
};

export default PolicyForm;
