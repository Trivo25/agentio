import { createHash } from 'node:crypto';

import type { ActionIntent } from './action.js';
import { serializeCanonicalJson } from './canonical-json.js';

/** Stable hash algorithm identifier used for local action commitments. */
export const ACTION_HASH_ALGORITHM = 'sha256' as const;

/**
 * Serializes an action into deterministic JSON for proof/message binding.
 *
 * Use this when a receiver must confirm that the action carried in a message is
 * the same action the sender proved. It preserves bigint amounts and sorts
 * metadata keys so independently constructed equivalent actions hash the same.
 */
export function serializeAction(action: ActionIntent): string {
  return serializeCanonicalJson(action);
}

/**
 * Hashes an action commitment using the local deterministic action serialization.
 *
 * Verifiers compare this hash to the proof public inputs before acting, which
 * prevents a sender from attaching an old proof to a modified action payload.
 */
export function hashAction(action: ActionIntent): string {
  return `${ACTION_HASH_ALGORITHM}:${createHash(ACTION_HASH_ALGORITHM).update(serializeAction(action)).digest('hex')}`;
}
