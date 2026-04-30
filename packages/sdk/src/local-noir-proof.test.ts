import assert from 'node:assert/strict';
import test from 'node:test';

import { hashAction, hashPolicy } from '@0xagentio/core';

import { localNoirProofs } from './local-noir-proof.js';

const policy = {
  id: 'policy-test',
  allowedActions: ['swap'],
  constraints: [{ type: 'max-amount' as const, value: 500n, actionTypes: ['swap'] }],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const credential = {
  id: 'credential-test',
  agentId: 'agent-test',
  policyId: policy.id,
  policyHash: hashPolicy(policy),
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  expiresAt: policy.expiresAt,
};

test('localNoirProofs creates Noir-shaped public inputs from an authorized action', async () => {
  const action = { type: 'swap', amount: 250n, metadata: { assetPair: 'ETH/USDC' } };
  const proof = await localNoirProofs().proveAction({
    credential,
    policy,
    state: { cumulativeSpend: 100n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
    action,
    now: new Date('2026-04-25T12:00:00.000Z'),
  });

  assert.equal(proof.proof.format, 'local-noir-policy-proof');
  assert.deepEqual(proof.proof.publicInputs, {
    agentId: 'agent-test',
    policyHash: credential.policyHash,
    actionType: 'swap',
    actionHash: hashAction(action),
    actionAmount: '250',
  });
});

test('localNoirProofs verifies non-empty local Noir proof payloads', async () => {
  const action = { type: 'swap', amount: 250n, metadata: { assetPair: 'ETH/USDC' } };
  const proof = await localNoirProofs().proveAction({
    credential,
    policy,
    state: { cumulativeSpend: 0n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
    action: { type: 'swap', amount: 250n },
    now: new Date('2026-04-25T12:00:00.000Z'),
  });

  assert.deepEqual(await localNoirProofs().verifyProof(proof.proof), { valid: true, reason: undefined });
});

test('localNoirProofs rejects actions before producing Noir-shaped proofs', async () => {
  await assert.rejects(
    localNoirProofs().proveAction({
      credential,
      policy,
      state: { cumulativeSpend: 0n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
      action: { type: 'swap', amount: 750n },
      now: new Date('2026-04-25T12:00:00.000Z'),
    }),
    /amount-exceeds-maximum/,
  );
});
