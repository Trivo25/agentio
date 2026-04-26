/**
 * Describes an action an agent wants to take before policy checks or proof generation.
 */
export type ActionIntent = {
  /** Action kind, such as `swap` or `broadcast-signal`. */
  readonly type: string;
  /** Optional action amount in the smallest unit understood by the caller. */
  readonly amount?: bigint;
  /** Optional adapter-specific context that should not affect the core type shape. */
  readonly metadata?: Readonly<Record<string, unknown>>;
};
