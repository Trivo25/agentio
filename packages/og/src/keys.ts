/**
 * Returns the canonical object key for an agent's latest state snapshot.
 *
 * Developers should care because local and real 0G storage must agree on these
 * keys for an agent runtime to switch storage backends without changing app
 * code or migration logic.
 */
export function agentStateKey(agentId: string): string {
  return `agents/${agentId}/state/latest`;
}

/**
 * Returns the canonical object key for an append-only audit event.
 *
 * Audit keys include the event id so each decision cycle can be persisted as a
 * separate record instead of overwriting the agent's history.
 */
export function auditEventKey(agentId: string, eventId: string): string {
  return `agents/${agentId}/audit/${eventId}`;
}

/**
 * Prefixes a storage key with an optional app namespace.
 *
 * This lets demos, tests, and deployments share the same 0G account or bucket
 * while keeping their object keys separated by project or environment.
 */
export function namespacedKey(namespace: string | undefined, key: string): string {
  if (namespace === undefined || namespace.length === 0) {
    return key;
  }

  return `${trimSlashes(namespace)}/${key}`;
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}
