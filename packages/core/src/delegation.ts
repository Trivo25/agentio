import type { Credential } from './credential.js';

/**
 * Statement signed by a principal to delegate a policy commitment to an agent.
 */
export type DelegationStatement = {
  /** Principal or signer identifier authorizing the delegation. */
  readonly principalId: string;
  /** Agent receiving delegated authority. */
  readonly agentId: string;
  /** Policy identifier being delegated. */
  readonly policyId: string;
  /** Deterministic commitment to the delegated policy contents. */
  readonly policyHash: string;
  /** Credential expiry time. */
  readonly expiresAt: Date;
};

/**
 * Signature over a delegation statement.
 */
export type DelegationSignature = {
  /** Principal or signer identifier that produced the signature. */
  readonly principalId: string;
  /** Signature scheme or adapter-specific signature format. */
  readonly format: string;
  /** Signature payload produced by the signer. */
  readonly signature: string;
};

/**
 * Converts a delegation statement into a deterministic string to sign.
 */
export function serializeDelegationStatement(statement: DelegationStatement): string {
  return JSON.stringify({
    agentId: statement.agentId,
    expiresAt: statement.expiresAt.toISOString(),
    policyHash: statement.policyHash,
    policyId: statement.policyId,
    principalId: statement.principalId,
  });
}

/**
 * Builds the delegation statement represented by a credential. Requires a principal id.
 */
export function credentialDelegationStatement(credential: Credential, principalId: string): DelegationStatement {
  return {
    principalId,
    agentId: credential.agentId,
    policyId: credential.policyId,
    policyHash: credential.policyHash,
    expiresAt: credential.expiresAt,
  };
}
