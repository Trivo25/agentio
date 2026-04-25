/**
 * Identifies a credentialed agent in the 0xAgentio framework.
 */
export type AgentIdentity = {
  /** Stable agent identifier used by local state, transport messages, and audit logs. */
  readonly id: string;
  /** Public key associated with the agent runtime. */
  readonly publicKey: string;
};
