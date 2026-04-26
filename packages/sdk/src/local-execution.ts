import type { ExecutionAdapter, ExecutionRequest, ExecutionResult } from '@0xagentio/core';

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
