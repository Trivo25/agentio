import type { ActionIntent } from './action.js';
import type { CredentialProof } from './proof.js';

/**
 * Input passed to an execution adapter after an action has been authorized.
 */
export type ExecutionRequest = {
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
 * Pluggable backend for executing authorized actions.
 */
export interface ExecutionAdapter {
  /** Executes an already-authorized action. */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
