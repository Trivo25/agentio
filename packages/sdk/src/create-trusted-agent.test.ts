import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPolicy, type ExecutionRequest } from '@0xagentio/core';

import { createTrustedAgent } from './create-trusted-agent.js';
import { localExecution } from './local-execution.js';
import { localMemoryStorage } from './local-memory-storage.js';
import { localPolicyProofs } from './local-policy-proof.js';
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
