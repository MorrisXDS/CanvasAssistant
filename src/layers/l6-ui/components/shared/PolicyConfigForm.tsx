/**
 * PolicyConfigForm - Policy-specific configuration form (Step 2 of policy modal)
 *
 * Renders the correct form fields based on the selected policy type.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Info, ArrowDown } from 'lucide-react';
import type { PolicyType } from './PolicyTypeSelector';

// Task types for grace token filtering
const GRACE_TOKEN_TASK_TYPES = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'homework', label: 'Homework' },
  { value: 'lab', label: 'Lab' },
  { value: 'project', label: 'Project' },
  { value: 'essay', label: 'Essay' },
  { value: 'problem_set', label: 'Problem Set' },
  { value: 'discussion', label: 'Discussion' },
  { value: 'exam', label: 'Exam' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'final', label: 'Final' },
];

// Task group/category types for drop lowest
const CATEGORY_TYPES = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'homework', label: 'Homework' },
  { value: 'lab', label: 'Lab' },
  { value: 'problem_set', label: 'Problem Set' },
];

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

export interface PolicyConfigFormData {
  policyName: string;
  config: Record<string, unknown>;
}

interface PolicyConfigFormProps {
  policyType: PolicyType;
  initialData?: {
    policyName?: string;
    config?: Record<string, unknown>;
  };
  tasks?: Task[];
  taskGroups?: TaskGroup[];
  existingPolicyNames?: string[];
  onValidChange: (isValid: boolean, data: PolicyConfigFormData) => void;
}

export function PolicyConfigForm({
  policyType,
  initialData,
  tasks = [],
  taskGroups = [],
  existingPolicyNames = [],
  onValidChange,
}: PolicyConfigFormProps) {
  // Common fields
  const [policyName, setPolicyName] = useState(initialData?.policyName || '');
  const [nameError, setNameError] = useState<string | null>(null);

  // Late Penalty Config
  const [penaltyType, setPenaltyType] = useState<string>(
    (initialData?.config?.penalty_type as string) || 'percentage_per_day'
  );
  const [penaltyValue, setPenaltyValue] = useState(
    String(initialData?.config?.penalty_value ?? '10')
  );
  const [gracePeriodHours, setGracePeriodHours] = useState(
    String(initialData?.config?.grace_period_hours ?? '0')
  );
  const [hardCutoffDays, setHardCutoffDays] = useState(
    String(initialData?.config?.hard_cutoff_days ?? '')
  );
  const [minGrade, setMinGrade] = useState(String(initialData?.config?.min_grade ?? '0'));

  // Grace Token Config
  const [graceTokenTaskType, setGraceTokenTaskType] = useState(
    (initialData?.config?.task_type as string) || ''
  );
  const [totalTokens, setTotalTokens] = useState(
    String(initialData?.config?.total_tokens ?? '3')
  );
  const [hoursPerToken, setHoursPerToken] = useState(
    String(initialData?.config?.hours_per_token ?? '24')
  );
  const [maxTokensPerTask, setMaxTokensPerTask] = useState(
    initialData?.config?.max_tokens_per_task === null ||
      initialData?.config?.max_tokens_per_task === undefined
      ? ''
      : String(initialData?.config?.max_tokens_per_task)
  );

  // Drop Lowest Config
  const [dropCount, setDropCount] = useState(
    String(initialData?.config?.drop_count ?? '1')
  );
  const [dropCategory, setDropCategory] = useState(
    (initialData?.config?.category as string) || ''
  );
  const [minSubmissions, setMinSubmissions] = useState(
    String(initialData?.config?.min_submissions ?? '1')
  );

  // Weight Transfer / Grade Replacement Config
  const [sourceType, setSourceType] = useState<'task' | 'group'>(
    initialData?.config?.source_group_id ? 'group' : 'task'
  );
  const [sourceId, setSourceId] = useState(
    String(
      initialData?.config?.source_task_id || initialData?.config?.source_group_id || ''
    )
  );
  const [targetType, setTargetType] = useState<'task' | 'group'>(
    initialData?.config?.target_group_id ? 'group' : 'task'
  );
  const [targetId, setTargetId] = useState(
    String(
      initialData?.config?.target_task_id || initialData?.config?.target_group_id || ''
    )
  );
  const [transferType, setTransferType] = useState<'full' | 'partial' | 'conditional'>(
    (initialData?.config?.transfer_type as 'full' | 'partial' | 'conditional') || 'full'
  );
  const [transferPercent, setTransferPercent] = useState(
    String(initialData?.config?.transfer_percent ?? '100')
  );
  const [conditionType, setConditionType] = useState<'missed' | 'lower' | 'always'>(
    (initialData?.config?.condition_type as 'missed' | 'lower' | 'always') || 'missed'
  );

  // Grade Replacement Config
  const [replacementType, setReplacementType] = useState<
    'if_higher' | 'always' | 'best_of'
  >(
    (initialData?.config?.replacement_type as 'if_higher' | 'always' | 'best_of') ||
      'if_higher'
  );
  const [replacementRatio, setReplacementRatio] = useState(
    String(initialData?.config?.replacement_ratio ?? '1.0')
  );

  // Auto-generate policy name for grace tokens when task type changes
  useEffect(() => {
    if (policyType === 'grace_tokens' && graceTokenTaskType && !initialData?.policyName) {
      const typeLabel =
        GRACE_TOKEN_TASK_TYPES.find((t) => t.value === graceTokenTaskType)?.label ||
        graceTokenTaskType;
      setPolicyName(`Grace Tokens - ${typeLabel}`);
    }
  }, [graceTokenTaskType, policyType, initialData?.policyName]);

  // Validate policy name
  useEffect(() => {
    if (policyName.trim() === '') {
      setNameError(null);
      return;
    }

    // Check for duplicates (case-insensitive)
    const isDuplicate = existingPolicyNames.some(
      (name) =>
        name.toLowerCase() === policyName.trim().toLowerCase() &&
        name.toLowerCase() !== initialData?.policyName?.toLowerCase()
    );

    if (isDuplicate) {
      setNameError('A policy with this name already exists');
    } else {
      setNameError(null);
    }
  }, [policyName, existingPolicyNames, initialData?.policyName]);

  // Build and validate form data
  const formData = useMemo((): PolicyConfigFormData => {
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
          task_type: graceTokenTaskType,
          total_tokens: parseInt(totalTokens) || 3,
          tokens_used: (initialData?.config?.tokens_used as number) || 0,
          hours_per_token: parseInt(hoursPerToken) || 24,
          max_tokens_per_task:
            maxTokensPerTask === '' ? null : parseInt(maxTokensPerTask) || null,
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

    return {
      policyName: policyName.trim(),
      config,
    };
  }, [
    policyType,
    policyName,
    penaltyType,
    penaltyValue,
    gracePeriodHours,
    hardCutoffDays,
    minGrade,
    graceTokenTaskType,
    totalTokens,
    hoursPerToken,
    maxTokensPerTask,
    initialData?.config?.tokens_used,
    dropCount,
    dropCategory,
    minSubmissions,
    sourceType,
    sourceId,
    targetType,
    targetId,
    transferType,
    transferPercent,
    conditionType,
    replacementType,
    replacementRatio,
  ]);

  // Check form validity
  const isValid = useMemo(() => {
    if (!policyName.trim() || nameError) return false;

    switch (policyType) {
      case 'grace_tokens':
        return (
          !!graceTokenTaskType && parseInt(totalTokens) > 0 && parseInt(hoursPerToken) > 0
        );
      case 'drop_lowest':
        return !!dropCategory && parseInt(dropCount) > 0;
      case 'weight_transfer':
      case 'grade_replacement':
        return !!sourceId && !!targetId;
      default:
        return true;
    }
  }, [
    policyName,
    nameError,
    policyType,
    graceTokenTaskType,
    totalTokens,
    hoursPerToken,
    dropCategory,
    dropCount,
    sourceId,
    targetId,
  ]);

  // Notify parent of validity and data changes
  useEffect(() => {
    onValidChange(isValid, formData);
  }, [isValid, formData, onValidChange]);

  return (
    <div style={styles.form}>
      {/* Policy Name - Common for all types */}
      <div style={styles.field}>
        <label style={styles.label}>Policy Name</label>
        <input
          type="text"
          value={policyName}
          onChange={(e) => setPolicyName(e.target.value)}
          placeholder="Enter policy name"
          style={{
            ...styles.input,
            borderColor: nameError ? 'var(--color-error)' : 'var(--border-default)',
          }}
        />
        {nameError && <p style={styles.error}>{nameError}</p>}
      </div>

      <div style={styles.divider} />

      {/* Late Penalty Fields */}
      {policyType === 'late_penalty' && (
        <div style={styles.configSection}>
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
              <div style={styles.inputWithSuffix}>
                <input
                  type="number"
                  value={penaltyValue}
                  onChange={(e) => setPenaltyValue(e.target.value)}
                  style={styles.inputInline}
                  min="0"
                  max="100"
                />
                <span style={styles.suffix}>%</span>
              </div>
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

      {/* Grace Tokens Fields */}
      {policyType === 'grace_tokens' && (
        <div style={styles.configSection}>
          <div style={styles.field}>
            <label style={styles.label}>Task Type</label>
            <select
              value={graceTokenTaskType}
              onChange={(e) => setGraceTokenTaskType(e.target.value)}
              style={styles.select}
            >
              <option value="">Select task type...</option>
              {GRACE_TOKEN_TASK_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <p style={styles.hint}>This policy will only apply to tasks of this type</p>
          </div>

          <div style={styles.grid2}>
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
          </div>

          <div style={styles.infoBox}>
            <Info size={14} />
            <span>
              {totalTokens || 0} tokens × {hoursPerToken || 0} hours ={' '}
              <strong>
                {(parseInt(totalTokens) || 0) * (parseInt(hoursPerToken) || 0)} total
                extension hours
              </strong>
            </span>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Max per Task</label>
            <div style={styles.maxPerTaskRow}>
              <input
                type="number"
                value={maxTokensPerTask}
                onChange={(e) => setMaxTokensPerTask(e.target.value)}
                placeholder="No limit"
                style={styles.maxPerTaskInput}
                min="1"
              />
              <span style={styles.maxPerTaskHint}>
                {maxTokensPerTask === ''
                  ? 'No limit'
                  : `${maxTokensPerTask} tokens max per task`}
              </span>
            </div>
            <p style={styles.hint}>
              Maximum tokens on a single task (leave empty for no limit)
            </p>
          </div>
        </div>
      )}

      {/* Drop Lowest Fields */}
      {policyType === 'drop_lowest' && (
        <div style={styles.configSection}>
          <div style={styles.grid2}>
            <div style={styles.field}>
              <label style={styles.label}>Category/Group</label>
              <select
                value={dropCategory}
                onChange={(e) => setDropCategory(e.target.value)}
                style={styles.select}
              >
                <option value="">Select category...</option>
                {taskGroups.length > 0 && (
                  <>
                    <optgroup label="Course Groups">
                      {taskGroups.map((group) => (
                        <option key={group.id} value={group.name}>
                          {group.displayName}
                        </option>
                      ))}
                    </optgroup>
                  </>
                )}
                <optgroup label="Task Types">
                  {CATEGORY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
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

      {/* Weight Transfer Fields */}
      {policyType === 'weight_transfer' && (
        <div style={styles.configSection}>
          <div style={styles.field}>
            <label style={styles.label}>Source (Transfer From)</label>
            <div style={styles.splitSelect}>
              <select
                value={sourceType}
                onChange={(e) => {
                  setSourceType(e.target.value as 'task' | 'group');
                  setSourceId('');
                }}
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
                  ? tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))
                  : taskGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.displayName}
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <div style={styles.arrowDown}>
            <ArrowDown size={20} color="var(--text-muted)" />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Target (Transfer To)</label>
            <div style={styles.splitSelect}>
              <select
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value as 'task' | 'group');
                  setTargetId('');
                }}
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
                  ? tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))
                  : taskGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.displayName}
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <div style={styles.divider} />

          <div style={styles.grid2}>
            <div style={styles.field}>
              <label style={styles.label}>Transfer Type</label>
              <select
                value={transferType}
                onChange={(e) =>
                  setTransferType(e.target.value as 'full' | 'partial' | 'conditional')
                }
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
                    onChange={(e) =>
                      setConditionType(e.target.value as 'missed' | 'lower' | 'always')
                    }
                    style={styles.select}
                  >
                    <option value="missed">If source is missed</option>
                    <option value="lower">If source is lower</option>
                    <option value="always">Always</option>
                  </select>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grade Replacement Fields */}
      {policyType === 'grade_replacement' && (
        <div style={styles.configSection}>
          <div style={styles.field}>
            <label style={styles.label}>Source Grade (Replace From)</label>
            <div style={styles.splitSelect}>
              <select
                value={sourceType}
                onChange={(e) => {
                  setSourceType(e.target.value as 'task' | 'group');
                  setSourceId('');
                }}
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
                  ? tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))
                  : taskGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.displayName}
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <div style={styles.arrowDown}>
            <ArrowDown size={20} color="var(--text-muted)" />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Target Grade (Replace With)</label>
            <div style={styles.splitSelect}>
              <select
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value as 'task' | 'group');
                  setTargetId('');
                }}
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
                  ? tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))
                  : taskGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.displayName}
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <div style={styles.divider} />

          <div style={styles.grid2}>
            <div style={styles.field}>
              <label style={styles.label}>Replacement Type</label>
              <select
                value={replacementType}
                onChange={(e) =>
                  setReplacementType(e.target.value as 'if_higher' | 'always' | 'best_of')
                }
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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  configSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
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

  inputInline: {
    flex: 1,
    height: '36px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderTopLeftRadius: 'var(--radius-md)',
    borderBottomLeftRadius: 'var(--radius-md)',
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRight: 'none',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
  },

  inputWithSuffix: {
    display: 'flex',
    alignItems: 'stretch',
  },

  suffix: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    fontSize: '14px',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderTopRightRadius: 'var(--radius-md)',
    borderBottomRightRadius: 'var(--radius-md)',
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

  error: {
    fontSize: '12px',
    color: 'var(--color-error)',
    margin: 0,
  },

  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    alignItems: 'start',
  },

  divider: {
    height: '1px',
    backgroundColor: 'var(--border-light)',
    margin: '4px 0',
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

  maxPerTaskRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

  maxPerTaskInput: {
    width: '80px',
    height: '36px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
    textAlign: 'center',
  },

  maxPerTaskHint: {
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
};

export default PolicyConfigForm;
