import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPolicy } from '@0xagentio/core';

import { localPolicyProofs } from './local-policy-proof.js';

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

test('localPolicyProofs includes the credential policy hash in public inputs', async () => {
  const proof = await localPolicyProofs().proveAction({
    credential,
    policy,
    state: { cumulativeSpend: 0n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
    action: { type: 'swap', amount: 250n },
    now: new Date('2026-04-25T12:00:00.000Z'),
  });

  assert.equal(proof.proof.publicInputs.policyHash, credential.policyHash);
});

test('localPolicyProofs rejects credentials that do not match the supplied policy hash', async () => {
  await assert.rejects(
    localPolicyProofs().proveAction({
      credential: { ...credential, policyHash: 'sha256:mismatched' },
      policy,
      state: { cumulativeSpend: 0n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
      action: { type: 'swap', amount: 250n },
      now: new Date('2026-04-25T12:00:00.000Z'),
    }),
    /credential policy hash does not match supplied policy/,
  );
});
