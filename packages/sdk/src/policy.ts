import type { Policy } from '@0xagentio/core';

/**
 * Creates a policy object while preserving the core policy shape.
 */
export function createPolicy(policy: Policy): Policy {
  return policy;
}
