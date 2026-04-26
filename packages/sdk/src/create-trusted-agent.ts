import type {
  ActionIntent,
  AgentIdentity,
  AgentState,
  AuditEvent,
  Credential,
  CredentialProof,
  ExecutionAdapter,
  ExecutionResult,
  Policy,
  ProofAdapter,
  ReasoningEngine,
  StorageAdapter,
  ValidationResult,
} from '@0xagentio/core';
import { validateActionAgainstPolicy } from '@0xagentio/core';

/**
 * Dependencies required to create a trusted agent runtime.
 */
export type CreateTrustedAgentOptions = {
  /** Identity of the running agent. */
  readonly identity: AgentIdentity;
  /** Credential binding the agent to delegated authority. */
  readonly credential: Credential;
  /** Policy constraining the agent's actions. */
  readonly policy: Policy;
  /** Initial state used when storage has no prior state. */
  readonly initialState: AgentState;
  /** Decision layer that proposes the next action. */
  readonly reasoning: ReasoningEngine;
  /** Proof backend that proves and verifies authorized actions. */
  readonly proof: ProofAdapter;
  /** Persistence backend for state and audit events. */
  readonly storage: StorageAdapter;
  /** Optional backend for executing authorized actions after proof generation. */
  readonly execution?: ExecutionAdapter;
  /** Optional clock for deterministic examples and tests. */
  readonly now?: () => Date;
  /** Optional event id generator for deterministic examples and tests. */
  readonly createEventId?: () => string;
};

/**
 * Result returned after one agent decision cycle.
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
      readonly action: ActionIntent;
      readonly validation: ValidationResult;
      readonly event: AuditEvent;
    };

/**
 * Minimal trusted agent runtime exposed by the SDK.
 */
export type TrustedAgent = {
  /** Runs one reasoning, validation, proof, and audit cycle. */
  startOnce(): Promise<AgentStepResult>;
};

/**
 * Creates a trusted agent runtime from pluggable reasoning, proof, and storage dependencies.
 */
export function createTrustedAgent(options: CreateTrustedAgentOptions): TrustedAgent {
  const now = options.now ?? (() => new Date());
  const createEventId = options.createEventId ?? (() => crypto.randomUUID());

  return {
    async startOnce(): Promise<AgentStepResult> {
      const cycleTime = now();
      const state = await loadStateOrInitial(options.storage, options.identity, options.initialState);
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

      const validation = validateActionAgainstPolicy(options.policy, decision, cycleTime);
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
        action: decision,
        proof: proofResult.proof,
      });

      const event = await appendEvent(options.storage, {
        id: createEventId(),
        agentId: options.identity.id,
        createdAt: cycleTime,
        status: 'accepted',
        action: decision,
      });

      return { status: 'accepted', action: decision, validation, proof: proofResult.proof, execution, event };
    },
  };
}

async function loadStateOrInitial(
  storage: StorageAdapter,
  identity: AgentIdentity,
  initialState: AgentState,
): Promise<AgentState> {
  try {
    return await storage.loadState(identity);
  } catch {
    // missing state should not block the first local decision cycle
    await storage.saveState(identity, initialState);
    return initialState;
  }
}

async function appendEvent(storage: StorageAdapter, event: AuditEvent): Promise<AuditEvent> {
  await storage.appendAuditEvent(event);
  return event;
}
