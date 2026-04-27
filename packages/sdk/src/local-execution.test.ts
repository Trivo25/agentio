import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPolicy } from '@0xagentio/core';

import { localVerifyingExecution } from './local-execution.js';
import { localNoirProofs } from './local-noir-proof.js';

const identity = {
  id: 'agent-test',
  publicKey: 'agent-public-key-test',
};

const policy = {
  id: 'policy-test',
  allowedActions: ['swap'],
  constraints: [{ type: 'max-amount' as const, value: 500n, actionTypes: ['swap'] }],
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

const state = {
  cumulativeSpend: 0n,
  updatedAt: new Date('2026-04-25T00:00:00.000Z'),
};

test('localVerifyingExecution verifies proof public inputs before executing', async () => {
  const proofAdapter = localNoirProofs();
  const action = { type: 'swap', amount: 250n };
  const proof = await proofAdapter.proveAction({
    credential,
    policy,
    state,
    action,
    now: new Date('2026-04-25T12:00:00.000Z'),
  });
  const executions: unknown[] = [];
  const executor = localVerifyingExecution(proofAdapter, async (request) => {
    executions.push(request);
    return { success: true, reference: `executed:${request.action.type}` };
  });

  const result = await executor.execute({
    identity,
    credential,
    policy,
    action,
    proof: proof.proof,
  });

  assert.equal(result.success, true);
  assert.equal(result.reference, 'executed:swap');
  assert.equal(executions.length, 1);
});

test('localVerifyingExecution rejects mismatched proof public inputs before executing', async () => {
  const proofAdapter = localNoirProofs();
  const action = { type: 'swap', amount: 250n };
  const proof = await proofAdapter.proveAction({
    credential,
    policy,
    state,
    action,
    now: new Date('2026-04-25T12:00:00.000Z'),
  });
  const executions: unknown[] = [];
  const executor = localVerifyingExecution(proofAdapter, async (request) => {
    executions.push(request);
    return { success: true, reference: `executed:${request.action.type}` };
  });

  const result = await executor.execute({
    identity: { ...identity, id: 'agent-impostor' },
    credential,
    policy,
    action,
    proof: proof.proof,
  });

  assert.equal(result.success, false);
  assert.equal(result.reference, 'rejected:proof-public-input-mismatch');
  assert.equal(result.details?.reason, 'proof-public-input-mismatch');
  assert.equal(executions.length, 0);
});
