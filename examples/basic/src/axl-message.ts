import {
  createActionIntent,
  createAgentIdentity,
  createPolicy,
  issueLocalCredential,
  localAxlTransport,
  localPolicyProofs,
  onVerifiedMessage,
} from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This example demonstrates the Gensyn AXL-shaped transport seam with a proof-carrying message.
// The receiver still uses onVerifiedMessage, but outbound messages are recorded as
// local AXL-shaped envelopes before a real AXL network adapter exists.

const transport = localAxlTransport();
const proof = localPolicyProofs();
const trustedMessages: unknown[] = [];
const rejectedMessages: unknown[] = [];

const identity = createAgentIdentity({
  id: 'agent-alice',
  publicKey: 'agent-public-key-alice',
});

const policy = createPolicy({
  id: 'policy-basic',
  allowedActions: ['swap', 'broadcast-signal'],
  constraints: [
    { type: 'max-amount' as const, value: 500n, actionTypes: ['swap'] },
    { type: 'allowed-metadata-value' as const, key: 'assetPair', values: ['ETH/USDC'], actionTypes: ['swap'] },
  ],
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
});

const credential = await issueLocalCredential({
  identity,
  policy,
  id: 'credential-basic',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
});

const state = {
  cumulativeSpend: 0n,
  updatedAt: new Date('2026-04-25T00:00:00.000Z'),
};

const action = createActionIntent({
  type: 'swap',
  amount: 250n,
  metadata: { assetPair: 'ETH/USDC' },
});

const proofResult = await proof.proveAction({
  credential,
  policy,
  state,
  action,
  now: new Date('2026-04-25T12:00:00.000Z'),
});

onVerifiedMessage(transport, proof, {
  onTrusted(result) {
    trustedMessages.push(result);
  },
  onRejected(result) {
    rejectedMessages.push(result);
  },
});

const trustedMessage = {
  type: 'credential-present',
  sender: 'agent-alice',
  createdAt: new Date('2026-04-25T12:00:00.000Z'),
  payload: {
    action,
    proof: proofResult.proof,
  },
};

const uncredentialedMessage = {
  type: 'credential-present',
  sender: 'agent-mallory',
  createdAt: new Date('2026-04-25T12:01:00.000Z'),
  payload: {
    action,
  },
};

await transport.send('agent-bob', trustedMessage);
await transport.receive(trustedMessage);
await transport.send('agent-bob', uncredentialedMessage);
await transport.receive(uncredentialedMessage);

console.log(
  JSON.stringify(
    toJsonSafe({
      axlEnvelopes: transport.getEnvelopes(),
      trustedMessages,
      rejectedMessages,
    }),
    null,
    2,
  ),
);
