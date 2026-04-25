import type { AuditEvent } from './audit.js';
import type { AgentIdentity } from './identity.js';
import type { AgentState } from './state.js';

/**
 * Pluggable persistence backend for agent state and audit history.
 */
export interface StorageAdapter {
  /** Loads the latest state for an agent. */
  loadState(identity: AgentIdentity): Promise<AgentState>;
  /** Saves the latest state for an agent. */
  saveState(identity: AgentIdentity, state: AgentState): Promise<void>;
  /** Appends an audit event for a decision cycle. */
  appendAuditEvent(event: AuditEvent): Promise<void>;
}
