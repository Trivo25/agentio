import type {
  ActionIntent,
  AgentContext,
  ReasoningEngine,
} from '@0xagentio/core';
import { serializePolicy } from '@0xagentio/core';

import { createActionIntent } from './action.js';
import type { LlmClient } from './llm-client.js';

/** Parsed decision returned by an LLM reasoning response. */
export type LlmReasoningDecision =
  | {
      readonly decision: 'act';
      readonly action: ActionIntent;
      readonly reason?: string;
    }
  | {
      readonly decision: 'skip';
      readonly reason?: string;
    };

/** Context passed to an optional guard after an LLM returns a decision. */
export type LlmReasoningGuardContext = {
  /** Parsed LLM decision before runtime policy validation or proof generation. */
  readonly decision: LlmReasoningDecision;
  /** Agent context that was sent to the reasoning engine. */
  readonly context: AgentContext;
};

/**
 * Optional deterministic check that runs after LLM output is parsed.
 *
 * Guards let developers approve, rewrite, reject, or skip model output with
 * testable code before the normal runtime validation/proof boundary runs.
 */
export type LlmReasoningGuard = (
  context: LlmReasoningGuardContext,
) => LlmReasoningDecision | 'skip' | Promise<LlmReasoningDecision | 'skip'>;

/** Options for creating an LLM-backed reasoning engine. */
export type LlmReasoningEngineOptions = {
  /** Provider-neutral LLM client. */
  readonly client: LlmClient;
  /** Goal the agent should reason toward on every decision cycle. */
  readonly goal: string;
  /** Optional extra instructions, such as domain rules or output preferences. */
  readonly instructions?: string;
  /** Optional action allow-list checked before runtime policy validation. */
  readonly allowedActionTypes?: readonly string[];
  /** Optional deterministic guard checked after parsing model output. */
  readonly guard?: LlmReasoningGuard;
};

/**
 * Creates a reasoning engine that asks an LLM to propose the next action.
 *
 * The LLM only proposes. The runtime still validates policy, generates proofs,
 * persists state, and routes execution through adapters, so a model cannot
 * exceed delegated authority by returning a more aggressive action.
 */
export function llmReasoningEngine(
  options: LlmReasoningEngineOptions,
): ReasoningEngine {
  return {
    async decide(context: AgentContext): Promise<ActionIntent | 'skip'> {
      const completion = await options.client.complete({
        system: createSystemPrompt(options),
        responseFormat: 'json',
        messages: [
          {
            role: 'user',
            content: JSON.stringify(createReasoningPrompt(context, options)),
          },
        ],
      });
      const parsedDecision = parseLlmReasoningDecision(completion.content);
      const decision = await applyGuard(parsedDecision, context, options.guard);

      if (decision.decision === 'skip') {
        return 'skip';
      }

      const action = decision.action;
      if (
        options.allowedActionTypes !== undefined &&
        !options.allowedActionTypes.includes(action.type)
      ) {
        throw new Error(
          `LLM proposed disallowed action type ${action.type}.`,
        );
      }

      return action;
    },
  };
}

async function applyGuard(
  decision: LlmReasoningDecision,
  context: AgentContext,
  guard: LlmReasoningGuard | undefined,
): Promise<LlmReasoningDecision> {
  if (guard === undefined) {
    return decision;
  }

  const guarded = await guard({ decision, context });
  return guarded === 'skip' ? { decision: 'skip' } : guarded;
}

/**
 * Parses strict JSON model output into an SDK reasoning decision.
 *
 * Provider clients should normalize model responses to text; this parser keeps
 * the security-sensitive conversion from text to action small and testable.
 */
export function parseLlmReasoningDecision(content: string): LlmReasoningDecision {
  const parsed = parseJsonObject(content);
  const decision = parsed.decision;

  if (decision === 'skip') {
    return {
      decision: 'skip',
      reason: readOptionalString(parsed.reason, 'reason'),
    };
  }

  if (decision !== 'act') {
    throw new Error('LLM reasoning output must set decision to "act" or "skip".');
  }

  const action = parseAction(parsed.action);
  return {
    decision: 'act',
    action,
    reason: readOptionalString(parsed.reason, 'reason'),
  };
}

function createSystemPrompt(options: LlmReasoningEngineOptions): string {
  return [
    'You are the reasoning layer for an autonomous AgentIO agent.',
    'Return strict JSON only.',
    'You may propose an action, but policy validation and proof generation happen after your response.',
    'Use {"decision":"skip","reason":"..."} when no safe action should be proposed.',
    'Use {"decision":"act","action":{"type":"...","amount":"...","metadata":{}},"reason":"..."} when proposing an action.',
    'Represent numeric action amounts as decimal strings.',
    options.instructions,
  ]
    .filter((line): line is string => line !== undefined && line !== '')
    .join('\n');
}

function createReasoningPrompt(
  context: AgentContext,
  options: LlmReasoningEngineOptions,
): Readonly<Record<string, unknown>> {
  return {
    goal: options.goal,
    allowedActionTypes: options.allowedActionTypes,
    agent: {
      id: context.identity.id,
      publicKey: context.identity.publicKey,
    },
    policy: JSON.parse(serializePolicy(context.policy)),
    state: {
      cumulativeSpend: context.state.cumulativeSpend.toString(),
      updatedAt: context.state.updatedAt.toISOString(),
    },
    now: context.now.toISOString(),
  };
}

function parseAction(value: unknown): ActionIntent {
  if (!isRecord(value)) {
    throw new Error('LLM reasoning action must be an object.');
  }

  if (typeof value.type !== 'string' || value.type === '') {
    throw new Error('LLM reasoning action.type must be a non-empty string.');
  }

  return createActionIntent({
    type: value.type,
    amount: parseOptionalAmount(value.amount),
    metadata: parseOptionalMetadata(value.metadata),
  });
}

function parseOptionalAmount(value: unknown): bigint | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const normalized = normalizeIntegerAmountString(value);
    if (normalized !== undefined) {
      return BigInt(normalized);
    }
  }

  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  throw new Error(
    `LLM reasoning action.amount must be a decimal string or safe integer. Received ${describeAmountValue(value)}.`,
  );
}

function normalizeIntegerAmountString(value: string): string | undefined {
  const trimmed = value.trim();
  const match = /^(-?\d+)(?:\.0+)?$/.exec(trimmed);
  return match?.[1];
}

function describeAmountValue(value: unknown): string {
  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseOptionalMetadata(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error('LLM reasoning action.metadata must be an object.');
  }

  return value;
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`LLM reasoning ${field} must be a string when provided.`);
  }

  return value;
}

function parseJsonObject(content: string): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `LLM reasoning output must be strict JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!isRecord(parsed)) {
    throw new Error('LLM reasoning output must be a JSON object.');
  }

  return parsed;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
