/**
 * Policy Selectors - Memoized selectors for policy data
 *
 * Computes which policies apply to each task and formats
 * them for display as badges.
 */

import type { Policy, Task } from '../../../shared/ipc-contract';
import type { PolicyBadgeData, PolicyType } from '../../l6-ui/components/shared/PolicyBadge';

/**
 * Policy configuration interfaces for type-safe access
 */
interface GraceTokenConfig {
  task_type?: string;
  total_tokens: number;
  tokens_used?: number;
  hours_per_token: number;
  max_tokens_per_task?: number | null;
}

interface LatePenaltyConfig {
  task_type?: string;
  penalty_per_day: number;
  max_penalty?: number;
  grace_period_hours?: number;
}

interface DropLowestConfig {
  task_type?: string;
  drop_count: number;
  category_total?: number;
}

interface WeightTransferConfig {
  task_type?: string;
  transfer_to: string;
  condition?: string;
}

interface GradeReplacementConfig {
  task_type?: string;
  replacement_source: string;
  condition?: string;
}

/**
 * Task policy info result
 */
export interface TaskPolicyInfo {
  badges: PolicyBadgeData[];
  graceTokensAvailable: number;
  isDroppable: boolean;
  hasLatePenalty: boolean;
  hasWeightTransfer: boolean;
  hasGradeReplacement: boolean;
}

/**
 * Memoization cache for policy info computation
 * Key: `${taskId}-${policiesHash}`
 */
const policyInfoCache = new Map<string, TaskPolicyInfo>();
let lastPoliciesHash = '';

function computePoliciesHash(policies: Policy[]): string {
  return policies
    .map((p) => `${p.id}:${p.courseId}:${p.policyType}:${p.isActive}`)
    .sort()
    .join('|');
}

/**
 * Check if a policy applies to a task based on task_type config
 */
function policyAppliesToTask(policy: Policy, task: Task): boolean {
  const config = policy.policyConfig as Record<string, unknown>;
  const taskType = config.task_type as string | undefined;

  // If no task_type specified, applies to all tasks
  if (!taskType || taskType === 'all') {
    return true;
  }

  // Match by task type (e.g., 'assignment', 'quiz', 'discussion')
  if (task.taskType) {
    const normalizedTaskType = task.taskType.toLowerCase();
    const normalizedPolicyType = taskType.toLowerCase();

    // Exact match or partial match
    if (
      normalizedTaskType === normalizedPolicyType ||
      normalizedTaskType.includes(normalizedPolicyType)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Format grace tokens policy as badge data
 */
function formatGraceTokensBadge(policy: Policy): PolicyBadgeData {
  const config = policy.policyConfig as unknown as GraceTokenConfig;
  const available = config.total_tokens - (config.tokens_used || 0);
  const hours = config.hours_per_token;

  return {
    policyId: policy.id,
    policyType: 'grace_tokens',
    label: `${available} token${available !== 1 ? 's' : ''}`,
    tooltip: `${available} grace token${available !== 1 ? 's' : ''} available (${hours}h each)`,
    variant: available > 0 ? 'success' : 'default',
  };
}

/**
 * Format late penalty policy as badge data
 */
function formatLatePenaltyBadge(policy: Policy): PolicyBadgeData {
  const config = policy.policyConfig as unknown as LatePenaltyConfig;
  const penalty = config.penalty_per_day;
  const maxPenalty = config.max_penalty;

  let tooltip = `${penalty}% penalty per day late`;
  if (maxPenalty) {
    tooltip += `, max ${maxPenalty}%`;
  }
  if (config.grace_period_hours) {
    tooltip += ` (${config.grace_period_hours}h grace period)`;
  }

  return {
    policyId: policy.id,
    policyType: 'late_penalty',
    label: `-${penalty}%/day`,
    tooltip,
    variant: 'warning',
  };
}

/**
 * Format drop lowest policy as badge data
 */
function formatDropLowestBadge(policy: Policy): PolicyBadgeData {
  const config = policy.policyConfig as unknown as DropLowestConfig;
  const count = config.drop_count;
  const total = config.category_total;

  let tooltip = `Lowest ${count} score${count !== 1 ? 's' : ''} dropped`;
  if (total) {
    tooltip += ` (of ${total} total)`;
  }

  return {
    policyId: policy.id,
    policyType: 'drop_lowest',
    label: 'Droppable',
    tooltip,
    variant: 'info',
  };
}

/**
 * Format weight transfer policy as badge data
 */
function formatWeightTransferBadge(policy: Policy): PolicyBadgeData {
  const config = policy.policyConfig as unknown as WeightTransferConfig;
  const transferTo = config.transfer_to;
  const condition = config.condition;

  let tooltip = `Weight transfers to ${transferTo}`;
  if (condition) {
    tooltip += ` if ${condition}`;
  }

  return {
    policyId: policy.id,
    policyType: 'weight_transfer',
    label: 'Transfer',
    tooltip,
    variant: 'info',
  };
}

/**
 * Format grade replacement policy as badge data
 */
function formatGradeReplacementBadge(policy: Policy): PolicyBadgeData {
  const config = policy.policyConfig as unknown as GradeReplacementConfig;
  const source = config.replacement_source;
  const condition = config.condition;

  let tooltip = `Can be replaced by ${source}`;
  if (condition) {
    tooltip += ` (${condition})`;
  }

  return {
    policyId: policy.id,
    policyType: 'grade_replacement',
    label: 'Replaceable',
    tooltip,
    variant: 'success',
  };
}

/**
 * Format a policy as badge data based on its type
 */
function formatPolicyBadge(policy: Policy): PolicyBadgeData | null {
  switch (policy.policyType as PolicyType) {
    case 'grace_tokens':
      return formatGraceTokensBadge(policy);
    case 'late_penalty':
      return formatLatePenaltyBadge(policy);
    case 'drop_lowest':
      return formatDropLowestBadge(policy);
    case 'weight_transfer':
      return formatWeightTransferBadge(policy);
    case 'grade_replacement':
      return formatGradeReplacementBadge(policy);
    default:
      return null;
  }
}

/**
 * Get policy info for a specific task
 * Returns badges and metadata about applicable policies
 */
export function getTaskPolicyInfo(
  task: Task,
  policies: Policy[]
): TaskPolicyInfo {
  // Filter policies for this task's course
  const coursePolicies = policies.filter(
    (p) => p.courseId === task.courseId && p.isActive
  );

  // Check cache
  const policiesHash = computePoliciesHash(coursePolicies);
  const cacheKey = `${task.id}-${policiesHash}`;

  // Invalidate cache if policies changed
  if (policiesHash !== lastPoliciesHash) {
    policyInfoCache.clear();
    lastPoliciesHash = policiesHash;
  }

  const cached = policyInfoCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Compute policy info
  const badges: PolicyBadgeData[] = [];
  let graceTokensAvailable = 0;
  let isDroppable = false;
  let hasLatePenalty = false;
  let hasWeightTransfer = false;
  let hasGradeReplacement = false;

  for (const policy of coursePolicies) {
    // Check if policy applies to this task
    if (!policyAppliesToTask(policy, task)) {
      continue;
    }

    const badge = formatPolicyBadge(policy);
    if (badge) {
      badges.push(badge);

      // Track policy presence
      switch (policy.policyType as PolicyType) {
        case 'grace_tokens': {
          const config = policy.policyConfig as unknown as GraceTokenConfig;
          graceTokensAvailable = config.total_tokens - (config.tokens_used || 0);
          break;
        }
        case 'drop_lowest':
          isDroppable = true;
          break;
        case 'late_penalty':
          hasLatePenalty = true;
          break;
        case 'weight_transfer':
          hasWeightTransfer = true;
          break;
        case 'grade_replacement':
          hasGradeReplacement = true;
          break;
      }
    }
  }

  const result: TaskPolicyInfo = {
    badges,
    graceTokensAvailable,
    isDroppable,
    hasLatePenalty,
    hasWeightTransfer,
    hasGradeReplacement,
  };

  // Cache result
  policyInfoCache.set(cacheKey, result);

  return result;
}

/**
 * Get all policies for a course formatted as badge data
 */
export function getCoursePolicyBadges(
  courseId: number,
  policies: Policy[]
): PolicyBadgeData[] {
  return policies
    .filter((p) => p.courseId === courseId && p.isActive)
    .map(formatPolicyBadge)
    .filter((badge): badge is PolicyBadgeData => badge !== null);
}

/**
 * Clear the policy info cache
 * Call this when policies are updated
 */
export function clearPolicyInfoCache(): void {
  policyInfoCache.clear();
  lastPoliciesHash = '';
}
