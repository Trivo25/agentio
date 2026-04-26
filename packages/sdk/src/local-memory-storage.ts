import type { AgentIdentity, AgentState, AuditEvent, StorageAdapter } from '@0xagentio/core';

/**
 * In-memory storage adapter for examples and local tests.
 */
export type LocalMemoryStorage = StorageAdapter & {
  /** Returns all audit events currently stored in memory. */
  getAuditEvents(): readonly AuditEvent[];
};

/**
 * Creates a local storage adapter with the same shape as future 0G-backed storage.
 */
export function localMemoryStorage(initialStates: ReadonlyMap<string, AgentState> = new Map()): LocalMemoryStorage {
  const states = new Map(initialStates);
  const auditEvents: AuditEvent[] = [];

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
    },

    async appendAuditEvent(event: AuditEvent): Promise<void> {
      auditEvents.push(event);
    },

    getAuditEvents(): readonly AuditEvent[] {
      return auditEvents;
    },
  };
}
