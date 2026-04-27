import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExecutionAdapter, ExecutionRequest } from '@0xagentio/core';
import { hashPolicy } from '@0xagentio/core';

import { localVerifyingExecution } from './local-execution.js';
import { localNoirProofs } from './local-noir-proof.js';

const identity = {
  id: 'agent-alice',
  publicKey: 'agent-public-key-alice',
};

const policy = {
  id: 'policy-execution-contract',
  allowedActions: ['swap'],
  constraints: [
    { type: 'max-amount' as const, value: 500n, actionTypes: ['swap'] },
    {
      type: 'allowed-metadata-value' as const,
      key: 'venue',
      values: ['uniswap-demo'],
      actionTypes: ['swap'],
    },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const credential = {
  id: 'credential-execution-contract',
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

const action = {
  type: 'swap',
  amount: 250n,
  metadata: { venue: 'uniswap-demo', assetPair: 'ETH/USDC' },
};

const proofAdapter = localNoirProofs();

testExecutionAdapterContract(
  'localVerifyingExecution',
  localVerifyingExecution(proofAdapter, async (request) => ({
    success: true,
    reference: `mock-execution:${request.proof.publicInputs.policyHash}:${request.action.type}`,
    details: {
      venue: request.action.metadata?.venue,
      amount: request.action.amount,
    },
  })),
);

function testExecutionAdapterContract(name: string, execution: ExecutionAdapter): void {
  test(`${name} executes requests with valid proof public inputs`, async () => {
    const request = await createExecutionRequest();

    const result = await execution.execute(request);

    assert.equal(result.success, true);
    assert.equal(result.reference, `${'mock-execution'}:${credential.policyHash}:swap`);
    assert.equal(result.details?.venue, 'uniswap-demo');
  });

  test(`${name} rejects requests whose proof agent does not match the requester`, async () => {
    const request = await createExecutionRequest();

    const result = await execution.execute({
      ...request,
      identity: { ...identity, id: 'agent-impostor' },
    });

    assert.equal(result.success, false);
    assert.equal(result.reference, 'rejected:proof-public-input-mismatch');
    assert.equal(result.details?.reason, 'proof-public-input-mismatch');
  });

  test(`${name} rejects requests whose proof action does not match the requested action`, async () => {
    const request = await createExecutionRequest();

    const result = await execution.execute({
      ...request,
      action: { ...action, type: 'request-quote' },
    });

    assert.equal(result.success, false);
    assert.equal(result.reference, 'rejected:proof-public-input-mismatch');
    assert.equal(result.details?.reason, 'proof-public-input-mismatch');
  });
}

async function createExecutionRequest(): Promise<ExecutionRequest> {
  const proof = await proofAdapter.proveAction({
    credential,
    policy,
    state,
    action,
    now: new Date('2026-04-25T12:00:00.000Z'),
  });

  return {
    identity,
    credential,
    policy,
    action,
    proof: proof.proof,
  };
}
