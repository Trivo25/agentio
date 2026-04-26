import {
  createActionIntent,
  createAgentIdentity,
  createPolicy,
  createTrustedAgent,
  hashPolicy,
  issueLocalCredential,
  localDelegationSigner,
  verifyLocalDelegation,
  localExecution,
  localOgStorage,
  localNoirProofs,
  staticReasoningEngine,
} from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This example shows that the runtime is storage-adapter-agnostic.
// It uses the same trusted-agent flow as noir-flow.ts, but swaps in the
// 0G-shaped local storage adapter.

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

const policyHash = hashPolicy(policy);

const credential = await issueLocalCredential({
  identity,
  policy,
  id: 'credential-basic',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  signer: localDelegationSigner('principal-alice'),
});

const action = createActionIntent({
  type: 'swap',
  amount: 250n,
  metadata: { assetPair: 'ETH/USDC' },
});

const storage = localOgStorage();
const agent = createTrustedAgent({
  identity,
  credential,
  policy,
  initialState: {
    cumulativeSpend: 0n,
    updatedAt: new Date('2026-04-25T00:00:00.000Z'),
  },
  reasoning: staticReasoningEngine(action),
  delegationVerifier: verifyLocalDelegation,
  proof: localNoirProofs(),
  storage,
  execution: localExecution(async ({ action }) => ({
    success: true,
    reference: `local-execution:${action.type}`,
    details: { assetPair: action.metadata?.assetPair, amount: action.amount },
  })),
  now: () => new Date('2026-04-25T12:00:00.000Z'),
  createEventId: () => 'event-og-storage-flow-1',
});

const result = await agent.startOnce();

console.log(JSON.stringify(toJsonSafe({ policyHash, credential, result, auditEvents: storage.getAuditEvents(), storageRecords: storage.getRecords() }), null, 2));
