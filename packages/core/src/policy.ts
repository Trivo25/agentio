/**
 * Generic constraint attached to a delegated policy.
 */
export type PolicyConstraint =
  | {
      /** Requires an action amount to stay below or equal to a maximum value. */
      readonly type: 'max-amount';
      /** Maximum permitted amount in the smallest unit understood by the caller. */
      readonly value: bigint;
      /** Optional action types this constraint applies to. Omit to apply it to every allowed action. */
      readonly actionTypes?: readonly string[];
    }
  | {
      /** Requires current cumulative spend plus the action amount to stay below or equal to a total budget. */
      readonly type: 'max-cumulative-amount';
      /** Maximum cumulative amount permitted across the agent state and current action. */
      readonly value: bigint;
      /** Optional action types this constraint applies to. Omit to apply it to every allowed action. */
      readonly actionTypes?: readonly string[];
    }
  | {
      /** Requires a metadata field to match one of the configured values. */
      readonly type: 'allowed-metadata-value';
      /** Metadata key to read from the action. */
      readonly key: string;
      /** Allowed primitive metadata values for the configured key. */
      readonly values: readonly (string | number | boolean)[];
      /** Optional action types this constraint applies to. Omit to apply it to every allowed action. */
      readonly actionTypes?: readonly string[];
    };

/**
 * Describes the authority delegated to an agent.
 */
export type Policy = {
  /** Unique policy identifier used by credentials and proof requests. */
  readonly id: string;
  /** Action names the agent is allowed to propose or execute. */
  readonly allowedActions: readonly string[];
  /** Generic constraints that apply to eligible actions. */
  readonly constraints?: readonly PolicyConstraint[];
  /** Time after which the delegated authority is no longer valid. */
  readonly expiresAt: Date;
};
