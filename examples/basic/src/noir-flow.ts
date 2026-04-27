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
  localMemoryStorage,
  localNoirProofs,
  staticReasoningEngine,
} from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This example shows that the runtime is proof-adapter-agnostic.
// It uses the same identity, policy, credential, reasoning and execution flow as
// sdk-flow.ts, but swaps in the Noir-shaped local proof adapter.

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
  delegationVerifier: verifyLocalDelegation,
  proof: localNoirProofs(),
  storage,
  execution: localExecution(async ({ action }) => ({
    success: true,
    reference: `local-execution:${action.type}`,
    details: { assetPair: action.metadata?.assetPair, amount: action.amount },
  })),
  now: () => new Date('2026-04-25T12:00:00.000Z'),
  createEventId: () => 'event-noir-flow-1',
});

const result = await agent.startOnce();

console.log(JSON.stringify(toJsonSafe({ policyHash, credential, result, auditEvents: storage.getAuditEvents() }), null, 2));
