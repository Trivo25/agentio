import type { ActionIntent } from './action.js';
import type { Policy } from './policy.js';

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
