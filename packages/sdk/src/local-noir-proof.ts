import type { CredentialProof, ProofAdapter, ProofRequest, ProofResult, VerifierResult } from '@0xagentio/core';
import { createNoirAuthorizationInput, validateActionAgainstPolicy, validateCredentialForPolicy } from '@0xagentio/core';

const textEncoder = new TextEncoder();

/**
 * Local proof adapter that exercises the Noir authorization input boundary.
 */
export function localNoirProofs(): ProofAdapter {
  return {
    async proveAction(request: ProofRequest): Promise<ProofResult> {
      const credentialValidation = validateCredentialForPolicy(request.credential, request.policy, request.now);
      if (!credentialValidation.valid) {
        throw new Error(
          `Cannot create local Noir proof for invalid credential: ${credentialValidation.issues.map((issue) => issue.code).join(', ')}`,
        );
      }

      const validation = validateActionAgainstPolicy(request.policy, request.action, request.now);
      if (!validation.valid) {
        throw new Error(
          `Cannot create local Noir proof for invalid action: ${validation.issues.map((issue) => issue.code).join(', ')}`,
        );
      }

      const authorizationInput = createNoirAuthorizationInput(request);

      return {
        proof: {
          format: 'local-noir-policy-proof',
          proof: textEncoder.encode(
            `${authorizationInput.privateInputs.credentialId}:${authorizationInput.privateInputs.policyId}:${authorizationInput.publicInputs.policyHash}:${authorizationInput.publicInputs.actionType}`,
          ),
          publicInputs: {
            ...authorizationInput.publicInputs,
          },
        },
      };
    },

    async verifyProof(proof: CredentialProof): Promise<VerifierResult> {
      if (proof.format !== 'local-noir-policy-proof') {
        return { valid: false, reason: `Unsupported proof format ${proof.format}.` };
      }

      return { valid: proof.proof.length > 0, reason: proof.proof.length > 0 ? undefined : 'Proof payload is empty.' };
    },
  };
}
