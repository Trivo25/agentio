import type { AgentIdentity, AgentState, AuditEvent, StorageAdapter } from '@0xagentio/core';

/**
 * Options for the future real 0G storage adapter.
 *
 * This type establishes the app-facing package boundary before we choose the
 * exact 0G client dependency. The final adapter should use these options to
 * locate the storage namespace where agent state and audit records are written.
 */
export type OgStorageOptions = {
  /** Logical namespace or bucket/prefix for this app's agent records. */
  readonly namespace?: string;
};

const NOT_IMPLEMENTED_REASON =
  'The real 0G storage adapter is not implemented yet. Use localOgStorage() from @0xagentio/sdk for local tests until this package wires the 0G client.';

/**
 * Creates the real 0G-backed storage adapter for agent state and audit events.
 *
 * The SDK runtime consumes only the generic StorageAdapter interface, so this
 * package will become a drop-in replacement for localOgStorage(). Keeping it in
 * @0xagentio/og prevents 0G-specific clients, credentials, and network behavior
 * from becoming mandatory for every SDK user.
 */
export function ogStorage(_options: OgStorageOptions = {}): StorageAdapter {
  return new UnimplementedOgStorageAdapter();
}

class UnimplementedOgStorageAdapter implements StorageAdapter {
  async loadState(_identity: AgentIdentity): Promise<AgentState> {
    throw new Error(NOT_IMPLEMENTED_REASON);
  }

  async saveState(_identity: AgentIdentity, _state: AgentState): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_REASON);
  }

  async appendAuditEvent(_event: AuditEvent): Promise<void> {
    throw new Error(NOT_IMPLEMENTED_REASON);
  }
}
