/**
 * Generic constraint attached to a delegated policy.
 */
export type PolicyConstraint =
  | {
      /** Requires an action amount to stay below or equal to a maximum value. */
      readonly type: 'max-amount';
      /** Maximum permitted amount in the smallest unit understood by the caller. */
      readonly value: bigint;
    };

/**
 * Describes the authority delegated to an agent.
 */
export type Policy = {
  /** Unique policy identifier used by credentials and future proof requests. */
  readonly id: string;
  /** Action names the agent is allowed to propose or execute. */
  readonly allowedActions: readonly string[];
  /** Generic constraints that apply to eligible actions. */
  readonly constraints?: readonly PolicyConstraint[];
  /** Time after which the delegated authority is no longer valid. */
  readonly expiresAt: Date;
};
