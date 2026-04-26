import type { ActionIntent } from './action.js';
import type { AgentIdentity } from './identity.js';
import type { Policy } from './policy.js';
import type { AgentState } from './state.js';

/**
 * Context passed to a reasoning engine when it decides the agent's next action.
 */
export type AgentContext = {
  /** Identity of the agent making the decision. */
  readonly identity: AgentIdentity;
  /** Policy constraining what the agent may do. */
  readonly policy: Policy;
  /** Current state available to the agent. */
  readonly state: AgentState;
  /** Time associated with this decision cycle. */
  readonly now: Date;
};

/**
 * Pluggable decision layer implemented by applications, strategy packages, or LLM adapters.
 */
export interface ReasoningEngine {
  /** Returns an action intent or `skip` when the agent should not act. */
  decide(context: AgentContext): Promise<ActionIntent | 'skip'>;
}
