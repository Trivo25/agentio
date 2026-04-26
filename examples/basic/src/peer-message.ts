import { localPolicyProofs, localTransport, verifyCredentialMessage } from '@0xagentio/sdk';

import { toJsonSafe } from './json.js';

// This example demonstrates the local peer-communication seam with a proof-carrying message.
// The receiver verifies the proof before treating the message as trusted.
// The same TransportAdapter shape will later be implemented by Gensyn AXL.

const transport = localTransport();
const proof = localPolicyProofs();
const trustedMessages: unknown[] = [];
const rejectedMessages: unknown[] = [];

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

transport.onMessage(async (message) => {
  const result = await verifyCredentialMessage(message, proof);
  if (result.valid) {
    trustedMessages.push(result);
    return;
  }

  rejectedMessages.push(result);
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
      sentMessages: transport.getSentMessages(),
      trustedMessages,
      rejectedMessages,
    }),
    null,
    2,
  ),
);
