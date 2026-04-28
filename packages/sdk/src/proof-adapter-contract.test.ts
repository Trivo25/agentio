import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProofAdapter } from '@0xagentio/core';
import { hashAction, hashPolicy } from '@0xagentio/core';

import { localNoirProofs } from './local-noir-proof.js';

const policy = {
  id: 'policy-backend-contract',
  allowedActions: ['request-quote', 'swap'],
  constraints: [
    { type: 'max-amount' as const, value: 500n, actionTypes: ['request-quote', 'swap'] },
    {
      type: 'allowed-metadata-value' as const,
      key: 'venue',
      values: ['uniswap-demo'],
      actionTypes: ['request-quote', 'swap'],
    },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const credential = {
  id: 'credential-backend-contract',
  agentId: 'agent-alice',
  policyId: policy.id,
  policyHash: hashPolicy(policy),
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  expiresAt: policy.expiresAt,
};

const state = {
  cumulativeSpend: 0n,
  updatedAt: new Date('2026-04-25T00:00:00.000Z'),
};

const now = new Date('2026-04-25T12:00:00.000Z');

testProofAdapterContract('localNoirProofs', localNoirProofs());

function testProofAdapterContract(name: string, proofAdapter: ProofAdapter): void {
  test(`${name} satisfies the proof adapter authorization contract`, async () => {
    const action = {
      type: 'request-quote',
      amount: 250n,
      metadata: { venue: 'uniswap-demo' },
    };
    const result = await proofAdapter.proveAction({
      credential,
      policy,
      state,
      action,
      now,
    });

    assert.equal(typeof result.proof.format, 'string');
    assert.ok(result.proof.proof.length > 0);
    assert.deepEqual(result.proof.publicInputs, {
      agentId: credential.agentId,
      policyHash: credential.policyHash,
      actionType: 'request-quote',
      actionHash: hashAction(action),
      actionAmount: '250',
    });
    assert.deepEqual(await proofAdapter.verifyProof(result.proof), { valid: true, reason: undefined });
  });

  test(`${name} rejects unauthorized actions before producing proofs`, async () => {
    await assert.rejects(
      proofAdapter.proveAction({
        credential,
        policy,
        state,
        action: {
          type: 'request-quote',
          amount: 750n,
          metadata: { venue: 'uniswap-demo' },
        },
        now,
      }),
      /amount-exceeds-maximum/,
    );
  });

  test(`${name} rejects unsupported proof formats during verification`, async () => {
    assert.deepEqual(
      await proofAdapter.verifyProof({
        format: 'unsupported-proof-format',
        proof: new Uint8Array([1]),
        publicInputs: {
          agentId: credential.agentId,
          policyHash: credential.policyHash,
          actionType: 'request-quote',
        },
      }),
      { valid: false, reason: 'Unsupported proof format unsupported-proof-format.' },
    );
  });
}
