import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPolicy, type ExecutionRequest } from '@0xagentio/core';

import { createAgentRuntime } from './agent-runtime.js';
import { createAgentMessage } from './message.js';
import { localExecution } from './local-execution.js';
import { localMemoryStorage } from './local-memory-storage.js';
import { localPolicyProofs } from './local-policy-proof.js';
import { localTransport } from './local-transport.js';
import { staticReasoningEngine } from './static-reasoning-engine.js';

const identity = {
  id: 'agent-runtime-test',
  publicKey: 'agent-runtime-public-key-test',
};

const policy = {
  id: 'policy-runtime-test',
  allowedActions: ['swap'],
  constraints: [{ type: 'max-amount' as const, value: 500n }],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const credential = {
  id: 'credential-runtime-test',
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

test('createAgentRuntime composes decision, proof, execution, and storage adapters', async () => {
  const executions: ExecutionRequest[] = [];
  const storage = localMemoryStorage();
  const runtime = createAgentRuntime({
    identity,
    credential,
    policy,
    initialState,
    reasoning: staticReasoningEngine({ type: 'swap', amount: 250n }),
    proof: localPolicyProofs(),
    storage,
    execution: localExecution((request) => {
      executions.push(request);
      return { success: true, reference: 'executed:runtime' };
    }),
    now: () => new Date('2026-04-25T12:00:00.000Z'),
    createEventId: () => 'event-runtime-test',
  });

  const result = await runtime.startOnce();

  assert.equal(result.status, 'accepted');
  assert.equal(executions.length, 1);
  assert.deepEqual(await runtime.loadState(), {
    cumulativeSpend: 250n,
    updatedAt: new Date('2026-04-25T12:00:00.000Z'),
  });
});

test('createAgentRuntime exposes peer messaging when a transport is configured', async () => {
  const transport = localTransport();
  const runtime = createAgentRuntime({
    identity,
    credential,
    policy,
    initialState,
    reasoning: staticReasoningEngine('skip'),
    proof: localPolicyProofs(),
    storage: localMemoryStorage(),
    transport,
  });
  const message = createAgentMessage({
    id: 'message-runtime-test',
    type: 'ping',
    sender: identity.id,
    createdAt: new Date('2026-04-25T12:00:00.000Z'),
    payload: { ok: true },
  });

  await runtime.send('peer-runtime-test', message);

  assert.equal(transport.getSentMessages()[0]?.peerId, 'peer-runtime-test');
  assert.equal(transport.getSentMessages()[0]?.message.id, 'message-runtime-test');
});

test('createAgentRuntime reports missing transport before sending peer messages', async () => {
  const runtime = createAgentRuntime({
    identity,
    credential,
    policy,
    initialState,
    reasoning: staticReasoningEngine('skip'),
    proof: localPolicyProofs(),
    storage: localMemoryStorage(),
  });

  await assert.rejects(
    runtime.send(
      'peer-runtime-test',
      createAgentMessage({
        id: 'message-runtime-missing-transport-test',
        type: 'ping',
        sender: identity.id,
        createdAt: new Date('2026-04-25T12:00:00.000Z'),
        payload: {},
      }),
    ),
    /without a transport adapter/,
  );
});
