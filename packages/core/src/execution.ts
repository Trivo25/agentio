import type { ActionIntent } from './action.js';
import type { Credential } from './credential.js';
import type { AgentIdentity } from './identity.js';
import type { Policy } from './policy.js';
import type { CredentialProof } from './proof.js';

/**
 * Input passed to an execution adapter after local authorization and proof generation.
 */
export type ExecutionRequest = {
  /** Agent requesting execution. */
  readonly identity: AgentIdentity;
  /** Credential used to authorize the execution request. */
  readonly credential: Credential;
  /** Policy constraining the requested execution. */
  readonly policy: Policy;
  /** Authorized action to execute. */
  readonly action: ActionIntent;
  /** Credential proof associated with the authorized action. */
  readonly proof: CredentialProof;
};

/**
 * Result returned by an execution adapter.
 */
export type ExecutionResult = {
  /** Whether execution succeeded. */
  readonly success: boolean;
  /** Optional external transaction, receipt, or operation identifier. */
  readonly reference?: string;
  /** Optional adapter-specific execution details. */
  readonly details?: Readonly<Record<string, unknown>>;
};

/**
 * Pluggable backend for honoring authorized action requests.
 */
export interface ExecutionAdapter {
  /** Verifies and/or executes an already locally-authorized action request. */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
