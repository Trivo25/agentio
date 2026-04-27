import type { CredentialProof, ProofAdapter, ProofRequest, ProofResult, VerifierResult } from '@0xagentio/core';
import { validateActionAgainstPolicy, validateCredentialForPolicy } from '@0xagentio/core';

const textEncoder = new TextEncoder();

/**
 * Proof adapter that returns proof-shaped local policy validation output.
 */
export function localPolicyProofs(): ProofAdapter {
  return {
    async proveAction(request: ProofRequest): Promise<ProofResult> {
      const credentialValidation = validateCredentialForPolicy(request.credential, request.policy, request.now);
      if (!credentialValidation.valid) {
        throw new Error(
          `Cannot create local proof for invalid credential: ${credentialValidation.issues.map((issue) => issue.code).join(', ')}`,
        );
      }

      const validation = validateActionAgainstPolicy(request.policy, request.action, request.now, request.state.cumulativeSpend);
      if (!validation.valid) {
        throw new Error(`Cannot create local proof for invalid action: ${validation.issues.map((issue) => issue.code).join(', ')}`);
      }

      return {
        proof: {
          format: 'local-policy-proof',
          proof: textEncoder.encode(
            `${request.credential.id}:${request.policy.id}:${request.credential.policyHash}:${request.action.type}`,
          ),
          publicInputs: {
            credentialId: request.credential.id,
            policyId: request.policy.id,
            policyHash: request.credential.policyHash,
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
