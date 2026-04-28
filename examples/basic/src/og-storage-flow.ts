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
  localNoirProofs,
  staticReasoningEngine,
} from '@0xagentio/sdk';
import { memoryOgObjectClient, ogStorage } from '@0xagentio/og';

import { toJsonSafe } from './json.js';

/**
 * Demonstrates the 0G-shaped storage path without live network credentials.
 *
 * The trusted-agent runtime still talks to the generic StorageAdapter interface,
 * but this example routes state and audit writes through `ogStorage()` plus an
 * in-memory object client. That makes the object keys, serialization format,
 * and swap from local test double to real 0G SDK wrapper visible to a
 * developer before we add live testnet writes.
 */
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

console.log('Creating a memory 0G object client for local development...');
const objectClient = memoryOgObjectClient();

console.log('Creating an ogStorage adapter over that object client...');
const storage = ogStorage({ namespace: 'agentio-example', client: objectClient });

console.log('Creating Alice with a static decision, local Noir-shaped proofs, and 0G-shaped storage...');
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

console.log('Running one trusted-agent cycle...');
const result = await agent.startOnce();

console.log('Loading Alice state back through ogStorage...');
const storedState = await storage.loadState(identity);

console.log('Objects written through the 0G object-client contract:');
for (const entry of objectClient.entries()) {
  console.log(`- ${entry.key}`);
}

console.log('Final outcome:');
console.log(
  JSON.stringify(
    toJsonSafe({
      accepted: result.status === 'accepted',
      policyHash,
      executionReference: result.status === 'accepted' ? result.execution?.reference : undefined,
      storedState,
      objectCount: objectClient.entries().length,
    }),
    null,
    2,
  ),
);
