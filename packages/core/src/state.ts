/**
 * Tracks mutable agent execution state required for policy and proof decisions.
 */
export type AgentState = {
  /** Total amount spent or consumed by the agent so far. */
  readonly cumulativeSpend: bigint;
  /** Time at which this state snapshot was last updated. */
  readonly updatedAt: Date;
};
