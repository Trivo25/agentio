import { localPolicyProofs, localTransport } from '@0xagentio/sdk';

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
  const credentialProof = message.payload.proof;
  if (!isCredentialProofLike(credentialProof)) {
    rejectedMessages.push({ message, reason: 'missing-proof' });
    return;
  }

  const verification = await proof.verifyProof(credentialProof);
  if (!verification.valid) {
    rejectedMessages.push({ message, verification });
    return;
  }

  trustedMessages.push({ message, verification });
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
      trustedMessages,
      rejectedMessages,
    }),
    null,
    2,
  ),
);

function isCredentialProofLike(value: unknown): value is { format: string; proof: Uint8Array; publicInputs: Readonly<Record<string, unknown>> } {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { format?: unknown; proof?: unknown; publicInputs?: unknown };
  return typeof candidate.format === 'string' && candidate.proof instanceof Uint8Array && isRecord(candidate.publicInputs);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
