import type { CredentialProof, ProofAdapter, ProofRequest, ProofResult, VerifierResult } from '@0xagentio/core';

/**
 * Options for the real Noir proof adapter.
 *
 * This type exists before the implementation so application code can start
 * depending on the future package boundary without pulling Noir or
 * Barretenberg into the main SDK. The concrete fields will become the compiled
 * authorization circuit, proving backend settings, and verifier metadata once
 * the real adapter is wired.
 */
export type NoirProofAdapterOptions = {
  /**
   * Stable identifier for the authorization circuit this adapter proves with.
   *
   * Developers and peer agents need this id to reject proofs generated for the
   * wrong circuit version instead of trusting any Noir-shaped payload.
   */
  readonly circuitId?: string;
};

const NOT_IMPLEMENTED_REASON =
  'The real Noir proof adapter is not implemented yet. Use localNoirProofs() from @0xagentio/sdk for local tests until this package wires NoirJS and Barretenberg.';

/**
 * Creates the real Noir-backed proof adapter for agent authorization proofs.
 *
 * The SDK already consumes the generic ProofAdapter interface, so this package
 * will be the drop-in replacement for localNoirProofs() when we start using a
 * compiled Noir circuit and Barretenberg proofs. Keeping it in @0xagentio/noir
 * prevents heavy ZK dependencies from becoming mandatory for every SDK user.
 */
export function noirProofs(_options: NoirProofAdapterOptions = {}): ProofAdapter {
  return new UnimplementedNoirProofAdapter();
}

class UnimplementedNoirProofAdapter implements ProofAdapter {
  async proveAction(_request: ProofRequest): Promise<ProofResult> {
    throw new Error(NOT_IMPLEMENTED_REASON);
  }

  async verifyProof(_proof: CredentialProof): Promise<VerifierResult> {
    return { valid: false, reason: NOT_IMPLEMENTED_REASON };
  }
}

export type { AuthorizationCircuitInput } from './witness.js';
export { buildAuthorizationCircuitInput, hashToField } from './witness.js';
