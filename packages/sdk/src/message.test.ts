import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPolicy } from '@0xagentio/core';

import { localPolicyProofs } from './local-policy-proof.js';
import { createAgentMessage, createAgentReply, createProofBackedMessage } from './message.js';

const policy = {
  id: 'policy-test',
  allowedActions: ['request-quote'],
  constraints: [{ type: 'max-amount' as const, value: 500n, actionTypes: ['request-quote'] }],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const credential = {
  id: 'credential-test',
  agentId: 'agent-alice',
  policyId: policy.id,
  policyHash: hashPolicy(policy),
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  expiresAt: policy.expiresAt,
};

test('createAgentReply links replies to the original request', () => {
  const request = createAgentMessage({
    id: 'quote-request-1',
    correlationId: 'rebalance-session-1',
    type: 'swap-quote-request',
    sender: 'agent-alice',
    createdAt: new Date('2026-04-25T12:00:00.000Z'),
    payload: { assetPair: 'ETH/USDC' },
  });

  const reply = createAgentReply({
    id: 'quote-reply-1',
    type: 'swap-quote-reply',
    sender: 'agent-bob',
    createdAt: new Date('2026-04-25T12:00:01.000Z'),
    request,
    payload: { offeredRatio: '1:3' },
  });

  assert.equal(reply.correlationId, 'rebalance-session-1');
  assert.equal(reply.replyTo, 'quote-request-1');
});

test('createProofBackedMessage attaches the action and proof to the message payload', async () => {
  const action = { type: 'request-quote', amount: 250n };
  const message = await createProofBackedMessage({
    id: 'quote-request-1',
    correlationId: 'rebalance-session-1',
    type: 'swap-quote-request',
    sender: 'agent-alice',
    createdAt: new Date('2026-04-25T12:00:00.000Z'),
    credential,
    policy,
    state: { cumulativeSpend: 0n, updatedAt: new Date('2026-04-25T00:00:00.000Z') },
    action,
    proof: localPolicyProofs(),
    now: new Date('2026-04-25T12:00:00.000Z'),
    payload: { policyHash: credential.policyHash },
  });

  assert.equal(message.id, 'quote-request-1');
  assert.equal(message.payload.action, action);
  assert.equal(message.payload.policyHash, credential.policyHash);
  assert.equal((message.payload.proof as { publicInputs: Record<string, unknown> }).publicInputs.actionType, 'request-quote');
});
