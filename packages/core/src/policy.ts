/**
 * Describes the authority delegated to an agent.
 */
export type Policy = {
  /** Unique policy identifier used by credentials and future proof requests. */
  readonly id: string;
  /** Action names the agent is allowed to propose or execute. */
  readonly allowedActions: readonly string[];
  /** Time after which the delegated authority is no longer valid. */
  readonly expiresAt: Date;
};
