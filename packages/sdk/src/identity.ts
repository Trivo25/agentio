import type { AgentIdentity } from '@0xagentio/core';

/**
 * Creates an agent identity while preserving the core identity shape.
 */
export function createAgentIdentity(identity: AgentIdentity): AgentIdentity {
  return identity;
}
