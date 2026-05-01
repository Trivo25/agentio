import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPolicy, type ActionIntent, type ExecutionRequest, type ReasoningEngine } from '@0xagentio/core';

import { createActionIntent } from './action.js';
import { createTrustedAgent } from './create-trusted-agent.js';
import { localDelegationSigner, verifyLocalDelegation } from './local-delegation.js';
import { localExecution, localVerifyingExecution } from './local-execution.js';
import { issueLocalCredential } from './local-credential.js';
import { localMemoryStorage } from './local-memory-storage.js';
import { localNoirProofs } from './local-noir-proof.js';
import { localOgStorage } from './local-og-storage.js';
import { localPolicyProofs } from './local-policy-proof.js';
import { llmReasoningEngine, type LlmReasoningDecision } from './llm-reasoning-engine.js';
import { mockLlmClient } from './llm-client.js';
import { staticReasoningEngine } from './static-reasoning-engine.js';

const identity = {
  id: 'agent-test',
  publicKey: 'agent-public-key-test',
};

const policy = {
  id: 'policy-test',
  allowedActions: ['swap'],
  constraints: [{ type: 'max-amount' as const, value: 500n }],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const credential = {
  id: 'credential-test',
  agentId: identity.id,
  policyId: policy.id,
  policyHash: hashPolicy(policy),
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  expiresAt: policy.expiresAt,
};

const initialState = {
  cumulativeSpend: 0n,
  updatedAt: new Date('2026-04-25T00:00:00.000Z'),
};

/**
 * Creates a runtime with deterministic dependencies for execution behavior tests.
 */
function createTestAgent(reasoning: Parameters<typeof staticReasoningEngine>[0], executions: ExecutionRequest[]) {
  const storage = localMemoryStorage();
  const agent = createTrustedAgent({
    identity,
    credential,
    policy,
    initialState,
    reasoning: staticReasoningEngine(reasoning),
    proof: localPolicyProofs(),
    storage,
    execution: localExecution(async (request) => {
      executions.push(request);
      return { success: true, reference: `executed:${request.action.type}` };
    }),
    now: () => new Date('2026-04-25T12:00:00.000Z'),
    createEventId: () => 'event-test',
  });

  return { agent, storage };
}

function createTestAgentWithCredential(
  testCredential: typeof credential,
  reasoning: Parameters<typeof staticReasoningEngine>[0],
  executions: ExecutionRequest[],
  delegationVerifier?: Parameters<typeof createTrustedAgent>[0]['delegationVerifier'],
) {
  const storage = localMemoryStorage();
  const agent = createTrustedAgent({
    identity,
    credential: testCredential,
    policy,
    initialState,
    reasoning: staticReasoningEngine(reasoning),
    proof: localPolicyProofs(),
    storage,
    execution: localExecution(async (request) => {
      executions.push(request);
      return { success: true, reference: `executed:${request.action.type}` };
    }),
    delegationVerifier,
    now: () => new Date('2026-04-25T12:00:00.000Z'),
    createEventId: () => 'event-test',
  });

  return { agent, storage };
}

test('createTrustedAgent executes valid actions after proof generation', async () => {
  const executions: ExecutionRequest[] = [];
  const { agent, storage } = createTestAgent({ type: 'swap', amount: 250n }, executions);

  const result = await agent.startOnce();

  assert.equal(result.status, 'accepted');
  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.action.type, 'swap');
  assert.equal(result.execution?.reference, 'executed:swap');
  assert.equal(storage.getAuditEvents()[0]?.execution?.reference, 'executed:swap');
  assert.deepEqual(await storage.loadState(identity), {
    cumulativeSpend: 250n,
    updatedAt: new Date('2026-04-25T12:00:00.000Z'),
  });
});

test('createTrustedAgent does not execute rejected actions', async () => {
  const executions: ExecutionRequest[] = [];
  const { agent, storage } = createTestAgent({ type: 'swap', amount: 750n }, executions);

  const result = await agent.startOnce();

  assert.equal(result.status, 'rejected');
  assert.equal(executions.length, 0);
  assert.equal(storage.getAuditEvents()[0]?.status, 'rejected');
  assert.equal(storage.getAuditEvents()[0]?.execution, undefined);
});

test('createTrustedAgent does not execute skipped decisions', async () => {
  const executions: ExecutionRequest[] = [];
  const { agent, storage } = createTestAgent('skip', executions);

  const result = await agent.startOnce();

  assert.equal(result.status, 'skipped');
  assert.equal(executions.length, 0);
  assert.equal(storage.getAuditEvents()[0]?.status, 'skipped');
  assert.equal(storage.getAuditEvents()[0]?.execution, undefined);
});

test('createTrustedAgent rejects invalid credentials before reasoning and execution', async () => {
  const executions: ExecutionRequest[] = [];
  const { agent, storage } = createTestAgentWithCredential(
    { ...credential, policyHash: 'sha256:mismatch' },
    { type: 'swap', amount: 250n },
    executions,
  );

  const result = await agent.startOnce();

  assert.equal(result.status, 'rejected');
  assert.equal(result.action, undefined);
  assert.equal(executions.length, 0);
  assert.deepEqual(result.validation.issues.map((issue) => issue.code), ['credential-policy-hash-mismatch']);
  assert.deepEqual(storage.getAuditEvents()[0]?.issues?.map((issue) => issue.code), [
    'credential-policy-hash-mismatch',
  ]);
});

test('createTrustedAgent can require valid credential delegation before reasoning and execution', async () => {
  const executions: ExecutionRequest[] = [];
  const { agent } = createTestAgentWithCredential(
    credential,
    { type: 'swap', amount: 250n },
    executions,
    verifyLocalDelegation,
  );

  const result = await agent.startOnce();

  assert.equal(result.status, 'rejected');
  assert.equal(executions.length, 0);
  assert.deepEqual(result.validation.issues.map((issue) => issue.code), ['credential-delegation-invalid']);
});

test('createTrustedAgent accepts valid delegated credentials when delegation verification is configured', async () => {
  const executions: ExecutionRequest[] = [];
  const delegatedCredential = await issueLocalCredential({
    identity,
    policy,
    id: credential.id,
    issuedAt: credential.issuedAt,
    signer: localDelegationSigner('principal-test'),
  });
  const { agent } = createTestAgentWithCredential(
    delegatedCredential,
    { type: 'swap', amount: 250n },
    executions,
    verifyLocalDelegation,
  );

  const result = await agent.startOnce();

  assert.equal(result.status, 'accepted');
  assert.equal(executions.length, 1);
});

test('createTrustedAgent does not advance cumulative state when execution fails', async () => {
  const storage = localMemoryStorage();
  const agent = createTrustedAgent({
    identity,
    credential,
    policy,
    initialState,
    reasoning: staticReasoningEngine({ type: 'swap', amount: 250n }),
    proof: localPolicyProofs(),
    storage,
    execution: localExecution(async () => ({ success: false, reference: 'execution-declined' })),
    now: () => new Date('2026-04-25T12:00:00.000Z'),
    createEventId: () => 'event-test',
  });

  const result = await agent.startOnce();

  assert.equal(result.status, 'accepted');
  await assert.rejects(
    storage.loadState(identity),
    /No state found for agent agent-test/,
  );
});

test('createTrustedAgent runUntilComplete stops when reasoning skips', async () => {
  const storage = localMemoryStorage();
  const decisions: Array<ActionIntent | 'skip'> = [
    { type: 'swap', amount: 100n },
    { type: 'swap', amount: 150n },
    'skip',
  ];
  const reasoning = sequentialReasoning(decisions);
  const agent = createTrustedAgent({
    identity,
    credential,
    policy,
    initialState,
    reasoning,
    proof: localPolicyProofs(),
    storage,
    execution: localExecution(async (request) => ({
      success: true,
      reference: `executed:${request.action.amount?.toString() ?? '0'}`,
    })),
    now: () => new Date('2026-04-25T12:00:00.000Z'),
    createEventId: () => crypto.randomUUID(),
  });

  const result = await agent.runUntilComplete({ maxSteps: 5 });

  assert.equal(result.status, 'completed');
  assert.equal(result.steps.length, 3);
  assert.deepEqual(result.finalState, {
    cumulativeSpend: 250n,
    updatedAt: new Date('2026-04-25T12:00:00.000Z'),
  });
});

test('createTrustedAgent runUntilComplete supports stopWhen predicates', async () => {
  const storage = localMemoryStorage();
  const agent = createTrustedAgent({
    identity,
    credential,
    policy,
    initialState,
    reasoning: staticReasoningEngine({ type: 'swap', amount: 100n }),
    proof: localPolicyProofs(),
    storage,
    execution: localExecution(async () => ({
      success: true,
      reference: 'executed:swap',
    })),
    now: () => new Date('2026-04-25T12:00:00.000Z'),
    createEventId: () => crypto.randomUUID(),
  });

  const result = await agent.runUntilComplete({
    maxSteps: 5,
    stopWhen: ({ state }) => state.cumulativeSpend >= 300n,
  });

  assert.equal(result.status, 'stopped');
  assert.equal(result.steps.length, 3);
  assert.equal(result.finalState.cumulativeSpend, 300n);
});

test('createTrustedAgent runUntilComplete supports guarded LLM decisions through proof, execution, state, and audit', async () => {
  const targetSpend = 300n;
  const stepAmount = 100n;
  const delegatedPolicy = {
    ...policy,
    id: 'policy-llm-loop',
    constraints: [
      { type: 'max-amount' as const, value: stepAmount, actionTypes: ['swap'] },
      { type: 'max-cumulative-amount' as const, value: targetSpend, actionTypes: ['swap'] },
      {
        type: 'allowed-metadata-value' as const,
        key: 'assetPair',
        values: ['ETH/USDC'],
        actionTypes: ['swap'],
      },
    ],
  };
  const delegatedCredential = await issueLocalCredential({
    identity,
    policy: delegatedPolicy,
    id: 'credential-llm-loop',
    issuedAt: credential.issuedAt,
    signer: localDelegationSigner('principal-llm-loop'),
  });
  const proof = localNoirProofs();
  const storage = localOgStorage();
  const executions: ExecutionRequest[] = [];
  const observedDecisions: string[] = [];
  const providerAmounts: unknown[] = [100, '100.0', '250'];
  let providerCall = 0;
  const reasoning = llmReasoningEngine({
    client: mockLlmClient(() => {
      const amount = providerAmounts[providerCall];
      providerCall += 1;

      return JSON.stringify({
        decision: 'act',
        action: {
          type: 'swap',
          amount,
          metadata: { assetPair: 'ETH/USDC' },
        },
      });
    }),
    goal: 'Incrementally rebalance ETH/USDC until cumulative spend reaches 300.',
    allowedActionTypes: ['swap'],
    guard: ({ decision, context }) => guardLoopDecision(decision, context.state.cumulativeSpend, targetSpend, stepAmount),
    onDecision: ({ rawDecision, decision }) => {
      if (rawDecision.decision === 'act' && decision.decision === 'act') {
        observedDecisions.push(`${String(rawDecision.action.amount)} -> ${String(decision.action.amount)}`);
      }
    },
  });
  const agent = createTrustedAgent({
    identity,
    credential: delegatedCredential,
    policy: delegatedPolicy,
    initialState,
    reasoning,
    delegationVerifier: verifyLocalDelegation,
    proof,
    storage,
    execution: localVerifyingExecution(proof, async (request) => {
      executions.push(request);
      return {
        success: true,
        reference: `executed:${request.action.amount?.toString() ?? '0'}`,
      };
    }),
    now: () => new Date('2026-04-25T12:00:00.000Z'),
    createEventId: () => crypto.randomUUID(),
  });

  const result = await agent.runUntilComplete({
    maxSteps: 5,
    stopWhen: ({ state }) => state.cumulativeSpend >= targetSpend,
  });

  assert.equal(result.status, 'stopped');
  assert.equal(result.steps.length, 3);
  assert.equal(executions.length, 3);
  assert.deepEqual(executions.map((request) => request.action.amount), [100n, 100n, 100n]);
  assert.deepEqual(observedDecisions, ['100 -> 100', '100 -> 100', '250 -> 100']);
  assert.equal(result.finalState.cumulativeSpend, targetSpend);
  assert.equal(storage.getAuditEvents().length, 3);
  assert.equal(storage.getRecords().filter((record) => record.kind === 'agent-state').length, 3);
  assert.equal(storage.getRecords().filter((record) => record.kind === 'audit-event').length, 3);
  assert.ok(result.steps.every((step) => step.status === 'accepted'));
});

test('createTrustedAgent runUntilComplete stops on rejection', async () => {
  const executions: ExecutionRequest[] = [];
  const { agent } = createTestAgent({ type: 'swap', amount: 750n }, executions);

  const result = await agent.runUntilComplete({ maxSteps: 5 });

  assert.equal(result.status, 'rejected');
  assert.equal(result.steps.length, 1);
  assert.equal(executions.length, 0);
});

test('createTrustedAgent runUntilComplete stops on execution failure', async () => {
  const storage = localMemoryStorage();
  const agent = createTrustedAgent({
    identity,
    credential,
    policy,
    initialState,
    reasoning: staticReasoningEngine({ type: 'swap', amount: 100n }),
    proof: localPolicyProofs(),
    storage,
    execution: localExecution(async () => ({
      success: false,
      reference: 'execution-failed',
    })),
    now: () => new Date('2026-04-25T12:00:00.000Z'),
    createEventId: () => crypto.randomUUID(),
  });

  const result = await agent.runUntilComplete({ maxSteps: 5 });

  assert.equal(result.status, 'execution-failed');
  assert.equal(result.steps.length, 1);
  assert.deepEqual(result.finalState, initialState);
});

test('createTrustedAgent runUntilComplete stops at maxSteps', async () => {
  const storage = localMemoryStorage();
  const agent = createTrustedAgent({
    identity,
    credential,
    policy,
    initialState,
    reasoning: staticReasoningEngine({ type: 'swap', amount: 1n }),
    proof: localPolicyProofs(),
    storage,
    execution: localExecution(async () => ({
      success: true,
      reference: 'executed:swap',
    })),
    now: () => new Date('2026-04-25T12:00:00.000Z'),
    createEventId: () => crypto.randomUUID(),
  });

  const result = await agent.runUntilComplete({ maxSteps: 2 });

  assert.equal(result.status, 'max-steps');
  assert.equal(result.steps.length, 2);
  assert.equal(result.finalState.cumulativeSpend, 2n);
});

test('createTrustedAgent runUntilComplete reports aborted before starting a step', async () => {
  const controller = new AbortController();
  controller.abort();
  const executions: ExecutionRequest[] = [];
  const { agent } = createTestAgent({ type: 'swap', amount: 250n }, executions);

  const result = await agent.runUntilComplete({
    maxSteps: 5,
    signal: controller.signal,
  });

  assert.equal(result.status, 'aborted');
  assert.equal(result.steps.length, 0);
  assert.equal(executions.length, 0);
});

test('createTrustedAgent runUntilComplete validates maxSteps', async () => {
  const executions: ExecutionRequest[] = [];
  const { agent } = createTestAgent({ type: 'swap', amount: 250n }, executions);

  await assert.rejects(
    () => agent.runUntilComplete({ maxSteps: 0 }),
    /maxSteps must be a positive integer/,
  );
});

function sequentialReasoning(decisions: Array<ActionIntent | 'skip'>): ReasoningEngine {
  let index = 0;
  return {
    async decide() {
      const decision = decisions[index] ?? 'skip';
      index += 1;
      return decision;
    },
  };
}

function guardLoopDecision(
  decision: LlmReasoningDecision,
  cumulativeSpend: bigint,
  targetSpend: bigint,
  stepAmount: bigint,
): LlmReasoningDecision {
  if (cumulativeSpend >= targetSpend) {
    return { decision: 'skip' };
  }

  const remaining = targetSpend - cumulativeSpend;
  return {
    decision: 'act',
    action: createActionIntent({
      type: 'swap',
      amount: remaining < stepAmount ? remaining : stepAmount,
      metadata: { assetPair: 'ETH/USDC' },
    }),
  };
}
