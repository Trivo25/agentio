import { createTrustedAgent, localMemoryStorage, staticReasoningEngine } from '@0xagentio/sdk';

const identity = {
  id: 'agent-alice',
  publicKey: 'agent-public-key-alice',
};

const policy = {
  id: 'policy-basic',
  allowedActions: ['swap', 'broadcast-signal'],
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
const agent = createTrustedAgent({
  identity,
  credential,
  policy,
  initialState,
  reasoning: staticReasoningEngine({
    type: 'swap',
    amount: 250n,
    assetPair: 'ETH/USDC',
  }),
  storage,
  now: () => new Date('2026-04-25T12:00:00.000Z'),
  createEventId: () => 'event-basic-1',
});

const result = await agent.startOnce();

console.log(JSON.stringify(toJsonSafe({ result, auditEvents: storage.getAuditEvents() }), null, 2));

function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, toJsonSafe(nestedValue)]),
    );
  }

  return value;
}
