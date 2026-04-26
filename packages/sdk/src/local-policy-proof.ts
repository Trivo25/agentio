import type { CredentialProof, ProofAdapter, ProofRequest, ProofResult, VerifierResult } from '@0xagentio/core';
import { hashPolicy, validateActionAgainstPolicy } from '@0xagentio/core';

const textEncoder = new TextEncoder();

/**
 * Proof adapter that returns proof-shaped local policy validation output.
 */
export function localPolicyProofs(): ProofAdapter {
  return {
    async proveAction(request: ProofRequest): Promise<ProofResult> {
      const policyHash = hashPolicy(request.policy);
      if (request.credential.policyHash !== policyHash) {
        throw new Error('Cannot create local proof: credential policy hash does not match supplied policy.');
      }

      const validation = validateActionAgainstPolicy(request.policy, request.action, request.now);
      if (!validation.valid) {
        throw new Error(`Cannot create local proof for invalid action: ${validation.issues.map((issue) => issue.code).join(', ')}`);
      }

      return {
        proof: {
          format: 'local-policy-proof',
          proof: textEncoder.encode(
            `${request.credential.id}:${request.policy.id}:${policyHash}:${request.action.type}`,
          ),
          publicInputs: {
            credentialId: request.credential.id,
            policyId: request.policy.id,
            policyHash,
            actionType: request.action.type,
            agentId: request.credential.agentId,
          },
        },
      };
    },

    async verifyProof(proof: CredentialProof): Promise<VerifierResult> {
      if (proof.format !== 'local-policy-proof') {
        return { valid: false, reason: `Unsupported proof format ${proof.format}.` };
      }

      return { valid: proof.proof.length > 0, reason: proof.proof.length > 0 ? undefined : 'Proof payload is empty.' };
    },
  };
}
