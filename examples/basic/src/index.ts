import {
  createActionIntent,
  createTrustedAgent,
  issueLocalCredential,
  localExecution,
  localMemoryStorage,
  localPolicyProofs,
  staticReasoningEngine,
} from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This example demonstrates the smallest local trusted-agent flow:
// reasoning proposes actions, policy validation accepts or rejects them,
// a local proof adapter creates proof-shaped output for valid actions,
// an execution adapter runs only after proof generation succeeds,
// and local storage records audit events.

const identity = {
  id: 'agent-alice',
  publicKey: 'agent-public-key-alice',
};

const policy = {
  id: 'policy-basic',
  allowedActions: ['swap', 'broadcast-signal'],
  constraints: [
    { type: 'max-amount' as const, value: 500n, actionTypes: ['swap'] },
    { type: 'allowed-metadata-value' as const, key: 'assetPair', values: ['ETH/USDC'], actionTypes: ['swap'] },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const credential = issueLocalCredential({
  identity,
  policy,
  id: 'credential-basic',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
});

const initialState = {
  cumulativeSpend: 0n,
  updatedAt: new Date('2026-04-25T00:00:00.000Z'),
};

const storage = localMemoryStorage();
const proof = localPolicyProofs();
const execution = localExecution(async ({ action }) => ({
  success: true,
  reference: `local-execution:${action.type}`,
  details: { assetPair: action.metadata?.assetPair, amount: action.amount },
}));

const acceptedAgent = createTrustedAgent({
  identity,
  credential,
  policy,
  initialState,
  reasoning: staticReasoningEngine(
    createActionIntent({
      type: 'swap',
      amount: 250n,
      metadata: { assetPair: 'ETH/USDC' },
    }),
  ),
  proof,
  storage,
  execution,
  now: () => new Date('2026-04-25T12:00:00.000Z'),
  createEventId: () => 'event-accepted-1',
});

const rejectedAgent = createTrustedAgent({
  identity,
  credential,
  policy,
  initialState,
  reasoning: staticReasoningEngine(
    createActionIntent({
      type: 'transfer-ownership',
      metadata: { target: 'unsafe-admin-change' },
    }),
  ),
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
  reasoning: staticReasoningEngine(
    createActionIntent({
      type: 'swap',
      amount: 750n,
      metadata: { assetPair: 'ETH/USDC' },
    }),
  ),
  proof,
  storage,
  now: () => new Date('2026-04-25T12:02:00.000Z'),
  createEventId: () => 'event-over-limit-1',
});

const accepted = await acceptedAgent.startOnce();
const rejected = await rejectedAgent.startOnce();
const overLimit = await overLimitAgent.startOnce();

console.log(JSON.stringify(toJsonSafe({ accepted, rejected, overLimit, auditEvents: storage.getAuditEvents() }), null, 2));
