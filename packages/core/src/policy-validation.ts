import type { ActionIntent } from './action.js';
import type { Policy, PolicyConstraint } from './policy.js';
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
  cumulativeSpend = 0n,
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

  if (isActionAllowedByPolicy(policy, action)) {
    for (const constraint of policy.constraints ?? []) {
      issues.push(...validateConstraint(policy, action, constraint, cumulativeSpend));
    }
  }

  return issues.length === 0 ? validResult() : invalidResult(...issues);
}

function validateConstraint(
  policy: Policy,
  action: ActionIntent,
  constraint: PolicyConstraint,
  cumulativeSpend: bigint,
): readonly ValidationIssue[] {
  if (!doesConstraintApplyToAction(constraint, action)) {
    return [];
  }

  switch (constraint.type) {
    case 'max-amount':
      return validateMaxAmount(policy, action, constraint.value);
    case 'max-cumulative-amount':
      return validateMaxCumulativeAmount(policy, action, constraint.value, cumulativeSpend);
    case 'allowed-metadata-value':
      return validateAllowedMetadataValue(policy, action, constraint.key, constraint.values);
  }
}

function validateMaxAmount(policy: Policy, action: ActionIntent, maxAmount: bigint): readonly ValidationIssue[] {
  if (action.amount === undefined) {
    return [
      {
        code: 'amount-required',
        message: `Action ${action.type} must include an amount for policy ${policy.id}.`,
      },
    ];
  }

  if (action.amount > maxAmount) {
    return [
      {
        code: 'amount-exceeds-maximum',
        message: `Action ${action.type} amount exceeds the maximum allowed by policy ${policy.id}.`,
      },
    ];
  }

  return [];
}

function validateMaxCumulativeAmount(
  policy: Policy,
  action: ActionIntent,
  maxCumulativeAmount: bigint,
  cumulativeSpend: bigint,
): readonly ValidationIssue[] {
  if (action.amount === undefined) {
    return [
      {
        code: 'amount-required',
        message: `Action ${action.type} must include an amount for policy ${policy.id}.`,
      },
    ];
  }

  if (cumulativeSpend + action.amount > maxCumulativeAmount) {
    return [
      {
        code: 'cumulative-amount-exceeds-maximum',
        message: `Action ${action.type} would exceed the maximum cumulative amount allowed by policy ${policy.id}.`,
      },
    ];
  }

  return [];
}

function validateAllowedMetadataValue(
  policy: Policy,
  action: ActionIntent,
  key: string,
  values: readonly (string | number | boolean)[],
): readonly ValidationIssue[] {
  const actual = action.metadata?.[key];

  if (!values.some((value) => value === actual)) {
    return [
      {
        code: 'metadata-value-not-allowed',
        message: `Action ${action.type} metadata ${key} is not allowed by policy ${policy.id}.`,
      },
    ];
  }

  return [];
}

function doesConstraintApplyToAction(constraint: PolicyConstraint, action: ActionIntent): boolean {
  return constraint.actionTypes === undefined || constraint.actionTypes.includes(action.type);
}
