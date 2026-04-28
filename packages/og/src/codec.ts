import type { AgentState, AuditEvent } from '@0xagentio/core';

/** JSON payload persisted through the 0G adapter boundary. */
export type OgStorageDocument = {
  readonly version: 1;
  readonly kind: 'agent-state' | 'audit-event';
  readonly agentId: string;
  readonly createdAt: string;
  readonly payload: unknown;
};

/**
 * Encodes an agent state snapshot as a JSON document for 0G persistence.
 *
 * Dates and bigints are not plain JSON values, so the adapter stores them with a
 * small tagged representation. This keeps persisted state deterministic and
 * reversible across local tests and real 0G downloads.
 */
export function encodeAgentStateDocument(agentId: string, state: AgentState, createdAt = new Date()): string {
  return JSON.stringify({
    version: 1,
    kind: 'agent-state',
    agentId,
    createdAt: createdAt.toISOString(),
    payload: toJsonValue(state),
  } satisfies OgStorageDocument);
}

/**
 * Encodes an audit event as an append-only JSON document for 0G persistence.
 */
export function encodeAuditEventDocument(event: AuditEvent, createdAt = new Date()): string {
  return JSON.stringify({
    version: 1,
    kind: 'audit-event',
    agentId: event.agentId,
    createdAt: createdAt.toISOString(),
    payload: toJsonValue(event),
  } satisfies OgStorageDocument);
}

/**
 * Decodes a persisted agent state document.
 *
 * The real 0G adapter calls this after downloading bytes for
 * `agents/{agentId}/state/latest`, allowing the SDK runtime to receive normal
 * TypeScript `Date` and `bigint` values instead of storage-specific JSON.
 */
export function decodeAgentStateDocument(document: string): AgentState {
  const parsed = parseDocument(document);
  if (parsed.kind !== 'agent-state') {
    throw new TypeError(`Expected agent-state document but received ${parsed.kind}.`);
  }

  const payload = fromJsonValue(parsed.payload);
  if (!isAgentState(payload)) {
    throw new TypeError('Invalid agent-state payload.');
  }

  return payload;
}

function parseDocument(document: string): OgStorageDocument {
  const parsed = JSON.parse(document) as unknown;
  if (!isRecord(parsed)) {
    throw new TypeError('Invalid 0G storage document: expected an object.');
  }

  if (parsed.version !== 1 || (parsed.kind !== 'agent-state' && parsed.kind !== 'audit-event')) {
    throw new TypeError('Invalid 0G storage document header.');
  }

  if (typeof parsed.agentId !== 'string' || typeof parsed.createdAt !== 'string' || !('payload' in parsed)) {
    throw new TypeError('Invalid 0G storage document metadata.');
  }

  return parsed as OgStorageDocument;
}

function toJsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { $type: 'bigint', value: value.toString() };
  }

  if (value instanceof Date) {
    return { $type: 'date', value: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, toJsonValue(nestedValue)]));
  }

  return value;
}

function fromJsonValue(value: unknown): unknown {
  if (isRecord(value) && value.$type === 'bigint' && typeof value.value === 'string') {
    return BigInt(value.value);
  }

  if (isRecord(value) && value.$type === 'date' && typeof value.value === 'string') {
    return new Date(value.value);
  }

  if (Array.isArray(value)) {
    return value.map(fromJsonValue);
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, fromJsonValue(nestedValue)]));
  }

  return value;
}

function isAgentState(value: unknown): value is AgentState {
  return isRecord(value) && typeof value.cumulativeSpend === 'bigint' && value.updatedAt instanceof Date;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
