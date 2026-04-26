import {
  createActionIntent,
  createAgentIdentity,
  createPolicy,
  createTrustedAgent,
  issueLocalCredential,
  localExecution,
  localMemoryStorage,
  localPolicyProofs,
  staticReasoningEngine,
} from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This example is the smallest happy-path SDK flow for a third-party developer.
// It shows how identity, policy, credential issuance, reasoning, proof generation,
// execution and audit storage fit together without any real network dependencies.

const identity = createAgentIdentity({
  id: 'agent-alice',
  publicKey: 'agent-public-key-alice',
});

const policy = createPolicy({
  id: 'policy-basic',
  allowedActions: ['swap'],
  constraints: [
    { type: 'max-amount', value: 500n, actionTypes: ['swap'] },
    { type: 'allowed-metadata-value', key: 'assetPair', values: ['ETH/USDC'], actionTypes: ['swap'] },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});

const credential = issueLocalCredential({
  identity,
  policy,
  id: 'credential-basic',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
});

const action = createActionIntent({
  type: 'swap',
  amount: 250n,
  metadata: { assetPair: 'ETH/USDC' },
});

const storage = localMemoryStorage();
const agent = createTrustedAgent({
  identity,
  credential,
  policy,
  initialState: {
    cumulativeSpend: 0n,
    updatedAt: new Date('2026-04-25T00:00:00.000Z'),
  },
  reasoning: staticReasoningEngine(action),
  proof: localPolicyProofs(),
  storage,
  execution: localExecution(async ({ action }) => ({
    success: true,
    reference: `local-execution:${action.type}`,
    details: { assetPair: action.metadata?.assetPair, amount: action.amount },
  })),
  now: () => new Date('2026-04-25T12:00:00.000Z'),
  createEventId: () => 'event-sdk-flow-1',
});

const result = await agent.startOnce();

console.log(JSON.stringify(toJsonSafe({ result, auditEvents: storage.getAuditEvents() }), null, 2));
