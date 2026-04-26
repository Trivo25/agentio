import type { ActionIntent } from './action.js';
import type { Credential } from './credential.js';
import type { Policy } from './policy.js';
import type { AgentState } from './state.js';

/**
 * Input required to prove that an agent action is authorized.
 */
export type ProofRequest = {
  /** Credential binding the agent to a delegated policy. */
  readonly credential: Credential;
  /** Policy the action must satisfy. */
  readonly policy: Policy;
  /** Current mutable agent state used by budget-aware proof systems. */
  readonly state: AgentState;
  /** Action the agent wants to prove authorization for. */
  readonly action: ActionIntent;
  /** Time used for expiry checks and proof public inputs. */
  readonly now: Date;
};

/**
 * Proof payload produced by a proof adapter.
 */
export type CredentialProof = {
  /** Adapter-specific proof format identifier. */
  readonly format: string;
  /** Serialized proof bytes or proof-like payload. */
  readonly proof: Uint8Array;
  /** Public values that verifiers may inspect. */
  readonly publicInputs: Readonly<Record<string, unknown>>;
};

/**
 * Result returned after proof generation.
 */
export type ProofResult = {
  /** Generated credential proof. */
  readonly proof: CredentialProof;
};

/**
 * Result returned after proof verification.
 */
export type VerifierResult = {
  /** Whether the proof verified successfully. */
  readonly valid: boolean;
  /** Optional verifier-specific reason when verification fails. */
  readonly reason?: string;
};

/**
 * Pluggable proof backend used by the SDK to prove and verify agent actions.
 */
export interface ProofAdapter {
  /** Generates a proof for an action authorization request. */
  proveAction(request: ProofRequest): Promise<ProofResult>;
  /** Verifies a credential proof produced by this or a compatible adapter. */
  verifyProof(proof: CredentialProof): Promise<VerifierResult>;
}
