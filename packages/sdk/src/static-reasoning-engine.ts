import type { ActionIntent, AgentContext, ReasoningEngine } from '@0xagentio/core';

/**
 * Reasoning engine that always returns the same decision.
 */
export function staticReasoningEngine(decision: ActionIntent | 'skip'): ReasoningEngine {
  return {
    async decide(_context: AgentContext): Promise<ActionIntent | 'skip'> {
      return decision;
    },
  };
}
