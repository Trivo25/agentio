import type { ActionIntent } from './action.js';
import type { Policy } from './policy.js';
import type { ValidationIssue, ValidationResult } from './validation.js';
import { invalidResult, validResult } from './validation.js';

/**
 * Returns whether a policy is expired at the provided time.
 */
export function isPolicyExpired(policy: Policy, now: Date): boolean {
  return policy.expiresAt.getTime() <= now.getTime();
}

/**
 * Returns whether an action type is explicitly allowed by a policy.
 */
export function isActionAllowedByPolicy(policy: Policy, action: ActionIntent): boolean {
  return policy.allowedActions.includes(action.type);
}

/**
 * Validates whether an action is eligible under a policy at the provided time.
 */
export function validateActionAgainstPolicy(
  policy: Policy,
  action: ActionIntent,
  now: Date,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (isPolicyExpired(policy, now)) {
    issues.push({
      code: 'policy-expired',
      message: `Policy ${policy.id} is expired.`,
    });
  }

  if (!isActionAllowedByPolicy(policy, action)) {
    issues.push({
      code: 'action-not-allowed',
      message: `Action ${action.type} is not allowed by policy ${policy.id}.`,
    });
  }

  return issues.length === 0 ? validResult() : invalidResult(...issues);
}
