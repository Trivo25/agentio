import { createHash } from 'node:crypto';

import { serializeCanonicalJson } from './canonical-json.js';
import type { Policy } from './policy.js';

/**
 * Stable hash algorithm identifier used for local policy commitments.
 */
export const POLICY_HASH_ALGORITHM = 'sha256' as const;

/**
 * Serializes a policy into deterministic JSON for hashing and signing.
 */
export function serializePolicy(policy: Policy): string {
  return serializeCanonicalJson(policy);
}

/**
 * Hashes a policy commitment using the local deterministic policy serialization.
 */
export function hashPolicy(policy: Policy): string {
  return `${POLICY_HASH_ALGORITHM}:${createHash(POLICY_HASH_ALGORITHM).update(serializePolicy(policy)).digest('hex')}`;
}
