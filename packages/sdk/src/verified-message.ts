import type { AgentMessage, CredentialProof, ProofAdapter, VerifierResult } from '@0xagentio/core';

/**
 * Result returned after verifying a credential-carrying message.
 */
export type VerifiedMessageResult =
  | {
      readonly valid: true;
      readonly message: AgentMessage;
      readonly proof: CredentialProof;
      readonly verification: VerifierResult;
    }
  | {
      readonly valid: false;
      readonly message: AgentMessage;
      readonly reason: string;
      readonly verification?: VerifierResult;
    };

/**
 * Verifies the credential proof carried in an agent message payload.
 */
export async function verifyCredentialMessage(
  message: AgentMessage,
  proofAdapter: ProofAdapter,
): Promise<VerifiedMessageResult> {
  const proof = message.payload.proof;
  if (!isCredentialProofLike(proof)) {
    return { valid: false, message, reason: 'missing-proof' };
  }

  const verification = await proofAdapter.verifyProof(proof);
  if (!verification.valid) {
    return { valid: false, message, reason: verification.reason ?? 'proof-verification-failed', verification };
  }

  return { valid: true, message, proof, verification };
}

function isCredentialProofLike(value: unknown): value is CredentialProof {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { format?: unknown; proof?: unknown; publicInputs?: unknown };
  return typeof candidate.format === 'string' && candidate.proof instanceof Uint8Array && isRecord(candidate.publicInputs);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
