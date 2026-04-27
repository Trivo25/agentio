import type { AgentIdentity, AgentState, AuditEvent, StorageAdapter } from '@0xagentio/core';

/**
 * Local record shaped like an object that could later be persisted to 0G Storage.
 */
export type LocalOgStorageRecord = {
  /** Deterministic object key for the stored record. */
  readonly key: string;
  /** Record kind used by future 0G adapters to route serialization. */
  readonly kind: 'agent-state' | 'audit-event';
  /** Agent that owns the record. */
  readonly agentId: string;
  /** Local creation time for the storage record. */
  readonly createdAt: Date;
  /** Stored payload. */
  readonly payload: AgentState | AuditEvent;
};

/**
 * In-memory storage adapter that uses 0G-shaped object keys and records.
 */
export type LocalOgStorage = StorageAdapter & {
  /** Returns all local 0G-shaped records in insertion order. */
  getRecords(): readonly LocalOgStorageRecord[];
  /** Returns all audit events currently stored in local 0G-shaped records. */
  getAuditEvents(): readonly AuditEvent[];
};

/**
 * Creates a local 0G-shaped storage adapter for examples and adapter-boundary tests.
 */
export function localOgStorage(initialStates: ReadonlyMap<string, AgentState> = new Map()): LocalOgStorage {
  const states = new Map(initialStates);
  const records: LocalOgStorageRecord[] = [];

  return {
    async loadState(identity: AgentIdentity): Promise<AgentState> {
      const state = states.get(identity.id);
      if (state === undefined) {
        throw new Error(`No state found for agent ${identity.id}.`);
      }
      return state;
    },

    async saveState(identity: AgentIdentity, state: AgentState): Promise<void> {
      states.set(identity.id, state);
      records.push({
        key: stateRecordKey(identity.id),
        kind: 'agent-state',
        agentId: identity.id,
        createdAt: new Date(),
        payload: state,
      });
    },

    async appendAuditEvent(event: AuditEvent): Promise<void> {
      records.push({
        key: auditRecordKey(event.agentId, event.id),
        kind: 'audit-event',
        agentId: event.agentId,
        createdAt: new Date(),
        payload: event,
      });
    },

    getRecords(): readonly LocalOgStorageRecord[] {
      return records;
    },

    getAuditEvents(): readonly AuditEvent[] {
      return records
        .filter((record): record is LocalOgStorageRecord & { readonly payload: AuditEvent } => record.kind === 'audit-event')
        .map((record) => record.payload);
    },
  };
}

function stateRecordKey(agentId: string): string {
  return `agents/${agentId}/state/latest`;
}

function auditRecordKey(agentId: string, eventId: string): string {
  return `agents/${agentId}/audit/${eventId}`;
}
