import type {
  ActionIntent,
  AgentIdentity,
  AgentState,
  AuditEvent,
  Credential,
  CredentialProof,
  DelegationVerificationResult,
  DelegationVerifier,
  ExecutionAdapter,
  ExecutionResult,
  Policy,
  ProofAdapter,
  ReasoningEngine,
  StorageAdapter,
  ValidationIssue,
  ValidationResult,
} from '@0xagentio/core';
import { validateActionAgainstPolicy, validateCredentialForPolicy } from '@0xagentio/core';

/**
 * Dependencies for the lower-level trusted decision agent.
 *
 * Use this when an application wants direct control over a single
 * reason/validate/prove/execute/audit loop and does not want this helper to own
 * peer communication. Most applications should start with `createAgentRuntime`
 * and use this only when they need custom orchestration.
 */
export type CreateTrustedAgentOptions = {
  /** Identity that names the agent in validation, proofs, state, and audit events. */
  readonly identity: AgentIdentity;
  /** Credential showing which delegated authority this decision loop may use. */
  readonly credential: Credential;
  /** Policy checked before proof generation or execution can happen. */
  readonly policy: Policy;
  /** Initial mutable state saved before the first run when storage is empty. */
  readonly initialState: AgentState;
  /** Reasoning layer that proposes an action or chooses to skip this cycle. */
  readonly reasoning: ReasoningEngine;
  /** Proof backend used to bind an approved action to the credential and policy. */
  readonly proof: ProofAdapter;
  /** Storage backend that persists cumulative state and audit events. */
  readonly storage: StorageAdapter;
  /** Optional executor that consumes a proved action and returns a domain receipt. */
  readonly execution?: ExecutionAdapter;
  /** Optional verifier that rejects credentials not signed by the delegating principal. */
  readonly delegationVerifier?: DelegationVerifier;
  /** Optional clock for deterministic examples, tests, and replayable runs. */
  readonly now?: () => Date;
  /** Optional event id generator for deterministic audit records. */
  readonly createEventId?: () => string;
};

export type { DelegationVerificationResult, DelegationVerifier } from '@0xagentio/core';

/**
 * Result returned after one trusted-agent decision cycle.
 *
 * Applications inspect this result to learn whether the agent skipped, rejected,
 * or accepted an action and to retrieve proof, execution, and audit details when
 * an action was accepted.
 */
export type AgentStepResult =
  | {
      readonly status: 'skipped';
      readonly event: AuditEvent;
    }
  | {
      readonly status: 'accepted';
      readonly action: ActionIntent;
      readonly validation: ValidationResult;
      readonly proof: CredentialProof;
      readonly execution?: ExecutionResult;
      readonly event: AuditEvent;
    }
  | {
      readonly status: 'rejected';
      readonly action?: ActionIntent;
      readonly validation: ValidationResult;
      readonly event: AuditEvent;
    };

/** Data passed to `runUntilComplete` stop predicates after each step. */
export type AgentRunStopContext = {
  /** Latest completed step. */
  readonly step: AgentStepResult;
  /** All steps completed in this run so far. */
  readonly history: readonly AgentStepResult[];
  /** Latest persisted state after the step. */
  readonly state: AgentState;
};

/** Options for running a bounded multi-step trusted-agent loop. */
export type AgentRunUntilCompleteOptions = {
  /** Maximum number of decision cycles. Defaults to 10. */
  readonly maxSteps?: number;
  /** Optional wall-clock timeout for the whole run. */
  readonly timeoutMs?: number;
  /** Optional cancellation signal checked between steps. */
  readonly signal?: AbortSignal;
  /** Optional app-specific stop condition checked after each completed step. */
  readonly stopWhen?: (
    context: AgentRunStopContext,
  ) => boolean | Promise<boolean>;
};

/**
 * Result returned by a bounded multi-step trusted-agent run.
 *
 * The loop is intentionally conservative: every step still goes through
 * `startOnce`, so validation, proof generation, execution, state updates, and
 * audit events remain per-action and independently inspectable.
 */
export type AgentRunUntilCompleteResult = {
  /** Why the loop stopped. */
  readonly status:
    | 'completed'
    | 'stopped'
    | 'rejected'
    | 'execution-failed'
    | 'max-steps'
    | 'timeout'
    | 'aborted';
  /** Completed step results in execution order. */
  readonly steps: readonly AgentStepResult[];
  /** Latest persisted state after the loop stopped. */
  readonly finalState: AgentState;
};

/**
 * Lower-level decision/proof agent without peer messaging.
 *
 * This surface is intentionally small so applications can embed the trusted loop
 * inside their own scheduler, server, or multi-agent coordinator.
 */
export type TrustedAgent = {
  /** Runs one cycle: load state, reason, validate, prove, optionally execute, persist, and audit. */
  startOnce(): Promise<AgentStepResult>;
  /** Runs bounded decision cycles until completion, stop condition, rejection, failure, or guardrail. */
  runUntilComplete(options?: AgentRunUntilCompleteOptions): Promise<AgentRunUntilCompleteResult>;
};

/**
 * Creates the lower-level trusted agent used by `createAgentRuntime`.
 *
 * Choose this helper when message handling lives somewhere else and the
 * application only needs the decision/proof/execution loop.
 */
export function createTrustedAgent(options: CreateTrustedAgentOptions): TrustedAgent {
  const now = options.now ?? (() => new Date());
  const createEventId = options.createEventId ?? (() => crypto.randomUUID());

  const trusted: TrustedAgent = {
    async startOnce(): Promise<AgentStepResult> {
      const cycleTime = now();
      const state = await loadStateOrInitial(options.storage, options.identity, options.initialState);
      const credentialValidation = validateCredentialForPolicy(options.credential, options.policy, cycleTime);
      if (!credentialValidation.valid) {
        const event = await appendEvent(options.storage, {
          id: createEventId(),
          agentId: options.identity.id,
          createdAt: cycleTime,
          status: 'rejected',
          issues: credentialValidation.issues,
        });

        return { status: 'rejected', validation: credentialValidation, event };
      }

      const delegationValidation = await validateCredentialDelegation(options.credential, options.delegationVerifier);
      if (!delegationValidation.valid) {
        const event = await appendEvent(options.storage, {
          id: createEventId(),
          agentId: options.identity.id,
          createdAt: cycleTime,
          status: 'rejected',
          issues: delegationValidation.issues,
        });

        return { status: 'rejected', validation: delegationValidation, event };
      }

      const decision = await options.reasoning.decide({
        identity: options.identity,
        policy: options.policy,
        state,
        now: cycleTime,
      });

      if (decision === 'skip') {
        const event = await appendEvent(options.storage, {
          id: createEventId(),
          agentId: options.identity.id,
          createdAt: cycleTime,
          status: 'skipped',
        });

        return { status: 'skipped', event };
      }

      const validation = validateActionAgainstPolicy(options.policy, decision, cycleTime, state.cumulativeSpend);
      if (!validation.valid) {
        const event = await appendEvent(options.storage, {
          id: createEventId(),
          agentId: options.identity.id,
          createdAt: cycleTime,
          status: 'rejected',
          action: decision,
          issues: validation.issues,
        });

        return { status: 'rejected', action: decision, validation, event };
      }

      const proofResult = await options.proof.proveAction({
        credential: options.credential,
        policy: options.policy,
        state,
        action: decision,
        now: cycleTime,
      });

      const execution = await options.execution?.execute({
        identity: options.identity,
        credential: options.credential,
        policy: options.policy,
        action: decision,
        proof: proofResult.proof,
      });

      if (shouldAdvanceState(execution)) {
        await options.storage.saveState(options.identity, advanceState(state, decision.amount ?? 0n, cycleTime));
      }

      const event = await appendEvent(options.storage, {
        id: createEventId(),
        agentId: options.identity.id,
        createdAt: cycleTime,
        status: 'accepted',
        action: decision,
        execution,
      });

      return { status: 'accepted', action: decision, validation, proof: proofResult.proof, execution, event };
    },

    async runUntilComplete(runOptions: AgentRunUntilCompleteOptions = {}): Promise<AgentRunUntilCompleteResult> {
      const maxSteps = runOptions.maxSteps ?? 10;
      if (!Number.isInteger(maxSteps) || maxSteps <= 0) {
        throw new Error('runUntilComplete maxSteps must be a positive integer.');
      }

      const startedAt = Date.now();
      const steps: AgentStepResult[] = [];

      for (let index = 0; index < maxSteps; index += 1) {
        if (runOptions.signal?.aborted === true) {
          return await finishRun(options, 'aborted', steps);
        }
        if (hasTimedOut(startedAt, runOptions.timeoutMs)) {
          return await finishRun(options, 'timeout', steps);
        }

        const step = await trusted.startOnce();
        steps.push(step);
        const state = await loadStateOrInitial(options.storage, options.identity, options.initialState);

        if (step.status === 'skipped') {
          return { status: 'completed', steps, finalState: state };
        }
        if (step.status === 'rejected') {
          return { status: 'rejected', steps, finalState: state };
        }
        if (step.execution?.success === false) {
          return { status: 'execution-failed', steps, finalState: state };
        }
        if (await runOptions.stopWhen?.({ step, history: steps, state })) {
          return { status: 'stopped', steps, finalState: state };
        }
      }

      return await finishRun(options, 'max-steps', steps);
    },
  };

  return trusted;
}


// advance mutable state after an authorized action is actually consumed.
// the cumulative amount is part of the policy envelope and noir input, so the
// runtime must persist the new total before the next decision cycle. otherwise
// an agent could repeatedly authorize individually-valid actions while never
// consuming its cumulative budget.
function advanceState(state: AgentState, amount: bigint, updatedAt: Date): AgentState {
  return {
    cumulativeSpend: state.cumulativeSpend + amount,
    updatedAt,
  };
}

function shouldAdvanceState(execution: ExecutionResult | undefined): boolean {
  return execution === undefined || execution.success;
}

async function loadStateOrInitial(
  storage: StorageAdapter,
  identity: AgentIdentity,
  initialState: AgentState,
): Promise<AgentState> {
  try {
    return await storage.loadState(identity);
  } catch (error) {
    if (!isMissingStateError(error)) {
      throw error;
    }

    // missing state should bootstrap the first decision without creating an
    // extra storage write. network-backed stores can expose stale reads when an
    // initial snapshot and the first accepted snapshot are written to the same
    // key in quick succession.
    return initialState;
  }
}

function isMissingStateError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('No state found for agent ');
}

async function appendEvent(storage: StorageAdapter, event: AuditEvent): Promise<AuditEvent> {
  await storage.appendAuditEvent(event);
  return event;
}

async function finishRun(
  options: CreateTrustedAgentOptions,
  status: AgentRunUntilCompleteResult['status'],
  steps: readonly AgentStepResult[],
): Promise<AgentRunUntilCompleteResult> {
  return {
    status,
    steps,
    finalState: await loadStateOrInitial(options.storage, options.identity, options.initialState),
  };
}

function hasTimedOut(startedAt: number, timeoutMs: number | undefined): boolean {
  return timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs;
}

async function validateCredentialDelegation(
  credential: Credential,
  delegationVerifier: CreateTrustedAgentOptions['delegationVerifier'],
): Promise<ValidationResult> {
  if (delegationVerifier === undefined) {
    return { valid: true, issues: [] };
  }

  const verification = await delegationVerifier(credential);
  if (verification.valid) {
    return { valid: true, issues: [] };
  }

  const issue: ValidationIssue = {
    code: 'credential-delegation-invalid',
    message: `Credential ${credential.id} delegation is invalid: ${verification.reason}.`,
  };

  return { valid: false, issues: [issue] };
}
