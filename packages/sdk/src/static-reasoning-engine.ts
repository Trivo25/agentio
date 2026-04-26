import type { ActionIntent, AgentContext, ReasoningEngine } from '@0xagentio/core';

/**
 * Creates a reasoning engine that always returns the same decision.
 *
 * This is intended for examples, tests, and deterministic local demos.
 */
export function staticReasoningEngine(decision: ActionIntent | 'skip'): ReasoningEngine {
  return {
    async decide(_context: AgentContext): Promise<ActionIntent | 'skip'> {
      return decision;
    },
  };
}
