import { createHash } from 'node:crypto';

import type { Policy } from './policy.js';

type JsonPrimitive = string | number | boolean | null;
type CanonicalJson = JsonPrimitive | readonly CanonicalJson[] | { readonly [key: string]: CanonicalJson };

/**
 * Stable hash algorithm identifier used for local policy commitments.
 */
export const POLICY_HASH_ALGORITHM = 'sha256' as const;

/**
 * Serializes a policy into deterministic JSON for hashing and signing.
 */
export function serializePolicy(policy: Policy): string {
  return JSON.stringify(toCanonicalJson(policy));
}

/**
 * Hashes a policy commitment using the local deterministic policy serialization.
 */
export function hashPolicy(policy: Policy): string {
  return `${POLICY_HASH_ALGORITHM}:${createHash(POLICY_HASH_ALGORITHM).update(serializePolicy(policy)).digest('hex')}`;
}

function toCanonicalJson(value: unknown): CanonicalJson {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return { type: 'bigint', value: value.toString() };
  }

  if (value instanceof Date) {
    return { type: 'date', value: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return value.map((item) => toCanonicalJson(item));
  }

  if (typeof value === 'object' && value !== undefined) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, toCanonicalJson(entryValue)]),
    );
  }

  throw new TypeError(`Cannot serialize policy value of type ${typeof value}.`);
}
