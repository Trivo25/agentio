import { localPolicyProofs, localTransport } from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This example demonstrates the local peer-communication seam with a proof-carrying message.
// The same TransportAdapter shape will later be implemented by Gensyn AXL,
// so credential-backed messages can move from memory to real P2P transport.

const transport = localTransport();
const proof = localPolicyProofs();
const receivedMessages: unknown[] = [];

const credential = {
  id: 'credential-basic',
  agentId: 'agent-alice',
  policyId: 'policy-basic',
  issuedAt: new Date('2026-04-25T00:00:00.000Z'),
  expiresAt: new Date('2026-05-01T00:00:00.000Z'),
};

const policy = {
  id: 'policy-basic',
  allowedActions: ['swap', 'broadcast-signal'],
  constraints: [{ type: 'max-amount' as const, value: 500n }],
  expiresAt: credential.expiresAt,
};

const state = {
  cumulativeSpend: 0n,
  updatedAt: new Date('2026-04-25T00:00:00.000Z'),
};

const action = {
  type: 'swap',
  amount: 250n,
  assetPair: 'ETH/USDC',
};

const proofResult = await proof.proveAction({
  credential,
  policy,
  state,
  action,
  now: new Date('2026-04-25T12:00:00.000Z'),
});

transport.onMessage((message) => {
  receivedMessages.push(message);
});

const message = {
  type: 'credential-present',
  sender: 'agent-alice',
  createdAt: new Date('2026-04-25T12:00:00.000Z'),
  payload: {
    action,
    proof: proofResult.proof,
  },
};

await transport.send('agent-bob', message);
await transport.receive(message);

console.log(
  JSON.stringify(
    toJsonSafe({
      sentMessages: transport.getSentMessages(),
      receivedMessages,
    }),
    null,
    2,
  ),
);
