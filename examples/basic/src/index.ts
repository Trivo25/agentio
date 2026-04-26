import { createTrustedAgent, localMemoryStorage, localPolicyProofs, staticReasoningEngine } from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This example demonstrates the smallest local trusted-agent flow:
// reasoning proposes actions, policy validation accepts or rejects them,
// a local proof adapter creates proof-shaped output for valid actions,
// and local storage records audit events.

const identity = {
  id: 'agent-alice',
  publicKey: 'agent-public-key-alice',
};

const policy = {
  id: 'policy-basic',
  allowedActions: ['swap', 'broadcast-signal'],
  constraints: [{ type: 'max-amount' as const, value: 500n }],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const credential = {
  id: 'credential-basic',
  agentId: identity.id,
  policyId: policy.id,
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  expiresAt: policy.expiresAt,
};

const initialState = {
  cumulativeSpend: 0n,
  updatedAt: new Date('2026-04-25T00:00:00.000Z'),
};

const storage = localMemoryStorage();
const proof = localPolicyProofs();

const acceptedAgent = createTrustedAgent({
  identity,
  credential,
  policy,
  initialState,
  reasoning: staticReasoningEngine({
    type: 'swap',
    amount: 250n,
    assetPair: 'ETH/USDC',
  }),
  proof,
  storage,
  now: () => new Date('2026-04-25T12:00:00.000Z'),
  createEventId: () => 'event-accepted-1',
});

const rejectedAgent = createTrustedAgent({
  identity,
  credential,
  policy,
  initialState,
  reasoning: staticReasoningEngine({
    type: 'transfer-ownership',
    metadata: { target: 'unsafe-admin-change' },
  }),
  proof,
  storage,
  now: () => new Date('2026-04-25T12:01:00.000Z'),
  createEventId: () => 'event-rejected-1',
});

const overLimitAgent = createTrustedAgent({
  identity,
  credential,
  policy,
  initialState,
  reasoning: staticReasoningEngine({
    type: 'swap',
    amount: 750n,
    assetPair: 'ETH/USDC',
  }),
  proof,
  storage,
  now: () => new Date('2026-04-25T12:02:00.000Z'),
  createEventId: () => 'event-over-limit-1',
});

const accepted = await acceptedAgent.startOnce();
const rejected = await rejectedAgent.startOnce();
const overLimit = await overLimitAgent.startOnce();

console.log(JSON.stringify(toJsonSafe({ accepted, rejected, overLimit, auditEvents: storage.getAuditEvents() }), null, 2));
