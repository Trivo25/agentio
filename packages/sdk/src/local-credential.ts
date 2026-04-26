import {
  hashPolicy,
  serializeDelegationStatement,
  type AgentIdentity,
  type Credential,
  type DelegationSignature,
  type DelegationSigner,
  type Policy,
} from '@0xagentio/core';

/**
 * Options for issuing a local credential in examples and tests.
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
  /** Optional signer used to attach a local delegation signature. */
  readonly signer?: DelegationSigner;
};

/**
 * Issues an unsigned local credential for examples, tests, and early SDK prototyping.
 */
export async function issueLocalCredential(options: IssueLocalCredentialOptions): Promise<Credential> {
  const unsignedCredential = {
    id: options.id ?? `credential:${options.identity.id}:${options.policy.id}`,
    agentId: options.identity.id,
    policyId: options.policy.id,
    policyHash: hashPolicy(options.policy),
    issuedAt: options.issuedAt ?? new Date(),
    expiresAt: options.policy.expiresAt,
  };

  if (options.signer === undefined) {
    return unsignedCredential;
  }

  const statement = {
    principalId: options.signer.principalId,
    agentId: unsignedCredential.agentId,
    policyId: unsignedCredential.policyId,
    policyHash: unsignedCredential.policyHash,
    expiresAt: unsignedCredential.expiresAt,
  };

  const delegation: DelegationSignature = {
    principalId: options.signer.principalId,
    format: options.signer.format,
    signature: await options.signer.sign(serializeDelegationStatement(statement), statement),
  };

  return { ...unsignedCredential, delegation };
}
