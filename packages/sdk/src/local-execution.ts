import type { ExecutionAdapter, ExecutionRequest, ExecutionResult, ProofAdapter } from '@0xagentio/core';

/**
 * Creates a local execution adapter for examples and tests.
 */
export function localExecution(
  execute: (request: ExecutionRequest) => ExecutionResult | Promise<ExecutionResult>,
): ExecutionAdapter {
  return {
    async execute(request) {
      return execute(request);
    },
  };
}

/**
 * Creates a local executor that verifies proof authorization before executing.
 */
export function localVerifyingExecution(
  proofAdapter: ProofAdapter,
  execute: (request: ExecutionRequest) => ExecutionResult | Promise<ExecutionResult>,
): ExecutionAdapter {
  return localExecution(async (request) => {
    const proofVerification = await proofAdapter.verifyProof(request.proof);
    if (!proofVerification.valid) {
      return rejectedExecution('proof-verification-failed', proofVerification.reason);
    }

    const publicInputValidation = validateExecutionPublicInputs(request);
    if (!publicInputValidation.valid) {
      return rejectedExecution('proof-public-input-mismatch', publicInputValidation.reason);
    }

    return execute(request);
  });
}

function validateExecutionPublicInputs(request: ExecutionRequest): { readonly valid: true } | { readonly valid: false; readonly reason: string } {
  const checks: [string, unknown, unknown][] = [
    ['agentId', request.identity.id, request.proof.publicInputs.agentId],
    ['policyHash', request.credential.policyHash, request.proof.publicInputs.policyHash],
    ['actionType', request.action.type, request.proof.publicInputs.actionType],
  ];

  for (const [key, expected, actual] of checks) {
    if (actual !== expected) {
      return { valid: false, reason: `${key} expected ${String(expected)} but received ${String(actual)}.` };
    }
  }

  return { valid: true };
}

function rejectedExecution(reason: string, detail?: string): ExecutionResult {
  return {
    success: false,
    reference: `rejected:${reason}`,
    details: detail === undefined ? { reason } : { reason, detail },
  };
}
