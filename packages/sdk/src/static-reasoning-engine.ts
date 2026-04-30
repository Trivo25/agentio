import type { ActionIntent, AgentContext, ReasoningEngine } from '@0xagentio/core';

/** Decision returned by one deterministic reasoning rule. */
export type StaticReasoningRuleDecision = ActionIntent | 'skip' | undefined;

/**
 * Deterministic rule used by `staticRulesReasoningEngine`.
 *
 * Rules can inspect the current agent context and may also perform asynchronous
 * checks such as reading project configuration, checking a local file, or
 * calling an API before deciding whether they can propose the next action.
 */
export type StaticReasoningRule = (
  context: AgentContext,
) => StaticReasoningRuleDecision | Promise<StaticReasoningRuleDecision>;

/**
 * Options for composing deterministic reasoning rules.
 *
 * Use this when an agent should make repeatable non-LLM decisions from multiple
 * ordered rules. The first rule that returns an action or `skip` wins; rules
 * that return `undefined` let the next rule inspect the same context.
 */
export type StaticRulesReasoningEngineOptions = {
  /** Ordered rules evaluated on every decision cycle. */
  readonly rules: readonly StaticReasoningRule[];
  /** Decision to return when no rule matches. Defaults to `skip`. */
  readonly fallback?: ActionIntent | 'skip';
};

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

/**
 * Creates a deterministic reasoning engine from ordered developer-defined rules.
 *
 * This is useful for agents that should remain fully predictable but still need
 * richer logic than a fixed action. Developers can encode domain rules, inspect
 * state, check files or configuration, or call APIs before proposing an action.
 * Runtime validation and proof generation still remain authoritative after a
 * rule proposes an action.
 */
export function staticRulesReasoningEngine(
  options: StaticRulesReasoningEngineOptions,
): ReasoningEngine {
  return {
    async decide(context: AgentContext): Promise<ActionIntent | 'skip'> {
      for (const rule of options.rules) {
        const decision = await rule(context);
        if (decision !== undefined) {
          return decision;
        }
      }

      return options.fallback ?? 'skip';
    },
  };
}
