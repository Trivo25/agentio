import type { AgentIdentity, Credential, Policy } from '@0xagentio/core';

/**
 * Options for issuing a local unsigned credential in examples and tests.
 */
export type IssueLocalCredentialOptions = {
  /** Agent identity receiving delegated authority. */
  readonly identity: AgentIdentity;
  /** Policy delegated to the agent. */
  readonly policy: Policy;
  /** Optional credential identifier. */
  readonly id?: string;
  /** Optional issuance time. */
  readonly issuedAt?: Date;
};

/**
 * Issues an unsigned local credential for examples, tests, and early SDK prototyping.
 */
export function issueLocalCredential(options: IssueLocalCredentialOptions): Credential {
  return {
    id: options.id ?? `credential:${options.identity.id}:${options.policy.id}`,
    agentId: options.identity.id,
    policyId: options.policy.id,
    issuedAt: options.issuedAt ?? new Date(),
    expiresAt: options.policy.expiresAt,
  };
}
