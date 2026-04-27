import type { DelegationSignature } from './delegation.js';
/**
 * Connects an agent identity to a delegated policy.
 */
export type Credential = {
  /** Unique credential identifier. */
  readonly id: string;
  /** Identifier of the agent receiving delegated authority. */
  readonly agentId: string;
  /** Identifier of the policy this credential binds to. */
  readonly policyId: string;
  /** Deterministic commitment to the full policy contents. */
  readonly policyHash: string;
  /** Time at which the credential was issued. */
  readonly issuedAt: Date;
  /** Time after which the credential is no longer valid. */
  readonly expiresAt: Date;
  /** Optional principal signature authorizing this delegation. */
  readonly delegation?: DelegationSignature;
};
